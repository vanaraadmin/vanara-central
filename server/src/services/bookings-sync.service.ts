import {
  beds24Get,
  beds24GetAbsolute,
  type Beds24Bindings,
} from "./beds24-client.service.js";
import { sanitizeLogMessage } from "./log-safety.service.js";
import { SyncMetrics } from "./sync-metrics.service.js";
import {
  acquireSyncLock,
  recordSkippedSyncRun,
  releaseSyncLock,
} from "./sync-lock.service.js";

export interface BookingsSyncBindings extends Beds24Bindings {
  DB: D1Database;
}

interface Beds24Guest {
  id?: number;
  title?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countryCode?: string;
  country2?: string;
  flagText?: string;
  flagColor?: string;
  note?: string;
  [key: string]: unknown;
}

interface Beds24InfoItem {
  code?: string;
  name?: string;
  text?: unknown;
  value?: unknown;
  [key: string]: unknown;
}

type Beds24CancellationRule =
  | string
  | {
      type?: string;
      daysBeforeArrival?: number;
      days?: number;
      daysBeforeArrivalValue?: number;
      [key: string]: unknown;
    };

type Beds24BookingGroupItem = {
  id?: number;
  bookingId?: number;
  masterId?: number | null;
  isMaster?: boolean;
  bookings?: Beds24BookingGroupItem[];
  [key: string]: unknown;
};

type Beds24BookingGroupPayload =
  | Beds24BookingGroupItem
  | Beds24BookingGroupItem[]
  | null;

interface Beds24Booking {
  id: number;
  masterId?: number | null;
  propertyId: number;
  roomId: number;
  unitId?: number | null;
  roomQty?: number;
  offerId?: number | null;
  status?: string;
  subStatus?: string;
  statusCode?: number;
  arrival?: string;
  departure?: string;
  arrivalTime?: string;
  numAdult?: number;
  numChild?: number;
  title?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countryCode?: string;
  country2?: string;
  lang?: string;
  comments?: string;
  notes?: string;
  message?: string;
  groupNote?: string;
  custom1?: string;
  custom2?: string;
  custom3?: string;
  custom4?: string;
  custom5?: string;
  custom6?: string;
  custom7?: string;
  custom8?: string;
  custom9?: string;
  custom10?: string;
  flagColor?: string;
  flagText?: string;
  price?: number;
  deposit?: number;
  tax?: number;
  commission?: number;
  currency?: string;
  rateDescription?: string;
  invoiceeId?: number | null;
  allowChannelUpdate?: string;
  allowAutoAction?: string;
  allowReview?: string;
  allowCancellation?: Beds24CancellationRule;
  cancellation?: Beds24CancellationRule;
  bookingTime?: string;
  modifiedTime?: string;
  cancelTime?: string | null;
  apiSourceId?: number;
  apiSource?: string;
  channel?: string;
  apiReference?: string;
  reference?: string;
  voucher?: string;
  referer?: string;
  refererEditable?: string;
  guest?: Beds24Guest | Beds24Guest[];
  guests?: Beds24Guest[];
  infoItems?: Beds24InfoItem[];
  bookingGroup?: Beds24BookingGroupPayload;
  [key: string]: unknown;
}

interface Beds24BookingsResponse {
  success?: boolean;
  error?: string;
  count?: number;
  data?: Beds24Booking[];
  pages?: { nextPageExists?: boolean; nextPageLink?: string | null };
}

interface PropertyMapRow {
  property_id: number;
  beds24_property_id: number;
}
interface RoomMapRow {
  room_type_id: number;
  beds24_room_id: number;
}
interface UnitMapRow {
  unit_id: number;
  room_type_id: number;
  beds24_unit_id: number;
}
interface OfferMapRow {
  offer_id: number;
  room_type_id: number;
  beds24_offer_id: number;
}

interface BookingGroupMember {
  masterBeds24BookingId: number;
  memberBeds24BookingId: number;
  isMaster: boolean;
  raw: unknown;
}

interface CancellationFields {
  type: string | null;
  daysBeforeArrival: number | null;
}

export interface NormalizedBookingFields {
  countryCode: string | null;
  cancellationType: string | null;
  cancellationDaysBeforeArrival: number | null;
  guests: Beds24Guest[];
  infoItems: Beds24InfoItem[];
  bookingGroupMembers: BookingGroupMember[];
}

export interface BookingsSyncResult {
  ok: true;
  mode: "initial" | "incremental";
  modifiedFrom: string;
  pagesRead: number;
  recordsRead: number;
  recordsWritten: number;
  recordsSkipped: number;
  recordsFailed: number;
  startedAt: string;
  finishedAt: string;
  skipped?: boolean;
  skippedReason?: string;
}

const CURSOR_NAME = "bookings_modified_cursor";
const SYNC_TYPE = "bookings";
const INITIAL_FROM = "2000-01-01T00:00:00Z";
const OVERLAP_MS = 5 * 60 * 1000;
const BOOKING_SYNC_STATUS_FILTERS = [null, "cancelled"] as const;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrFalse(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "yes";
}

function guestName(booking: Beds24Booking): string | null {
  const value = [text(booking.firstName), text(booking.lastName)].filter(Boolean).join(" ");
  return value || null;
}

function channelName(booking: Beds24Booking): string | null {
  return text(booking.channel) ?? text(booking.apiSource);
}

function cursorWithOverlap(cursor: string): string {
  const parsed = Date.parse(cursor);
  return Number.isFinite(parsed) ? new Date(parsed - OVERLAP_MS).toISOString() : INITIAL_FROM;
}

function countryCodeFrom(value: { countryCode?: string; country2?: string }): string | null {
  return text(value.countryCode) ?? text(value.country2);
}

function cancellationFrom(booking: Beds24Booking): CancellationFields {
  const rule = booking.cancellation ?? booking.allowCancellation;

  if (typeof rule === "string") {
    return { type: text(rule), daysBeforeArrival: null };
  }

  if (!rule || typeof rule !== "object") {
    return { type: null, daysBeforeArrival: null };
  }

  return {
    type: text(rule.type),
    daysBeforeArrival:
      numberOrNull(rule.daysBeforeArrival) ??
      numberOrNull(rule.daysBeforeArrivalValue) ??
      numberOrNull(rule.days),
  };
}

function normalizeGuests(booking: Beds24Booking): Beds24Guest[] {
  if (Array.isArray(booking.guests)) {
    return booking.guests;
  }

  if (Array.isArray(booking.guest)) {
    return booking.guest;
  }

  if (booking.guest && typeof booking.guest === "object") {
    return [booking.guest];
  }

  return [];
}

function normalizeInfoItems(booking: Beds24Booking): Beds24InfoItem[] {
  return Array.isArray(booking.infoItems) ? booking.infoItems : [];
}

function groupItemsFrom(payload: Beds24BookingGroupPayload | undefined): Beds24BookingGroupItem[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  const nested = Array.isArray(payload.bookings) ? payload.bookings : [];
  return nested.length > 0 ? nested : [payload];
}

export function normalizeBookingGroupMembers(booking: Beds24Booking): BookingGroupMember[] {
  const members: BookingGroupMember[] = [];
  const seen = new Set<string>();

  if (typeof booking.masterId === "number") {
    const key = `${booking.masterId}:${booking.id}`;
    seen.add(key);
    members.push({
      masterBeds24BookingId: booking.masterId,
      memberBeds24BookingId: booking.id,
      isMaster: booking.masterId === booking.id,
      raw: { masterId: booking.masterId, bookingId: booking.id },
    });
  }

  for (const item of groupItemsFrom(booking.bookingGroup)) {
    const memberId = numberOrNull(item.bookingId) ?? numberOrNull(item.id);
    const masterId =
      numberOrNull(item.masterId) ??
      numberOrNull(booking.masterId) ??
      (booleanOrFalse(item.isMaster) ? memberId : null);

    if (memberId === null || masterId === null) {
      continue;
    }

    const key = `${masterId}:${memberId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    members.push({
      masterBeds24BookingId: masterId,
      memberBeds24BookingId: memberId,
      isMaster: booleanOrFalse(item.isMaster) || masterId === memberId,
      raw: item,
    });
  }

  return members;
}

export function normalizeBookingFields(booking: Beds24Booking): NormalizedBookingFields {
  const cancellation = cancellationFrom(booking);
  return {
    countryCode: countryCodeFrom(booking),
    cancellationType: cancellation.type,
    cancellationDaysBeforeArrival: cancellation.daysBeforeArrival,
    guests: normalizeGuests(booking),
    infoItems: normalizeInfoItems(booking),
    bookingGroupMembers: normalizeBookingGroupMembers(booking),
  };
}

export function shouldAdvanceBookingsCursor(status: "success" | "failed"): boolean {
  return status === "success";
}

export function bookingSyncQueries(modifiedFrom: string): Record<string, string | boolean>[] {
  return BOOKING_SYNC_STATUS_FILTERS.map((status) => ({
    modifiedFrom,
    includeBookingGroup: true,
    includeGuests: true,
    includeInfoItems: true,
    ...(status ? { status } : {}),
  }));
}

async function loadMaps(env: BookingsSyncBindings) {
  const [properties, rooms, units, offers] = await Promise.all([
    env.DB.prepare("SELECT property_id, beds24_property_id FROM properties WHERE active = 1").all<PropertyMapRow>(),
    env.DB.prepare("SELECT room_type_id, beds24_room_id FROM room_types WHERE active = 1").all<RoomMapRow>(),
    env.DB.prepare("SELECT unit_id, room_type_id, beds24_unit_id FROM units WHERE active = 1").all<UnitMapRow>(),
    env.DB.prepare("SELECT offer_id, room_type_id, beds24_offer_id FROM offers WHERE active = 1").all<OfferMapRow>(),
  ]);
  return {
    properties: new Map((properties.results ?? []).map((row) => [row.beds24_property_id, row.property_id])),
    rooms: new Map((rooms.results ?? []).map((row) => [row.beds24_room_id, row.room_type_id])),
    units: new Map((units.results ?? []).map((row) => [`${row.room_type_id}:${row.beds24_unit_id}`, row.unit_id])),
    offers: new Map((offers.results ?? []).map((row) => [`${row.room_type_id}:${row.beds24_offer_id}`, row.offer_id])),
  };
}

async function upsertBooking(
  env: BookingsSyncBindings,
  booking: Beds24Booking,
  maps: Awaited<ReturnType<typeof loadMaps>>,
  syncedAt: string,
): Promise<number> {
  const propertyId = maps.properties.get(booking.propertyId);
  const roomTypeId = maps.rooms.get(booking.roomId);
  if (!propertyId || !roomTypeId || !booking.arrival || !booking.departure) {
    return 0;
  }

  const unitId = booking.unitId == null ? null : maps.units.get(`${roomTypeId}:${booking.unitId}`) ?? null;
  const offerId = booking.offerId == null ? null : maps.offers.get(`${roomTypeId}:${booking.offerId}`) ?? null;
  const normalized = normalizeBookingFields(booking);

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      INSERT INTO bookings (
        beds24_booking_id, property_id, room_type_id, unit_id, offer_id,
        api_source_id, api_source, channel, api_reference, reference, voucher, referer, referer_editable,
        master_beds24_booking_id, room_quantity, status, sub_status, status_code,
        arrival_date, departure_date, arrival_time, adults, children,
        guest_title, first_name, last_name, guest_name, email, phone, mobile, fax, company,
        address, city, state, postcode, country, country_code, language_code,
        comments, notes, guest_message, group_note,
        custom1, custom2, custom3, custom4, custom5, custom6, custom7, custom8, custom9, custom10,
        flag_color, flag_text, price, deposit, tax, commission, currency, rate_description, invoicee_id,
        allow_channel_update, allow_auto_action, allow_review,
        cancellation_type, cancellation_days_before_arrival,
        booking_time, modified_time, cancel_time, raw_json, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT (beds24_booking_id) DO UPDATE SET
        property_id=excluded.property_id, room_type_id=excluded.room_type_id, unit_id=excluded.unit_id,
        offer_id=excluded.offer_id, api_source_id=excluded.api_source_id, api_source=excluded.api_source,
        channel=excluded.channel, api_reference=excluded.api_reference, reference=excluded.reference,
        voucher=excluded.voucher, referer=excluded.referer, referer_editable=excluded.referer_editable,
        master_beds24_booking_id=excluded.master_beds24_booking_id, room_quantity=excluded.room_quantity,
        status=excluded.status, sub_status=excluded.sub_status, status_code=excluded.status_code,
        arrival_date=excluded.arrival_date, departure_date=excluded.departure_date, arrival_time=excluded.arrival_time,
        adults=excluded.adults, children=excluded.children, guest_title=excluded.guest_title,
        first_name=excluded.first_name, last_name=excluded.last_name, guest_name=excluded.guest_name,
        email=excluded.email, phone=excluded.phone, mobile=excluded.mobile, fax=excluded.fax, company=excluded.company,
        address=excluded.address, city=excluded.city, state=excluded.state, postcode=excluded.postcode,
        country=excluded.country, country_code=excluded.country_code, language_code=excluded.language_code,
        comments=excluded.comments, notes=excluded.notes, guest_message=excluded.guest_message, group_note=excluded.group_note,
        custom1=excluded.custom1, custom2=excluded.custom2, custom3=excluded.custom3, custom4=excluded.custom4,
        custom5=excluded.custom5, custom6=excluded.custom6, custom7=excluded.custom7, custom8=excluded.custom8,
        custom9=excluded.custom9, custom10=excluded.custom10, flag_color=excluded.flag_color, flag_text=excluded.flag_text,
        price=excluded.price, deposit=excluded.deposit, tax=excluded.tax, commission=excluded.commission,
        currency=excluded.currency, rate_description=excluded.rate_description, invoicee_id=excluded.invoicee_id,
        allow_channel_update=excluded.allow_channel_update, allow_auto_action=excluded.allow_auto_action,
        allow_review=excluded.allow_review, cancellation_type=excluded.cancellation_type,
        cancellation_days_before_arrival=excluded.cancellation_days_before_arrival,
        booking_time=excluded.booking_time, modified_time=excluded.modified_time, cancel_time=excluded.cancel_time,
        raw_json=excluded.raw_json, updated_at=excluded.updated_at
    `).bind(
      booking.id, propertyId, roomTypeId, unitId, offerId,
      numberOrNull(booking.apiSourceId), text(booking.apiSource), channelName(booking), text(booking.apiReference),
      text(booking.reference), text(booking.voucher), text(booking.referer), text(booking.refererEditable),
      numberOrNull(booking.masterId), numberOrNull(booking.roomQty), text(booking.status) ?? "confirmed",
      text(booking.subStatus), numberOrNull(booking.statusCode), booking.arrival, booking.departure,
      text(booking.arrivalTime), numberOrNull(booking.numAdult) ?? 0, numberOrNull(booking.numChild) ?? 0,
      text(booking.title), text(booking.firstName), text(booking.lastName), guestName(booking), text(booking.email),
      text(booking.phone), text(booking.mobile), text(booking.fax), text(booking.company), text(booking.address),
      text(booking.city), text(booking.state), text(booking.postcode), text(booking.country), normalized.countryCode,
      text(booking.lang), text(booking.comments), text(booking.notes), text(booking.message), text(booking.groupNote),
      text(booking.custom1), text(booking.custom2), text(booking.custom3), text(booking.custom4), text(booking.custom5),
      text(booking.custom6), text(booking.custom7), text(booking.custom8), text(booking.custom9), text(booking.custom10),
      text(booking.flagColor), text(booking.flagText), numberOrNull(booking.price), numberOrNull(booking.deposit),
      numberOrNull(booking.tax), numberOrNull(booking.commission), text(booking.currency), text(booking.rateDescription),
      numberOrNull(booking.invoiceeId), text(booking.allowChannelUpdate), text(booking.allowAutoAction),
      text(booking.allowReview), normalized.cancellationType, normalized.cancellationDaysBeforeArrival,
      text(booking.bookingTime), text(booking.modifiedTime), text(booking.cancelTime), JSON.stringify(booking), syncedAt, syncedAt,
    ),
    env.DB.prepare(`
      DELETE FROM booking_guests
      WHERE booking_id = (SELECT booking_id FROM bookings WHERE beds24_booking_id = ?)
    `).bind(booking.id),
    env.DB.prepare(`
      DELETE FROM booking_info_items
      WHERE booking_id = (SELECT booking_id FROM bookings WHERE beds24_booking_id = ?)
    `).bind(booking.id),
    env.DB.prepare(`
      DELETE FROM booking_group_members
      WHERE member_beds24_booking_id = ?
         OR (master_beds24_booking_id = ? AND ? = 1)
    `).bind(
      booking.id,
      booking.id,
      normalized.bookingGroupMembers.some((member) => member.masterBeds24BookingId === booking.id) ? 1 : 0,
    ),
  ];

  for (const guest of normalized.guests) {
    statements.push(env.DB.prepare(`
      INSERT INTO booking_guests (
        booking_id, beds24_guest_id, guest_title, first_name, last_name, email, phone, mobile, company,
        address, city, state, postcode, country, country_code, flag_text, flag_color, note,
        custom1, custom2, custom3, custom4, custom5, custom6, custom7, custom8, custom9, custom10,
        raw_json, created_at, updated_at
      ) VALUES (
        (SELECT booking_id FROM bookings WHERE beds24_booking_id = ?),
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).bind(
      booking.id, numberOrNull(guest.id), text(guest.title), text(guest.firstName), text(guest.lastName),
      text(guest.email), text(guest.phone), text(guest.mobile), text(guest.company), text(guest.address), text(guest.city),
      text(guest.state), text(guest.postcode), text(guest.country), countryCodeFrom(guest), text(guest.flagText),
      text(guest.flagColor), text(guest.note), text(guest.custom1), text(guest.custom2), text(guest.custom3),
      text(guest.custom4), text(guest.custom5), text(guest.custom6), text(guest.custom7), text(guest.custom8),
      text(guest.custom9), text(guest.custom10), JSON.stringify(guest), syncedAt, syncedAt,
    ));
  }

  for (const item of normalized.infoItems) {
    const code = text(item.code);
    if (!code) {
      continue;
    }

    const value = item.value ?? item.text;
    statements.push(env.DB.prepare(`
      INSERT INTO booking_info_items (booking_id, info_code, info_name, info_value, raw_json, created_at, updated_at)
      VALUES (
        (SELECT booking_id FROM bookings WHERE beds24_booking_id = ?),
        ?, ?, ?, ?, ?, ?
      )
    `).bind(
      booking.id,
      code,
      text(item.name),
      value == null ? null : String(value),
      JSON.stringify(item),
      syncedAt,
      syncedAt,
    ));
  }

  for (const member of normalized.bookingGroupMembers) {
    statements.push(env.DB.prepare(`
      INSERT INTO booking_group_members (
        master_beds24_booking_id, member_beds24_booking_id, is_master,
        raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (master_beds24_booking_id, member_beds24_booking_id)
      DO UPDATE SET
        is_master = excluded.is_master,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).bind(
      member.masterBeds24BookingId,
      member.memberBeds24BookingId,
      member.isMaster ? 1 : 0,
      JSON.stringify(member.raw),
      syncedAt,
      syncedAt,
    ));
  }

  const results = await env.DB.batch(statements);
  return results.reduce((sum, row) => sum + (row.meta?.changes ?? 0), 0);
}

function skippedResult(
  startedAt: string,
  reason: string,
): BookingsSyncResult {
  const finishedAt = new Date().toISOString();
  return {
    ok: true,
    mode: "incremental",
    modifiedFrom: INITIAL_FROM,
    pagesRead: 0,
    recordsRead: 0,
    recordsWritten: 0,
    recordsSkipped: 0,
    recordsFailed: 0,
    startedAt,
    finishedAt,
    skipped: true,
    skippedReason: reason,
  };
}

export async function syncBookings(env: BookingsSyncBindings): Promise<BookingsSyncResult> {
  const startedAt = new Date().toISOString();
  const metrics = new SyncMetrics();
  let pagesRead = 0;
  const lock = await acquireSyncLock(env, SYNC_TYPE, startedAt);
  if (!lock) {
    const reason = "Bookings synchronization already running.";
    await recordSkippedSyncRun(env, SYNC_TYPE, startedAt, reason);
    return skippedResult(startedAt, reason);
  }

  const cursorRow = await env.DB.prepare("SELECT cursor_value FROM sync_cursors WHERE cursor_name = ?")
    .bind(CURSOR_NAME).first<{ cursor_value: string | null }>();
  const mode: "initial" | "incremental" = cursorRow?.cursor_value ? "incremental" : "initial";
  const modifiedFrom = mode === "initial" ? INITIAL_FROM : cursorWithOverlap(cursorRow!.cursor_value!);

  try {
    const maps = await loadMaps(env);
    if (maps.properties.size === 0 || maps.rooms.size === 0) {
      throw new Error("No active property/room mappings found. Run POST /sync/properties first.");
    }

    for (const query of bookingSyncQueries(modifiedFrom)) {
      let response = await beds24Get<Beds24BookingsResponse>(env, "/bookings", query);

      while (true) {
        pagesRead += 1;
        if (response.success === false) {
          throw new Error(response.error ?? "Beds24 bookings returned success=false");
        }

        for (const booking of response.data ?? []) {
          metrics.read();
          const changes = await upsertBooking(env, booking, maps, startedAt);
          if (changes === 0) {
            metrics.skipped();
          } else {
            metrics.written(changes);
          }
        }

        const next = response.pages?.nextPageExists ? response.pages.nextPageLink : null;
        if (!next) {
          break;
        }

        response = await beds24GetAbsolute<Beds24BookingsResponse>(env, next);
      }
    }

    const finishedAt = new Date().toISOString();
    const snapshot = metrics.snapshot();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO sync_cursors (cursor_name, cursor_value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(cursor_name) DO UPDATE SET cursor_value=excluded.cursor_value, updated_at=excluded.updated_at
      `).bind(CURSOR_NAME, startedAt, finishedAt),
      env.DB.prepare(`
        INSERT INTO sync_runs (sync_type, started_at, finished_at, status, records_read, records_written, records_failed, error_message)
        VALUES ('bookings', ?, ?, 'success', ?, ?, 0, NULL)
      `).bind(startedAt, finishedAt, snapshot.recordsRead, snapshot.recordsWritten),
    ]);

    return {
      ok: true,
      mode,
      modifiedFrom,
      pagesRead,
      recordsRead: snapshot.recordsRead,
      recordsWritten: snapshot.recordsWritten,
      recordsSkipped: snapshot.recordsSkipped,
      recordsFailed: snapshot.recordsFailed,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    metrics.failed();
    const finishedAt = new Date().toISOString();
    const snapshot = metrics.snapshot();
    const message = sanitizeLogMessage(error, "Unknown bookings sync error");
    try {
      await env.DB.prepare(`
        INSERT INTO sync_runs (sync_type, started_at, finished_at, status, records_read, records_written, records_failed, error_message)
        VALUES ('bookings', ?, ?, 'failed', ?, ?, ?, ?)
      `).bind(startedAt, finishedAt, snapshot.recordsRead, snapshot.recordsWritten, snapshot.recordsFailed, message).run();
    } catch (logError) {
      console.error("Unable to log bookings sync failure", sanitizeLogMessage(logError, "Unknown D1 logging error"));
    }
    throw error;
  } finally {
    if (lock) {
      await releaseSyncLock(env, lock);
    }
  }
}
