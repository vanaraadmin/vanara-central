export interface BookingEventsBindings {
  DB: D1Database;
}

export type BookingEventType = "new" | "updated" | "cancelled";
export type BookingPulseEventType = "NEW" | "UPDATED" | "CANCELLED";

export const BOOKING_PULSE_RETENTION_HOURS = 24;
export const BOOKING_PULSE_RESORT_TIME_ZONE = "Asia/Bangkok";

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

export interface BookingPulseItem {
  eventId: string;
  bookingId: string;
  eventType: BookingPulseEventType;
  eventTimestamp: string;
  guestName: string;
  nationality?: string | null;
  countryCode?: string | null;
  unitId?: number | null;
  unitName?: string | null;
  source: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
  stayNights?: number | null;
  bookingStatus?: string | null;
  guestCount?: number | null;
  totalPrice?: number | null;
  currency?: string | null;
}

interface BookingEventRow {
  booking_event_id: number;
  event_type: BookingEventType;
  beds24_booking_id: number;
  event_accommodation: string;
  event_source: string | null;
  occurred_at: string;
  guest_name: string | null;
  country: string | null;
  country_code: string | null;
  unit_id: number | null;
  unit_name: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  booking_status: string | null;
  adults: number | null;
  children: number | null;
  api_source: string | null;
  channel: string | null;
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

function pulseTypeFor(type: BookingEventType): BookingPulseEventType {
  if (type === "new") return "NEW";
  if (type === "updated") return "UPDATED";
  return "CANCELLED";
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function sourceFor(row: BookingEventRow): string | null {
  return cleanOptionalText(row.event_source) ?? cleanOptionalText(row.channel) ?? cleanOptionalText(row.api_source);
}

function dateOnlyToTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(`${value}T00:00:00+07:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function stayNights(arrivalDate: string | null, departureDate: string | null): number | null {
  const arrival = dateOnlyToTime(arrivalDate);
  const departure = dateOnlyToTime(departureDate);
  if (arrival === null || departure === null) return null;
  const nights = Math.round((departure - arrival) / 86_400_000);
  return nights >= 0 ? nights : null;
}

function guestCount(row: BookingEventRow): number | null {
  const adults = typeof row.adults === "number" && Number.isFinite(row.adults) ? row.adults : 0;
  const children = typeof row.children === "number" && Number.isFinite(row.children) ? row.children : 0;
  const total = adults + children;
  return total > 0 ? total : null;
}

function toBookingPulseItem(row: BookingEventRow): BookingPulseItem {
  const eventType = pulseTypeFor(row.event_type);
  return {
    eventId: `${row.beds24_booking_id}:${eventType}:${row.occurred_at}`,
    bookingId: String(row.beds24_booking_id),
    eventType,
    eventTimestamp: row.occurred_at,
    guestName: cleanOptionalText(row.guest_name) ?? "Guest name unavailable",
    nationality: cleanOptionalText(row.country) ?? cleanOptionalText(row.country_code),
    countryCode: cleanOptionalText(row.country_code),
    unitId: row.unit_id,
    unitName: cleanOptionalText(row.unit_name) ?? cleanOptionalText(row.event_accommodation),
    source: sourceFor(row),
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    stayNights: stayNights(row.arrival_date, row.departure_date),
    bookingStatus: cleanOptionalText(row.booking_status),
    guestCount: guestCount(row),
    totalPrice: null,
    currency: null,
  };
}

export function isBookingPulseEventVisible(eventTimestamp: string, now: Date): boolean {
  const eventTime = new Date(eventTimestamp).getTime();
  const currentTime = now.getTime();

  if (!Number.isFinite(eventTime) || !Number.isFinite(currentTime)) return false;

  const ageMs = currentTime - eventTime;
  const retentionMs = BOOKING_PULSE_RETENTION_HOURS * 60 * 60 * 1000;

  return ageMs >= 0 && ageMs < retentionMs;
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

export async function listRecentBookingEvents(env: BookingEventsBindings, limit = 3, now = new Date()): Promise<BookingPulseItem[]> {
  const readLimit = Math.max(limit * 10, 50);
  const rows = await env.DB.prepare(`
    SELECT
      be.booking_event_id,
      be.event_type,
      be.beds24_booking_id,
      be.accommodation AS event_accommodation,
      be.source AS event_source,
      be.occurred_at,
      b.guest_name,
      b.country,
      b.country_code,
      b.unit_id,
      u.unit_name,
      b.arrival_date,
      b.departure_date,
      b.status AS booking_status,
      b.adults,
      b.children,
      b.api_source,
      b.channel
    FROM booking_events be
    INNER JOIN bookings b
      ON b.booking_id = be.booking_id
    LEFT JOIN units u
      ON u.unit_id = b.unit_id
    WHERE be.event_type IN ('new', 'updated', 'cancelled')
    ORDER BY be.occurred_at DESC, be.booking_event_id DESC
    LIMIT ?
  `).bind(readLimit).all<BookingEventRow>();

  const seenBookings = new Set<string>();
  const items: BookingPulseItem[] = [];

  for (const row of rows.results ?? []) {
    if (!isBookingPulseEventVisible(row.occurred_at, now)) continue;
    const bookingKey = String(row.beds24_booking_id);
    if (seenBookings.has(bookingKey)) continue;

    seenBookings.add(bookingKey);
    items.push(toBookingPulseItem(row));
    if (items.length >= limit) break;
  }

  return items;
}
