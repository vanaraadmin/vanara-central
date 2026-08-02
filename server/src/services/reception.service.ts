import type { HousekeepingBindings } from "./housekeeping-overview.service.js";
import { listOpenMaintenanceTicketDetailsForRoom, type MaintenanceBindings } from "./maintenance.service.js";
import { isOperationalBookingStatus, operationalBookingStatusSql } from "./booking-status.service.js";
import { countryCodeFrom, countryFlagFrom, countryFlagUrlFrom } from "./country-flags.service.js";
import { getBangkokDate } from "./today.service.js";
import type { CurrentUser } from "./current-user.service.js";
import { loadOperationalAvailabilityForUnit } from "./room-operational-state.service.js";
import { loadRoomHousekeepingStateForUnit } from "./room-housekeeping-state.service.js";

export interface ReceptionBindings extends HousekeepingBindings, MaintenanceBindings {
  DB: D1Database;
}

export type ReceptionCheckInField = "guestArrived" | "passportCollected" | "depositCollected" | "welcomeCompleted" | "keysDelivered";
export type ReceptionCheckOutField = "guestLeft" | "keysReturned" | "depositReturned" | "roomReleased";
export type ReceptionCompletionType = "check-in" | "check-out";
export type ReceptionAlertType = "passport_missing" | "deposit_pending";

interface BookingRow {
  beds24_booking_id: number;
  guest_name: string | null;
  unit_id: number | null;
  unit_name: string | null;
  room_type_name: string;
  adults: number;
  children: number;
  arrival_date: string;
  departure_date: string;
  channel: string | null;
  api_source: string | null;
  api_reference: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  country: string | null;
  country_code: string | null;
  status: string;
}

interface BookingAlertContextRow {
  beds24_booking_id: number;
  unit_id: number | null;
}

interface ReceptionStayRow {
  beds24_booking_id: number;
  guest_arrived: number;
  passport_collected: number;
  deposit_collected: number;
  welcome_completed: number;
  keys_delivered: number;
  guest_left: number;
  keys_returned: number;
  deposit_returned: number;
  room_released: number;
  special_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ReceptionNoteRow {
  note_id: number;
  beds24_booking_id: number;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
}

interface ReceptionEventRow {
  event_id: number;
  beds24_booking_id: number;
  action: string;
  from_value: string | null;
  to_value: string | null;
  actor_id: string;
  actor_name: string;
  created_at: string;
}

interface ActiveRoomTaskRow {
  task_type: string;
  status: string;
}

export interface ReceptionActionInput {
  field: ReceptionCheckInField | ReceptionCheckOutField;
  completed: boolean;
}

export interface CompleteReceptionCheckInInput {
  passportRegistrationCompleted: boolean;
  depositCollected: boolean;
}

export interface CompleteReceptionCheckOutInput {
  roomInspected: boolean;
  keysReturned: boolean;
  depositReturned?: boolean;
}

export interface ReceptionNotesInput {
  body?: string;
  specialNotes?: string | null;
}

export interface ReceptionGuestNote {
  id: number;
  bookingId: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

export interface ReceptionEvent {
  id: number;
  bookingId: number;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  actorId: string;
  actorName: string;
  createdAt: string;
}

export interface ReceptionStay {
  bookingId: number;
  guestName: string;
  roomId: number | null;
  roomName: string;
  nationality: string | null;
  nationalityFlag: string | null;
  nationalityFlagUrl: string | null;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  bookingSource: string | null;
  bookingReference: string | null;
  phone: string | null;
  email: string | null;
  bookingStatus: string;
  nationalityCode: string | null;
  roomStatus: string;
  maintenance: {
    openIssues: number;
    outOfService: boolean;
    label: string | null;
  };
  checkIn: Record<ReceptionCheckInField, boolean>;
  checkOut: Record<ReceptionCheckOutField, boolean>;
  specialNotes: string | null;
  notes: ReceptionGuestNote[];
  timeline: ReceptionEvent[];
  links: {
    room: string | null;
    housekeeping: string;
    maintenance: string;
  };
}

export class ReceptionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceptionConflictError";
  }
}

export interface ReceptionOverview {
  date: string;
  arrivals: ReceptionStay[];
  departures: ReceptionStay[];
  inHouse: ReceptionStay[];
  summary: {
    arrivals: number;
    departures: number;
    inHouse: number;
  };
}

const CHECK_IN_FIELDS: ReceptionCheckInField[] = ["guestArrived", "passportCollected", "depositCollected", "welcomeCompleted", "keysDelivered"];
const CHECK_OUT_FIELDS: ReceptionCheckOutField[] = ["guestLeft", "keysReturned", "depositReturned", "roomReleased"];
const FIELD_TO_COLUMN: Record<ReceptionCheckInField | ReceptionCheckOutField, keyof ReceptionStayRow> = {
  guestArrived: "guest_arrived",
  passportCollected: "passport_collected",
  depositCollected: "deposit_collected",
  welcomeCompleted: "welcome_completed",
  keysDelivered: "keys_delivered",
  guestLeft: "guest_left",
  keysReturned: "keys_returned",
  depositReturned: "deposit_returned",
  roomReleased: "room_released",
};

function requiredString(value: unknown, label: string, max: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed.slice(0, max);
}

function optionalString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function optionalBoolean(payload: object, key: string): boolean {
  return key in payload && payload[key as keyof typeof payload] === true;
}

function normalizeOperationalDate(value: string | null | undefined): string {
  const today = getBangkokDate();
  if (!value) return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Reception date is invalid.");
  if (value < today) throw new Error("Reception date cannot be in the past.");
  return value;
}

function assertPayloadKeys(payload: object, allowed: string[], label: string): void {
  const unknown = Object.keys(payload).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} contains unsupported field: ${unknown}.`);
}

export function normalizeReceptionCheckInInput(payload: unknown): ReceptionActionInput {
  if (!payload || typeof payload !== "object") throw new Error("Reception check-in payload is required.");
  assertPayloadKeys(payload, ["field", "completed"], "Reception check-in payload");
  const field = "field" in payload ? payload.field : undefined;
  if (!CHECK_IN_FIELDS.includes(field as ReceptionCheckInField)) throw new Error("Check-in field is invalid.");
  const completed = "completed" in payload ? payload.completed : undefined;
  if (typeof completed !== "boolean") throw new Error("completed is required.");
  return { field: field as ReceptionCheckInField, completed };
}

export function normalizeReceptionCheckOutInput(payload: unknown): ReceptionActionInput {
  if (!payload || typeof payload !== "object") throw new Error("Reception check-out payload is required.");
  assertPayloadKeys(payload, ["field", "completed"], "Reception check-out payload");
  const field = "field" in payload ? payload.field : undefined;
  if (!CHECK_OUT_FIELDS.includes(field as ReceptionCheckOutField)) throw new Error("Check-out field is invalid.");
  const completed = "completed" in payload ? payload.completed : undefined;
  if (typeof completed !== "boolean") throw new Error("completed is required.");
  return { field: field as ReceptionCheckOutField, completed };
}

export function normalizeReceptionNotesInput(payload: unknown): ReceptionNotesInput {
  if (!payload || typeof payload !== "object") throw new Error("Reception notes payload is required.");
  assertPayloadKeys(payload, ["body", "specialNotes"], "Reception notes payload");
  return {
    body: "body" in payload ? requiredString(payload.body, "Note", 2000) : undefined,
    specialNotes: "specialNotes" in payload ? optionalString(payload.specialNotes, 2000) : undefined,
  };
}

export function normalizeCompleteReceptionCheckInInput(payload: unknown): CompleteReceptionCheckInInput {
  if (!payload || typeof payload !== "object") throw new Error("Complete check-in payload is required.");
  assertPayloadKeys(payload, ["passportRegistrationCompleted", "depositCollected"], "Complete check-in payload");
  return {
    passportRegistrationCompleted: optionalBoolean(payload, "passportRegistrationCompleted"),
    depositCollected: optionalBoolean(payload, "depositCollected"),
  };
}

export function normalizeCompleteReceptionCheckOutInput(payload: unknown): CompleteReceptionCheckOutInput {
  if (!payload || typeof payload !== "object") throw new Error("Complete check-out payload is required.");
  assertPayloadKeys(payload, ["roomInspected", "keysReturned", "depositReturned"], "Complete check-out payload");
  return {
    roomInspected: optionalBoolean(payload, "roomInspected"),
    keysReturned: optionalBoolean(payload, "keysReturned"),
    depositReturned: "depositReturned" in payload ? payload.depositReturned === true : undefined,
  };
}

function emptyStay(bookingId: number, now: string): ReceptionStayRow {
  return {
    beds24_booking_id: bookingId,
    guest_arrived: 0,
    passport_collected: 0,
    deposit_collected: 0,
    welcome_completed: 0,
    keys_delivered: 0,
    guest_left: 0,
    keys_returned: 0,
    deposit_returned: 0,
    room_released: 0,
    special_notes: null,
    created_at: now,
    updated_at: now,
  };
}

function completionError(message: string): never {
  throw new ReceptionConflictError(message);
}

async function ensureReceptionStay(env: ReceptionBindings, bookingId: number): Promise<ReceptionStayRow> {
  const existing = await env.DB.prepare("SELECT * FROM reception_stays WHERE beds24_booking_id = ?").bind(bookingId).first<ReceptionStayRow>();
  if (existing) return existing;
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO reception_stays (beds24_booking_id, created_at, updated_at)
    VALUES (?, ?, ?)
  `).bind(bookingId, now, now).run();
  return emptyStay(bookingId, now);
}

async function bookingExists(env: ReceptionBindings, bookingId: number): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT beds24_booking_id
    FROM bookings
    WHERE beds24_booking_id = ?
      AND ${operationalBookingStatusSql("status")}
  `).bind(bookingId).first<{ beds24_booking_id: number }>();
  return row !== null;
}

async function loadBookingRow(env: ReceptionBindings, bookingId: number): Promise<BookingRow | null> {
  return env.DB.prepare(`
    SELECT b.beds24_booking_id, b.guest_name, b.unit_id, u.unit_name, rt.room_type_name,
           b.adults, b.children, b.arrival_date, b.departure_date, b.channel, b.api_source, b.api_reference,
           b.email, b.phone, b.mobile, b.country, b.country_code, b.status
    FROM bookings b
    JOIN room_types rt ON rt.room_type_id = b.room_type_id
    LEFT JOIN units u ON u.unit_id = b.unit_id
    WHERE b.beds24_booking_id = ?
      AND ${operationalBookingStatusSql("b.status")}
  `).bind(bookingId).first<BookingRow>();
}

async function recordEvent(env: ReceptionBindings, bookingId: number, action: string, fromValue: string | null, toValue: string | null, user: CurrentUser, now: string) {
  await env.DB.prepare(`
    INSERT INTO reception_events (beds24_booking_id, action, from_value, to_value, actor_id, actor_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(bookingId, action, fromValue, toValue, user.id, user.displayName, now).run();
}

async function loadBookingAlertContext(env: ReceptionBindings, bookingId: number): Promise<BookingAlertContextRow | null> {
  return env.DB.prepare(`
    SELECT beds24_booking_id, unit_id
    FROM bookings
    WHERE beds24_booking_id = ?
      AND ${operationalBookingStatusSql("status")}
  `).bind(bookingId).first<BookingAlertContextRow>();
}

function alertTitle(type: ReceptionAlertType): string {
  return type === "passport_missing" ? "Passport(s) missing" : "Deposit pending";
}

async function upsertReceptionAlert(env: ReceptionBindings, bookingId: number, unitId: number | null, type: ReceptionAlertType, user: CurrentUser, now: string): Promise<void> {
  if (!unitId) return;
  await env.DB.prepare(`
    INSERT INTO reception_room_alerts (
      beds24_booking_id, unit_id, alert_type, title, status,
      created_by, created_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
    ON CONFLICT (beds24_booking_id, alert_type)
    DO UPDATE SET
      unit_id = excluded.unit_id,
      title = excluded.title,
      status = 'active',
      resolved_by = NULL,
      resolved_by_name = NULL,
      resolved_at = NULL,
      updated_at = excluded.updated_at
  `).bind(bookingId, unitId, type, alertTitle(type), user.id, user.displayName, now, now).run();
}

async function resolveReceptionAlert(env: ReceptionBindings, bookingId: number, type: ReceptionAlertType, user: CurrentUser, now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE reception_room_alerts
    SET status = 'resolved', resolved_by = ?, resolved_by_name = ?, resolved_at = ?, updated_at = ?
    WHERE beds24_booking_id = ?
      AND alert_type = ?
      AND status = 'active'
  `).bind(user.id, user.displayName, now, now, bookingId, type).run();
}

export async function resolveReceptionRoomAlert(env: ReceptionBindings, bookingId: number, type: ReceptionAlertType, user: CurrentUser): Promise<ReceptionStay | null> {
  const context = await loadBookingAlertContext(env, bookingId);
  if (!context) return null;
  const now = new Date().toISOString();
  const local = await ensureReceptionStay(env, bookingId);

  if (type === "passport_missing") {
    if (local.passport_collected !== 1) {
      await env.DB.prepare("UPDATE reception_stays SET passport_collected = 1, updated_at = ? WHERE beds24_booking_id = ?").bind(now, bookingId).run();
      await recordEvent(env, bookingId, "passportRegistrationCompleted", "false", "true", user, now);
    }
  } else {
    if (local.deposit_collected !== 1) {
      await env.DB.prepare("UPDATE reception_stays SET deposit_collected = 1, updated_at = ? WHERE beds24_booking_id = ?").bind(now, bookingId).run();
      await recordEvent(env, bookingId, "depositCollected", "false", "true", user, now);
    }
  }

  await resolveReceptionAlert(env, bookingId, type, user, now);
  return getReceptionStay(env, bookingId);
}

function mapNote(row: ReceptionNoteRow): ReceptionGuestNote {
  return {
    id: row.note_id,
    bookingId: row.beds24_booking_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapEvent(row: ReceptionEventRow): ReceptionEvent {
  return {
    id: row.event_id,
    bookingId: row.beds24_booking_id,
    action: row.action,
    fromValue: row.from_value,
    toValue: row.to_value,
    actorId: row.actor_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  };
}

async function loadNotes(env: ReceptionBindings, bookingId: number): Promise<ReceptionGuestNote[]> {
  const rows = await env.DB.prepare("SELECT * FROM reception_guest_notes WHERE beds24_booking_id = ? ORDER BY created_at DESC, note_id DESC LIMIT 20").bind(bookingId).all<ReceptionNoteRow>();
  return (rows.results ?? []).map(mapNote);
}

async function loadEvents(env: ReceptionBindings, bookingId: number): Promise<ReceptionEvent[]> {
  const rows = await env.DB.prepare("SELECT * FROM reception_events WHERE beds24_booking_id = ? ORDER BY created_at DESC, event_id DESC LIMIT 20").bind(bookingId).all<ReceptionEventRow>();
  return (rows.results ?? []).map(mapEvent);
}

async function roomOperationalState(env: ReceptionBindings, roomId: number | null): Promise<{ status: string; maintenance: ReceptionStay["maintenance"] }> {
  if (!roomId) {
    return {
      status: "Expected Arrival",
      maintenance: { openIssues: 0, outOfService: false, label: null },
    };
  }
  const [maintenance, task, operationalAvailability, storedHousekeepingState] = await Promise.all([
    listOpenMaintenanceTicketDetailsForRoom(env, roomId),
    activeRoomReadinessTask(env, roomId),
    loadOperationalAvailabilityForUnit(env, roomId),
    loadRoomHousekeepingStateForUnit(env, roomId),
  ]);
  const outOfService = maintenance.some((ticket) => ticket.outOfService);
  const maintenanceSummary = {
    openIssues: maintenance.length,
    outOfService,
    label: outOfService ? "Maintenance Out Of Service" : maintenance.length > 0 ? "Maintenance Active" : null,
  };
  if (outOfService) return { status: "Out Of Service", maintenance: maintenanceSummary };
  if (operationalAvailability.status === "NOT_OPERATING") return { status: "Not Operating", maintenance: maintenanceSummary };
  if (maintenance.length > 0) return { status: "Maintenance", maintenance: maintenanceSummary };
  if (storedHousekeepingState.readyState === "NOT_READY") return { status: "Not Ready", maintenance: maintenanceSummary };
  if (task?.task_type === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION") return { status: "Waiting Reception", maintenance: maintenanceSummary };
  if (task && (task.status === "IN_PROGRESS" || task.status === "CLAIMED")) return { status: "Cleaning", maintenance: maintenanceSummary };
  return { status: "Ready", maintenance: maintenanceSummary };
}

async function activeRoomReadinessTask(env: ReceptionBindings, roomId: number): Promise<ActiveRoomTaskRow | null> {
  return env.DB.prepare(`
    SELECT task_type, status
    FROM housekeeping_tasks
    WHERE unit_id = ?
      AND task_type IN ('TURNOVER', 'STANDARD_CLEANING', 'LINEN_CHANGE', 'ON_DEMAND_CLEANING')
      AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
      AND (idempotency_key IS NULL OR idempotency_key NOT LIKE 'room-ready-baseline:not-ready:%')
    ORDER BY
      CASE task_type WHEN 'TURNOVER' THEN 1 WHEN 'ON_DEMAND_CLEANING' THEN 2 WHEN 'STANDARD_CLEANING' THEN 3 WHEN 'LINEN_CHANGE' THEN 4 ELSE 5 END,
      task_id
    LIMIT 1
  `).bind(roomId).first<ActiveRoomTaskRow>();
}

async function mapStay(env: ReceptionBindings, row: BookingRow): Promise<ReceptionStay> {
  const local = await ensureReceptionStay(env, row.beds24_booking_id);
  const nationalitySource = row.country_code || row.country;
  const nationalityCode = countryCodeFrom(nationalitySource);
  const [notes, timeline, roomOperations] = await Promise.all([
    loadNotes(env, row.beds24_booking_id),
    loadEvents(env, row.beds24_booking_id),
    roomOperationalState(env, row.unit_id),
  ]);
  return {
    bookingId: row.beds24_booking_id,
    guestName: row.guest_name || "Guest name unavailable",
    roomId: row.unit_id,
    roomName: row.unit_name || row.room_type_name || "Room not assigned",
    nationality: row.country || row.country_code || null,
    nationalityFlag: countryFlagFrom(nationalitySource),
    nationalityFlagUrl: countryFlagUrlFrom(nationalitySource),
    nationalityCode,
    arrival: row.arrival_date,
    departure: row.departure_date,
    adults: row.adults,
    children: row.children,
    bookingSource: row.api_source || row.channel,
    bookingReference: row.api_reference,
    phone: row.mobile || row.phone,
    email: row.email,
    bookingStatus: row.status,
    roomStatus: roomOperations.status,
    maintenance: roomOperations.maintenance,
    checkIn: {
      guestArrived: local.guest_arrived === 1,
      passportCollected: local.passport_collected === 1,
      depositCollected: local.deposit_collected === 1,
      welcomeCompleted: local.welcome_completed === 1,
      keysDelivered: local.keys_delivered === 1,
    },
    checkOut: {
      guestLeft: local.guest_left === 1,
      keysReturned: local.keys_returned === 1,
      depositReturned: local.deposit_returned === 1,
      roomReleased: local.room_released === 1,
    },
    specialNotes: local.special_notes,
    notes,
    timeline,
    links: {
      room: row.unit_id ? `/rooms/${row.unit_id}` : null,
      housekeeping: "/housekeeping",
      maintenance: row.unit_id ? `/maintenance/new?roomId=${row.unit_id}` : "/maintenance",
    },
  };
}

export function receptionCompletionErrorStatus(error: unknown): 400 | 409 {
  return error instanceof ReceptionConflictError ? 409 : 400;
}

export async function completeReceptionEvent(env: ReceptionBindings, bookingId: number, type: ReceptionCompletionType, user: CurrentUser, input: CompleteReceptionCheckInInput | CompleteReceptionCheckOutInput): Promise<ReceptionStay | null> {
  const booking = await loadBookingRow(env, bookingId);
  if (!booking) return null;
  if (!isOperationalBookingStatus(booking.status)) return null;

  const today = getBangkokDate();
  const targetDate = type === "check-in" ? booking.arrival_date : booking.departure_date;
  if (targetDate !== today) {
    completionError("Completion actions are available only for today's operational date.");
  }

  const local = await ensureReceptionStay(env, bookingId);
  const now = new Date().toISOString();

  if (type === "check-in") {
    if (local.guest_arrived === 1) completionError("Check-in has already been completed.");
    const checkInInput = input as CompleteReceptionCheckInInput;
    await env.DB.prepare(`
      UPDATE reception_stays
      SET guest_arrived = 1, passport_collected = ?, deposit_collected = ?, welcome_completed = 1, keys_delivered = 1, updated_at = ?
      WHERE beds24_booking_id = ?
    `)
      .bind(checkInInput.passportRegistrationCompleted ? 1 : 0, checkInInput.depositCollected ? 1 : 0, now, bookingId)
      .run();
    await recordEvent(env, bookingId, "checkInCompleted", "false", "true", user, now);
    if (checkInInput.passportRegistrationCompleted) {
      await resolveReceptionAlert(env, bookingId, "passport_missing", user, now);
    } else {
      await upsertReceptionAlert(env, bookingId, booking.unit_id, "passport_missing", user, now);
    }
    if (checkInInput.depositCollected) {
      await resolveReceptionAlert(env, bookingId, "deposit_pending", user, now);
    } else {
      await upsertReceptionAlert(env, bookingId, booking.unit_id, "deposit_pending", user, now);
    }
  } else {
    if (local.guest_left === 1 || local.room_released === 1) completionError("Check-out has already been completed.");
    const checkOutInput = input as CompleteReceptionCheckOutInput;
    if (!checkOutInput.roomInspected) completionError("Room inspection is required.");
    if (!checkOutInput.keysReturned) completionError("Keys returned is required.");
    if (local.deposit_collected === 1 && checkOutInput.depositReturned !== true) completionError("Deposit return is required.");
    await env.DB.prepare(`
      UPDATE reception_stays
      SET guest_left = 1, keys_returned = 1, deposit_returned = ?, room_released = 1, updated_at = ?
      WHERE beds24_booking_id = ?
    `)
      .bind(local.deposit_collected === 1 ? 1 : 0, now, bookingId)
      .run();
    await recordEvent(env, bookingId, "checkOutCompleted", "false", "true", user, now);
    if (local.deposit_collected !== 1) {
      await resolveReceptionAlert(env, bookingId, "deposit_pending", user, now);
    }
  }

  return mapStay(env, booking);
}

async function loadBookingRows(env: ReceptionBindings, where: string, params: string[]): Promise<BookingRow[]> {
  const rows = await env.DB.prepare(`
    SELECT b.beds24_booking_id, b.guest_name, b.unit_id, u.unit_name, rt.room_type_name,
           b.adults, b.children, b.arrival_date, b.departure_date, b.channel, b.api_source, b.api_reference,
           b.email, b.phone, b.mobile, b.country, b.country_code, b.status
    FROM bookings b
    JOIN room_types rt ON rt.room_type_id = b.room_type_id
    LEFT JOIN units u ON u.unit_id = b.unit_id
    WHERE ${operationalBookingStatusSql("b.status")}
      AND ${where}
    ORDER BY u.position, u.unit_name, b.guest_name
    LIMIT 120
  `).bind(...params).all<BookingRow>();
  return rows.results ?? [];
}

export async function getReceptionOverview(env: ReceptionBindings, requestedDate?: string | null): Promise<ReceptionOverview> {
  const date = normalizeOperationalDate(requestedDate);
  const [arrivalRows, departureRows, inHouseRows] = await Promise.all([
    loadBookingRows(env, "b.arrival_date = ?", [date]),
    loadBookingRows(env, "b.departure_date = ?", [date]),
    loadBookingRows(env, "b.arrival_date < ? AND b.departure_date > ?", [date, date]),
  ]);
  const arrivals = await Promise.all(arrivalRows.map((row) => mapStay(env, row)));
  const departures = await Promise.all(departureRows.map((row) => mapStay(env, row)));
  const inHouse = await Promise.all(inHouseRows.map((row) => mapStay(env, row)));
  return {
    date,
    arrivals,
    departures,
    inHouse,
    summary: {
      arrivals: arrivals.length,
      departures: departures.length,
      inHouse: inHouse.length,
    },
  };
}

export async function updateReceptionAction(env: ReceptionBindings, bookingId: number, input: ReceptionActionInput, user: CurrentUser): Promise<ReceptionStay | null> {
  if (!(await bookingExists(env, bookingId))) return null;
  const local = await ensureReceptionStay(env, bookingId);
  const column = FIELD_TO_COLUMN[input.field];
  const previous = local[column] === 1;
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE reception_stays SET ${String(column)} = ?, updated_at = ? WHERE beds24_booking_id = ?`).bind(input.completed ? 1 : 0, now, bookingId).run();
  await recordEvent(env, bookingId, input.field, previous ? "true" : "false", input.completed ? "true" : "false", user, now);
  return getReceptionStay(env, bookingId);
}

export async function updateReceptionNotes(env: ReceptionBindings, bookingId: number, input: ReceptionNotesInput, user: CurrentUser): Promise<ReceptionStay | null> {
  if (!(await bookingExists(env, bookingId))) return null;
  await ensureReceptionStay(env, bookingId);
  const now = new Date().toISOString();
  if (input.specialNotes !== undefined) {
    await env.DB.prepare("UPDATE reception_stays SET special_notes = ?, updated_at = ? WHERE beds24_booking_id = ?").bind(input.specialNotes, now, bookingId).run();
    await recordEvent(env, bookingId, "specialNotes", null, input.specialNotes, user, now);
  }
  if (input.body) {
    await env.DB.prepare(`
      INSERT INTO reception_guest_notes (beds24_booking_id, author_id, author_name, author_role, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(bookingId, user.id, user.displayName, user.role, input.body, now).run();
    await recordEvent(env, bookingId, "noteAdded", null, null, user, now);
  }
  return getReceptionStay(env, bookingId);
}

export async function getReceptionStay(env: ReceptionBindings, bookingId: number): Promise<ReceptionStay | null> {
  const row = await loadBookingRow(env, bookingId);
  return row ? mapStay(env, row) : null;
}
