import { getHousekeepingOverview, type CheckoutCompletionSource, type HousekeepingBindings } from "./housekeeping-overview.service.js";
import { getBangkokDate } from "./today.service.js";

export interface MovementsBindings extends HousekeepingBindings {
  DB: D1Database;
}

export type MovementEventType = "Arrival" | "Departure" | "CheckoutConfirmed" | "AutomaticFallback";
export type ArrivalActionStatus = "Pending";
export type DepartureActionStatus = "Pending" | "CheckoutConfirmed" | "AutomaticFallback";

interface MovementRow {
  beds24_booking_id: number;
  unit_id: number | null;
  unit_name: string | null;
  room_type_name: string;
  guest_name: string | null;
  arrival_date: string;
  departure_date: string;
  arrival_time: string | null;
  status: string;
  notes: string | null;
}

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
    source: CheckoutCompletionSource;
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

function roomName(row: MovementRow): string {
  return row.unit_name || row.room_type_name || "Room not assigned";
}

function guestName(row: MovementRow): string {
  return row.guest_name || "Guest name unavailable";
}

function normalizeArrival(row: MovementRow): ArrivalMovement {
  return {
    id: `arrival:${row.beds24_booking_id}`,
    bookingId: row.beds24_booking_id,
    unitId: row.unit_id,
    eventType: "Arrival",
    room: roomName(row),
    guestName: guestName(row),
    eta: row.arrival_time,
    roomStatus: row.unit_id ? "Assigned" : "Needs Room",
    notes: null,
    actionStatus: "Pending",
  };
}

function checkoutEvent(source: CheckoutCompletionSource): DepartureMovement["checkoutEvent"] {
  switch (source) {
    case "reception":
      return {
        type: "CheckoutConfirmed",
        source,
        label: "Checkout Confirmed by Reception",
      };
    case "automatic-fallback":
      return {
        type: "AutomaticFallback",
        source,
        label: "Automatic Checkout Fallback",
      };
    case "none":
      return {
        type: null,
        source,
        label: "Waiting for Reception",
      };
  }
}

function departureStatus(source: CheckoutCompletionSource): DepartureActionStatus {
  if (source === "reception") return "CheckoutConfirmed";
  if (source === "automatic-fallback") return "AutomaticFallback";
  return "Pending";
}

export async function getArrivalsDeparturesAgenda(env: MovementsBindings): Promise<ArrivalsDeparturesAgenda> {
  const date = getBangkokDate();
  const housekeeping = await getHousekeepingOverview(env);
  const checkoutByUnit = new Map(housekeeping.rooms.map((room) => [room.unitId, room.checkoutCompletionSource]));

  const baseSql = `
    SELECT b.beds24_booking_id, b.unit_id, u.unit_name, rt.room_type_name,
           b.guest_name, b.arrival_date, b.departure_date, b.arrival_time,
           b.status, b.notes
    FROM bookings b
    JOIN room_types rt ON rt.room_type_id = b.room_type_id
    LEFT JOIN units u ON u.unit_id = b.unit_id
    WHERE lower(b.status) NOT IN ('cancelled', 'canceled')
  `;

  const [arrivalRows, departureRows] = await Promise.all([
    env.DB.prepare(`${baseSql} AND b.arrival_date = ? ORDER BY u.position, u.unit_name`).bind(date).all<MovementRow>(),
    env.DB.prepare(`${baseSql} AND b.departure_date = ? ORDER BY u.position, u.unit_name`).bind(date).all<MovementRow>(),
  ]);

  const arrivals = (arrivalRows.results ?? []).map(normalizeArrival);
  const departures = (departureRows.results ?? []).map((row): DepartureMovement => {
    const source = row.unit_id ? checkoutByUnit.get(row.unit_id) ?? "none" : "none";
    return {
      id: `departure:${row.beds24_booking_id}`,
      bookingId: row.beds24_booking_id,
      unitId: row.unit_id,
      eventType: "Departure",
      room: roomName(row),
      guestName: guestName(row),
      scheduledCheckout: row.departure_date,
      occupancyStatus: source === "none" ? "Occupied" : "Checked Out",
      checkoutEvent: checkoutEvent(source),
      actionStatus: departureStatus(source),
    };
  });

  return {
    date,
    arrivals,
    departures,
    futureEvents: [
      { type: "Arrival", implemented: false },
      { type: "Departure", implemented: false },
      { type: "CheckoutConfirmed", implemented: false },
      { type: "AutomaticFallback", implemented: false },
    ],
    summary: {
      arrivals: arrivals.length,
      departures: departures.length,
      checkoutConfirmed: departures.filter((departure) => departure.checkoutEvent.type === "CheckoutConfirmed").length,
      automaticFallback: departures.filter((departure) => departure.checkoutEvent.type === "AutomaticFallback").length,
    },
  };
}
