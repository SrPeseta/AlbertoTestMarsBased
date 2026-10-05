import { createPinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { demoAsOf, shipments } from "../data/shipments";
import { formatDate, formatDateTime } from "./dates";
import {
  createDelivery,
  clearSavedState,
  deliveryDraft,
  deliveryPhases,
  nextPhase,
  service,
  useShipmentStore,
} from "./store";
import {
  DeliveryRoute,
  Operator,
  ShipmentStatus,
  type Delivery,
} from "./types";

const input: Delivery = {
  id: "SH-NEW",
  order: "ORD-NEW",
  account: "Atlas Components",
  site: "Bilbao Works",
  destination: "Paris, FR",
  destinationCountry: "France",
  promisedAt: "2026-10-08T16:00:00Z",
  route: DeliveryRoute.Multimodal,
};

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("delivery domain and persisted Pinia store", () => {
  it("formats UTC dates as Spanish day/month/year and 24-hour timestamps", () => {
    expect(formatDate("2026-10-02T23:10:00Z")).toBe("02/10/2026");
    expect(formatDateTime("2026-10-02T23:10:00Z")).toBe(
      "02/10/2026, 23:10 UTC",
    );
  });

  it("builds a typed draft and all expected phases without mutating its input", () => {
    expect(deliveryDraft("Atlas Components", "Bilbao Works")).toMatchObject({
      account: "Atlas Components",
      site: "Bilbao Works",
      route: "road",
    });
    expect(
      deliveryPhases(DeliveryRoute.Road).map((phase) => phase.code),
    ).toEqual(["PICKED_UP", "ON_ROUTE", "OUT_FOR_DELIVERY", "DELIVERED"]);
    expect(
      deliveryPhases(DeliveryRoute.Multimodal).map((phase) => phase.code),
    ).toEqual([
      "PICKED_UP",
      "AT_TERMINAL",
      "SAILED",
      "PORT_ARRIVAL",
      "CUSTOMS_RELEASED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
    expect(createDelivery(input)).toMatchObject({
      id: "SH-NEW",
      legs: [
        { mode: "road" },
        { mode: "sea" },
        { mode: "customs" },
        { mode: "road" },
      ],
      events: [],
    });
    expect(input).not.toHaveProperty("legs");
  });

  it("persists and restores a full delivery and event history", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    try {
      const storage = memoryStorage();
      const original = useShipmentStore(createPinia());
      original.initialize(storage);
      original.addDelivery(input);
      original.advance("SH-NEW", "2026-10-05T10:00:00Z");
      original.acknowledge("SH-NEW", "Called carrier", "2026-10-05T11:00:00Z");
      expect(original.asOf).toBe("2026-10-05T12:00:00.000Z");
      const restored = useShipmentStore(createPinia());
      restored.initialize(storage);
      const delivery = restored.shipmentList.find(
        (shipment) => shipment.id === "SH-NEW",
      )!;
      expect(delivery.events).toHaveLength(2);
      expect(delivery.events[1].description).toBe("Called carrier");
      expect(restored.asOf).toBe(original.asOf);
      expect(nextPhase(delivery)?.code).toBe("AT_TERMINAL");
      expect(service.view(delivery, restored.asOf).status).toBe(
        ShipmentStatus.OnTrack,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets only saved shipments so a new store loads the fixtures", () => {
    const storage = memoryStorage();
    storage.setItem("unrelated", "preserved");
    const original = useShipmentStore(createPinia());
    original.initialize(storage);
    original.addDelivery(input);
    clearSavedState(storage);
    expect(storage.getItem("waypoint.shipments.v1")).toBeNull();
    expect(storage.getItem("unrelated")).toBe("preserved");

    const reloaded = useShipmentStore(createPinia());
    reloaded.initialize(storage);
    expect(reloaded.shipmentList).toHaveLength(shipments.length);
    expect(reloaded.asOf).toBe(demoAsOf);
  });

  it("rejects malformed snapshots and unavailable storage without losing the fixtures", () => {
    for (const raw of [
      "{",
      JSON.stringify({
        shipments: [
          {
            id: "broken",
            account: "Atlas",
            site: "Bilbao",
            promisedAt: demoAsOf,
            legs: [],
            events: [],
            documents: [],
          },
        ],
        asOf: demoAsOf,
      }),
      JSON.stringify({
        shipments: [
          { ...shipments[0], legs: [{ ...shipments[0].legs[0], mode: "air" }] },
        ],
        asOf: demoAsOf,
      }),
      JSON.stringify({
        shipments: [
          {
            ...shipments[0],
            events: [{ ...shipments[0].events[0], operator: "unknown" }],
          },
        ],
        asOf: demoAsOf,
      }),
    ]) {
      const store = useShipmentStore(createPinia());
      store.initialize({ getItem: () => raw, setItem: () => {} });
      expect(store.shipmentList).toHaveLength(shipments.length);
      expect(store.asOf).toBe(demoAsOf);
    }
    const store = useShipmentStore(createPinia());
    store.initialize({
      getItem: () => {
        throw new Error("Denied");
      },
      setItem: () => {
        throw new Error("Quota");
      },
    });
    expect(() => store.addDelivery(input)).not.toThrow();
    expect(store.shipmentList).toHaveLength(shipments.length + 1);
  });

  it("rejects duplicate or incomplete deliveries and invalid updates without mutating state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    try {
      const store = useShipmentStore(createPinia());
      const initial = store.shipmentList.length;
      expect(() => store.addDelivery({ ...input, site: "" })).toThrow();
      expect(() =>
        store.addDelivery({ ...input, promisedAt: "bad" }),
      ).toThrow();
      expect(() =>
        store.addDelivery({ ...input, route: "air" as Delivery["route"] }),
      ).toThrow();
      expect(store.shipmentList).toHaveLength(initial);
      store.addDelivery(input);
      expect(() => store.addDelivery(input)).toThrow();
      expect(() =>
        store.acknowledge(input.id, " ", "2026-10-05T10:00:00Z"),
      ).toThrow();
      expect(() => store.advance(input.id, "2026-10-06T10:00:00Z")).toThrow();
      store.advance(input.id, "2026-10-05T10:00:00Z");
      expect(() => store.advance(input.id, "2026-10-05T09:00:00Z")).toThrow();
      expect(() =>
        store.recordEvent("missing", {
          operator: Operator.Roadline,
          code: "ON_ROUTE",
          description: "",
          occurredAt: demoAsOf,
          leg: 0,
        }),
      ).toThrow();
      expect(
        store.shipmentList.find((shipment) => shipment.id === input.id)?.events,
      ).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
