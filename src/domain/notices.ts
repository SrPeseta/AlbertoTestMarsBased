import { AlertKind, Provenance, type ShipmentView } from "./types";
import { formatDate } from "./dates";

export class NoticeComposer {
  compose(view: ShipmentView): string | undefined {
    const estimate = view.shipment.scenarioEstimate;
    if (
      !estimate ||
      !view.milestones.some(
        (milestone) =>
          milestone.id === estimate.sourceEventId &&
          milestone.provenance === Provenance.Confirmed,
      )
    )
      return undefined;
    if (!view.alerts.some((alert) => alert.kind === AlertKind.Risk))
      return undefined;
    const estimatedDay = formatDate(estimate.arrivalAt);
    return `Update for ${view.shipment.id}: ${estimate.reason}. The scenario-based estimated arrival is ${estimatedDay} (not confirmed). Awaiting the next confirmed operator update.`;
  }
}
