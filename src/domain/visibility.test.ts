import { describe, expect, it, vi } from "vitest";
import { demoAsOf, personas, shipments } from "../data/shipments";
import { formatDate, formatDateTime } from "./dates";
import { ExceptionPolicy } from "./exceptions";
import { NoticeComposer } from "./notices";
import { searchShipments } from "./search";
import {
  AlertKind,
  DeliveryRoute,
  MilestoneKind,
  Operator,
  Provenance,
  ShipmentStatus,
} from "./types";
import {
  acknowledge,
  addDelivery,
  advance,
  nextPhase,
  shipmentList,
  service as sharedService,
} from "./store";
import {
  OceanSpanAdapter,
  RoadlineAdapter,
  ShipmentVisibilityService,
  visibleTo,
} from "./visibility";

const service = new ShipmentVisibilityService(
  [new RoadlineAdapter(), new OceanSpanAdapter()],
  new ExceptionPolicy(),
);

describe("shipment visibility", () => {
  it("normalizes road, sea and customs events in order with provenance", () => {
    const view = service.view(shipments[0], demoAsOf);
    expect(view.milestones.map((milestone) => milestone.kind)).toEqual([
      "departed",
      "port",
      "departed",
      "customs_hold",
    ]);
    expect(view.milestones[3]).toMatchObject({
      operator: Operator.OceanSpan,
      leg: 2,
      provenance: Provenance.Confirmed,
    });
    expect(view.alerts.map((alert) => alert.kind)).toEqual([
      AlertKind.Hold,
      AlertKind.Risk,
    ]);
  });

  it("deduplicates source event IDs and never promotes unknown codes to confirmed state", () => {
    const shipment = {
      ...shipments[6],
      events: [...shipments[6].events, shipments[6].events[1]],
    };
    const view = service.view(shipment, demoAsOf);
    expect(view.milestones).toHaveLength(3);
    expect(view.milestones.at(-1)).toMatchObject({
      kind: MilestoneKind.NeedsReview,
      provenance: Provenance.Unmapped,
    });
    expect(view.current).toMatchObject({ kind: "departed", rawCode: "SAILED" });
    expect(view.alerts.map((alert) => alert.kind)).toEqual([AlertKind.Review]);
  });

  it("uses the most recent confirmed event and ignores future events", () => {
    const shipment = {
      ...shipments[1],
      events: [
        ...shipments[1].events,
        {
          ...shipments[1].events[1],
          id: "future",
          code: "DELIVERED",
          occurredAt: "2026-10-03T10:00:00Z",
        },
      ],
    };
    const view = service.view(shipment, demoAsOf);
    expect(view.status).toBe(ShipmentStatus.OnTrack);
    expect(view.milestones.some((milestone) => milestone.id === "future")).toBe(
      false,
    );
  });

  it("limits each role to its account and assigned site", () => {
    expect(
      shipments
        .filter((shipment) => visibleTo(shipment, personas[0]))
        .map((shipment) => shipment.id),
    ).toEqual(["SH-1042", "SH-1043", "SH-1045", "SH-1046"]);
    expect(
      shipments
        .filter((shipment) => visibleTo(shipment, personas[2]))
        .map((shipment) => shipment.id),
    ).toEqual(["SH-1042", "SH-1044", "SH-1046", "SH-1048"]);
  });

  it("does not invent an arrival estimate or a notice without supporting evidence", () => {
    const composer = new NoticeComposer();
    const held = service.view(shipments[0], demoAsOf);
    expect(composer.compose(held)).toContain("not confirmed");
    expect(
      composer.compose(service.view(shipments[1], demoAsOf)),
    ).toBeUndefined();
    expect(
      composer.compose(
        service.view(
          {
            ...shipments[0],
            scenarioEstimate: {
              ...shipments[0].scenarioEstimate!,
              sourceEventId: "missing",
            },
          },
          demoAsOf,
        ),
      ),
    ).toBeUndefined();
  });

  it("surfaces overdue, stale and delivered shipments without a false alarm on delivery", () => {
    expect(service.view(shipments[5], demoAsOf).alerts[0]?.kind).toBe(
      AlertKind.Overdue,
    );
    expect(
      service.view(shipments[5], demoAsOf).alerts.map((alert) => alert.kind),
    ).toContain(AlertKind.Risk);
    expect(
      new NoticeComposer().compose(service.view(shipments[5], demoAsOf)),
    ).toContain("03/10/2026");
    expect(service.view(shipments[3], demoAsOf).alerts[0]?.kind).toBe(
      AlertKind.Stale,
    );
    expect(service.view(shipments[4], demoAsOf)).toMatchObject({
      status: ShipmentStatus.Delivered,
      alerts: [],
    });
  });

  it("filters natural-language requests only within the supplied portfolio", () => {
    const north = shipments
      .filter((shipment) => visibleTo(shipment, personas[0]))
      .map((shipment) => service.view(shipment, demoAsOf));
    expect(
      searchShipments(
        north,
        "shipments to France this week running late",
        demoAsOf,
      ).map((view) => view.shipment.id),
    ).toEqual(["SH-1042"]);
    expect(
      searchShipments(north, "what's going on with order 85013?", demoAsOf).map(
        (view) => view.shipment.id,
      ),
    ).toEqual(["SH-1043"]);
    expect(searchShipments(north, "SH-1044", demoAsOf)).toEqual([]);
    expect(searchShipments(north, "unrelated question", demoAsOf)).toEqual([]);
  });

  it("keeps the confirmed hold after an internal acknowledgment", () => {
    const held = {
      ...shipments[0],
      events: [
        ...shipments[0].events,
        {
          id: "ack",
          operator: Operator.Waypoint,
          code: "ACKNOWLEDGED",
          description: "Called operator",
          occurredAt: "2026-10-02T10:00:00Z",
          receivedAt: "2026-10-02T11:00:00Z",
          leg: 2,
        },
      ],
    };
    const view = sharedService.view(held, demoAsOf);
    expect(view.status).toBe(ShipmentStatus.Attention);
    expect(view.acknowledgedAction).toMatchObject({
      description: "Called operator",
      receivedAt: "2026-10-02T11:00:00Z",
    });
    expect(view.current?.kind).toBe(MilestoneKind.CustomsHold);
    expect(view.alerts[0]?.kind).toBe(AlertKind.Hold);
  });

  it("keeps an unconfirmed overdue shipment in attention", () => {
    const shipment = {
      ...shipments[0],
      events: [],
      promisedAt: "2026-10-01T12:00:00Z",
    };
    const view = sharedService.view(shipment, demoAsOf);
    expect(view.status).toBe(ShipmentStatus.Attention);
    expect(view.acknowledgedAction).toBeUndefined();
  });

  it("confirms every leg in a multimodal delivery without skipping phases", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    try {
      addDelivery({
        id: "SH-SEA",
        order: "ORD-SEA",
        account: "Meridian Assembly",
        site: "Valencia Hub",
        destination: "Lyon, FR",
        destinationCountry: "France",
        promisedAt: "2026-10-08T12:00:00Z",
        route: DeliveryRoute.Multimodal,
      });
      const shipment = shipmentList.value.find(
        (entry) => entry.id === "SH-SEA",
      )!;
      for (const code of [
        "PICKED_UP",
        "AT_TERMINAL",
        "SAILED",
        "PORT_ARRIVAL",
        "CUSTOMS_RELEASED",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ]) {
        expect(nextPhase(shipment)?.code).toBe(code);
        advance("SH-SEA", "2026-10-05T11:00:00Z");
      }
      expect(nextPhase(shipment)).toBeUndefined();
      expect(sharedService.view(shipment, "2026-10-05T12:00:00Z").status).toBe(
        ShipmentStatus.Delivered,
      );
      expect(
        sharedService.timeline(shipment).map((milestone) => milestone.kind),
      ).toEqual([
        "departed",
        "port",
        "departed",
        "port",
        "customs_clear",
        "out_for_delivery",
        "delivered",
      ]);
    } finally {
      shipmentList.value = shipmentList.value.filter(
        (entry) => entry.id !== "SH-SEA",
      );
      vi.useRealTimers();
    }
  });

  it("records acknowledgment with an actual receipt time and progresses a new delivery in order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    try {
      addDelivery({
        id: "SH-TEST",
        order: "ORD-TEST",
        account: "Atlas Components",
        site: "Bilbao Works",
        destination: "Paris, FR",
        destinationCountry: "France",
        promisedAt: "2026-10-07T12:00:00Z",
        route: DeliveryRoute.Road,
      });
      const shipment = shipmentList.value.find(
        (entry) => entry.id === "SH-TEST",
      )!;
      expect(visibleTo(shipment, personas[0])).toBe(true);
      expect(visibleTo(shipment, personas[1])).toBe(false);
      expect(visibleTo(shipment, personas[2])).toBe(true);
      expect(nextPhase(shipment)?.code).toBe("PICKED_UP");
      expect(sharedService.view(shipment, demoAsOf).status).toBe(
        ShipmentStatus.Pending,
      );
      acknowledge(
        "SH-TEST",
        "Operator called with pickup confirmation",
        "2026-10-05T10:00:00Z",
      );
      expect(shipment.events[0]).toMatchObject({
        occurredAt: "2026-10-05T10:00:00.000Z",
        receivedAt: "2026-10-05T12:00:00.000Z",
      });
      expect(sharedService.view(shipment, "2026-10-05T12:00:00Z").status).toBe(
        ShipmentStatus.Pending,
      );
      for (const code of [
        "PICKED_UP",
        "ON_ROUTE",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ]) {
        expect(nextPhase(shipment)?.code).toBe(code);
        advance("SH-TEST", "2026-10-05T11:00:00Z");
        expect(
          sharedService.view(shipment, "2026-10-05T12:00:00Z")
            .acknowledgedAction,
        ).toBeUndefined();
      }
      expect(nextPhase(shipment)).toBeUndefined();
      expect(sharedService.view(shipment, "2026-10-05T12:00:00Z").status).toBe(
        "delivered",
      );
      expect(() => advance("SH-TEST", "2026-10-05T11:00:00Z")).toThrow();
    } finally {
      shipmentList.value = shipmentList.value.filter(
        (entry) => entry.id !== "SH-TEST",
      );
      vi.useRealTimers();
    }
  });
});
