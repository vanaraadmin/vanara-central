import { getHousekeepingOverview, type CheckoutCompletionSource, type HousekeepingBindings, type HousekeepingRoom, type HousekeepingWorkflowStatus } from "./housekeeping-overview.service.js";
import { housekeepingOperationalTaskCapabilities } from "./housekeeping-task-capabilities.service.js";
import { createHousekeepingTask, getHousekeepingTask, ROOM_READY_OVERRIDE_SOURCE, transitionHousekeepingTask, type HousekeepingTask, type HousekeepingTaskPriority, type HousekeepingTaskStatus, type HousekeepingTaskType } from "./housekeeping-task-domain.service.js";
import { getHousekeepingV2Overview, type HousekeepingV2Bindings } from "./housekeeping-v2-overview.service.js";
import { createMaintenanceTicket, listOpenMaintenanceTicketDetailsForRoom, normalizeCreateMaintenanceTicketInput, type CreateMaintenanceTicketInput, type MaintenanceBindings, type MaintenanceTicketDetail } from "./maintenance.service.js";
import { operationalBookingStatusSql } from "./booking-status.service.js";
import { getReceptionStay, type ReceptionBindings, type ReceptionStay } from "./reception.service.js";
import { getBangkokDate } from "./today.service.js";
import { ForbiddenError, type CurrentUser } from "./current-user.service.js";
import { canChangeOperationalAvailability, loadOperationalAvailabilityForUnit, type OperationalAvailabilityStatus, type RoomOperationalStateBindings } from "./room-operational-state.service.js";
import { loadRoomHousekeepingStateForUnit, setRoomHousekeepingState, type RoomHousekeepingState, type RoomHousekeepingStateBindings, type RoomReadyState } from "./room-housekeeping-state.service.js";

export interface RoomDetailBindings extends HousekeepingBindings, HousekeepingV2Bindings, MaintenanceBindings, ReceptionBindings, RoomOperationalStateBindings, RoomHousekeepingStateBindings {
  DB: D1Database;
}

type TimelineType = "check-in" | "check-out" | "housekeeping" | "maintenance" | "note" | "procurement";
type RoomOperationalStatus = "Clean" | "Dirty" | "Cleaning scheduled" | "Cleaning In Progress" | "Full Cleaning" | "Priority" | "Waiting for Check-out" | "Maintenance Block" | "Water refill";

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
  readyState: RoomReadyState;
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
  canChangeReadyState: boolean;
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
  startedAt: string | null;
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
  operationalAvailability: {
    status: OperationalAvailabilityStatus;
    label: "Operating" | "Not Operating";
    reason: string | null;
    seasonalStart: string | null;
    seasonalEnd: string | null;
    seasonalLabel: string | null;
    updatedAt: string | null;
    canChange: boolean;
  };
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
  status: RoomReadyState;
  reason: string | null;
  idempotencyKey: string | null;
}

export interface StartRoomStandardCleaningInput {
  idempotencyKey: string | null;
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

function roomReleasedSql(alias: string): string {
  return `(
    COALESCE(${alias}.guest_left, 0) = 1
    AND COALESCE(${alias}.room_released, 0) = 1
  )`;
}

function roomStatus(operations: HousekeepingRoom, maintenanceOpenIssues: number, outOfService: boolean, availabilityStatus: OperationalAvailabilityStatus): string {
  if (outOfService) return "Out of Service";
  if (availabilityStatus === "NOT_OPERATING") return "Not Operating";
  if (maintenanceOpenIssues > 0) return "Maintenance";
  if (operations.occupancyStatus === "Ready for Guest" || operations.occupancyStatus === "Checked Out") return "Vacant";
  return operations.occupancyStatus;
}

function roomOccupancyLabel(operations: HousekeepingRoom): string {
  if (operations.occupancyStatus === "Ready for Guest" || operations.occupancyStatus === "Checked Out") return "Vacant";
  return operations.occupancyStatus;
}

const ACTIVE_TASK_STATUSES = new Set<HousekeepingTaskStatus>(["WAITING_FOR_RECEPTION", "AVAILABLE_FOR_CLAIM", "CLAIMED", "IN_PROGRESS", "CHECKLIST_COMPLETE", "READY_FOR_INSPECTION", "READY", "BLOCKED"]);
const TERMINAL_TASK_STATUSES = new Set<HousekeepingTaskStatus>(["COMPLETED", "SKIPPED", "CANCELLED"]);

function canCreateRoomHousekeepingTask(user: CurrentUser): boolean {
  return user.role === "Owner" || user.role === "Manager" || user.role === "Housekeeping" || user.role === "Operations";
}

function canChangeRoomReadyState(user: CurrentUser): boolean {
  return user.role === "Owner" || user.role === "Manager";
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
  if (task.taskType === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION") return "Waiting for Check-out";
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

function primaryHousekeepingState(task: RoomHousekeepingTask | null, maintenanceBlocked: boolean, readyState: RoomReadyState): { label: HousekeepingWorkflowStatus | RoomOperationalStatus; tone: string } {
  if (maintenanceBlocked) return { label: "Maintenance Block", tone: "maintenance-block" };
  if (!task) return readyState === "NOT_READY" ? { label: "Dirty", tone: "dirty" } : { label: "Clean", tone: "clean" };
  if (task.status === "WAITING_FOR_RECEPTION") return { label: "Waiting for Check-out", tone: "waiting-reception" };
  if (task.isCarriedOver) return { label: "Priority", tone: "priority" };
  if (task.status === "IN_PROGRESS" || task.status === "CLAIMED") return { label: "Cleaning In Progress", tone: "cleaning-in-progress" };
  if (task.status === "READY" || task.status === "READY_FOR_INSPECTION") return { label: "Clean", tone: "clean" };
  if (task.priority === "URGENT" || task.priority === "HIGH" || task.taskType === "TURNOVER") return { label: "Priority", tone: "priority" };
  if (task.taskType === "LINEN_CHANGE") return { label: "Full Cleaning", tone: "full-cleaning" };
  if (task.taskType === "WATER_REFILL") return { label: "Water refill", tone: "water-refill" };
  return { label: "Cleaning scheduled", tone: "cleaning-scheduled" };
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
    SELECT b.booking_id, b.beds24_booking_id, b.guest_name, b.arrival_date, b.departure_date, b.adults, b.children,
           b.api_source, b.channel, b.api_reference, b.reference
    FROM bookings b
    LEFT JOIN reception_stays rs_current ON rs_current.beds24_booking_id = b.beds24_booking_id
    WHERE b.unit_id = ?1
      AND ${operationalBookingStatusSql("b.status")}
      AND (
        (
          b.arrival_date = ?2
          AND COALESCE(rs_current.guest_arrived, 0) = 1
          AND NOT ${roomReleasedSql("rs_current")}
        )
        OR (
          b.arrival_date < ?2
          AND b.departure_date = ?2
          AND NOT ${roomReleasedSql("rs_current")}
        )
        OR (
          b.arrival_date < ?2
          AND b.departure_date > ?2
        )
      )
    ORDER BY
      CASE
        WHEN COALESCE(rs_current.guest_arrived, 0) = 1 AND NOT ${roomReleasedSql("rs_current")} THEN 1
        ELSE 2
      END,
      b.arrival_date DESC,
      b.booking_id DESC
    LIMIT 1
  `).bind(unitId, today).first<StayRow>();
}

async function loadTodayTurnoverStay(env: RoomDetailBindings, unitId: number, today: string): Promise<StayRow | null> {
  return env.DB.prepare(`
    SELECT b.booking_id, b.beds24_booking_id, b.guest_name, b.arrival_date, b.departure_date, b.adults, b.children,
           b.api_source, b.channel, b.api_reference, b.reference
    FROM bookings b
    WHERE b.unit_id = ?1
      AND ${operationalBookingStatusSql("b.status")}
      AND (b.arrival_date = ?2 OR b.departure_date = ?2)
    ORDER BY
      CASE
        WHEN b.departure_date = ?2 THEN 1
        WHEN b.arrival_date = ?2 THEN 2
        ELSE 3
      END,
      b.booking_id DESC
    LIMIT 1
  `).bind(unitId, today).first<StayRow>();
}

async function loadActiveHousekeepingTasks(env: RoomDetailBindings, unitId: number, date: string): Promise<HousekeepingTask[]> {
  const rows = await env.DB.prepare(`
    SELECT task_id
    FROM housekeeping_tasks
    WHERE unit_id = ?
      AND status IN ('WAITING_FOR_RECEPTION', 'AVAILABLE_FOR_CLAIM', 'CLAIMED', 'IN_PROGRESS', 'CHECKLIST_COMPLETE', 'READY_FOR_INSPECTION', 'READY', 'BLOCKED')
      AND (idempotency_key IS NULL OR idempotency_key NOT LIKE 'room-ready-baseline:not-ready:%')
      AND (
        operational_date = ?
        OR due_cycle_date <= ?
        OR (
          source = 'manual'
          AND (
            task_type = 'ON_DEMAND_CLEANING'
            OR on_demand_source = ?
          )
        )
      )
    ORDER BY
      CASE task_type WHEN 'TURNOVER' THEN 1 WHEN 'ON_DEMAND_CLEANING' THEN 2 WHEN 'STANDARD_CLEANING' THEN 3 WHEN 'LINEN_CHANGE' THEN 4 WHEN 'WATER_REFILL' THEN 5 ELSE 6 END,
      task_id
  `).bind(unitId, date, date, ROOM_READY_OVERRIDE_SOURCE).all<{ task_id: number }>();

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

function roomOperationsForStay(operations: HousekeepingRoom, stay: RoomCurrentStay | null): HousekeepingRoom {
  if (stay) {
    return {
      ...operations,
      operationalPriority: "Occupied",
      occupancyStatus: "Occupied",
    };
  }
  if (operations.occupancyStatus === "Ready for Guest") return operations;
  return {
    ...operations,
    operationalPriority: operations.operationalPriority === "Occupied" ? "Ready" : operations.operationalPriority,
    occupancyStatus: "Ready for Guest",
  };
}

function receptionCheckoutCompleted(reception: ReceptionStay | null, turnoverStay: RoomCurrentStay | null, today: string): boolean {
  return Boolean(
    reception
      && turnoverStay
      && turnoverStay.departure === today
      && reception.checkOut.guestLeft
      && reception.checkOut.roomReleased,
  );
}

function roomTaskCapabilities(task: HousekeepingTask, user: CurrentUser, maintenanceBlocked: boolean): RoomHousekeepingTask["capabilities"] {
  const capabilities = housekeepingOperationalTaskCapabilities(task, user, { maintenanceBlocked });
  const isOwner = user.role === "Owner" && user.views.includes("owner");
  const isManager = user.role === "Manager";
  const active = !TERMINAL_TASK_STATUSES.has(task.status);

  return {
    canClaim: capabilities.canClaim,
    canReleaseClaim: capabilities.canReleaseClaim,
    canStart: capabilities.canStartCleaning,
    canComplete: capabilities.canFinishCleaning || (task.taskType === "WATER_REFILL" && capabilities.canCompleteTask),
    canSkip: capabilities.canSkip,
    canCancel: active && Boolean(isOwner || isManager),
    canReopen: TERMINAL_TASK_STATUSES.has(task.status) && Boolean(isOwner || isManager),
  };
}

function mapRoomHousekeepingTask(task: HousekeepingTask, user: CurrentUser, today: string, maintenanceBlocked: boolean): RoomHousekeepingTask {
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
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
    capabilities: roomTaskCapabilities(task, user, maintenanceBlocked),
  };
}

function isRoomReadyOverrideTask(task: HousekeepingTask): boolean {
  if (task.idempotencyKey?.startsWith("room-ready-baseline:not-ready:")) return false;
  return task.source === "manual" && task.onDemandSource === ROOM_READY_OVERRIDE_SOURCE;
}

function roomReadyState(storedState: RoomHousekeepingState): RoomReadyState {
  return storedState.readyState;
}

function housekeepingDetail(tasks: HousekeepingTask[], storedState: RoomHousekeepingState, user: CurrentUser, maintenanceBlocked: boolean, today: string): RoomHousekeeping {
  const taskDtos = tasks.map((task) => mapRoomHousekeepingTask(task, user, today, maintenanceBlocked));
  const activeTask = taskDtos[0] ?? null;
  const primary = primaryHousekeepingState(activeTask, maintenanceBlocked, storedState.readyState);

  return {
    status: primary.label,
    primaryStatus: primary.label,
    primaryStatusTone: primary.tone,
    readyState: roomReadyState(storedState),
    assignedTo: activeTask?.assignee?.name ?? null,
    assignedAt: activeTask?.updatedAt ?? null,
    lastUpdated: activeTask?.updatedAt ?? null,
    checklistAvailable: false,
    checklistLabel: "Not used",
    checklistCompleted: 0,
    checklistTotal: 0,
    notes: storedState.reason,
    activeTask,
    tasks: taskDtos,
    canCreateOnDemandCleaning: canCreateRoomHousekeepingTask(user),
    canChangeReadyState: canChangeRoomReadyState(user),
  };
}

function roomTaskBelongsToCurrentStay(task: HousekeepingTask, stay: RoomCurrentStay | null): boolean {
  if (isRoomReadyOverrideTask(task)) return true;
  if (task.taskType === "TURNOVER") return true;
  if (!stay) return true;
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
  if (!payload || typeof payload !== "object") throw new Error("Room status payload is required.");
  const allowed = ["status", "reason", "idempotencyKey"];
  const unknown = Object.keys(payload).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Room status payload contains unsupported field: ${unknown}.`);
  const data = payload as Record<string, unknown>;
  const rawStatus = typeof data.status === "string" ? data.status.trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_") : "";
  if (rawStatus !== "READY" && rawStatus !== "NOT_READY") throw new Error("Room status is invalid.");
  const reason = typeof data.reason === "string" && data.reason.trim() ? data.reason.trim().slice(0, 500) : null;
  const idempotencyKey = typeof data.idempotencyKey === "string" && data.idempotencyKey.trim() ? data.idempotencyKey.trim().slice(0, 200) : null;
  return { status: rawStatus, reason, idempotencyKey };
}

export function normalizeStartRoomStandardCleaningInput(payload: unknown): StartRoomStandardCleaningInput {
  if (payload !== null && payload !== undefined && typeof payload !== "object") throw new Error("Cleaning payload is invalid.");
  const data = (payload ?? {}) as Record<string, unknown>;
  const allowed = ["idempotencyKey"];
  const unknown = Object.keys(data).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Cleaning payload contains unsupported field: ${unknown}.`);
  const idempotencyKey = typeof data.idempotencyKey === "string" && data.idempotencyKey.trim() ? data.idempotencyKey.trim().slice(0, 200) : null;
  return { idempotencyKey };
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
  const [stayRow, turnoverStayRow, housekeepingOverview, activeTasks, tickets, notes, chatContext, receptionAlerts, procurement, operationalAvailability, storedHousekeepingState] = await Promise.all([
    loadCurrentStay(env, unit.unit_id, today),
    loadTodayTurnoverStay(env, unit.unit_id, today),
    getHousekeepingOverview(env),
    loadActiveHousekeepingTasks(env, unit.unit_id, today),
    listOpenMaintenanceTicketDetailsForRoom(env, unit.unit_id),
    loadRoomNotes(env, unit.unit_id),
    loadChatContext(env, unit),
    loadReceptionRoomAlerts(env, unit.unit_id),
    loadProcurementAttention(env),
    loadOperationalAvailabilityForUnit(env, unit.unit_id),
    loadRoomHousekeepingStateForUnit(env, unit.unit_id),
  ]);

  const currentStay = mapStay(stayRow);
  const turnoverStay = mapStay(turnoverStayRow);
  const roomScopedActiveTasks = activeTasks.filter((task) => roomTaskBelongsToCurrentStay(task, currentStay));
  const receptionStay = turnoverStay ?? currentStay;
  const reception = receptionStay ? await getReceptionStay(env, receptionStay.beds24BookingId) : null;
  const operations = roomOperationsForStay(
    housekeepingOverview.rooms.find((room) => room.unitId === unit.unit_id) ?? operationalFallback(unit, currentStay),
    currentStay,
  );
  const openIssues = tickets.length;
  const outOfService = tickets.some((ticket) => ticket.outOfService);
  const highestPriority = ["High", "Normal", "Low"].find((priority) => tickets.some((ticket) => ticket.priority === priority)) ?? null;
  const housekeeping = housekeepingDetail(roomScopedActiveTasks, storedHousekeepingState, user, outOfService, today);
  const checkoutCompleted = receptionCheckoutCompleted(reception, turnoverStay, today) || operations.checkoutCompleted;

  return {
    unitId: unit.unit_id,
    roomName: unit.unit_name,
    roomType: unitType(unit),
    accommodationType: unitType(unit),
    roomStatus: outOfService || operationalAvailability.status === "NOT_OPERATING" || housekeeping.primaryStatus === "Clean" || housekeeping.primaryStatus === "Dirty"
      ? roomStatus(operations, openIssues, outOfService, operationalAvailability.status)
      : housekeeping.primaryStatus,
    occupancyStatus: roomOccupancyLabel(operations),
    housekeepingStatus: housekeeping.status,
    operationalAvailability: {
      status: operationalAvailability.status,
      label: operationalAvailability.status === "OPERATING" ? "Operating" : "Not Operating",
      reason: operationalAvailability.reason,
      seasonalStart: operationalAvailability.seasonalStart,
      seasonalEnd: operationalAvailability.seasonalEnd,
      seasonalLabel: operationalAvailability.seasonalLabel,
      updatedAt: operationalAvailability.updatedAt,
      canChange: canChangeOperationalAvailability(user),
    },
    operationalPriority: operations.operationalPriority,
    checkoutCompleted,
    checkoutCompletionSource: operations.checkoutCompletionSource,
    newGuestToday: operations.newGuestToday,
    arrival: currentStay?.arrival ?? turnoverStay?.arrival ?? null,
    departure: currentStay?.departure ?? turnoverStay?.departure ?? null,
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

async function loadActiveRoomReadyOverrideTasks(env: RoomDetailBindings, unitId: number): Promise<HousekeepingTask[]> {
  const rows = await env.DB.prepare(`
    SELECT task_id
    FROM housekeeping_tasks
    WHERE unit_id = ?
      AND task_type = 'STANDARD_CLEANING'
      AND source = 'manual'
      AND on_demand_source = ?
      AND (idempotency_key IS NULL OR idempotency_key NOT LIKE 'room-ready-baseline:not-ready:%')
      AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
    ORDER BY task_id
  `).bind(unitId, ROOM_READY_OVERRIDE_SOURCE).all<{ task_id: number }>();

  const tasks: HousekeepingTask[] = [];
  for (const row of rows.results ?? []) {
    const task = await getHousekeepingTask(env, row.task_id);
    if (task) tasks.push(task);
  }
  return tasks;
}

async function insertRoomReadyAuditEvent(env: RoomDetailBindings, task: HousekeepingTask, user: CurrentUser, previousRoomStatus: RoomReadyState, newRoomStatus: RoomReadyState, reason: string | null, idempotencyKey: string | null, now: string): Promise<void> {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO housekeeping_task_events (
      task_id, event_type, actor_user_id, actor_name, previous_status, new_status,
      reason, metadata_json, idempotency_key, created_at
    )
    VALUES (?, 'room_ready_override', ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    task.id,
    user.id,
    user.displayName,
    task.status,
    task.status,
    reason,
    JSON.stringify({ previousRoomStatus, newRoomStatus, source: "room_workspace" }),
    idempotencyKey,
    now,
  ).run();
}

function roomReadyIdempotency(input: UpdateRoomHousekeepingInput, unitId: number, status: RoomReadyState, now: string): string {
  if (input.idempotencyKey) return input.idempotencyKey;
  return `room-ready:${status.toLowerCase()}:${unitId}:${now}:${crypto.randomUUID()}`;
}

export async function startRoomStandardCleaning(env: RoomDetailBindings, id: number, input: StartRoomStandardCleaningInput, user: CurrentUser): Promise<RoomDetail | null> {
  if (!canCreateRoomHousekeepingTask(user)) throw new ForbiddenError("Housekeeping access is required.");
  const unit = await resolveUnit(env, id);
  if (!unit) return null;

  const today = getBangkokDate();
  const [currentStay, storedState, activeTasks, activeOverrides, tickets] = await Promise.all([
    loadCurrentStay(env, unit.unit_id, today),
    loadRoomHousekeepingStateForUnit(env, unit.unit_id),
    loadActiveHousekeepingTasks(env, unit.unit_id, today),
    loadActiveRoomReadyOverrideTasks(env, unit.unit_id),
    listOpenMaintenanceTicketDetailsForRoom(env, unit.unit_id),
  ]);

  if (currentStay) throw new Error("Standard Cleaning from Rooms requires a vacant room.");
  if (tickets.some((ticket) => ticket.outOfService)) throw new Error("Cleaning is blocked by Maintenance.");
  if (storedState.readyState !== "NOT_READY") throw new Error("Room must be dirty before starting cleaning.");

  const manualTaskIds = new Set(activeOverrides.map((task) => task.id));
  const conflictingTask = activeTasks.find((task) => !manualTaskIds.has(task.id));
  if (conflictingTask) throw new Error("An active Housekeeping task already exists for this room.");

  const existing = activeOverrides[0] ?? null;
  if (existing?.status === "IN_PROGRESS") return getRoomDetail(env, unit.unit_id, user);
  if (existing && existing.status !== "AVAILABLE_FOR_CLAIM" && existing.status !== "CLAIMED") {
    throw new Error("Existing cleaning task cannot be started.");
  }

  const idempotencyKey = input.idempotencyKey ?? `room-workspace:standard-cleaning:${unit.unit_id}:${today}:${crypto.randomUUID()}`;
  const task = existing ?? await createHousekeepingTask(env, {
    taskType: "STANDARD_CLEANING",
    unitId: unit.unit_id,
    bookingId: null,
    stayId: null,
    operationalDate: today,
    dueCycleDate: today,
    priority: "NORMAL",
    source: "manual",
    onDemandSource: ROOM_READY_OVERRIDE_SOURCE,
    idempotencyKey,
    creationMetadata: { source: "room_workspace", reasonCode: "vacant_dirty_standard_cleaning" },
  }, user);

  await transitionHousekeepingTask(env, task.id, {
    action: "start",
    expectedVersion: task.version,
    actor: user,
    idempotencyKey: `${idempotencyKey}:start`,
    metadata: { source: "room_workspace", reasonCode: "vacant_dirty_standard_cleaning" },
  });

  return getRoomDetail(env, unit.unit_id, user);
}

export async function updateRoomHousekeepingStatus(env: RoomDetailBindings, id: number, input: UpdateRoomHousekeepingInput, user: CurrentUser): Promise<RoomDetail | null> {
  if (!canChangeRoomReadyState(user)) throw new ForbiddenError("Owner or Manager access is required.");
  const unit = await resolveUnit(env, id);
  if (!unit) return null;
  const now = new Date().toISOString();
  const activeOverrides = await loadActiveRoomReadyOverrideTasks(env, unit.unit_id);

  if (input.status === "NOT_READY") {
    const existing = activeOverrides[0] ?? null;
    if (existing) {
      await insertRoomReadyAuditEvent(env, existing, user, "NOT_READY", "NOT_READY", input.reason, input.idempotencyKey ? `${input.idempotencyKey}:audit` : null, now);
    } else {
      const task = await createHousekeepingTask(env, {
        taskType: "STANDARD_CLEANING",
        unitId: unit.unit_id,
        bookingId: null,
        stayId: null,
        operationalDate: getBangkokDate(),
        dueCycleDate: getBangkokDate(),
        priority: "NORMAL",
        source: "manual",
        onDemandSource: ROOM_READY_OVERRIDE_SOURCE,
        idempotencyKey: roomReadyIdempotency(input, unit.unit_id, "NOT_READY", now),
        creationMetadata: { previousRoomStatus: "READY", newRoomStatus: "NOT_READY", reason: input.reason, source: "room_workspace" },
      }, user);
      await insertRoomReadyAuditEvent(env, task, user, "READY", "NOT_READY", input.reason, `${task.idempotencyKey ?? task.id}:room-ready-override`, now);
    }
    await setRoomHousekeepingState(
      env,
      unit.unit_id,
      "NOT_READY",
      input.reason,
      "room_workspace_manual_cleaning_request",
      user,
      input.idempotencyKey ? `${input.idempotencyKey}:room-state` : `room-ready:not-ready:${unit.unit_id}:${now}`,
      now,
    );
  } else {
    for (const task of activeOverrides) {
      await transitionHousekeepingTask(env, task.id, {
        action: "cancel",
        expectedVersion: task.version,
        actor: user,
        reason: input.reason ?? "Room manually marked ready.",
        idempotencyKey: `${input.idempotencyKey ?? `room-ready:ready:${unit.unit_id}`}:${task.id}:${task.version}`,
        metadata: { previousRoomStatus: "NOT_READY", newRoomStatus: "READY", source: "room_workspace" },
      });
    }
    await setRoomHousekeepingState(
      env,
      unit.unit_id,
      "READY",
      null,
      "room_workspace_manual_ready_override",
      user,
      input.idempotencyKey ? `${input.idempotencyKey}:room-state` : `room-ready:ready:${unit.unit_id}:${now}`,
      now,
    );
  }

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
    ? { ...payload, targetType: "ROOM", roomId: unit.unit_id, accommodationId: unit.room_type_id, locationArea: null }
    : payload;
  const input = normalizeCreateMaintenanceTicketInput(scopedPayload);
  const roomInput: CreateMaintenanceTicketInput = {
    ...input,
    targetType: "ROOM",
    roomId: unit.unit_id,
    accommodationId: unit.room_type_id,
  };
  return createMaintenanceTicket(env, roomInput, user);
}
