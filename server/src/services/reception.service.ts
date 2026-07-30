import { getHousekeepingOverview, type HousekeepingBindings } from "./housekeeping-overview.service.js";
import { listOpenMaintenanceTicketDetailsForRoom, type MaintenanceBindings } from "./maintenance.service.js";
import { isOperationalBookingStatus, operationalBookingStatusSql } from "./booking-status.service.js";
import { countryCodeFrom, countryFlagFrom, countryFlagUrlFrom } from "./country-flags.service.js";
import { getBangkokDate } from "./today.service.js";
import type { CurrentUser } from "./current-user.service.js";

export interface ReceptionBindings extends HousekeepingBindings, MaintenanceBindings {
  DB: D1Database;
}

export type ReceptionCheckInField = "guestArrived" | "passportCollected" | "depositCollected" | "welcomeCompleted" | "keysDelivered";
export type ReceptionCheckOutField = "guestLeft" | "keysReturned" | "depositReturned" | "roomReleased";
export type ReceptionCompletionType = "check-in" | "check-out";

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
  country: string | null;
  country_code: string | null;
  status: string;
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

export interface ReceptionActionInput {
  field: ReceptionCheckInField | ReceptionCheckOutField;
  completed: boolean;
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
  bookingStatus: string;
  nationalityCode: string | null;
  roomStatus: string;
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
           b.country, b.country_code, b.status
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

async function roomStatus(env: ReceptionBindings, roomId: number | null): Promise<string> {
  if (!roomId) return "Expected Arrival";
  const housekeeping = await getHousekeepingOverview(env);
  const room = housekeeping.rooms.find((item) => item.unitId === roomId);
  const maintenance = await listOpenMaintenanceTicketDetailsForRoom(env, roomId);
  if (maintenance.some((ticket) => ticket.outOfService)) return "Out Of Service";
  if (maintenance.length > 0) return "Maintenance";
  if (!room) return "Ready";
  if (room.housekeepingStatus === "Cleaning") return "Cleaning";
  if (room.occupancyStatus === "Occupied") return "Occupied";
  if (room.newGuestToday) return "Expected Arrival";
  if (room.checkoutCompleted) return "Expected Departure";
  return "Ready";
}

async function mapStay(env: ReceptionBindings, row: BookingRow): Promise<ReceptionStay> {
  const local = await ensureReceptionStay(env, row.beds24_booking_id);
  const nationalitySource = row.country_code || row.country;
  const nationalityCode = countryCodeFrom(nationalitySource);
  const [notes, timeline, status] = await Promise.all([
    loadNotes(env, row.beds24_booking_id),
    loadEvents(env, row.beds24_booking_id),
    roomStatus(env, row.unit_id),
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
    bookingStatus: row.status,
    roomStatus: status,
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

export async function completeReceptionEvent(env: ReceptionBindings, bookingId: number, type: ReceptionCompletionType, user: CurrentUser): Promise<ReceptionStay | null> {
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
    await env.DB.prepare("UPDATE reception_stays SET guest_arrived = 1, updated_at = ? WHERE beds24_booking_id = ?")
      .bind(now, bookingId)
      .run();
    await recordEvent(env, bookingId, "checkInCompleted", "false", "true", user, now);
  } else {
    if (local.guest_left === 1 || local.room_released === 1) completionError("Check-out has already been completed.");
    await env.DB.prepare("UPDATE reception_stays SET guest_left = 1, room_released = 1, updated_at = ? WHERE beds24_booking_id = ?")
      .bind(now, bookingId)
      .run();
    await recordEvent(env, bookingId, "checkOutCompleted", "false", "true", user, now);
  }

  return mapStay(env, booking);
}

async function loadBookingRows(env: ReceptionBindings, where: string, params: string[]): Promise<BookingRow[]> {
  const rows = await env.DB.prepare(`
    SELECT b.beds24_booking_id, b.guest_name, b.unit_id, u.unit_name, rt.room_type_name,
           b.adults, b.children, b.arrival_date, b.departure_date, b.channel, b.api_source, b.api_reference,
           b.country, b.country_code, b.status
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
