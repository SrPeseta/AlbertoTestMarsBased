export enum Mode {
  Road = "road",
  Sea = "sea",
  Customs = "customs",
}

export enum MilestoneKind {
  Departed = "departed",
  InTransit = "in_transit",
  Port = "port",
  CustomsHold = "customs_hold",
  CustomsClear = "customs_clear",
  OutForDelivery = "out_for_delivery",
  Delivered = "delivered",
  Acknowledged = "acknowledged",
  NeedsReview = "needs_review",
}

export enum Operator {
  Roadline = "Roadline",
  OceanSpan = "OceanSpan",
  Waypoint = "Waypoint",
}

export enum Provenance {
  Confirmed = "confirmed",
  Unmapped = "unmapped",
}

export enum DeliveryRoute {
  Road = "road",
  Multimodal = "multimodal",
}

export enum PersonaRole {
  Operations = "operations",
  Customer = "customer",
}

export enum AlertKind {
  Hold = "hold",
  Overdue = "overdue",
  Risk = "risk",
  Stale = "stale",
  Review = "review",
}

export enum ShipmentStatus {
  Delivered = "delivered",
  Attention = "attention",
  OnTrack = "on_track",
  Pending = "pending",
}

export interface Leg {
  mode: Mode;
  from: string;
  to: string;
  operator: string;
}

export interface OperatorEvent {
  id: string;
  operator: Operator;
  code: string;
  description: string;
  occurredAt: string;
  receivedAt: string;
  leg: number;
}

export interface Milestone {
  id: string;
  kind: MilestoneKind;
  label: string;
  occurredAt: string;
  receivedAt: string;
  operator: string;
  rawCode: string;
  leg: number;
  provenance: Provenance;
}

export interface ShipmentDocument {
  name: string;
  reference: string;
  preview: string;
}

export interface Shipment {
  id: string;
  order: string;
  account: string;
  site: string;
  origin: string;
  destination: string;
  destinationCountry: string;
  promisedAt: string;
  scenarioEstimate?: {
    arrivalAt: string;
    reason: string;
    sourceEventId: string;
    startingAt?: string;
    expectedAt?: string;
  };
  legs: Leg[];
  events: OperatorEvent[];
  documents: ShipmentDocument[];
}

export interface Delivery {
  id: string;
  order: string;
  account: string;
  site: string;
  destination: string;
  destinationCountry: string;
  promisedAt: string;
  route: DeliveryRoute;
}

export interface Persona {
  id: string;
  name: string;
  role: PersonaRole;
  accounts: string[];
  sites: string[];
}

export interface Alert {
  kind: AlertKind;
  label: string;
  explanation: string;
  action: string;
  priority: number;
}

export interface ShipmentView {
  shipment: Shipment;
  milestones: Milestone[];
  lastConfirmed?: Milestone;
  current?: Milestone;
  alerts: Alert[];
  acknowledgedAction?: OperatorEvent;
  status: ShipmentStatus;
}
