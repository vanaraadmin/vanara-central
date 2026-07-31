import { getHousekeepingOverview, normalizeHousekeepingWorkflowInput, normalizeHousekeepingWorkflowStatus, updateHousekeepingWorkflow, type CheckoutCompletionSource, type HousekeepingBindings, type HousekeepingRoom, type HousekeepingWorkflowStatus } from "./housekeeping-overview.service.js";
import { createMaintenanceTicket, listOpenMaintenanceTicketDetailsForRoom, normalizeCreateMaintenanceTicketInput, type CreateMaintenanceTicketInput, type MaintenanceBindings, type MaintenanceTicketDetail } from "./maintenance.service.js";
import { operationalBookingStatusSql } from "./booking-status.service.js";
import { getReceptionStay, type ReceptionBindings } from "./reception.service.js";
import { getBangkokDate } from "./today.service.js";
import type { CurrentUser } from "./current-user.service.js";

export interface RoomDetailBindings extends HousekeepingBindings, MaintenanceBindings, ReceptionBindings {
  DB: D1Database;
}

type TimelineType = "check-in" | "check-out" | "housekeeping" | "maintenance" | "note" | "procurement";

interface UnitRow {
  unit_id: number;
  unit_name: string;
  unit_type: string | null;
  room_type_id: number;
  room_type_name: string;
  room_name: string | null;
}

interface StayRow {
  booking_id: number;
  beds24_booking_id: number;
  guest_name: string | null;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  api_source: string | null;
  channel: string | null;
  api_reference: string | null;
  reference: string | null;
}

interface HousekeepingDetailRow {
  housekeeping_id: number;
  status: string;
  assigned_to: string | null;
  work_date: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface RoomNoteRow {
  note_id: number;
  unit_id: number;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface ChatContextRow {
  conversation_id: string;
}

interface ReceptionRoomAlertRow {
  alert_id: number;
  beds24_booking_id: number;
  unit_id: number;
  alert_type: "passport_missing" | "deposit_pending";
  title: string;
  created_at: string;
}

export interface RoomCurrentStay {
  bookingId: number;
  beds24BookingId: number;
  guestName: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  guests: number;
  bookingSource: string;
  bookingReference: string | null;
}

export interface RoomHousekeeping {
  status: HousekeepingWorkflowStatus;
  assignedTo: string | null;
  assignedAt: string | null;
  lastUpdated: string | null;
  checklistAvailable: boolean;
  checklistLabel: string;
  checklistCompleted: number;
  checklistTotal: number;
  notes: string | null;
}

export interface RoomNote {
  id: number;
  unitId: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceptionRoomAlert {
  id: number;
  bookingId: number;
  unitId: number;
  type: "passport_missing" | "deposit_pending";
  title: string;
  actionLabel: string;
  createdAt: string;
}

export interface RoomTimelineEvent {
  id: string;
  type: TimelineType;
  title: string;
  description: string | null;
  actorName: string | null;
  occurredAt: string;
  sourceId: string | null;
}

export interface RoomChatContext {
  contextType: "room";
  contextId: string;
  roomName: string;
  accommodationType: string;
  conversationId: string | null;
  readyForContextualChat: boolean;
}

export interface RoomDetail {
  unitId: number;
  roomName: string;
  roomType: string;
  accommodationType: string;
  roomStatus: string;
  occupancyStatus: string;
  housekeepingStatus: HousekeepingWorkflowStatus;
  operationalPriority: string;
  checkoutCompleted: boolean;
  checkoutCompletionSource: CheckoutCompletionSource;
  newGuestToday: boolean;
  arrival: string | null;
  departure: string | null;
  currentStay: RoomCurrentStay | null;
  housekeeping: RoomHousekeeping;
  maintenance: {
    openIssues: number;
    label: string;
    highestPriority: string | null;
    outOfService: boolean;
    tickets: MaintenanceTicketDetail[];
  };
  reception: {
    guestSummary: string | null;
    arrival: string | null;
    departure: string | null;
    checkInStatus: string;
    checkOutStatus: string;
    alerts: ReceptionRoomAlert[];
    notes: string[];
  };
  notes: RoomNote[];
  timeline: {
    events: RoomTimelineEvent[];
  };
  chatContext: RoomChatContext;
}

export interface UpdateRoomHousekeepingInput {
  status: HousekeepingWorkflowStatus;
}

export interface CreateRoomNoteInput {
  body: string;
}

function unitType(row: UnitRow): string {
  return row.unit_type || row.room_type_name || row.room_name || "Accommodation";
}

function guestName(row: StayRow): string {
  return row.guest_name || "Guest name unavailable";
}

function dateTimeFromDate(date: string): string {
  return `${date}T12:00:00.000+07:00`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function roomStatus(operations: HousekeepingRoom, maintenanceOpenIssues: number, outOfService: boolean): string {
  if (outOfService) return "Out of Service";
  if (maintenanceOpenIssues > 0) return "Maintenance";
  if (operations.occupancyStatus === "Occupied") return "Occupied";
  if (operations.housekeepingStatus === "Cleaning") return "Cleaning";
  if (operations.housekeepingStatus === "Dirty") return "Dirty";
  if (operations.occupancyStatus === "Ready for Guest") return "Ready";
  return operations.operationalPriority;
}

async function resolveUnit(env: RoomDetailBindings, id: number): Promise<UnitRow | null> {
  const direct = await env.DB.prepare(`
    SELECT u.unit_id, u.unit_name, u.unit_type, u.room_type_id, rt.room_type_name, rt.room_name
    FROM units u
    JOIN room_types rt ON rt.room_type_id = u.room_type_id
    WHERE u.unit_id = ?1
    LIMIT 1
  `).bind(id).first<UnitRow>();

  if (direct) return direct;

  return env.DB.prepare(`
    SELECT u.unit_id, u.unit_name, u.unit_type, u.room_type_id, rt.room_type_name, rt.room_name
    FROM bookings b
    JOIN units u ON u.unit_id = b.unit_id
    JOIN room_types rt ON rt.room_type_id = u.room_type_id
    WHERE (b.beds24_booking_id = ?1 OR b.booking_id = ?1)
      AND ${operationalBookingStatusSql("b.status")}
    ORDER BY b.arrival_date DESC
    LIMIT 1
  `).bind(id).first<UnitRow>();
}

async function loadCurrentStay(env: RoomDetailBindings, unitId: number, today: string): Promise<StayRow | null> {
  return env.DB.prepare(`
    SELECT booking_id, beds24_booking_id, guest_name, arrival_date, departure_date, adults, children,
           api_source, channel, api_reference, reference
    FROM bookings
    WHERE unit_id = ?1
      AND arrival_date <= ?2
      AND departure_date > ?2
      AND ${operationalBookingStatusSql("status")}
    ORDER BY arrival_date DESC
    LIMIT 1
  `).bind(unitId, today).first<StayRow>();
}

async function loadLatestHousekeeping(env: RoomDetailBindings, unitId: number): Promise<HousekeepingDetailRow | null> {
  return env.DB.prepare(`
    SELECT housekeeping_id, status, assigned_to, work_date, started_at, completed_at, notes, created_at, updated_at
    FROM housekeeping
    WHERE unit_id = ?
    ORDER BY work_date DESC, updated_at DESC, housekeeping_id DESC
    LIMIT 1
  `).bind(unitId).first<HousekeepingDetailRow>();
}

async function loadRoomNotes(env: RoomDetailBindings, unitId: number): Promise<RoomNote[]> {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM room_notes
    WHERE unit_id = ?
    ORDER BY created_at DESC, note_id DESC
    LIMIT 50
  `).bind(unitId).all<RoomNoteRow>();

  return (rows.results ?? []).map((row) => ({
    id: row.note_id,
    unitId: row.unit_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function loadReceptionRoomAlerts(env: RoomDetailBindings, unitId: number): Promise<ReceptionRoomAlert[]> {
  const rows = await env.DB.prepare(`
    SELECT alert_id, beds24_booking_id, unit_id, alert_type, title, created_at
    FROM reception_room_alerts
    WHERE unit_id = ?
      AND status = 'active'
    ORDER BY created_at ASC, alert_id ASC
    LIMIT 12
  `).bind(unitId).all<ReceptionRoomAlertRow>();

  return (rows.results ?? []).map((row) => ({
    id: row.alert_id,
    bookingId: row.beds24_booking_id,
    unitId: row.unit_id,
    type: row.alert_type,
    title: row.title,
    actionLabel: row.alert_type === "passport_missing" ? "Passport photographed" : "Deposit collected",
    createdAt: row.created_at,
  }));
}

async function loadChatContext(env: RoomDetailBindings, unit: UnitRow): Promise<RoomChatContext> {
  const row = await env.DB.prepare(`
    SELECT conversation_id
    FROM chat_conversations
    WHERE context_type = 'room' AND context_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(String(unit.unit_id)).first<ChatContextRow>();

  return {
    contextType: "room",
    contextId: String(unit.unit_id),
    roomName: unit.unit_name,
    accommodationType: unitType(unit),
    conversationId: row?.conversation_id ?? null,
    readyForContextualChat: true,
  };
}

function mapStay(row: StayRow | null): RoomCurrentStay | null {
  if (!row) return null;
  return {
    bookingId: row.booking_id,
    beds24BookingId: row.beds24_booking_id,
    guestName: guestName(row),
    arrival: row.arrival_date,
    departure: row.departure_date,
    adults: row.adults,
    children: row.children,
    guests: row.adults + row.children,
    bookingSource: row.api_source || row.channel || "Beds24",
    bookingReference: row.api_reference || row.reference || String(row.beds24_booking_id),
  };
}

function operationalFallback(unit: UnitRow, stay: RoomCurrentStay | null): HousekeepingRoom {
  const occupied = stay !== null;
  return {
    id: `unit:${unit.unit_id}`,
    unitId: unit.unit_id,
    unitName: unit.unit_name,
    group: occupied ? "occupied" : "ready",
    operationalPriority: occupied ? "Occupied" : "Ready",
    occupancyStatus: occupied ? "Occupied" : "Ready for Guest",
    housekeepingStatus: "Ready",
    checkoutCompleted: false,
    checkoutCompletionSource: "none",
    newGuestToday: false,
    priority: occupied ? "Normal" : "None",
    assignedTo: null,
    assignedUserId: null,
    assignedAt: null,
    lastUpdated: null,
    minutesSinceUpdate: null,
    checklist: {
      version: 1,
      items: [],
      completed: 0,
      total: 0,
      missing: [],
    },
    blocked: false,
  };
}

function housekeepingDetail(operations: HousekeepingRoom, row: HousekeepingDetailRow | null): RoomHousekeeping {
  return {
    status: row ? normalizeHousekeepingWorkflowStatus(row.status) : operations.housekeepingStatus,
    assignedTo: operations.assignedTo ?? row?.assigned_to ?? null,
    assignedAt: operations.assignedAt,
    lastUpdated: operations.lastUpdated ?? row?.updated_at ?? null,
    checklistAvailable: true,
    checklistLabel: `${operations.checklist.completed}/${operations.checklist.total} completed`,
    checklistCompleted: operations.checklist.completed,
    checklistTotal: operations.checklist.total,
    notes: row?.notes ?? null,
  };
}

function buildTimeline(stay: RoomCurrentStay | null, housekeeping: RoomHousekeeping, tickets: MaintenanceTicketDetail[], notes: RoomNote[]): RoomTimelineEvent[] {
  const events: RoomTimelineEvent[] = [];

  if (stay) {
    events.push({
      id: `check-in:${stay.bookingId}`,
      type: "check-in",
      title: "Check-in",
      description: stay.guestName,
      actorName: null,
      occurredAt: dateTimeFromDate(stay.arrival),
      sourceId: String(stay.bookingId),
    });
    events.push({
      id: `check-out:${stay.bookingId}`,
      type: "check-out",
      title: "Scheduled check-out",
      description: stay.guestName,
      actorName: null,
      occurredAt: dateTimeFromDate(stay.departure),
      sourceId: String(stay.bookingId),
    });
  }

  if (housekeeping.lastUpdated) {
    events.push({
      id: `housekeeping:${housekeeping.lastUpdated}`,
      type: "housekeeping",
      title: `Housekeeping: ${housekeeping.status}`,
      description: housekeeping.assignedTo ? `Assigned to ${housekeeping.assignedTo}` : null,
      actorName: housekeeping.assignedTo,
      occurredAt: housekeeping.lastUpdated,
      sourceId: null,
    });
  }

  for (const ticket of tickets) {
    const maintenanceEvents = ticket.timeline.slice(-3);
    if (maintenanceEvents.length === 0) {
      events.push({
        id: `maintenance:${ticket.id}`,
        type: "maintenance",
        title: ticket.title,
        description: `${ticket.priority} · ${ticket.status}`,
        actorName: ticket.reportedByName,
        occurredAt: ticket.updatedAt,
        sourceId: String(ticket.id),
      });
    }
    for (const item of maintenanceEvents) {
      events.push({
        id: `maintenance-event:${item.id}`,
        type: "maintenance",
        title: `Maintenance ${item.eventType.replaceAll("_", " ")}`,
        description: item.toValue,
        actorName: item.actorName,
        occurredAt: item.createdAt,
        sourceId: String(ticket.id),
      });
    }
  }

  for (const note of notes) {
    events.push({
      id: `note:${note.id}`,
      type: "note",
      title: "Room note",
      description: note.body,
      actorName: note.authorName,
      occurredAt: note.createdAt,
      sourceId: String(note.id),
    });
  }

  return events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 80);
}

export function normalizeRoomHousekeepingInput(payload: unknown): UpdateRoomHousekeepingInput {
  return normalizeHousekeepingWorkflowInput(payload);
}

export function normalizeRoomNoteInput(payload: unknown): CreateRoomNoteInput {
  if (!payload || typeof payload !== "object") throw new Error("Note payload is required.");
  const body = "body" in payload && typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) throw new Error("Note is required.");
  if (body.length > 2000) throw new Error("Note must be 2000 characters or less.");
  return { body };
}

export async function getRoomDetail(env: RoomDetailBindings, id: number): Promise<RoomDetail | null> {
  const unit = await resolveUnit(env, id);
  if (!unit) return null;

  const today = getBangkokDate();
  const [stayRow, housekeepingOverview, latestHousekeeping, tickets, notes, chatContext, receptionAlerts] = await Promise.all([
    loadCurrentStay(env, unit.unit_id, today),
    getHousekeepingOverview(env),
    loadLatestHousekeeping(env, unit.unit_id),
    listOpenMaintenanceTicketDetailsForRoom(env, unit.unit_id),
    loadRoomNotes(env, unit.unit_id),
    loadChatContext(env, unit),
    loadReceptionRoomAlerts(env, unit.unit_id),
  ]);

  const currentStay = mapStay(stayRow);
  const reception = currentStay ? await getReceptionStay(env, currentStay.beds24BookingId) : null;
  const operations = housekeepingOverview.rooms.find((room) => room.unitId === unit.unit_id) ?? operationalFallback(unit, currentStay);
  const housekeeping = housekeepingDetail(operations, latestHousekeeping);
  const openIssues = tickets.length;
  const outOfService = tickets.some((ticket) => ticket.outOfService);
  const highestPriority = ["Critical", "High", "Medium", "Low"].find((priority) => tickets.some((ticket) => ticket.priority === priority)) ?? null;

  return {
    unitId: unit.unit_id,
    roomName: unit.unit_name,
    roomType: unitType(unit),
    accommodationType: unitType(unit),
    roomStatus: roomStatus({ ...operations, housekeepingStatus: housekeeping.status }, openIssues, outOfService),
    occupancyStatus: operations.occupancyStatus,
    housekeepingStatus: housekeeping.status,
    operationalPriority: operations.operationalPriority,
    checkoutCompleted: operations.checkoutCompleted,
    checkoutCompletionSource: operations.checkoutCompletionSource,
    newGuestToday: operations.newGuestToday,
    arrival: currentStay?.arrival ?? null,
    departure: currentStay?.departure ?? null,
    currentStay,
    housekeeping,
    maintenance: {
      openIssues,
      label: outOfService ? "Out of Service" : highestPriority ? `${highestPriority} maintenance issue` : "No open issues",
      highestPriority,
      outOfService,
      tickets,
    },
    reception: {
      guestSummary: reception?.guestName ?? currentStay?.guestName ?? null,
      arrival: reception?.arrival ?? currentStay?.arrival ?? null,
      departure: reception?.departure ?? currentStay?.departure ?? null,
      checkInStatus: reception ? `${Object.values(reception.checkIn).filter(Boolean).length}/5` : "Not Available",
      checkOutStatus: reception ? `${Object.values(reception.checkOut).filter(Boolean).length}/4` : "Not Available",
      alerts: receptionAlerts,
      notes: reception ? [reception.specialNotes, ...reception.notes.slice(0, 3).map((note) => note.body)].filter((note): note is string => Boolean(note)) : [],
    },
    notes,
    timeline: {
      events: buildTimeline(currentStay, housekeeping, tickets, notes),
    },
    chatContext,
  };
}

export async function updateRoomHousekeepingStatus(env: RoomDetailBindings, id: number, input: UpdateRoomHousekeepingInput, user: CurrentUser): Promise<RoomDetail | null> {
  const unit = await resolveUnit(env, id);
  if (!unit) return null;
  await updateHousekeepingWorkflow(env, unit.unit_id, input, user);
  return getRoomDetail(env, unit.unit_id);
}

export async function createRoomNote(env: RoomDetailBindings, id: number, input: CreateRoomNoteInput, user: CurrentUser): Promise<RoomNote | null> {
  const unit = await resolveUnit(env, id);
  if (!unit) return null;
  const now = nowIso();
  const result = await env.DB.prepare(`
    INSERT INTO room_notes (unit_id, author_id, author_name, author_role, body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(unit.unit_id, user.id, user.displayName, user.role, input.body, now, now).run();

  const row = await env.DB.prepare("SELECT * FROM room_notes WHERE note_id = ?").bind(result.meta.last_row_id).first<RoomNoteRow>();
  return row
    ? {
        id: row.note_id,
        unitId: row.unit_id,
        authorId: row.author_id,
        authorName: row.author_name,
        authorRole: row.author_role,
        body: row.body,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}

export async function createRoomMaintenanceTicket(env: RoomDetailBindings, id: number, payload: unknown, user: CurrentUser): Promise<MaintenanceTicketDetail | null> {
  const unit = await resolveUnit(env, id);
  if (!unit) return null;
  const scopedPayload = payload && typeof payload === "object"
    ? { ...payload, roomId: unit.unit_id, accommodationId: unit.room_type_id, locationArea: null }
    : payload;
  const input = normalizeCreateMaintenanceTicketInput(scopedPayload);
  const roomInput: CreateMaintenanceTicketInput = {
    ...input,
    roomId: unit.unit_id,
    accommodationId: unit.room_type_id,
  };
  return createMaintenanceTicket(env, roomInput, user);
}
