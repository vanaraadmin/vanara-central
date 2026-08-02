export interface BookingEventsBindings {
  DB: D1Database;
}

export type BookingEventType = "new" | "updated" | "cancelled";

export interface BookingEventSnapshot {
  bookingId?: number | null;
  beds24BookingId: number;
  status: string | null;
  arrivalDate: string;
  departureDate: string;
  roomTypeId: number;
  unitId: number | null;
  accommodation: string;
  guestName: string | null;
  adults: number;
  children: number;
  source: string | null;
}

export interface BookingEventRecord {
  id: string;
  type: BookingEventType;
  title: "NEW BOOKING" | "BOOKING UPDATED" | "BOOKING CANCELLED";
  accommodation: string;
  source: string | null;
  occurredAt: string;
}

interface BookingEventRow {
  booking_event_id: number;
  event_type: BookingEventType;
  accommodation: string;
  source: string | null;
  occurred_at: string;
}

function normalizedText(value: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function isCancelled(status: string | null): boolean {
  const value = normalizedText(status);
  return value === "cancelled" || value === "canceled";
}

function significantFields(snapshot: BookingEventSnapshot) {
  return {
    arrivalDate: snapshot.arrivalDate,
    departureDate: snapshot.departureDate,
    roomTypeId: snapshot.roomTypeId,
    unitId: snapshot.unitId,
    guestName: normalizedText(snapshot.guestName),
    guests: snapshot.adults + snapshot.children,
    source: normalizedText(snapshot.source),
  };
}

function stableSignature(input: unknown): string {
  return JSON.stringify(input);
}

function titleFor(type: BookingEventType): BookingEventRecord["title"] {
  if (type === "new") return "NEW BOOKING";
  if (type === "updated") return "BOOKING UPDATED";
  return "BOOKING CANCELLED";
}

export function bookingEventType(previous: BookingEventSnapshot | null, current: BookingEventSnapshot): BookingEventType | null {
  if (!previous) return "new";
  if (!isCancelled(previous.status) && isCancelled(current.status)) return "cancelled";
  if (isCancelled(current.status)) return null;
  return stableSignature(significantFields(previous)) === stableSignature(significantFields(current)) ? null : "updated";
}

export function bookingEventSignature(type: BookingEventType, snapshot: BookingEventSnapshot): string {
  const eventSnapshot = type === "cancelled"
    ? { status: "cancelled", cancelTimeSource: normalizedText(snapshot.status), ...significantFields(snapshot) }
    : significantFields(snapshot);
  return stableSignature({
    beds24BookingId: snapshot.beds24BookingId,
    type,
    eventSnapshot,
  });
}

export async function recordBookingEvent(
  env: BookingEventsBindings,
  previous: BookingEventSnapshot | null,
  current: BookingEventSnapshot,
  occurredAt: string,
): Promise<void> {
  const eventType = bookingEventType(previous, current);
  if (!eventType || !current.bookingId) return;

  await env.DB.prepare(`
    INSERT OR IGNORE INTO booking_events (
      event_type,
      booking_id,
      beds24_booking_id,
      accommodation,
      source,
      event_signature,
      occurred_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventType,
    current.bookingId,
    current.beds24BookingId,
    current.accommodation,
    current.source,
    bookingEventSignature(eventType, current),
    occurredAt,
    occurredAt,
  ).run();
}

export async function listRecentBookingEvents(env: BookingEventsBindings, limit = 3): Promise<BookingEventRecord[]> {
  const rows = await env.DB.prepare(`
    SELECT booking_event_id, event_type, accommodation, source, occurred_at
    FROM booking_events
    WHERE event_type IN ('new', 'updated', 'cancelled')
    ORDER BY occurred_at DESC, booking_event_id DESC
    LIMIT ?
  `).bind(limit).all<BookingEventRow>();

  return (rows.results ?? []).map((row) => ({
    id: String(row.booking_event_id),
    type: row.event_type,
    title: titleFor(row.event_type),
    accommodation: row.accommodation,
    source: row.source,
    occurredAt: row.occurred_at,
  }));
}
