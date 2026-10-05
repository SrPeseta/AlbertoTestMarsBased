import { AlertKind, type ShipmentView } from "./types";

export function searchShipments(
  views: ShipmentView[],
  query: string,
  asOf: string,
) {
  const text = query.trim().toLowerCase();
  if (!text) return views;
  const countries = ["france", "spain", "germany", "netherlands"];
  const country = countries.find((entry) => text.includes(entry));
  const references = text.match(/(?:sh-\d+|ord-\d+|\b\d{5}\b)/gi) ?? [];
  const late = /\b(late|delay|delayed|risk|overdue|behind)\b/.test(text);
  const week = /this week/.test(text);
  if (
    !country &&
    !references.length &&
    !late &&
    !week &&
    !/^(all |my )?(shipments|deliveries)$/.test(text)
  )
    return [];
  const from = Date.parse(asOf);
  return views.filter(
    (view) =>
      (!country ||
        view.shipment.destinationCountry.toLowerCase() === country) &&
      (!references.length ||
        references.some((reference) =>
          `${view.shipment.id} ${view.shipment.order}`
            .toLowerCase()
            .includes(reference.toLowerCase()),
        )) &&
      (!late ||
        view.alerts.some((alert) =>
          [AlertKind.Risk, AlertKind.Overdue, AlertKind.Hold].includes(
            alert.kind,
          ),
        )) &&
      (!week ||
        (Date.parse(view.shipment.promisedAt) >= from &&
          Date.parse(view.shipment.promisedAt) <= from + 7 * 86_400_000)),
  );
}
