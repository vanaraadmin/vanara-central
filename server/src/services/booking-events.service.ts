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
  price: number | null;
  apiSource: string | null;
  channel: string | null;
  apiReference: string | null;
  reference: string | null;
  voucher: string | null;
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
  unitNames: string[];
  roomQuantity: number;
  compactUnitLabel: string;
  assignmentComplete: boolean;
  source: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
  stayNights?: number | null;
  bookingStatus?: string | null;
  guestCount?: number | null;
  totalPrice?: number | null;
}

export interface ListRecentBookingEventsOptions {
  includeBookingValue?: boolean;
}

interface BookingEventRow {
  booking_event_id: number;
  booking_id: number;
  event_type: BookingEventType;
  beds24_booking_id: number;
  master_beds24_booking_id: number | null;
  pulse_group_beds24_booking_id: number | null;
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
  booking_sub_status: string | null;
  adults: number | null;
  children: number | null;
  price: number | null;
  api_source: string | null;
  channel: string | null;
  unit_type: string | null;
  room_type_name: string | null;
  room_name: string | null;
}

interface BookingPulseGroupMemberRow {
  beds24_booking_id: number;
  master_beds24_booking_id: number | null;
  unit_id: number | null;
  unit_name: string | null;
  unit_type: string | null;
  room_type_name: string | null;
  room_name: string | null;
  arrival_date: string | null;
  departure_date: string | null;
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isCancelled(status: string | null): boolean {
  const value = normalizedText(status);
  return value === "cancelled" || value === "canceled";
}

function normalizedNumber(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function significantFields(snapshot: BookingEventSnapshot) {
  return {
    arrivalDate: snapshot.arrivalDate,
    departureDate: snapshot.departureDate,
    roomTypeId: snapshot.roomTypeId,
    unitId: snapshot.unitId,
    guestName: normalizedText(snapshot.guestName),
    guests: snapshot.adults + snapshot.children,
    price: normalizedNumber(snapshot.price),
    source: normalizedText(snapshot.source),
    sourcePayload: {
      apiSource: normalizedText(snapshot.apiSource),
      channel: normalizedText(snapshot.channel),
      apiReference: normalizedText(snapshot.apiReference),
      reference: normalizedText(snapshot.reference),
      voucher: normalizedText(snapshot.voucher),
    },
  };
}

function stableSignature(input: unknown): string {
  return JSON.stringify(input);
}

function eventSortDescending(a: Pick<BookingEventRow, "booking_event_id" | "occurred_at">, b: Pick<BookingEventRow, "booking_event_id" | "occurred_at">): number {
  return b.occurred_at.localeCompare(a.occurred_at) || b.booking_event_id - a.booking_event_id;
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

function pulseGroupKeyFor(row: BookingEventRow): number {
  return row.pulse_group_beds24_booking_id ?? row.master_beds24_booking_id ?? row.beds24_booking_id;
}

function isProviderDeletedBookingPulseRow(row: BookingEventRow): boolean {
  return normalizedText(row.booking_sub_status) === "provider_deleted";
}

function unitSortKey(value: string): [number, number, string] {
  const normalized = normalizedText(value);
  const familyRank = normalized.includes("villa") ? 1 : normalized.includes("bungalow") ? 2 : normalized.includes("tent") || normalized.includes("yurt") ? 3 : 99;
  const numberMatch = normalized.match(/\d+/);
  return [familyRank, numberMatch ? Number(numberMatch[0]) : 9999, normalized];
}

function sortUnitNames(left: string, right: string): number {
  const leftKey = unitSortKey(left);
  const rightKey = unitSortKey(right);
  return leftKey[0] - rightKey[0] || leftKey[1] - rightKey[1] || leftKey[2].localeCompare(rightKey[2]);
}

function uniqueUnitNames(values: Array<string | null | undefined>): string[] {
  const names = new Map<string, string>();
  for (const value of values) {
    const cleaned = cleanOptionalText(value);
    if (!cleaned) continue;
    names.set(normalizedText(cleaned), cleaned);
  }
  return [...names.values()].sort(sortUnitNames);
}

function uniqueGroupMembers(members: BookingPulseGroupMemberRow[]): BookingPulseGroupMemberRow[] {
  const byBooking = new Map<number, BookingPulseGroupMemberRow>();
  for (const member of members) {
    byBooking.set(member.beds24_booking_id, member);
  }
  return [...byBooking.values()];
}

function roomMembersForSummary(members: BookingPulseGroupMemberRow[]): BookingPulseGroupMemberRow[] {
  const unique = uniqueGroupMembers(members);
  const withPhysicalUnit = unique.filter((member) => member.unit_id !== null);
  return withPhysicalUnit.length > 0 ? withPhysicalUnit : unique;
}

function isGroupPulse(row: BookingEventRow, members: BookingPulseGroupMemberRow[]): boolean {
  return pulseGroupKeyFor(row) !== row.beds24_booking_id || uniqueGroupMembers(members).length > 1;
}

function bookingPulseUnitSummaryFor(row: BookingEventRow, members: BookingPulseGroupMemberRow[]) {
  const group = isGroupPulse(row, members);
  const memberRows = group ? roomMembersForSummary(members) : [];
  const rawUnitNames = group ? memberRows.map((member) => member.unit_name) : [row.unit_name];
  const unitNames = uniqueUnitNames(rawUnitNames);
  const roomQuantity = group ? Math.max(uniqueGroupMembers(members).length, unitNames.length, 1) : 1;
  const assignmentComplete = unitNames.length > 0 && unitNames.length >= roomQuantity;
  const fallback = "Unit assignment pending";
  const compactUnitLabel = unitNames.length === 0
    ? fallback
    : unitNames.length > 2
      ? `${unitNames.slice(0, 2).join(", ")} +${unitNames.length - 2}`
      : unitNames.join(", ");

  return {
    unitNames,
    roomQuantity,
    compactUnitLabel,
    assignmentComplete,
    unitName: unitNames.length > 0 ? unitNames.join(", ") : fallback,
  };
}

function groupUnitIdFor(row: BookingEventRow, members: BookingPulseGroupMemberRow[]): number | null {
  if (!isGroupPulse(row, members)) return row.unit_id;
  const unitIds = new Set(roomMembersForSummary(members).map((member) => member.unit_id).filter((value): value is number => value !== null));
  return unitIds.size === 1 ? [...unitIds][0] : null;
}

function groupDateFor(
  row: BookingEventRow,
  members: BookingPulseGroupMemberRow[],
  field: "arrival_date" | "departure_date",
): string | null {
  if (!isGroupPulse(row, members)) return row[field];
  const values = roomMembersForSummary(members)
    .map((member) => member[field])
    .filter((value): value is string => Boolean(value));
  if (values.length === 0) return row[field];
  values.sort();
  return field === "arrival_date" ? values[0] : values[values.length - 1];
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

function cleanOptionalNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toBookingPulseItem(row: BookingEventRow, options: ListRecentBookingEventsOptions, groupMembers: BookingPulseGroupMemberRow[] = []): BookingPulseItem {
  const eventType = pulseTypeFor(row.event_type);
  const includeBookingValue = options.includeBookingValue === true;
  const groupKey = pulseGroupKeyFor(row);
  const arrivalDate = groupDateFor(row, groupMembers, "arrival_date");
  const departureDate = groupDateFor(row, groupMembers, "departure_date");
  const unitSummary = bookingPulseUnitSummaryFor(row, groupMembers);
  return {
    eventId: `${groupKey}:${eventType}:${row.occurred_at}`,
    bookingId: String(groupKey),
    eventType,
    eventTimestamp: row.occurred_at,
    guestName: cleanOptionalText(row.guest_name) ?? "Guest name unavailable",
    nationality: cleanOptionalText(row.country) ?? cleanOptionalText(row.country_code),
    countryCode: cleanOptionalText(row.country_code),
    unitId: groupUnitIdFor(row, groupMembers),
    unitName: unitSummary.unitName,
    unitNames: unitSummary.unitNames,
    roomQuantity: unitSummary.roomQuantity,
    compactUnitLabel: unitSummary.compactUnitLabel,
    assignmentComplete: unitSummary.assignmentComplete,
    source: sourceFor(row),
    arrivalDate,
    departureDate,
    stayNights: stayNights(arrivalDate, departureDate),
    bookingStatus: cleanOptionalText(row.booking_status),
    guestCount: guestCount(row),
    totalPrice: includeBookingValue ? cleanOptionalNumber(row.price) : null,
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
  if (isCancelled(previous.status) && !isCancelled(current.status)) return "updated";
  if (isCancelled(current.status)) return null;
  return stableSignature(significantFields(previous)) === stableSignature(significantFields(current)) ? null : "updated";
}

export function bookingEventSignature(type: BookingEventType, snapshot: BookingEventSnapshot, previous?: BookingEventSnapshot | null): string {
  const eventSnapshot = type === "cancelled"
    ? { status: "cancelled", cancelTimeSource: normalizedText(snapshot.status), ...significantFields(snapshot) }
    : type === "updated"
      ? {
          status: normalizedText(snapshot.status),
          restoredFromCancelled: previous ? isCancelled(previous.status) && !isCancelled(snapshot.status) : false,
          ...significantFields(snapshot),
        }
    : significantFields(snapshot);
  return stableSignature({
    beds24BookingId: snapshot.beds24BookingId,
    type,
    eventSnapshot,
  });
}

function retentionCutoffFor(occurredAt: string): string | null {
  const eventTime = new Date(occurredAt).getTime();
  if (!Number.isFinite(eventTime)) return null;
  return new Date(eventTime - BOOKING_PULSE_RETENTION_HOURS * 60 * 60 * 1000).toISOString();
}

async function hasActiveNewEvent(env: BookingEventsBindings, bookingId: number, occurredAt: string): Promise<boolean> {
  const cutoff = retentionCutoffFor(occurredAt);
  if (!cutoff) return false;

  const row = await env.DB.prepare(`
    SELECT booking_event_id
    FROM booking_events
    WHERE booking_id = ?
      AND event_type = 'new'
      AND occurred_at > ?
      AND occurred_at <= ?
    ORDER BY occurred_at DESC, booking_event_id DESC
    LIMIT 1
  `).bind(bookingId, cutoff, occurredAt).first<{ booking_event_id: number }>();

  return Boolean(row);
}

export async function recordBookingEvent(
  env: BookingEventsBindings,
  previous: BookingEventSnapshot | null,
  current: BookingEventSnapshot,
  occurredAt: string,
): Promise<void> {
  const eventType = bookingEventType(previous, current);
  if (!eventType || !current.bookingId) return;
  if (eventType === "updated" && await hasActiveNewEvent(env, current.bookingId, occurredAt)) return;

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
    bookingEventSignature(eventType, current, previous),
    occurredAt,
    occurredAt,
  ).run();
}

function bookingPulseRowFor(rows: BookingEventRow[]): BookingEventRow {
  const sorted = rows.slice().sort(eventSortDescending);
  const latest = sorted[0];
  if (latest.event_type === "cancelled") return latest;
  return sorted.find((row) => row.event_type === "new") ?? latest;
}

async function loadBookingPulseGroupMembers(env: BookingEventsBindings, groupKey: number): Promise<BookingPulseGroupMemberRow[]> {
  const rows = await env.DB.prepare(`
    SELECT DISTINCT
      b.beds24_booking_id,
      b.master_beds24_booking_id,
      b.unit_id,
      u.unit_name,
      u.unit_type,
      rt.room_type_name,
      rt.room_name,
      b.arrival_date,
      b.departure_date
    FROM bookings b
    LEFT JOIN booking_group_members gm
      ON gm.member_beds24_booking_id = b.beds24_booking_id
    LEFT JOIN units u
      ON u.unit_id = b.unit_id
    LEFT JOIN room_types rt
      ON rt.room_type_id = b.room_type_id
    WHERE b.beds24_booking_id = ?
       OR b.master_beds24_booking_id = ?
       OR gm.master_beds24_booking_id = ?
    ORDER BY
      CASE WHEN b.beds24_booking_id = ? THEN 0 ELSE 1 END,
      u.position,
      b.beds24_booking_id
  `).bind(groupKey, groupKey, groupKey, groupKey).all<BookingPulseGroupMemberRow>();

  return rows.results ?? [];
}

export async function listRecentBookingEvents(
  env: BookingEventsBindings,
  limit = 3,
  now = new Date(),
  options: ListRecentBookingEventsOptions = {},
): Promise<BookingPulseItem[]> {
  const readLimit = Math.max(limit * 10, 50);
  const rows = await env.DB.prepare(`
    SELECT
      be.booking_event_id,
      be.booking_id,
      be.event_type,
      be.beds24_booking_id,
      b.master_beds24_booking_id,
      COALESCE(b.master_beds24_booking_id, gm.master_beds24_booking_id, b.beds24_booking_id) AS pulse_group_beds24_booking_id,
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
      b.sub_status AS booking_sub_status,
      b.adults,
      b.children,
      b.price,
      b.api_source,
      b.channel,
      u.unit_type,
      rt.room_type_name,
      rt.room_name
    FROM booking_events be
    INNER JOIN bookings b
      ON b.booking_id = be.booking_id
    LEFT JOIN booking_group_members gm
      ON gm.member_beds24_booking_id = b.beds24_booking_id
    LEFT JOIN units u
      ON u.unit_id = b.unit_id
    LEFT JOIN room_types rt
      ON rt.room_type_id = b.room_type_id
    WHERE be.event_type IN ('new', 'updated', 'cancelled')
      AND lower(trim(COALESCE(b.sub_status, ''))) <> 'provider_deleted'
    ORDER BY be.occurred_at DESC, be.booking_event_id DESC
    LIMIT ?
  `).bind(readLimit).all<BookingEventRow>();

  const rowsByGroup = new Map<string, BookingEventRow[]>();

  for (const row of rows.results ?? []) {
    if (!isBookingPulseEventVisible(row.occurred_at, now)) continue;
    if (isProviderDeletedBookingPulseRow(row)) continue;
    const bookingKey = String(pulseGroupKeyFor(row));
    rowsByGroup.set(bookingKey, [...(rowsByGroup.get(bookingKey) ?? []), row]);
  }

  const pulseRows = [...rowsByGroup.values()]
    .map(bookingPulseRowFor)
    .sort(eventSortDescending)
    .slice(0, limit);

  const groupMembers = new Map<number, BookingPulseGroupMemberRow[]>();
  await Promise.all(pulseRows.map(async (row) => {
    const groupKey = pulseGroupKeyFor(row);
    groupMembers.set(groupKey, await loadBookingPulseGroupMembers(env, groupKey));
  }));

  return pulseRows.map((row) => toBookingPulseItem(row, options, groupMembers.get(pulseGroupKeyFor(row)) ?? []));
}
