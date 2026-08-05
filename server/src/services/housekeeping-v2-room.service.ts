import { operationalBookingStatusSql } from "./booking-status.service.js";
import { housekeepingOperationalTaskCapabilities } from "./housekeeping-task-capabilities.service.js";
import {
  createHousekeepingTask,
  HousekeepingTaskDomainError,
  getHousekeepingTask,
  ROOM_READY_OVERRIDE_SOURCE,
  syncReleasedTurnoverTasks,
  transitionHousekeepingTask,
  type HousekeepingCompletionInput,
  type HousekeepingTask,
  type HousekeepingTaskPriority,
  type HousekeepingTaskSource,
  type HousekeepingTaskStatus,
  type HousekeepingTaskType,
  type HousekeepingTransitionAction,
} from "./housekeeping-task-domain.service.js";
import {
  getHousekeepingV2Overview,
  normalizeHousekeepingV2Date,
  type HousekeepingV2Bindings,
} from "./housekeeping-v2-overview.service.js";
import { ForbiddenError, type CurrentUser } from "./current-user.service.js";

export interface HousekeepingV2RoomBindings extends HousekeepingV2Bindings {
  DB: D1Database;
}

export interface HousekeepingV2ChecklistItem {
  id: number;
  key: string;
  label: string;
  required: boolean;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
  note: string | null;
}

export interface HousekeepingV2RoomTask {
  id: number;
  taskType: HousekeepingTaskType;
  status: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  bookingId: number | null;
  beds24BookingId: number | null;
  version: number;
  assignee: { id: string; name: string } | null;
  blocker: string | null;
  operationalDate: string;
  dueCycleDate: string | null;
  timestamps: {
    claimedAt: string | null;
    startedAt: string | null;
    checklistCompletedAt: string | null;
    readyAt: string | null;
    completedAt: string | null;
    skippedAt: string | null;
    cancelledAt: string | null;
  };
  checklist: {
    completed: number;
    total: number;
    missing: string[];
    items: HousekeepingV2ChecklistItem[];
  };
  capabilities: HousekeepingV2TaskCapabilities;
}

export interface HousekeepingV2TaskCapabilities {
  canClaim: boolean;
  canReleaseClaim: boolean;
  canStart: boolean;
  canEditChecklist: boolean;
  canComplete: boolean;
  canSkip: boolean;
  canCancel: boolean;
  canReopen: boolean;
  canReassign: boolean;
  canForceRelease: boolean;
  canCreateMaintenanceIssue: boolean;
  canCreateProcurementRequest: boolean;
  canCreateOnDemandCleaning: boolean;
  canMarkLinenRequired: boolean;
}

export interface HousekeepingV2RoomDetail {
  operationalDate: string;
  room: {
    unitId: number;
    unitName: string;
    roomType: string;
    displayName: string;
  };
  occupancy: {
    status: "occupied" | "vacant" | "departing" | "arriving";
    currentGuest: string | null;
    currentBookingId: number | null;
    currentBeds24BookingId: number | null;
    arrivalDate: string | null;
    departureDate: string | null;
    guestArrived: boolean;
    nextBookingId: number | null;
    nextBeds24BookingId: number | null;
    nextGuest: string | null;
    nextCheckInAt: string | null;
  };
  reception: {
    guestLeft: boolean;
    keysReturned: boolean;
    depositReturned: boolean;
    roomReleased: boolean;
    releaseTimestamp: string | null;
    alerts: Array<{
      id: number;
      type: "passport_missing" | "deposit_pending";
      title: string;
      createdAt: string;
    }>;
    passportMissing: boolean;
    depositPending: boolean;
  };
  housekeeping: {
    primaryTaskId: number | null;
    tasks: HousekeepingV2RoomTask[];
    capabilities: HousekeepingV2TaskCapabilities;
  };
  cleaning: {
    lastStandardCleaningAt: string | null;
    nextStandardCleaningDue: string | null;
    lastLinenChangeAt: string | null;
    nextLinenDue: string | null;
    linenOverride: boolean;
    linenOverrideReason: string | null;
    waterRefillStatus: HousekeepingTaskStatus | "NOT_DUE" | null;
  };
  maintenance: {
    openTicketCount: number;
    outOfService: boolean;
    blockingTicket: {
      id: number;
      title: string;
      category: string;
      priority: string;
      status: string;
      updatedAt: string;
    } | null;
  };
  audit: Array<{
    id: number;
    taskId: number;
    actor: string | null;
    transition: string;
    from: string | null;
    to: string | null;
    reason: string | null;
    createdAt: string;
  }>;
}

interface UnitRow {
  unit_id: number;
  unit_name: string;
  unit_type: string | null;
  room_type_name: string | null;
  room_name: string | null;
}

interface BookingRow {
  booking_id: number;
  beds24_booking_id: number;
  guest_name: string | null;
  arrival_date: string;
  departure_date: string;
  arrival_time: string | null;
  guest_arrived: number | null;
  guest_left: number | null;
  keys_returned: number | null;
  deposit_returned: number | null;
  room_released: number | null;
}

interface AlertRow {
  alert_id: number;
  alert_type: "passport_missing" | "deposit_pending";
  title: string;
  created_at: string;
}

interface CounterRow {
  last_standard_cleaning_at: string | null;
  next_standard_cleaning_due_date: string | null;
  last_linen_change_at: string | null;
  next_linen_change_due_date: string | null;
  linen_required_override: number;
  linen_override_reason: string | null;
}

interface MaintenanceRow {
  ticket_id: number;
  title: string;
  category: string;
  priority: string;
  status: string;
  out_of_service: number;
  updated_at: string;
}

interface EventRow {
  event_id: number;
  task_id: number;
  event_type: string;
  actor_name: string | null;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  created_at: string;
}

interface ActionInput {
  expectedVersion: number;
  reason?: string | null;
  itemKey?: string | null;
  completed?: boolean | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  idempotencyKey?: string | null;
  completion?: HousekeepingCompletionInput;
}

interface OnDemandCleaningInput {
  source: "HOUSEKEEPING_MANUAL";
  taskSource: HousekeepingTaskSource;
  priority: HousekeepingTaskPriority;
  note: string | null;
  includeLinen: boolean;
  idempotencyKey: string | null;
}

interface LinenRequiredInput {
  reason: string;
  idempotencyKey: string | null;
}

export interface AssignHousekeepingV2TaskInput {
  expectedVersion: number;
  assignedUserId: string;
  reason: string | null;
  idempotencyKey: string | null;
}

interface AssignableHousekeepingUserRow {
  user_id: string;
  full_name: string;
  status: string;
  can_access: number | null;
}

const TERMINAL_STATUSES = new Set<HousekeepingTaskStatus>(["COMPLETED", "SKIPPED", "CANCELLED"]);

export class HousekeepingV2RoomError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(message: string, status: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "HousekeepingV2RoomError";
    this.status = status;
  }
}

export function normalizeTaskActionInput(payload: unknown, options: { reasonRequired?: boolean } = {}): ActionInput {
  if (!payload || typeof payload !== "object") throw new HousekeepingV2RoomError("Task action payload is required.");
  const data = payload as Record<string, unknown>;
  const expectedVersion = Number(data.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new HousekeepingV2RoomError("expectedVersion is required.");
  const reason = typeof data.reason === "string" ? data.reason.trim() : null;
  const idempotencyKey = typeof data.idempotencyKey === "string" && data.idempotencyKey.trim() ? data.idempotencyKey.trim() : null;
  const completion = normalizeCompletion(data.completion);
  if (options.reasonRequired && !reason) throw new HousekeepingV2RoomError("Reason is required.");
  return { expectedVersion, reason, idempotencyKey, completion };
}

export function normalizeTaskAssignmentInput(payload: unknown): AssignHousekeepingV2TaskInput {
  if (!payload || typeof payload !== "object") throw new HousekeepingV2RoomError("Task assignment payload is required.");
  const data = payload as Record<string, unknown>;
  const expectedVersion = Number(data.expectedVersion);
  const assignedUserId = typeof data.assignedUserId === "string" ? data.assignedUserId.trim() : "";
  const reason = typeof data.reason === "string" && data.reason.trim() ? data.reason.trim().slice(0, 500) : null;
  const idempotencyKey = typeof data.idempotencyKey === "string" && data.idempotencyKey.trim() ? data.idempotencyKey.trim() : null;
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new HousekeepingV2RoomError("expectedVersion is required.");
  if (!assignedUserId) throw new HousekeepingV2RoomError("assignedUserId is required.");
  return { expectedVersion, assignedUserId, reason, idempotencyKey };
}

export function normalizeForceReleaseInput(payload: unknown): { bookingId: number; expectedVersion: number; reason: string } {
  if (!payload || typeof payload !== "object") throw new HousekeepingV2RoomError("Force release payload is required.");
  const data = payload as Record<string, unknown>;
  const bookingId = Number(data.bookingId);
  const expectedVersion = Number(data.expectedVersion);
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";
  if (!Number.isInteger(bookingId) || bookingId < 1) throw new HousekeepingV2RoomError("bookingId is required.");
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new HousekeepingV2RoomError("expectedVersion is required.");
  if (!reason) throw new HousekeepingV2RoomError("Reason is required.");
  return { bookingId, expectedVersion, reason };
}

export function normalizeOnDemandCleaningInput(payload: unknown): OnDemandCleaningInput {
  if (!payload || typeof payload !== "object") throw new HousekeepingV2RoomError("On-demand cleaning payload is required.");
  const data = payload as Record<string, unknown>;
  const source = typeof data.source === "string" ? data.source.trim() : "";
  if (source !== "HOUSEKEEPING_MANUAL" && source !== "manual" && source !== "ROOM_WORKSPACE") throw new HousekeepingV2RoomError("On-demand cleaning source is invalid.");
  const priorityInput = typeof data.priority === "string" ? data.priority.trim().toUpperCase() : "NORMAL";
  const priority = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(priorityInput) ? priorityInput as HousekeepingTaskPriority : "NORMAL";
  const note = typeof data.note === "string" && data.note.trim() ? data.note.trim().slice(0, 500) : null;
  const idempotencyKey = typeof data.idempotencyKey === "string" && data.idempotencyKey.trim() ? data.idempotencyKey.trim() : null;
  return {
    source: "HOUSEKEEPING_MANUAL",
    taskSource: "manual",
    priority,
    note,
    includeLinen: data.includeLinen === true,
    idempotencyKey,
  };
}

export function normalizeLinenRequiredInput(payload: unknown): LinenRequiredInput {
  if (!payload || typeof payload !== "object") throw new HousekeepingV2RoomError("Linen requirement payload is required.");
  const data = payload as Record<string, unknown>;
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";
  if (!reason) throw new HousekeepingV2RoomError("Reason is required.");
  const idempotencyKey = typeof data.idempotencyKey === "string" && data.idempotencyKey.trim() ? data.idempotencyKey.trim() : null;
  return { reason: reason.slice(0, 500), idempotencyKey };
}

export async function getHousekeepingV2RoomDetail(env: HousekeepingV2RoomBindings, user: CurrentUser, unitId: number, dateInput?: string | null): Promise<HousekeepingV2RoomDetail | null> {
  const date = normalizeHousekeepingV2Date(dateInput);
  await getHousekeepingV2Overview(env, user, date);
  await syncReleasedTurnoverTasks(env, date, user);

  const unit = await loadUnit(env, unitId);
  if (!unit) return null;

  const [bookings, alerts, tasks, counter, maintenance, events] = await Promise.all([
    loadRoomBookings(env, unitId, date),
    loadReceptionAlerts(env, unitId),
    loadRoomTasks(env, unitId, date),
    loadCounter(env, unitId),
    loadMaintenance(env, unitId),
    loadTaskEvents(env, unitId, date),
  ]);

  const current = bookings.find((booking) => booking.arrival_date <= date && booking.departure_date > date) ?? null;
  const departing = bookings.find((booking) => booking.departure_date === date) ?? null;
  const next = bookings.filter((booking) => booking.arrival_date >= date).sort((left, right) => checkInAt(left).localeCompare(checkInAt(right)))[0] ?? null;
  const primary = primaryTask(tasks);
  const blockingTicket = maintenance.find((ticket) => ticket.out_of_service === 1) ?? null;
  const taskDtos = await Promise.all(tasks.map(async (task) => mapRoomTask(env, task, user, Boolean(blockingTicket))));
  const mergedCapabilities = taskDtos.find((task) => task.id === primary?.id)?.capabilities ?? emptyCapabilities(user);
  const releaseBooking = departing ?? current;

  return {
    operationalDate: date,
    room: {
      unitId: unit.unit_id,
      unitName: unit.unit_name,
      roomType: roomTypeLabel(unit),
      displayName: `${unit.unit_name} · ${roomTypeLabel(unit)}`,
    },
    occupancy: {
      status: departing ? "departing" : current ? "occupied" : next?.arrival_date === date ? "arriving" : "vacant",
      currentGuest: (departing ?? current)?.guest_name ?? null,
      currentBookingId: (departing ?? current)?.booking_id ?? null,
      currentBeds24BookingId: (departing ?? current)?.beds24_booking_id ?? null,
      arrivalDate: (departing ?? current)?.arrival_date ?? null,
      departureDate: (departing ?? current)?.departure_date ?? null,
      guestArrived: (departing ?? current)?.guest_arrived === 1,
      nextBookingId: next?.booking_id ?? null,
      nextBeds24BookingId: next?.beds24_booking_id ?? null,
      nextGuest: next?.guest_name ?? null,
      nextCheckInAt: next ? checkInAt(next) : null,
    },
    reception: {
      guestLeft: releaseBooking?.guest_left === 1,
      keysReturned: releaseBooking?.keys_returned === 1,
      depositReturned: releaseBooking?.deposit_returned === 1,
      roomReleased: releaseBooking?.room_released === 1,
      releaseTimestamp: releaseBooking ? await loadReleaseTimestamp(env, releaseBooking.beds24_booking_id) : null,
      alerts: alerts.map((alert) => ({ id: alert.alert_id, type: alert.alert_type, title: alert.title, createdAt: alert.created_at })),
      passportMissing: alerts.some((alert) => alert.alert_type === "passport_missing"),
      depositPending: alerts.some((alert) => alert.alert_type === "deposit_pending"),
    },
    housekeeping: {
      primaryTaskId: primary?.id ?? null,
      tasks: taskDtos,
      capabilities: mergedCapabilities,
    },
    cleaning: {
      lastStandardCleaningAt: counter?.last_standard_cleaning_at ?? null,
      nextStandardCleaningDue: counter?.next_standard_cleaning_due_date ?? null,
      lastLinenChangeAt: counter?.last_linen_change_at ?? null,
      nextLinenDue: counter?.next_linen_change_due_date ?? null,
      linenOverride: counter?.linen_required_override === 1,
      linenOverrideReason: counter?.linen_override_reason ?? null,
      waterRefillStatus: taskDtos.find((task) => task.taskType === "WATER_REFILL")?.status ?? "NOT_DUE",
    },
    maintenance: {
      openTicketCount: maintenance.length,
      outOfService: Boolean(blockingTicket),
      blockingTicket: blockingTicket ? {
        id: blockingTicket.ticket_id,
        title: blockingTicket.title,
        category: blockingTicket.category,
        priority: blockingTicket.priority,
        status: blockingTicket.status,
        updatedAt: blockingTicket.updated_at,
      } : null,
    },
    audit: events.map((event) => ({
      id: event.event_id,
      taskId: event.task_id,
      actor: event.actor_name,
      transition: event.event_type,
      from: event.previous_status,
      to: event.new_status,
      reason: event.reason,
      createdAt: event.created_at,
    })),
  };
}

export async function createHousekeepingV2OnDemandCleaning(env: HousekeepingV2RoomBindings, user: CurrentUser, unitId: number, input: OnDemandCleaningInput, dateInput?: string | null): Promise<HousekeepingV2RoomDetail> {
  const date = normalizeHousekeepingV2Date(dateInput);
  const unit = await loadUnit(env, unitId);
  if (!unit) throw new HousekeepingV2RoomError("Room not found.", 404);
  const booking = await activeInHouseBooking(env, unitId, date);
  if (!booking) throw new HousekeepingV2RoomError("On-demand cleaning requires an occupied in-house room.", 409);

  const idempotencyKey = input.idempotencyKey ?? `housekeeping:v2:on-demand:${unitId}:${input.source}:${date}`;
  const task = await createHousekeepingTask(env, {
    taskType: "ON_DEMAND_CLEANING",
    unitId,
    bookingId: booking.booking_id,
    stayId: booking.beds24_booking_id,
    operationalDate: date,
    dueCycleDate: date,
    priority: input.priority,
    source: input.taskSource,
    onDemandSource: input.source,
    idempotencyKey,
    creationMetadata: { source: input.source, note: input.note, includeLinen: input.includeLinen },
  }, user);
  if (task.status === "AVAILABLE_FOR_CLAIM" || task.status === "CLAIMED") {
    await transitionHousekeepingTask(env, task.id, {
      action: "start",
      expectedVersion: task.version,
      actor: user,
      idempotencyKey: `${idempotencyKey}:start`,
      metadata: { source: input.source, note: input.note, includeLinen: input.includeLinen },
    });
  }

  const detail = await getHousekeepingV2RoomDetail(env, user, unitId, date);
  if (!detail) throw new HousekeepingV2RoomError("Room not found.", 404);
  return detail;
}

export async function markHousekeepingV2LinenRequired(env: HousekeepingV2RoomBindings, user: CurrentUser, unitId: number, input: LinenRequiredInput, dateInput?: string | null): Promise<HousekeepingV2RoomDetail> {
  const date = normalizeHousekeepingV2Date(dateInput);
  const unit = await loadUnit(env, unitId);
  if (!unit) throw new HousekeepingV2RoomError("Room not found.", 404);
  const booking = await activeInHouseBooking(env, unitId, date);
  if (!booking) throw new HousekeepingV2RoomError("Linen change requires an occupied in-house room.", 409);

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO housekeeping_room_counters (
      unit_id, active_booking_id, active_stay_id, linen_required_override,
      linen_override_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(unit_id)
    DO UPDATE SET active_booking_id = excluded.active_booking_id,
                  active_stay_id = excluded.active_stay_id,
                  linen_required_override = 1,
                  linen_override_reason = excluded.linen_override_reason,
                  updated_at = excluded.updated_at
  `).bind(unitId, booking.booking_id, booking.beds24_booking_id, input.reason, now, now).run();

  const task = await createHousekeepingTask(env, {
    taskType: "LINEN_CHANGE",
    unitId,
    bookingId: booking.booking_id,
    stayId: booking.beds24_booking_id,
    operationalDate: date,
    dueCycleDate: date,
    priority: "HIGH",
    source: "manual",
    idempotencyKey: input.idempotencyKey ?? `housekeeping:v2:linen:${unitId}:${booking.beds24_booking_id}:${date}`,
    creationMetadata: { reasonCode: "linen_override", reason: input.reason },
  }, user);
  await insertTaskEvent(env, task.id, "linen_override_selected", task.status, task.status, user, input.reason, { reasonCode: "linen_override" }, `linen-override:${task.id}:${input.idempotencyKey ?? date}`, now);

  const detail = await getHousekeepingV2RoomDetail(env, user, unitId, date);
  if (!detail) throw new HousekeepingV2RoomError("Room not found.", 404);
  return detail;
}

export async function performHousekeepingV2TaskAction(env: HousekeepingV2RoomBindings, user: CurrentUser, taskId: number, action: "claim" | "release-claim" | "start" | "complete" | "skip" | "cancel" | "reopen", input: ActionInput): Promise<HousekeepingV2RoomDetail> {
  const task = await getRequiredTask(env, taskId);
  const blocking = await hasMaintenanceBlock(env, task.unitId);
  const permissions = taskCapabilitiesForUser(task, user, blocking);

  if (action === "claim") {
    if (!permissions.canClaim) throw new ForbiddenError();
    await transitionHousekeepingTask(env, taskId, transitionInput("claim", task, user, input));
  } else if (action === "release-claim") {
    if (!permissions.canReleaseClaim) throw new ForbiddenError();
    await transitionHousekeepingTask(env, taskId, transitionInput("release_claim", task, user, input));
  } else if (action === "start") {
    if (!permissions.canStart) throw new ForbiddenError();
    await transitionHousekeepingTask(env, taskId, transitionInput("start", task, user, input));
  } else if (action === "complete") {
    if (!permissions.canComplete) throw new ForbiddenError();
    await completeHousekeepingTaskWithRules(env, task, user, input);
  } else if (action === "skip") {
    if (!permissions.canSkip) throw new ForbiddenError();
    await transitionHousekeepingTask(env, taskId, transitionInput("skip", task, user, input));
  } else if (action === "cancel") {
    if (!permissions.canCancel || !input.reason) throw new ForbiddenError();
    await transitionHousekeepingTask(env, taskId, transitionInput("cancel", task, user, input));
    if (task.taskType === "LINEN_CHANGE") await clearLinenOverrideForTask(env, task, user, input.reason);
  } else {
    if (!permissions.canReopen || !input.reason) throw new ForbiddenError();
    await reopenTask(env, task, user, input.reason);
  }

  const detail = await getHousekeepingV2RoomDetail(env, user, task.unitId, task.operationalDate);
  if (!detail) throw new HousekeepingV2RoomError("Room not found.", 404);
  return detail;
}

export async function assignHousekeepingV2Task(env: HousekeepingV2RoomBindings, user: CurrentUser, taskId: number, input: AssignHousekeepingV2TaskInput): Promise<HousekeepingV2RoomDetail> {
  if (!isOwnerUser(user)) throw new ForbiddenError("Owner access is required.");
  const task = await getRequiredTask(env, taskId);
  if (task.version !== input.expectedVersion) throw new HousekeepingTaskDomainError("housekeeping_task_stale_version", "Housekeeping task has changed. Refresh and try again.");
  if (TERMINAL_STATUSES.has(task.status)) throw new HousekeepingV2RoomError("Only active Housekeeping tasks can be assigned.", 409);
  if (task.taskType === "WATER_REFILL") throw new HousekeepingV2RoomError("Only cleaning tasks can be assigned.", 409);

  const assignee = ensureAssignableHousekeepingUser(await loadAssignableHousekeepingUser(env, input.assignedUserId));
  const now = new Date().toISOString();
  const nextStatus: HousekeepingTaskStatus = task.status === "AVAILABLE_FOR_CLAIM" ? "CLAIMED" : task.status;
  const result = await env.DB.prepare(`
    UPDATE housekeeping_tasks
    SET status = ?,
        assigned_user_id = ?,
        assigned_user_name = ?,
        claimed_at = COALESCE(claimed_at, ?),
        version = version + 1,
        updated_by = ?,
        updated_by_name = ?,
        updated_at = ?
    WHERE task_id = ?
      AND version = ?
  `).bind(
    nextStatus,
    assignee.user_id,
    assignee.full_name,
    now,
    user.id,
    user.displayName,
    now,
    taskId,
    input.expectedVersion,
  ).run();
  if ((result.meta.changes ?? 0) !== 1) throw new HousekeepingTaskDomainError("housekeeping_task_stale_version", "Housekeeping task has changed. Refresh and try again.");

  await insertTaskEvent(
    env,
    task.id,
    "assigned",
    task.status,
    nextStatus,
    user,
    input.reason,
    {
      assignedUserId: assignee.user_id,
      assignedUserName: assignee.full_name,
      previousAssignedUserId: task.assignedUserId,
      previousAssignedUserName: task.assignedUserName,
    },
    input.idempotencyKey ?? `assign:${task.id}:${task.version}:${assignee.user_id}`,
    now,
  );

  const detail = await getHousekeepingV2RoomDetail(env, user, task.unitId, task.operationalDate);
  if (!detail) throw new HousekeepingV2RoomError("Room not found.", 404);
  return detail;
}

export async function forceHousekeepingV2RoomRelease(env: HousekeepingV2RoomBindings, user: CurrentUser, taskId: number, input: { bookingId: number; expectedVersion: number; reason: string }): Promise<HousekeepingV2RoomDetail> {
  if (user.role !== "Owner" || !user.views.includes("owner")) throw new ForbiddenError("Owner access is required.");
  const task = await getRequiredTask(env, taskId);
  if (task.taskType !== "TURNOVER" || task.status !== "WAITING_FOR_RECEPTION") throw new HousekeepingV2RoomError("Only waiting turnover tasks can be force released.", 409);
  if (task.version !== input.expectedVersion) throw new HousekeepingTaskDomainError("housekeeping_task_stale_version", "Housekeeping task has changed. Refresh and try again.");
  const booking = await env.DB.prepare(`
    SELECT booking_id, beds24_booking_id, departure_date
    FROM bookings
    WHERE booking_id = ?
      AND unit_id = ?
      AND ${operationalBookingStatusSql("status")}
  `).bind(input.bookingId, task.unitId).first<{ booking_id: number; beds24_booking_id: number; departure_date: string }>();
  if (!booking) throw new HousekeepingV2RoomError("Booking not found.", 404);
  if (booking.departure_date > task.operationalDate) throw new HousekeepingV2RoomError("Force release is available only on or after departure day.", 409);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO reception_stays (beds24_booking_id, room_released, created_at, updated_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT (beds24_booking_id)
    DO UPDATE SET room_released = 1, updated_at = excluded.updated_at
  `).bind(booking.beds24_booking_id, now, now).run();
  await env.DB.prepare(`
    INSERT INTO reception_events (beds24_booking_id, action, from_value, to_value, actor_id, actor_name, created_at)
    VALUES (?, 'housekeepingForceRoomReleased', 'false', 'true', ?, ?, ?)
  `).bind(booking.beds24_booking_id, user.id, user.displayName, now).run();
  await transitionHousekeepingTask(env, taskId, {
    action: "release_from_reception",
    expectedVersion: task.version,
    actor: user,
    reason: input.reason,
    idempotencyKey: `force-release:${taskId}:${task.version}`,
    metadata: { reason: input.reason, beds24BookingId: booking.beds24_booking_id },
  });
  const detail = await getHousekeepingV2RoomDetail(env, user, task.unitId, task.operationalDate);
  if (!detail) throw new HousekeepingV2RoomError("Room not found.", 404);
  return detail;
}

async function completeHousekeepingTaskWithRules(env: HousekeepingV2RoomBindings, task: HousekeepingTask, user: CurrentUser, input: ActionInput): Promise<void> {
  await transitionHousekeepingTask(env, task.id, transitionInput("complete", task, user, input));
}

async function reopenTask(env: HousekeepingV2RoomBindings, task: HousekeepingTask, user: CurrentUser, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE housekeeping_tasks
    SET status = 'AVAILABLE_FOR_CLAIM',
        completed_at = NULL,
        skipped_at = NULL,
        cancelled_at = NULL,
        cancellation_reason = NULL,
        assigned_user_id = NULL,
        assigned_user_name = NULL,
        claimed_at = NULL,
        version = version + 1,
        updated_by = ?,
        updated_by_name = ?,
        updated_at = ?
    WHERE task_id = ?
      AND status IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
  `).bind(user.id, user.displayName, now, task.id).run();
  await insertTaskEvent(env, task.id, "reopen", task.status, "AVAILABLE_FOR_CLAIM", user, reason, null, `reopen:${task.id}:${task.version}`, now);
}

function transitionInput(action: HousekeepingTransitionAction, task: HousekeepingTask, user: CurrentUser, input: ActionInput) {
  return {
    action,
    expectedVersion: input.expectedVersion,
    actor: user,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey ?? `${action}:${task.id}:${input.expectedVersion}:${user.id}`,
    completion: action === "complete" ? completionForTask(task, input) : undefined,
  };
}

function completionForTask(task: HousekeepingTask, input: ActionInput): HousekeepingCompletionInput {
  const completion = input.completion ?? {};
  if (task.taskType === "TURNOVER") {
    return { ...completion, standardCleaningCompleted: true, linenChangeCompleted: true };
  }
  if (task.taskType === "STANDARD_CLEANING") {
    return { ...completion, standardCleaningCompleted: true };
  }
  if (task.taskType === "LINEN_CHANGE") {
    return { ...completion, linenChangeCompleted: true };
  }
  if (task.taskType === "WATER_REFILL") {
    return { ...completion, waterRefillCompleted: true };
  }
  if (completion.standardCleaningCompleted !== true || typeof completion.linenChangeCompleted !== "boolean") {
    throw new HousekeepingV2RoomError("On-demand completion requires Cleaning or Full Cleaning selection.", 400);
  }
  return {
    ...completion,
    standardCleaningCompleted: true,
    linenChangeCompleted: completion.linenChangeCompleted,
  };
}

function normalizeCompletion(value: unknown): HousekeepingCompletionInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const completion: HousekeepingCompletionInput = {};
  if (typeof data.standardCleaningCompleted === "boolean") completion.standardCleaningCompleted = data.standardCleaningCompleted;
  if (typeof data.linenChangeCompleted === "boolean") completion.linenChangeCompleted = data.linenChangeCompleted;
  if (typeof data.waterRefillCompleted === "boolean") completion.waterRefillCompleted = data.waterRefillCompleted;
  if (typeof data.completedAt === "string") completion.completedAt = data.completedAt;
  return completion;
}

async function mapRoomTask(env: HousekeepingV2RoomBindings, task: HousekeepingTask, user: CurrentUser, maintenanceBlocked: boolean): Promise<HousekeepingV2RoomTask> {
  const caps = taskCapabilitiesForUser(task, user, maintenanceBlocked);
  const booking = task.bookingId ? await env.DB.prepare("SELECT beds24_booking_id FROM bookings WHERE booking_id = ?").bind(task.bookingId).first<{ beds24_booking_id: number }>() : null;
  return {
    id: task.id,
    taskType: task.taskType,
    status: task.status,
    priority: task.priority,
    bookingId: task.bookingId,
    beds24BookingId: booking?.beds24_booking_id ?? null,
    version: task.version,
    assignee: task.assignedUserId && task.assignedUserName ? { id: task.assignedUserId, name: task.assignedUserName } : null,
    blocker: task.blockingReason,
    operationalDate: task.operationalDate,
    dueCycleDate: task.dueCycleDate,
    timestamps: {
      claimedAt: task.claimedAt,
      startedAt: task.startedAt,
      checklistCompletedAt: task.checklistCompletedAt,
      readyAt: task.readyAt,
      completedAt: task.completedAt,
      skippedAt: task.skippedAt,
      cancelledAt: task.cancelledAt,
    },
    checklist: {
      completed: 0,
      total: 0,
      missing: [],
      items: [],
    },
    capabilities: caps,
  };
}

function taskCapabilitiesForUser(task: HousekeepingTask, user: CurrentUser, maintenanceBlocked: boolean): HousekeepingV2TaskCapabilities {
  const capabilities = housekeepingOperationalTaskCapabilities(task, user, { maintenanceBlocked });
  const isOwner = isOwnerUser(user);
  const isManager = user.role === "Manager";
  const active = !TERMINAL_STATUSES.has(task.status);
  const canRoomCreate = isOwner || isManager || user.role === "Housekeeping" || user.role === "Operations";

  return {
    canClaim: capabilities.canClaim,
    canReleaseClaim: capabilities.canReleaseClaim,
    canStart: capabilities.canStartCleaning,
    canEditChecklist: false,
    canComplete: capabilities.canFinishCleaning || (task.taskType === "WATER_REFILL" && capabilities.canCompleteTask),
    canSkip: capabilities.canSkip,
    canCancel: active && isOwner,
    canReopen: TERMINAL_STATUSES.has(task.status) && isOwner,
    canReassign: active && isOwner && task.taskType !== "WATER_REFILL",
    canForceRelease: task.taskType === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION" && isOwner,
    canCreateMaintenanceIssue: true,
    canCreateProcurementRequest: true,
    canCreateOnDemandCleaning: canRoomCreate,
    canMarkLinenRequired: canRoomCreate,
  };
}

function emptyCapabilities(user: CurrentUser): HousekeepingV2TaskCapabilities {
  const isOwner = isOwnerUser(user);
  const canRoomCreate = isOwner || user.role === "Housekeeping" || user.role === "Manager" || user.role === "Operations";
  return {
    canClaim: false,
    canReleaseClaim: false,
    canStart: false,
    canEditChecklist: false,
    canComplete: false,
    canSkip: false,
    canCancel: false,
    canReopen: false,
    canReassign: false,
    canForceRelease: false,
    canCreateMaintenanceIssue: canRoomCreate,
    canCreateProcurementRequest: canRoomCreate,
    canCreateOnDemandCleaning: canRoomCreate,
    canMarkLinenRequired: canRoomCreate,
  };
}

function isOwnerUser(user: CurrentUser): boolean {
  return user.role === "Owner" && user.views.includes("owner");
}

async function loadAssignableHousekeepingUser(env: HousekeepingV2RoomBindings, userId: string): Promise<AssignableHousekeepingUserRow | null> {
  return env.DB.prepare(`
    SELECT u.user_id, u.full_name, u.status, p.can_access
    FROM users u
    LEFT JOIN user_module_permissions p
      ON p.user_id = u.user_id
     AND p.module_key = 'housekeeping'
    WHERE u.user_id = ?
    LIMIT 1
  `).bind(userId).first<AssignableHousekeepingUserRow>();
}

function ensureAssignableHousekeepingUser(row: AssignableHousekeepingUserRow | null): AssignableHousekeepingUserRow {
  if (!row) throw new HousekeepingV2RoomError("Assignable user not found.", 404);
  if (row.status !== "active") throw new HousekeepingV2RoomError("Assignable user is not active.", 409);
  if (row.can_access !== 1) throw new HousekeepingV2RoomError("Assignable user cannot access Housekeeping.", 409);
  return row;
}

async function getRequiredTask(env: HousekeepingV2RoomBindings, taskId: number): Promise<HousekeepingTask> {
  const task = await getHousekeepingTask(env, taskId);
  if (!task) throw new HousekeepingV2RoomError("Task not found.", 404);
  return task;
}

async function hasMaintenanceBlock(env: HousekeepingV2RoomBindings, unitId: number): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT ticket_id
    FROM maintenance_tickets
    WHERE room_id = ?
      AND out_of_service = 1
      AND status NOT IN ('Resolved', 'Closed')
    LIMIT 1
  `).bind(unitId).first<{ ticket_id: number }>();
  return Boolean(row);
}

async function insertTaskEvent(env: HousekeepingV2RoomBindings, taskId: number, eventType: string, previousStatus: string | null, newStatus: string, user: CurrentUser, reason: string | null, metadata: Record<string, unknown> | null, idempotencyKey: string | null, now: string): Promise<void> {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO housekeeping_task_events (
      task_id, event_type, actor_user_id, actor_name, previous_status, new_status,
      reason, metadata_json, idempotency_key, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(taskId, eventType, user.id, user.displayName, previousStatus, newStatus, reason, metadata ? JSON.stringify(metadata) : null, idempotencyKey, now).run();
}

async function clearLinenOverrideForTask(env: HousekeepingV2RoomBindings, task: HousekeepingTask, user: CurrentUser, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE housekeeping_room_counters
    SET linen_required_override = 0,
        linen_override_reason = NULL,
        updated_at = ?
    WHERE unit_id = ?
      AND (active_booking_id = ? OR active_stay_id = ?)
  `).bind(now, task.unitId, task.bookingId, task.stayId).run();
  await insertTaskEvent(env, task.id, "linen_override_cancelled", task.status, task.status, user, reason, { reasonCode: "linen_override" }, `linen-override-cancelled:${task.id}:${task.version}`, now);
}

async function loadUnit(env: HousekeepingV2RoomBindings, unitId: number): Promise<UnitRow | null> {
  return env.DB.prepare(`
    SELECT u.unit_id, u.unit_name, u.unit_type, rt.room_type_name, rt.room_name
    FROM units u
    JOIN room_types rt ON rt.room_type_id = u.room_type_id
    WHERE u.unit_id = ?
      AND u.active = 1
  `).bind(unitId).first<UnitRow>();
}

async function loadRoomBookings(env: HousekeepingV2RoomBindings, unitId: number, date: string): Promise<BookingRow[]> {
  const rows = await env.DB.prepare(`
    SELECT b.booking_id, b.beds24_booking_id, b.guest_name, b.arrival_date, b.departure_date, b.arrival_time,
           rs.guest_arrived, rs.guest_left, rs.keys_returned, rs.deposit_returned, rs.room_released
    FROM bookings b
    LEFT JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
    WHERE b.unit_id = ?
      AND ${operationalBookingStatusSql("b.status")}
      AND (
        b.departure_date = ?
        OR (b.arrival_date <= ? AND b.departure_date > ?)
        OR b.arrival_date >= ?
      )
    ORDER BY b.arrival_date, b.departure_date, b.booking_id
  `).bind(unitId, date, date, date, date).all<BookingRow>();
  return rows.results ?? [];
}

async function activeInHouseBooking(env: HousekeepingV2RoomBindings, unitId: number, date: string): Promise<BookingRow | null> {
  const bookings = await loadRoomBookings(env, unitId, date);
  return bookings.find((booking) => booking.arrival_date <= date && booking.departure_date > date && booking.guest_arrived === 1) ?? null;
}

async function loadReceptionAlerts(env: HousekeepingV2RoomBindings, unitId: number): Promise<AlertRow[]> {
  const rows = await env.DB.prepare(`
    SELECT alert_id, alert_type, title, created_at
    FROM reception_room_alerts
    WHERE unit_id = ?
      AND status = 'active'
    ORDER BY created_at DESC, alert_id DESC
  `).bind(unitId).all<AlertRow>();
  return rows.results ?? [];
}

async function loadRoomTasks(env: HousekeepingV2RoomBindings, unitId: number, date: string): Promise<HousekeepingTask[]> {
  const rows = await env.DB.prepare(`
    SELECT task_id
    FROM housekeeping_tasks
    WHERE unit_id = ?
      AND (
        operational_date = ?
        OR (due_cycle_date <= ? AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED'))
        OR (
          status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')
          AND source = 'manual'
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
    if (task) tasks.push(task);
  }
  return tasks;
}

async function loadCounter(env: HousekeepingV2RoomBindings, unitId: number): Promise<CounterRow | null> {
  return env.DB.prepare(`
    SELECT last_standard_cleaning_at, next_standard_cleaning_due_date,
           last_linen_change_at, next_linen_change_due_date, linen_required_override,
           linen_override_reason
    FROM housekeeping_room_counters
    WHERE unit_id = ?
  `).bind(unitId).first<CounterRow>();
}

async function loadMaintenance(env: HousekeepingV2RoomBindings, unitId: number): Promise<MaintenanceRow[]> {
  const rows = await env.DB.prepare(`
    SELECT ticket_id, title, category,
           CASE priority WHEN 'Medium' THEN 'Normal' WHEN 'Critical' THEN 'High' ELSE priority END AS priority,
           status, out_of_service, updated_at
    FROM maintenance_tickets
    WHERE room_id = ?
      AND status NOT IN ('Resolved', 'Closed')
    ORDER BY out_of_service DESC, priority DESC, updated_at DESC
  `).bind(unitId).all<MaintenanceRow>();
  return rows.results ?? [];
}

async function loadTaskEvents(env: HousekeepingV2RoomBindings, unitId: number, date: string): Promise<EventRow[]> {
  const rows = await env.DB.prepare(`
    SELECT e.event_id, e.task_id, e.event_type, e.actor_name, e.previous_status, e.new_status, e.reason, e.created_at
    FROM housekeeping_task_events e
    JOIN housekeeping_tasks t ON t.task_id = e.task_id
    WHERE t.unit_id = ?
      AND t.operational_date = ?
    ORDER BY e.created_at DESC, e.event_id DESC
    LIMIT 12
  `).bind(unitId, date).all<EventRow>();
  return rows.results ?? [];
}

async function loadReleaseTimestamp(env: HousekeepingV2RoomBindings, beds24BookingId: number): Promise<string | null> {
  const row = await env.DB.prepare(`
    SELECT created_at
    FROM reception_events
    WHERE beds24_booking_id = ?
      AND action IN ('checkOutCompleted', 'housekeepingForceRoomReleased')
    ORDER BY created_at DESC, event_id DESC
    LIMIT 1
  `).bind(beds24BookingId).first<{ created_at: string }>();
  return row?.created_at ?? null;
}

function primaryTask(tasks: HousekeepingTask[]): HousekeepingTask | null {
  return tasks
    .filter((task) => !TERMINAL_STATUSES.has(task.status))
    .sort((left, right) => taskRank(left) - taskRank(right))[0] ?? null;
}

function taskRank(task: HousekeepingTask): number {
  if (task.taskType === "TURNOVER") return 1;
  if (task.taskType === "ON_DEMAND_CLEANING") return 2;
  if (task.taskType === "STANDARD_CLEANING") return 3;
  if (task.taskType === "LINEN_CHANGE") return 4;
  if (task.taskType === "WATER_REFILL") return 5;
  return 6;
}

function checkInAt(booking: BookingRow): string {
  return `${booking.arrival_date}T${booking.arrival_time || "14:00"}`;
}

function roomTypeLabel(unit: UnitRow): string {
  return unit.room_type_name || unit.room_name || unit.unit_type || "Accommodation";
}
