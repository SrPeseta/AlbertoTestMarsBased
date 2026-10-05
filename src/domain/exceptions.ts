import {
  AlertKind,
  MilestoneKind,
  Provenance,
  type Alert,
  type Milestone,
  type Shipment,
} from "./types";
import { formatDateTime } from "./dates";

const hoursBetween = (start: string, end: string) =>
  (Date.parse(end) - Date.parse(start)) / 3_600_000;

export class ExceptionPolicy {
  evaluate(shipment: Shipment, milestones: Milestone[], asOf: string): Alert[] {
    const confirmed = milestones.filter(
      (milestone) =>
        milestone.provenance === Provenance.Confirmed &&
        milestone.kind !== MilestoneKind.Acknowledged &&
        milestone.occurredAt <= asOf,
    );
    const latest = confirmed.at(-1);
    if (
      confirmed.some((milestone) => milestone.kind === MilestoneKind.Delivered)
    )
      return [];
    const alerts: Alert[] = [];
    if (latest?.kind === MilestoneKind.CustomsHold)
      alerts.push({
        kind: AlertKind.Hold,
        label: "Customs hold",
        explanation: `${latest.operator} confirmed a customs hold on ${formatDateTime(latest.occurredAt)}.`,
        action: "Check customs paperwork and contact the operator",
        priority: 5,
      });
    if (Date.parse(shipment.promisedAt) < Date.parse(asOf))
      alerts.push({
        kind: AlertKind.Overdue,
        label: "Past promised date",
        explanation: "No delivery confirmation by the promised date.",
        action: "Contact the operator for a delivery update",
        priority: 4,
      });
    if (
      shipment.scenarioEstimate &&
      Date.parse(shipment.scenarioEstimate.arrivalAt) >
        Date.parse(shipment.promisedAt) &&
      confirmed.some(
        (milestone) =>
          milestone.id === shipment.scenarioEstimate?.sourceEventId,
      )
    ) {
      alerts.push({
        kind: AlertKind.Risk,
        label: "Arrival at risk",
        explanation: `Scenario estimate is later than promised: ${shipment.scenarioEstimate.reason}.`,
        action: "Review the estimate and prepare a customer notice",
        priority: 3,
      });
    }
    if (latest && hoursBetween(latest.receivedAt, asOf) >= 36)
      alerts.push({
        kind: AlertKind.Stale,
        label: "Update overdue",
        explanation: "No confirmed operator update received in over 36 hours.",
        action: "Request a fresh status from the operator",
        priority: 2,
      });
    if (
      milestones.some(
        (milestone) =>
          milestone.provenance === Provenance.Unmapped &&
          milestone.occurredAt <= asOf,
      )
    )
      alerts.push({
        kind: AlertKind.Review,
        label: "Code needs review",
        explanation:
          "An operator status has no verified mapping; it did not change the shipment status.",
        action: "Review and map the operator code",
        priority: 1,
      });
    return alerts.sort((a, b) => b.priority - a.priority);
  }
}
