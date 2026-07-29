export type MovementEventType = "Arrival" | "Departure" | "CheckoutConfirmed" | "AutomaticFallback";
export type ArrivalActionStatus = "Pending";
export type DepartureActionStatus = "Pending" | "CheckoutConfirmed" | "AutomaticFallback";

export interface ArrivalMovement {
  id: string;
  bookingId: number;
  unitId: number | null;
  eventType: "Arrival";
  room: string;
  guestName: string;
  eta: string | null;
  roomStatus: string;
  notes: string | null;
  actionStatus: ArrivalActionStatus;
}

export interface DepartureMovement {
  id: string;
  bookingId: number;
  unitId: number | null;
  eventType: "Departure";
  room: string;
  guestName: string;
  scheduledCheckout: string;
  occupancyStatus: string;
  checkoutEvent: {
    type: "CheckoutConfirmed" | "AutomaticFallback" | null;
    source: "reception" | "automatic-fallback" | "none";
    label: string;
  };
  actionStatus: DepartureActionStatus;
}

export interface ArrivalsDeparturesAgenda {
  date: string;
  arrivals: ArrivalMovement[];
  departures: DepartureMovement[];
  futureEvents: Array<{
    type: MovementEventType;
    implemented: false;
  }>;
  summary: {
    arrivals: number;
    departures: number;
    checkoutConfirmed: number;
    automaticFallback: number;
  };
}

export interface ArrivalsDeparturesResponse {
  success: boolean;
  data?: ArrivalsDeparturesAgenda;
  error?: string;
}
