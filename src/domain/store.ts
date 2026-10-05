import { createPinia, defineStore, storeToRefs } from "pinia";
import { ref, watch } from "vue";
import { demoAsOf, shipments } from "../data/shipments";
import { ExceptionPolicy } from "./exceptions";
import {
  DeliveryRoute,
  Mode,
  Operator,
  type Delivery,
  type Leg,
  type OperatorEvent,
  type Shipment,
} from "./types";
import {
  OceanSpanAdapter,
  RoadlineAdapter,
  ShipmentVisibilityService,
  WaypointAdapter,
} from "./visibility";

export const service = new ShipmentVisibilityService(
  [new RoadlineAdapter(), new OceanSpanAdapter(), new WaypointAdapter()],
  new ExceptionPolicy(),
);
const storageKey = "waypoint.shipments.v1";

export function clearSavedState(
  storage: Pick<Storage, "removeItem"> = globalThis.localStorage,
) {
  storage.removeItem(storageKey);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isTime = (value: unknown) =>
  isText(value) && Number.isFinite(Date.parse(value));

function isSavedState(
  value: unknown,
): value is { shipments: Shipment[]; asOf: string } {
  if (
    !isRecord(value) ||
    !isTime(value.asOf) ||
    !Array.isArray(value.shipments)
  )
    return false;
  const ids = new Set<string>();
  return value.shipments.every((shipment: unknown) => {
    if (
      !isRecord(shipment) ||
      !isText(shipment.id) ||
      !shipment.id ||
      ids.has(shipment.id)
    )
      return false;
    ids.add(shipment.id);
    return (
      [
        "order",
        "account",
        "site",
        "origin",
        "destination",
        "destinationCountry",
      ].every((key) => isText(shipment[key])) &&
      isTime(shipment.promisedAt) &&
      Array.isArray(shipment.legs) &&
      shipment.legs.every(
        (leg: unknown) =>
          isRecord(leg) &&
          Object.values(Mode).includes(leg.mode as Mode) &&
          isText(leg.from) &&
          isText(leg.to) &&
          isText(leg.operator),
      ) &&
      Array.isArray(shipment.events) &&
      shipment.events.every(
        (event: unknown) =>
          isRecord(event) &&
          isText(event.id) &&
          isText(event.code) &&
          isText(event.description) &&
          Object.values(Operator).includes(event.operator as Operator) &&
          isTime(event.occurredAt) &&
          isTime(event.receivedAt) &&
          Number.isInteger(event.leg) &&
          (event.leg as number) >= 0 &&
          (event.leg as number) < (shipment.legs as unknown[]).length,
      ) &&
      Array.isArray(shipment.documents) &&
      shipment.documents.every(
        (document: unknown) =>
          isRecord(document) &&
          isText(document.name) &&
          isText(document.reference) &&
          isText(document.preview),
      ) &&
      (shipment.scenarioEstimate === undefined ||
        (isRecord(shipment.scenarioEstimate) &&
          isTime(shipment.scenarioEstimate.arrivalAt) &&
          isText(shipment.scenarioEstimate.reason) &&
          isText(shipment.scenarioEstimate.sourceEventId) &&
          (shipment.scenarioEstimate.expectedAt === undefined ||
            isTime(shipment.scenarioEstimate.expectedAt)) &&
          (shipment.scenarioEstimate.startingAt === undefined ||
            isTime(shipment.scenarioEstimate.startingAt))))
    );
  });
}

export const useShipmentStore = defineStore("shipments", () => {
  const shipmentList = ref<Shipment[]>(structuredClone(shipments));
  const asOf = ref(demoAsOf);
  let initialized = false;

  function initialize(storage?: Pick<Storage, "getItem" | "setItem">) {
    if (initialized) return;
    initialized = true;
    try {
      storage ??= globalThis.localStorage;
      const raw = storage?.getItem(storageKey);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (isSavedState(saved)) {
          shipmentList.value = saved.shipments;
          asOf.value = saved.asOf;
        }
      }
    } catch {
      /* Storage may be unavailable; the demo still works in memory. */
    }
    if (storage) {
      watch(
        [shipmentList, asOf],
        () => {
          try {
            storage.setItem(
              storageKey,
              JSON.stringify({
                shipments: shipmentList.value,
                asOf: asOf.value,
              }),
            );
          } catch {
            /* Quota or privacy settings may block persistence. */
          }
        },
        { deep: true, flush: "sync" },
      );
    }
  }

  function recordEvent(
    shipmentId: string,
    event: Omit<OperatorEvent, "id" | "receivedAt">,
  ) {
    const shipment = shipmentList.value.find(
      (entry) => entry.id === shipmentId,
    );
    if (!shipment) throw new Error("Shipment not found");
    const receivedAt = new Date().toISOString();
    shipment.events.push({ ...event, id: crypto.randomUUID(), receivedAt });
    asOf.value = receivedAt;
  }

  function acknowledge(shipmentId: string, note: string, occurredAt: string) {
    const shipment = shipmentList.value.find(
      (entry) => entry.id === shipmentId,
    );
    if (
      !shipment ||
      !note.trim() ||
      !Number.isFinite(Date.parse(occurredAt)) ||
      Date.parse(occurredAt) > Date.now()
    )
      throw new Error("A note and a valid past update time are required");
    recordEvent(shipmentId, {
      operator: Operator.Waypoint,
      code: "ACKNOWLEDGED",
      description: note.trim(),
      occurredAt: new Date(occurredAt).toISOString(),
      leg: Math.max(0, shipment.legs.length - 1),
    });
  }

  function addDelivery(input: Delivery) {
    if (
      !input.id.trim() ||
      !input.order.trim() ||
      !input.account.trim() ||
      !input.site.trim() ||
      !input.destination.trim() ||
      !input.destinationCountry.trim() ||
      !Object.values(DeliveryRoute).includes(input.route) ||
      !Number.isFinite(Date.parse(input.promisedAt)) ||
      shipmentList.value.some((entry) => entry.id === input.id.trim())
    )
      throw new Error("Complete the delivery fields with a unique shipment ID");
    shipmentList.value.push(createDelivery(input));
  }

  function advance(shipmentId: string, occurredAt: string) {
    const shipment = shipmentList.value.find(
      (entry) => entry.id === shipmentId,
    );
    const phase = shipment && nextPhase(shipment);
    if (
      !phase ||
      !Number.isFinite(Date.parse(occurredAt)) ||
      Date.parse(occurredAt) > Date.now()
    )
      throw new Error("Enter a valid past confirmation time");
    const latest = shipment.events
      .filter((event) => event.operator !== Operator.Waypoint)
      .at(-1);
    if (latest && Date.parse(occurredAt) < Date.parse(latest.occurredAt))
      throw new Error("Confirmation cannot precede the previous phase");
    recordEvent(shipmentId, {
      ...phase,
      description: phase.label,
      occurredAt: new Date(occurredAt).toISOString(),
    });
  }

  return {
    shipmentList,
    asOf,
    initialize,
    recordEvent,
    acknowledge,
    addDelivery,
    advance,
  };
});

export const pinia = createPinia();
const shipmentStore = useShipmentStore(pinia);
export const { shipmentList, asOf } = storeToRefs(shipmentStore);
export const recordEvent = shipmentStore.recordEvent;
export const acknowledge = shipmentStore.acknowledge;
export const addDelivery = shipmentStore.addDelivery;
export const advance = shipmentStore.advance;

export function deliveryDraft(account: string, site: string): Delivery {
  return {
    id: "",
    order: "",
    account,
    site,
    destination: "",
    destinationCountry: "",
    promisedAt: "",
    route: DeliveryRoute.Road,
  };
}

export function deliveryPhases(route: Delivery["route"]) {
  return phases({
    legs:
      route === DeliveryRoute.Road
        ? [{ mode: Mode.Road }]
        : [{ mode: Mode.Road }, { mode: Mode.Sea }],
  } as Shipment);
}

export function createDelivery(input: Delivery): Shipment {
  const legs: Leg[] =
    input.route === DeliveryRoute.Road
      ? [
          {
            mode: Mode.Road,
            from: input.site,
            to: input.destination,
            operator: "Roadline",
          },
        ]
      : [
          {
            mode: Mode.Road,
            from: input.site,
            to: `${input.site} port`,
            operator: "Roadline",
          },
          {
            mode: Mode.Sea,
            from: `${input.site} port`,
            to: `${input.destination} port`,
            operator: "OceanSpan",
          },
          {
            mode: Mode.Customs,
            from: `${input.destination} port`,
            to: `${input.destination} port`,
            operator: "OceanSpan",
          },
          {
            mode: Mode.Road,
            from: `${input.destination} port`,
            to: input.destination,
            operator: "Roadline",
          },
        ];
  return {
    ...input,
    id: input.id.trim(),
    order: input.order.trim(),
    origin: input.site,
    promisedAt: new Date(input.promisedAt).toISOString(),
    legs,
    events: [],
    documents: [],
  };
}

export function phases(shipment: Shipment) {
  return shipment.legs.length === 1
    ? [
        {
          code: "PICKED_UP",
          operator: Operator.Roadline,
          leg: 0,
          label: "Collected from origin",
        },
        {
          code: "ON_ROUTE",
          operator: Operator.Roadline,
          leg: 0,
          label: "Road transit",
        },
        {
          code: "OUT_FOR_DELIVERY",
          operator: Operator.Roadline,
          leg: 0,
          label: "Out for delivery",
        },
        {
          code: "DELIVERED",
          operator: Operator.Roadline,
          leg: 0,
          label: "Delivered",
        },
      ]
    : [
        {
          code: "PICKED_UP",
          operator: Operator.Roadline,
          leg: 0,
          label: "Collected from origin",
        },
        {
          code: "AT_TERMINAL",
          operator: Operator.Roadline,
          leg: 0,
          label: "Arrived at origin port",
        },
        {
          code: "SAILED",
          operator: Operator.OceanSpan,
          leg: 1,
          label: "Vessel departed",
        },
        {
          code: "PORT_ARRIVAL",
          operator: Operator.OceanSpan,
          leg: 1,
          label: "Vessel arrived at destination port",
        },
        {
          code: "CUSTOMS_RELEASED",
          operator: Operator.OceanSpan,
          leg: 2,
          label: "Cleared customs",
        },
        {
          code: "OUT_FOR_DELIVERY",
          operator: Operator.Roadline,
          leg: 3,
          label: "Out for delivery",
        },
        {
          code: "DELIVERED",
          operator: Operator.Roadline,
          leg: 3,
          label: "Delivered",
        },
      ];
}

export function nextPhase(shipment: Shipment) {
  const sequence = phases(shipment);
  const latest = shipment.events
    .filter((event) => event.operator !== Operator.Waypoint)
    .at(-1);
  if (!latest) return sequence[0];
  const index =
    latest.code === "CUSTOMS_HOLD"
      ? 3
      : sequence.findIndex((phase) => phase.code === latest.code);
  return index < 0 ? undefined : sequence[index + 1];
}
