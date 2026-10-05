import {
  MilestoneKind,
  Operator,
  PersonaRole,
  Provenance,
  ShipmentStatus,
  type Milestone,
  type OperatorEvent,
  type Persona,
  type Shipment,
  type ShipmentView,
} from "./types";
import { ExceptionPolicy } from "./exceptions";

export interface OperatorEventAdapter {
  operator: OperatorEvent["operator"];
  map(code: string): { kind: MilestoneKind; label: string } | undefined;
}

export class RoadlineAdapter implements OperatorEventAdapter {
  readonly operator = Operator.Roadline;
  private readonly codes: Record<
    string,
    { kind: MilestoneKind; label: string }
  > = {
    PICKED_UP: { kind: MilestoneKind.Departed, label: "Collected from origin" },
    AT_TERMINAL: { kind: MilestoneKind.Port, label: "Arrived at port" },
    ON_ROUTE: { kind: MilestoneKind.InTransit, label: "Road transit" },
    OUT_FOR_DELIVERY: {
      kind: MilestoneKind.OutForDelivery,
      label: "Out for delivery",
    },
    DELIVERED: { kind: MilestoneKind.Delivered, label: "Delivered" },
  };
  map(code: string) {
    return this.codes[code];
  }
}

export class OceanSpanAdapter implements OperatorEventAdapter {
  readonly operator = Operator.OceanSpan;
  private readonly codes: Record<
    string,
    { kind: MilestoneKind; label: string }
  > = {
    SAILED: { kind: MilestoneKind.Departed, label: "Vessel departed" },
    PORT_ARRIVAL: { kind: MilestoneKind.Port, label: "Vessel arrived at port" },
    CUSTOMS_HOLD: { kind: MilestoneKind.CustomsHold, label: "Held at customs" },
    CUSTOMS_RELEASED: {
      kind: MilestoneKind.CustomsClear,
      label: "Cleared customs",
    },
  };
  map(code: string) {
    return this.codes[code];
  }
}

export class WaypointAdapter implements OperatorEventAdapter {
  readonly operator = Operator.Waypoint;
  map(code: string) {
    return code === "ACKNOWLEDGED"
      ? { kind: MilestoneKind.Acknowledged, label: "Next action acknowledged" }
      : undefined;
  }
}

export function visibleTo(shipment: Shipment, persona: Persona): boolean {
  return (
    persona.accounts.includes(shipment.account) &&
    (persona.role === PersonaRole.Customer ||
      persona.sites.includes(shipment.site))
  );
}

export class ShipmentVisibilityService {
  constructor(
    private readonly adapters: OperatorEventAdapter[],
    private readonly policy: ExceptionPolicy,
  ) {}

  timeline(shipment: Shipment): Milestone[] {
    const seen = new Set<string>();
    return shipment.events
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .map((event) => {
        const mapped = this.adapters
          .find((adapter) => adapter.operator === event.operator)
          ?.map(event.code);
        return {
          id: event.id,
          kind: mapped?.kind ?? MilestoneKind.NeedsReview,
          label: mapped?.label ?? "Unmapped operator update",
          occurredAt: event.occurredAt,
          receivedAt: event.receivedAt,
          operator: event.operator,
          rawCode: event.code,
          leg: event.leg,
          provenance: mapped ? Provenance.Confirmed : Provenance.Unmapped,
        } as Milestone;
      })
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  view(shipment: Shipment, asOf: string): ShipmentView {
    const milestones = this.timeline(shipment).filter(
      (milestone) =>
        milestone.occurredAt <= asOf && milestone.receivedAt <= asOf,
    );
    const confirmed = milestones.filter(
      (milestone) =>
        milestone.provenance === Provenance.Confirmed &&
        milestone.occurredAt <= asOf,
    );
    const lastConfirmed = confirmed
      .filter((milestone) => milestone.kind !== MilestoneKind.Acknowledged)
      .at(-1);
    const current = lastConfirmed;
    const alerts = this.policy.evaluate(shipment, milestones, asOf);
    const confirmedIds = new Set(confirmed.map((milestone) => milestone.id));
    const latestReceived = shipment.events
      .filter((event) => confirmedIds.has(event.id))
      .reduce<OperatorEvent | undefined>(
        (latest, event) =>
          !latest || event.receivedAt >= latest.receivedAt ? event : latest,
        undefined,
      );
    return {
      shipment,
      milestones,
      lastConfirmed,
      current,
      alerts,
      acknowledgedAction:
        alerts.length && latestReceived?.code === "ACKNOWLEDGED"
          ? latestReceived
          : undefined,
      status: confirmed.some(
        (milestone) => milestone.kind === MilestoneKind.Delivered,
      )
        ? ShipmentStatus.Delivered
        : alerts.length
          ? ShipmentStatus.Attention
          : !lastConfirmed
            ? ShipmentStatus.Pending
            : ShipmentStatus.OnTrack,
    };
  }
}
