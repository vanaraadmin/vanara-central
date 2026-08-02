import { getHousekeepingOverview, normalizeHousekeepingWorkflowInput, normalizeHousekeepingWorkflowStatus, updateHousekeepingWorkflow, type CheckoutCompletionSource, type HousekeepingBindings, type HousekeepingRoom, type HousekeepingWorkflowStatus } from "./housekeeping-overview.service.js";
import { getHousekeepingTask, housekeepingTaskCapabilities, type HousekeepingTask, type HousekeepingTaskPriority, type HousekeepingTaskStatus, type HousekeepingTaskType } from "./housekeeping-task-domain.service.js";
import { getHousekeepingV2Overview, type HousekeepingV2Bindings } from "./housekeeping-v2-overview.service.js";
import { createMaintenanceTicket, listOpenMaintenanceTicketDetailsForRoom, normalizeCreateMaintenanceTicketInput, type CreateMaintenanceTicketInput, type MaintenanceBindings, type MaintenanceTicketDetail } from "./maintenance.service.js";
import { operationalBookingStatusSql } from "./booking-status.service.js";
import { getReceptionStay, type ReceptionBindings } from "./reception.service.js";
import { getBangkokDate } from "./today.service.js";
import type { CurrentUser } from "./current-user.service.js";

export interface RoomDetailBindings extends HousekeepingBindings, HousekeepingV2Bindings, MaintenanceBindings, ReceptionBindings {
  DB: D1Database;
}

type TimelineType = "check-in" | "check-out" | "housekeeping" | "maintenance" | "note" | "procurement";
type RoomOperationalStatus = "No active Housekeeping" | "Cleaning scheduled" | "Cleaning in progress" | "Full Cleaning" | "Priority" | "Waiting Reception" | "Maintenance Block" | "Ready" | "Water refill";

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
  status: HousekeepingWorkflowStatus | RoomOperationalStatus;
  primaryStatus: HousekeepingWorkflowStatus | RoomOperationalStatus;
  primaryStatusTone: string;
  assignedTo: string | null;
  assignedAt: string | null;
  lastUpdated: string | null;
  checklistAvailable: boolean;
  checklistLabel: string;
  checklistCompleted: number;
  checklistTotal: number;
  notes: string | null;
  activeTask: RoomHousekeepingTask | null;
  tasks: RoomHousekeepingTask[];
  canCreateOnDemandCleaning: boolean;
}

export interface RoomHousekeepingTask {
  id: number;
  taskType: HousekeepingTaskType;
  title: string;
  status: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  isCarriedOver: boolean;
  reason: string;
  version: number;
  assignee: { id: string; name: string } | null;
  operationalDate: string;
  dueCycleDate: string | null;
  updatedAt: string;
  capabilities: {
    canClaim: boolean;
    canReleaseClaim: boolean;
    canStart: boolean;
    canComplete: boolean;
    canSkip: boolean;
    canCancel: boolean;
    canReopen: boolean;
  };
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
  housekeepingStatus: HousekeepingWorkflowStatus | RoomOperationalStatus;
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
  procurement: {
    attentionCount: number;
    latestRequest: string | null;
  };
  reception: {
    guestSummary: string | null;
    arrival: string | null;
    departure: string | null;
    checkInStatus: string;
    checkOutStatus: string;
    passportStatus: string;
    depositStatus: string;
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

const ACTIVE_TASK_STATUSES = new Set<HousekeepingTaskStatus>(["WAITING_FOR_RECEPTION", "AVAILABLE_FOR_CLAIM", "CLAIMED", "IN_PROGRESS", "CHECKLIST_COMPLETE", "READY_FOR_INSPECTION", "READY", "BLOCKED"]);
const TERMINAL_TASK_STATUSES = new Set<HousekeepingTaskStatus>(["COMPLETED", "SKIPPED", "CANCELLED"]);

function canCreateRoomHousekeepingTask(user: CurrentUser): boolean {
  return user.role === "Owner" || user.role === "Manager" || user.role === "Housekeeping" || user.role === "Operations";
}

function taskTitle(task: HousekeepingTask): string {
  if (task.taskType === "STANDARD_CLEANING") return "Cleaning";
  if (task.taskType === "LINEN_CHANGE") return "Full Cleaning";
  if (task.taskType === "ON_DEMAND_CLEANING") return "Cleaning request";
  if (task.taskType === "WATER_REFILL") return "Water refill";
  return "Turnover";
}

function taskIsCarriedOver(task: HousekeepingTask, today: string): boolean {
  return (task.taskType === "STANDARD_CLEANING" || task.taskType === "ON_DEMAND_CLEANING") && task.operationalDate < today;
}

function taskReason(task: HousekeepingTask, today: string): string {
  if (task.blockingReason) return task.blockingReason;
  if (task.taskType === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION") return "Waiting Reception";
  if (taskIsCarriedOver(task, today)) return "Was scheduled previously. Please do this first today.";
  if (task.taskType === "STANDARD_CLEANING") return "Cleaning due";
  if (task.taskType === "LINEN_CHANGE") return "Full Cleaning required";
  if (task.taskType === "ON_DEMAND_CLEANING") return "On-Demand Cleaning";
  if (task.taskType === "WATER_REFILL") return "Daily water refill";
  return "Operational task";
}

function taskRank(task: HousekeepingTask): number {
  if (task.taskType === "TURNOVER") return 1;
  if (task.taskType === "ON_DEMAND_CLEANING") return 2;
  if (task.taskType === "STANDARD_CLEANING") return 3;
  if (task.taskType === "LINEN_CHANGE") return 4;
  if (task.taskType === "WATER_REFILL") return 5;
  return 6;
}

function primaryHousekeepingState(task: RoomHousekeepingTask | null, maintenanceBlocked: boolean, legacyStatus: HousekeepingWorkflowStatus): { label: HousekeepingWorkflowStatus | RoomOperationalStatus; tone: string } {
  if (maintenanceBlocked) return { label: "Maintenance Block", tone: "maintenance-block" };
  if (!task) return { label: legacyStatus === "Ready" ? "No active Housekeeping" : legacyStatus, tone: statusTone(legacyStatus === "Ready" ? "No active Housekeeping" : legacyStatus) };
  if (task.status === "WAITING_FOR_RECEPTION") return { label: "Waiting Reception", tone: "waiting-reception" };
  if (task.isCarriedOver) return { label: "Priority", tone: "priority" };
  if (task.status === "IN_PROGRESS" || task.status === "CLAIMED") return { label: "Cleaning in progress", tone: "cleaning-in-progress" };
  if (task.status === "READY" || task.status === "READY_FOR_INSPECTION") return { label: "Ready", tone: "ready" };
  if (task.priority === "URGENT" || task.priority === "HIGH" || task.taskType === "TURNOVER") return { label: "Priority", tone: "priority" };
  if (task.taskType === "LINEN_CHANGE") return { label: "Full Cleaning", tone: "full-cleaning" };
  if (task.taskType === "WATER_REFILL") return { label: "Water refill", tone: "water-refill" };
  return { label: "Cleaning scheduled", tone: "cleaning-scheduled" };
}

function statusTone(value: string): string {
  return value.toLowerCase().replaceAll(" ", "-");
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

async function loadActiveHousekeepingTasks(env: RoomDetailBindings, unitId: number, date: string): Promise<HousekeepingTask[]> {
  const rows = await env.DB.prepare(`
    SELECT task_id
    FROM housekeeping_tasks
    WHERE unit_id = ?
      AND status IN ('WAITING_FOR_RECEPTION', 'AVAILABLE_FOR_CLAIM', 'CLAIMED', 'IN_PROGRESS', 'CHECKLIST_COMPLETE', 'READY_FOR_INSPECTION', 'READY', 'BLOCKED')
      AND (operational_date = ? OR due_cycle_date <= ?)
    ORDER BY
      CASE task_type WHEN 'TURNOVER' THEN 1 WHEN 'ON_DEMAND_CLEANING' THEN 2 WHEN 'STANDARD_CLEANING' THEN 3 WHEN 'LINEN_CHANGE' THEN 4 WHEN 'WATER_REFILL' THEN 5 ELSE 6 END,
      task_id
  `).bind(unitId, date, date).all<{ task_id: number }>();

  const tasks: HousekeepingTask[] = [];
  for (const row of rows.results ?? []) {
    const task = await getHousekeepingTask(env, row.task_id);
    if (task && ACTIVE_TASK_STATUSES.has(task.status)) tasks.push(task);
  }
  return tasks.sort((left, right) => taskRank(left) - taskRank(right));
}

async function loadProcurementAttention(env: RoomDetailBindings): Promise<{ attentionCount: number; latestRequest: string | null }> {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count, MAX(COALESCE(custom_item_text, note, status)) AS latest_request
    FROM procurement_requests
    WHERE status IN ('requested', 'reviewed', 'ordered')
  `).first<{ count: number; latest_request: string | null }>();
  return {
    attentionCount: row?.count ?? 0,
    latestRequest: row?.latest_request ?? null,
  };
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
    actionLabel: row.alert_type === "passport_missing" ? "Passport registration completed" : "Deposit collected",
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

function roomTaskCapabilities(task: HousekeepingTask, user: CurrentUser): RoomHousekeepingTask["capabilities"] {
  const base = housekeepingTaskCapabilities(task);
  const isOwner = user.role === "Owner" && user.views.includes("owner");
  const isManager = user.role === "Manager";
  const isAssigned = task.assignedUserId === user.id;
  const isUnassigned = task.assignedUserId === null;
  const active = !TERMINAL_TASK_STATUSES.has(task.status);
  const released = !(task.taskType === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION");

  return {
    canClaim: task.taskType !== "WATER_REFILL" && base.canClaim && released,
    canReleaseClaim: task.status === "CLAIMED" && (isAssigned || isOwner || isManager),
    canStart: base.canStart && released && (isUnassigned || isAssigned || isOwner),
    canComplete: base.canComplete && released && (isAssigned || isOwner || (task.taskType === "WATER_REFILL" && isUnassigned)),
    canSkip: base.canSkip && (isAssigned || isOwner || isManager),
    canCancel: active && Boolean(isOwner || isManager),
    canReopen: TERMINAL_TASK_STATUSES.has(task.status) && Boolean(isOwner || isManager),
  };
}

function mapRoomHousekeepingTask(task: HousekeepingTask, user: CurrentUser, today: string): RoomHousekeepingTask {
  return {
    id: task.id,
    taskType: task.taskType,
    title: taskTitle(task),
    status: task.status,
    priority: task.priority,
    isCarriedOver: taskIsCarriedOver(task, today),
    reason: taskReason(task, today),
    version: task.version,
    assignee: task.assignedUserId && task.assignedUserName ? { id: task.assignedUserId, name: task.assignedUserName } : null,
    operationalDate: task.operationalDate,
    dueCycleDate: task.dueCycleDate,
    updatedAt: task.updatedAt,
    capabilities: roomTaskCapabilities(task, user),
  };
}

function housekeepingDetail(operations: HousekeepingRoom, row: HousekeepingDetailRow | null, tasks: HousekeepingTask[], user: CurrentUser, maintenanceBlocked: boolean, today: string): RoomHousekeeping {
  const taskDtos = tasks.map((task) => mapRoomHousekeepingTask(task, user, today));
  const activeTask = taskDtos[0] ?? null;
  const primary = primaryHousekeepingState(activeTask, maintenanceBlocked, row ? normalizeHousekeepingWorkflowStatus(row.status) : operations.housekeepingStatus);

  return {
    status: primary.label,
    primaryStatus: primary.label,
    primaryStatusTone: primary.tone,
    assignedTo: activeTask?.assignee?.name ?? operations.assignedTo ?? row?.assigned_to ?? null,
    assignedAt: activeTask?.updatedAt ?? operations.assignedAt,
    lastUpdated: activeTask?.updatedAt ?? operations.lastUpdated ?? row?.updated_at ?? null,
    checklistAvailable: false,
    checklistLabel: "Not used",
    checklistCompleted: 0,
    checklistTotal: 0,
    notes: row?.notes ?? null,
    activeTask,
    tasks: taskDtos,
    canCreateOnDemandCleaning: canCreateRoomHousekeepingTask(user),
  };
}

function roomTaskBelongsToCurrentStay(task: HousekeepingTask, stay: RoomCurrentStay | null): boolean {
  if (task.taskType === "TURNOVER") return true;
  if (!stay) return false;
  if (task.bookingId !== null) return task.bookingId === stay.bookingId;
  if (task.stayId !== null) return task.stayId === stay.beds24BookingId;
  return false;
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

export async function getRoomDetail(env: RoomDetailBindings, id: number, user: CurrentUser): Promise<RoomDetail | null> {
  const unit = await resolveUnit(env, id);
  if (!unit) return null;

  const today = getBangkokDate();
  await getHousekeepingV2Overview(env, user, today);
  const [stayRow, housekeepingOverview, latestHousekeeping, activeTasks, tickets, notes, chatContext, receptionAlerts, procurement] = await Promise.all([
    loadCurrentStay(env, unit.unit_id, today),
    getHousekeepingOverview(env),
    loadLatestHousekeeping(env, unit.unit_id),
    loadActiveHousekeepingTasks(env, unit.unit_id, today),
    listOpenMaintenanceTicketDetailsForRoom(env, unit.unit_id),
    loadRoomNotes(env, unit.unit_id),
    loadChatContext(env, unit),
    loadReceptionRoomAlerts(env, unit.unit_id),
    loadProcurementAttention(env),
  ]);

  const currentStay = mapStay(stayRow);
  const roomScopedActiveTasks = activeTasks.filter((task) => roomTaskBelongsToCurrentStay(task, currentStay));
  const reception = currentStay ? await getReceptionStay(env, currentStay.beds24BookingId) : null;
  const operations = housekeepingOverview.rooms.find((room) => room.unitId === unit.unit_id) ?? operationalFallback(unit, currentStay);
  const openIssues = tickets.length;
  const outOfService = tickets.some((ticket) => ticket.outOfService);
  const highestPriority = ["Critical", "High", "Medium", "Low"].find((priority) => tickets.some((ticket) => ticket.priority === priority)) ?? null;
  const housekeeping = housekeepingDetail(operations, latestHousekeeping, roomScopedActiveTasks, user, outOfService, today);

  return {
    unitId: unit.unit_id,
    roomName: unit.unit_name,
    roomType: unitType(unit),
    accommodationType: unitType(unit),
    roomStatus: housekeeping.primaryStatus === "No active Housekeeping" ? roomStatus(operations, openIssues, outOfService) : housekeeping.primaryStatus,
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
    procurement,
    reception: {
      guestSummary: reception?.guestName ?? currentStay?.guestName ?? null,
      arrival: reception?.arrival ?? currentStay?.arrival ?? null,
      departure: reception?.departure ?? currentStay?.departure ?? null,
      checkInStatus: reception ? `${Object.values(reception.checkIn).filter(Boolean).length}/5` : "Not Available",
      checkOutStatus: reception ? `${Object.values(reception.checkOut).filter(Boolean).length}/4` : "Not Available",
      passportStatus: reception ? reception.checkIn.passportCollected ? "Recorded" : "Missing" : "Not Available",
      depositStatus: reception ? reception.checkIn.depositCollected ? reception.checkOut.depositReturned ? "Returned" : "Collected" : "Pending" : "Not Available",
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
  return getRoomDetail(env, unit.unit_id, user);
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
