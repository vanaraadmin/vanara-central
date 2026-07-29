import {
  beds24Get,
  type Beds24Bindings,
  type Beds24RequestOptions,
} from "./beds24-client.service.js";
import { sanitizeLogMessage } from "./log-safety.service.js";
import {
  acquireSyncLock,
  recordSkippedSyncRun,
  releaseSyncLock,
} from "./sync-lock.service.js";

export interface AvailabilitySyncBindings extends Beds24Bindings {
  DB: D1Database;
}

export interface UnitRow {
  property_id: number;
  property_name: string;
  room_type_id: number;
  room_type_name: string | null;
  beds24_property_id: number;
  beds24_room_id: number;
  unit_id: number;
  unit_name: string;
  position: number | null;
}

export interface BookingOccupancyRow {
  unit_id: number;
  arrival_date: string;
  departure_date: string;
}

interface Beds24CalendarEntry {
  date?: string;
  from?: string;
  to?: string;
  startDate?: string;
  endDate?: string;
  numAvail?: number;
  numAvailable?: number;
  unitsAvailable?: number;
  availability?: boolean | number;
  available?: boolean | number;
  closed?: boolean | number | string;
  stopSell?: boolean | number | string;
  blackout?: boolean | number | string;
  minStay?: number;
  minimumStay?: number;
  maxStay?: number;
  maximumStay?: number;
  [key: string]: unknown;
}

export interface Beds24RoomCalendarResult {
  roomId: number;
  propertyId?: number;
  calendar?: Beds24CalendarEntry[] | Record<string, Beds24CalendarEntry>;
  availability?: Record<string, boolean>;
  [key: string]: unknown;
}

interface Beds24CalendarResponse {
  success?: boolean;
  data?: Beds24RoomCalendarResult[];
  error?: string;
  [key: string]: unknown;
}

export interface AvailabilitySyncOptions {
  batchDays?: number;
  startOffset?: number;
  fetchOptions?: Beds24RequestOptions;
}

export interface AvailabilitySyncResult {
  ok: true;
  horizonDays: number;
  batchDays: number;
  startOffset: number;
  nextOffset: number;
  datesProcessed: number;
  apiRequests: number;
  recordsRead: number;
  recordsWritten: number;
  startedAt: string;
  finishedAt: string;
  skipped?: boolean;
  skippedReason?: string;
}

export interface AvailabilityCacheRecord {
  propertyId: number;
  roomTypeId: number;
  unitId: number;
  date: string;
  availability: 0 | 1 | null;
  closed: 0 | 1;
  minimumStay: number | null;
  maximumStay: number | null;
  restrictions: string | null;
  rawJson: string;
}

const HORIZON_DAYS = 30;
const DEFAULT_BATCH_DAYS = 30;
const MAX_BATCH_DAYS = 30;
const CURSOR_NAME = "availability_cache_day_offset";

function clampBatchDays(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_DAYS;
  return Math.min(MAX_BATCH_DAYS, Math.max(1, Math.trunc(value as number)));
}

function normalizeOffset(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(HORIZON_DAYS - 1, Math.max(0, Math.trunc(value as number)));
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isDateOnly(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function datesBetween(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const dates: string[] = [];

  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(toDateOnly(cursor));
  }

  return dates;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "closed", "stop", "stopsell", "blackout"].includes(normalized)) return true;
    if (["false", "no", "0", "open"].includes(normalized)) return false;
  }
  return null;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function availabilityCount(entry: Beds24CalendarEntry | null): number | null {
  if (!entry) return null;
  return numeric(entry.numAvail) ?? numeric(entry.numAvailable) ?? numeric(entry.unitsAvailable);
}

function explicitAvailability(entry: Beds24CalendarEntry | null): boolean | null {
  if (!entry) return null;
  return normalizeBoolean(entry.availability) ?? normalizeBoolean(entry.available);
}

function isClosed(entry: Beds24CalendarEntry | null): boolean {
  if (!entry) return false;
  return Boolean(
    normalizeBoolean(entry.closed) ??
    normalizeBoolean(entry.stopSell) ??
    normalizeBoolean(entry.blackout),
  );
}

function minimumStay(entry: Beds24CalendarEntry | null): number | null {
  return entry ? numeric(entry.minStay) ?? numeric(entry.minimumStay) : null;
}

function maximumStay(entry: Beds24CalendarEntry | null): number | null {
  return entry ? numeric(entry.maxStay) ?? numeric(entry.maximumStay) : null;
}

function restrictionJson(entry: Beds24CalendarEntry | null): string | null {
  if (!entry) return null;

  const restrictions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if ([
      "date",
      "from",
      "to",
      "startDate",
      "endDate",
      "numAvail",
      "numAvailable",
      "unitsAvailable",
      "availability",
      "available",
      "closed",
      "stopSell",
      "blackout",
      "minStay",
      "minimumStay",
      "maxStay",
      "maximumStay",
      "price1",
      "price2",
      "price3",
    ].includes(key)) continue;
    restrictions[key] = value;
  }

  return Object.keys(restrictions).length > 0 ? JSON.stringify(restrictions) : null;
}

function calendarEntriesByDate(room: Beds24RoomCalendarResult | undefined): Map<string, Beds24CalendarEntry> {
  const entries = new Map<string, Beds24CalendarEntry>();
  if (!room) return entries;

  if (Array.isArray(room.calendar)) {
    for (const entry of room.calendar) {
      const start = entry.date ?? entry.from ?? entry.startDate;
      const end = entry.date ?? entry.to ?? entry.endDate ?? start;
      if (!isDateOnly(start) || !isDateOnly(end)) continue;
      for (const date of datesBetween(start, end)) {
        entries.set(date, { ...entry, date });
      }
    }
  } else if (room.calendar && typeof room.calendar === "object") {
    for (const [date, entry] of Object.entries(room.calendar)) {
      if (isDateOnly(date)) entries.set(date, { ...entry, date });
    }
  }

  if (room.availability && typeof room.availability === "object") {
    for (const [date, available] of Object.entries(room.availability)) {
      if (!isDateOnly(date)) continue;
      entries.set(date, { ...(entries.get(date) ?? {}), date, availability: available });
    }
  }

  return entries;
}

function unitsByRoomType(units: UnitRow[]): Map<number, UnitRow[]> {
  const groups = new Map<number, UnitRow[]>();
  for (const unit of units) {
    const current = groups.get(unit.room_type_id) ?? [];
    current.push(unit);
    groups.set(unit.room_type_id, current);
  }

  for (const group of groups.values()) {
    group.sort((left, right) =>
      (left.position ?? 9999) - (right.position ?? 9999) ||
      left.unit_name.localeCompare(right.unit_name) ||
      left.unit_id - right.unit_id,
    );
  }

  return groups;
}

function bookedUnitsByDate(rows: BookingOccupancyRow[], fromDate: string, toDate: string): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  for (const row of rows) {
    const occupancyStart = row.arrival_date > fromDate ? row.arrival_date : fromDate;
    const occupancyEndExclusive = row.departure_date <= toDate ? row.departure_date : toDate;
    for (const date of datesBetween(occupancyStart, occupancyEndExclusive)) {
      if (date >= row.departure_date) continue;
      const booked = result.get(date) ?? new Set<number>();
      booked.add(row.unit_id);
      result.set(date, booked);
    }
  }
  return result;
}

export function buildAvailabilityCacheRows(
  units: UnitRow[],
  calendarRooms: Beds24RoomCalendarResult[],
  bookingRows: BookingOccupancyRow[],
  fromDate: string,
  toDate: string,
): AvailabilityCacheRecord[] {
  const roomsByBeds24Id = new Map(calendarRooms.map((room) => [room.roomId, room]));
  const groupedUnits = unitsByRoomType(units);
  const bookedByDate = bookedUnitsByDate(bookingRows, fromDate, toDate);
  const targetDates = datesBetween(fromDate, toDate);
  const records: AvailabilityCacheRecord[] = [];

  for (const [roomTypeId, roomTypeUnits] of groupedUnits) {
    const firstUnit = roomTypeUnits[0];
    const room = roomsByBeds24Id.get(firstUnit.beds24_room_id);
    const entries = calendarEntriesByDate(room);

    for (const date of targetDates) {
      const entry = entries.get(date) ?? null;
      const count = availabilityCount(entry);
      const explicit = explicitAvailability(entry);
      const closed = isClosed(entry) ? 1 : 0;
      const booked = bookedByDate.get(date) ?? new Set<number>();
      let availableSlots = count ?? (explicit === true ? roomTypeUnits.length : explicit === false ? 0 : null);

      for (const unit of roomTypeUnits) {
        let availability: 0 | 1 | null = null;
        if (closed === 1 || booked.has(unit.unit_id)) {
          availability = 0;
        } else if (availableSlots !== null) {
          availability = availableSlots > 0 ? 1 : 0;
          if (availableSlots > 0) availableSlots -= 1;
        }

        records.push({
          propertyId: unit.property_id,
          roomTypeId,
          unitId: unit.unit_id,
          date,
          availability,
          closed,
          minimumStay: minimumStay(entry),
          maximumStay: maximumStay(entry),
          restrictions: restrictionJson(entry),
          rawJson: JSON.stringify({
            source: room ? "beds24-room-calendar" : "missing-room-calendar",
            beds24RoomId: unit.beds24_room_id,
            unitId: unit.unit_id,
            date,
            calendar: entry,
          }),
        });
      }
    }
  }

  return records;
}

async function getActiveUnits(env: AvailabilitySyncBindings): Promise<UnitRow[]> {
  const result = await env.DB.prepare(`
    SELECT
      p.property_id,
      p.property_name,
      rt.room_type_id,
      rt.room_type_name,
      p.beds24_property_id,
      rt.beds24_room_id,
      u.unit_id,
      u.unit_name,
      u.position
    FROM units u
    INNER JOIN room_types rt ON rt.room_type_id = u.room_type_id
    INNER JOIN properties p ON p.property_id = rt.property_id
    WHERE u.active = 1 AND rt.active = 1 AND p.active = 1
    ORDER BY p.beds24_property_id, rt.beds24_room_id, u.position, u.unit_name, u.unit_id
  `).all<UnitRow>();
  return result.results ?? [];
}

async function getBookedUnits(
  env: AvailabilitySyncBindings,
  fromDate: string,
  toDate: string,
): Promise<BookingOccupancyRow[]> {
  const result = await env.DB.prepare(`
    SELECT unit_id, arrival_date, departure_date
    FROM bookings
    WHERE unit_id IS NOT NULL
      AND arrival_date <= ?
      AND departure_date > ?
      AND lower(status) NOT IN ('cancelled', 'canceled', 'no show', 'noshow')
  `).bind(toDate, fromDate).all<BookingOccupancyRow>();
  return result.results ?? [];
}

async function fetchRoomCalendar(
  env: AvailabilitySyncBindings,
  propertyId: number,
  fromDate: string,
  toDate: string,
  options?: Beds24RequestOptions,
): Promise<Beds24CalendarResponse> {
  return beds24Get<Beds24CalendarResponse>(
    env,
    "/inventory/rooms/calendar",
    {
      propertyId,
      startDate: fromDate,
      endDate: toDate,
      includeNumAvail: true,
    },
    { pauseAfterMs: 1_000, ...options },
  );
}

function groupUnitsByProperty(units: UnitRow[]): Map<number, UnitRow[]> {
  const groups = new Map<number, UnitRow[]>();
  for (const unit of units) {
    const current = groups.get(unit.beds24_property_id) ?? [];
    current.push(unit);
    groups.set(unit.beds24_property_id, current);
  }
  return groups;
}

async function writeAvailabilityRows(
  env: AvailabilitySyncBindings,
  records: AvailabilityCacheRecord[],
  syncedAt: string,
): Promise<number> {
  let written = 0;

  for (let index = 0; index < records.length; index += 50) {
    const chunk = records.slice(index, index + 50);
    const results = await env.DB.batch(chunk.map((record) => env.DB.prepare(`
      INSERT INTO unit_availability_cache (
        property_id,
        room_type_id,
        unit_id,
        stay_date,
        availability,
        closed,
        minimum_stay,
        maximum_stay,
        restrictions,
        raw_json,
        synced_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (unit_id, stay_date) DO UPDATE SET
        property_id = excluded.property_id,
        room_type_id = excluded.room_type_id,
        availability = excluded.availability,
        closed = excluded.closed,
        minimum_stay = excluded.minimum_stay,
        maximum_stay = excluded.maximum_stay,
        restrictions = excluded.restrictions,
        raw_json = excluded.raw_json,
        synced_at = excluded.synced_at,
        updated_at = excluded.updated_at
    `).bind(
      record.propertyId,
      record.roomTypeId,
      record.unitId,
      record.date,
      record.availability,
      record.closed,
      record.minimumStay,
      record.maximumStay,
      record.restrictions,
      record.rawJson,
      syncedAt,
      syncedAt,
      syncedAt,
    )));

    for (const result of results) written += result.meta?.changes ?? 0;
  }

  return written;
}

export async function syncAvailabilityCache(
  env: AvailabilitySyncBindings,
  options: AvailabilitySyncOptions = {},
): Promise<AvailabilitySyncResult> {
  const startedAt = new Date().toISOString();
  const startOffset = normalizeOffset(options.startOffset);
  const requestedDays = clampBatchDays(options.batchDays);
  const batchDays = Math.min(requestedDays, HORIZON_DAYS - startOffset);
  const baseDate = todayUtc();
  const fromDate = toDateOnly(addUtcDays(baseDate, startOffset));
  const toDate = toDateOnly(addUtcDays(baseDate, startOffset + batchDays - 1));
  let apiRequests = 0;
  let recordsRead = 0;
  let recordsWritten = 0;

  const lock = await acquireSyncLock(env, "availability_cache", startedAt, 12 * 60 * 1_000);
  if (!lock) {
    const reason = "Availability cache synchronization already running.";
    await recordSkippedSyncRun(env, "availability_cache", startedAt, reason);
    return {
      ok: true,
      horizonDays: HORIZON_DAYS,
      batchDays,
      startOffset,
      nextOffset: startOffset,
      datesProcessed: 0,
      apiRequests: 0,
      recordsRead: 0,
      recordsWritten: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      skipped: true,
      skippedReason: reason,
    };
  }

  try {
    const units = await getActiveUnits(env);
    if (units.length === 0) {
      throw new Error("No active units found. Run POST /sync/properties first.");
    }

    const bookedUnits = await getBookedUnits(env, fromDate, toDate);
    const properties = groupUnitsByProperty(units);

    for (const [beds24PropertyId, propertyUnits] of properties) {
      const response = await fetchRoomCalendar(
        env,
        beds24PropertyId,
        fromDate,
        toDate,
        options.fetchOptions,
      );
      apiRequests += 1;

      if (response.success === false) {
        throw new Error(
          `Beds24 room calendar error for property ${beds24PropertyId}, ${fromDate} to ${toDate}: ` +
          `${response.error ?? "success=false"}`,
        );
      }

      const calendarRooms = Array.isArray(response.data) ? response.data : [];
      recordsRead += calendarRooms.reduce((total, room) => {
        if (Array.isArray(room.calendar)) return total + room.calendar.length;
        if (room.calendar && typeof room.calendar === "object") return total + Object.keys(room.calendar).length;
        return total;
      }, 0);

      const records = buildAvailabilityCacheRows(
        propertyUnits,
        calendarRooms,
        bookedUnits,
        fromDate,
        toDate,
      );
      recordsWritten += await writeAvailabilityRows(env, records, startedAt);
    }

    const nextOffset = startOffset + batchDays;
    const finishedAt = new Date().toISOString();
    const finalResults = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO sync_cursors (cursor_name, cursor_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT (cursor_name) DO UPDATE SET
          cursor_value = excluded.cursor_value,
          updated_at = excluded.updated_at
      `).bind(CURSOR_NAME, String(nextOffset >= HORIZON_DAYS ? 0 : nextOffset), finishedAt),
      env.DB.prepare(`DELETE FROM unit_availability_cache WHERE stay_date < ?`).bind(toDateOnly(baseDate)),
      env.DB.prepare(`DELETE FROM unit_availability_cache WHERE stay_date >= ?`).bind(toDateOnly(addUtcDays(baseDate, HORIZON_DAYS))),
      env.DB.prepare(`
        INSERT INTO sync_runs (
          sync_type, started_at, finished_at, status,
          records_read, records_written, records_failed, error_message
        ) VALUES (?, ?, ?, 'success', ?, ?, 0, NULL)
      `).bind("availability_cache", startedAt, finishedAt, recordsRead, recordsWritten),
    ]);
    for (const result of finalResults.slice(0, 3)) recordsWritten += result.meta?.changes ?? 0;

    return {
      ok: true,
      horizonDays: HORIZON_DAYS,
      batchDays,
      startOffset,
      nextOffset,
      datesProcessed: batchDays,
      apiRequests,
      recordsRead,
      recordsWritten,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = sanitizeLogMessage(error, "Unknown availability cache sync error");
    try {
      await env.DB.prepare(`
        INSERT INTO sync_runs (
          sync_type, started_at, finished_at, status,
          records_read, records_written, records_failed, error_message
        ) VALUES (?, ?, ?, 'failed', ?, ?, 1, ?)
      `).bind("availability_cache", startedAt, finishedAt, recordsRead, recordsWritten, message).run();
    } catch (logError) {
      console.error("Unable to record failed availability cache sync:", sanitizeLogMessage(logError, "Unknown D1 logging error"));
    }
    throw error;
  } finally {
    await releaseSyncLock(env, lock);
  }
}
