import { operationalBookingStatusSql } from "./booking-status.service.js";
import {
  HousekeepingTaskDomainError,
  getHousekeepingTask,
  housekeepingTaskCapabilities,
  transitionHousekeepingTask,
  type HousekeepingTask,
  type HousekeepingTaskPriority,
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

interface ChecklistRow {
  checklist_item_id: number;
  item_key: string;
  default_label: string;
  required: number;
  completed: number;
  completed_by: string | null;
  completed_at: string | null;
  note: string | null;
}

interface CounterRow {
  last_standard_cleaning_at: string | null;
  next_standard_cleaning_due_date: string | null;
  last_linen_change_at: string | null;
  next_linen_change_due_date: string | null;
  linen_required_override: number;
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
}

const TURNOVER_CHECKLIST = [
  ["bathroom", "Bathroom cleaned"],
  ["floor", "Floor cleaned"],
  ["bed", "Bed reset"],
  ["amenities", "Amenities replaced"],
  ["final-check", "Final room check"],
] as const;

const TERMINAL_STATUSES = new Set<HousekeepingTaskStatus>(["COMPLETED", "SKIPPED", "CANCELLED"]);

export class HousekeepingV2RoomError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(message: string, status: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "HousekeepingV2RoomError";
    this.status = status;
  }
}

export function normalizeTaskActionInput(payload: unknown, options: { reasonRequired?: boolean; checklist?: boolean } = {}): ActionInput {
  if (!payload || typeof payload !== "object") throw new HousekeepingV2RoomError("Task action payload is required.");
  const data = payload as Record<string, unknown>;
  const expectedVersion = Number(data.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new HousekeepingV2RoomError("expectedVersion is required.");
  const reason = typeof data.reason === "string" ? data.reason.trim() : null;
  if (options.reasonRequired && !reason) throw new HousekeepingV2RoomError("Reason is required.");
  if (options.checklist) {
    const itemKey = typeof data.itemKey === "string" ? data.itemKey.trim() : "";
    if (!itemKey) throw new HousekeepingV2RoomError("Checklist item is required.");
    if (typeof data.completed !== "boolean") throw new HousekeepingV2RoomError("Checklist completion value is required.");
    return { expectedVersion, reason, itemKey, completed: data.completed };
  }
  return { expectedVersion, reason };
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

export async function getHousekeepingV2RoomDetail(env: HousekeepingV2RoomBindings, user: CurrentUser, unitId: number, dateInput?: string | null): Promise<HousekeepingV2RoomDetail | null> {
  const date = normalizeHousekeepingV2Date(dateInput);
  await getHousekeepingV2Overview(env, user, date);
  await syncReleasedTurnoverTasks(env, date);

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
    if (!permissions.canComplete && !await canCompleteTurnoverFromCurrentState(env, task, user, blocking)) throw new ForbiddenError();
    await completeTurnoverTask(env, task, user, input);
  } else if (action === "skip") {
    if (!permissions.canSkip) throw new ForbiddenError();
    await transitionHousekeepingTask(env, taskId, transitionInput("skip", task, user, input));
  } else if (action === "cancel") {
    if (!permissions.canCancel || !input.reason) throw new ForbiddenError();
    await transitionHousekeepingTask(env, taskId, transitionInput("cancel", task, user, input));
  } else {
    if (!permissions.canReopen || !input.reason) throw new ForbiddenError();
    await reopenTask(env, task, user, input.reason);
  }

  const detail = await getHousekeepingV2RoomDetail(env, user, task.unitId, task.operationalDate);
  if (!detail) throw new HousekeepingV2RoomError("Room not found.", 404);
  return detail;
}

async function canCompleteTurnoverFromCurrentState(env: HousekeepingV2RoomBindings, task: HousekeepingTask, user: CurrentUser, maintenanceBlocked: boolean): Promise<boolean> {
  if (task.taskType !== "TURNOVER" || maintenanceBlocked) return false;
  const isOwner = user.role === "Owner" && user.views.includes("owner");
  const isAssigned = task.assignedUserId === user.id;
  if (!isAssigned && !isOwner) return false;
  if (task.status === "READY" || task.status === "CHECKLIST_COMPLETE") return true;
  if (task.status !== "IN_PROGRESS") return false;
  return (await missingChecklistItems(env, task)).length === 0;
}

export async function updateHousekeepingV2ChecklistItem(env: HousekeepingV2RoomBindings, user: CurrentUser, taskId: number, input: ActionInput): Promise<HousekeepingV2RoomDetail> {
  const task = await getRequiredTask(env, taskId);
  const permissions = taskCapabilitiesForUser(task, user, await hasMaintenanceBlock(env, task.unitId));
  if (!permissions.canEditChecklist || !input.itemKey || input.completed === null || input.completed === undefined) throw new ForbiddenError();
  await ensureChecklist(env, task);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE housekeeping_task_checklist_items
    SET completed = ?, completed_by = ?, completed_by_name = ?, completed_at = ?, updated_at = ?
    WHERE task_id = ?
      AND item_key = ?
  `).bind(input.completed ? 1 : 0, input.completed ? user.id : null, input.completed ? user.displayName : null, input.completed ? now : null, now, taskId, input.itemKey).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new HousekeepingV2RoomError("Checklist item not found.", 404);
  await insertTaskEvent(env, taskId, "checklist_updated", task.status, task.status, user, input.itemKey, { completed: input.completed }, `checklist:${taskId}:${input.itemKey}:${now}`, now);
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

async function completeTurnoverTask(env: HousekeepingV2RoomBindings, task: HousekeepingTask, user: CurrentUser, input: ActionInput): Promise<void> {
  if (task.taskType !== "TURNOVER") {
    await transitionHousekeepingTask(env, task.id, transitionInput("complete", task, user, input));
    return;
  }
  const missing = await missingChecklistItems(env, task);
  if (missing.length > 0) throw new HousekeepingV2RoomError(`Checklist incomplete: ${missing.join(", ")}.`, 409);
  let current = task;
  if (current.status === "IN_PROGRESS") current = await transitionHousekeepingTask(env, current.id, transitionInput("checklist_complete", current, user, input));
  if (current.status === "CHECKLIST_COMPLETE") current = await transitionHousekeepingTask(env, current.id, transitionInput("mark_ready", current, user, { ...input, expectedVersion: current.version }));
  if (current.status === "READY") await transitionHousekeepingTask(env, current.id, transitionInput("complete", current, user, { ...input, expectedVersion: current.version }));
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
    idempotencyKey: `${action}:${task.id}:${input.expectedVersion}:${user.id}`,
    completion: { standardCleaningCompleted: task.taskType === "TURNOVER" },
  };
}

async function mapRoomTask(env: HousekeepingV2RoomBindings, task: HousekeepingTask, user: CurrentUser, maintenanceBlocked: boolean): Promise<HousekeepingV2RoomTask> {
  await ensureChecklist(env, task);
  const checklist = await loadChecklist(env, task.id);
  const caps = taskCapabilitiesForUser(task, user, maintenanceBlocked);
  const booking = task.bookingId ? await env.DB.prepare("SELECT beds24_booking_id FROM bookings WHERE booking_id = ?").bind(task.bookingId).first<{ beds24_booking_id: number }>() : null;
  const missing = checklist.filter((item) => item.required && !item.completed).map((item) => item.label);
  if (task.taskType === "TURNOVER" && task.status === "IN_PROGRESS" && missing.length === 0 && caps.canEditChecklist) {
    caps.canComplete = true;
  }
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
      completed: checklist.filter((item) => item.completed).length,
      total: checklist.length,
      missing,
      items: checklist,
    },
    capabilities: caps,
  };
}

function taskCapabilitiesForUser(task: HousekeepingTask, user: CurrentUser, maintenanceBlocked: boolean): HousekeepingV2TaskCapabilities {
  const base = housekeepingTaskCapabilities(task);
  const isOwner = user.role === "Owner" && user.views.includes("owner");
  const isManager = user.role === "Manager";
  const isAssigned = task.assignedUserId === user.id;
  const active = !TERMINAL_STATUSES.has(task.status);
  const released = !(task.taskType === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION");

  return {
    canClaim: base.canClaim && released && !maintenanceBlocked,
    canReleaseClaim: task.status === "CLAIMED" && (isAssigned || isOwner || isManager),
    canStart: task.status === "CLAIMED" && released && !maintenanceBlocked && (isAssigned || isOwner),
    canEditChecklist: task.status === "IN_PROGRESS" && !maintenanceBlocked && (isAssigned || isOwner),
    canComplete: base.canComplete && released && !maintenanceBlocked && (isAssigned || isOwner),
    canSkip: base.canSkip && (isAssigned || isOwner || isManager),
    canCancel: active && Boolean(isOwner || isManager),
    canReopen: TERMINAL_STATUSES.has(task.status) && Boolean(isOwner || isManager),
    canReassign: active && Boolean(isOwner || isManager),
    canForceRelease: task.taskType === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION" && isOwner,
    canCreateMaintenanceIssue: true,
    canCreateProcurementRequest: true,
  };
}

function emptyCapabilities(user: CurrentUser): HousekeepingV2TaskCapabilities {
  const isOwner = user.role === "Owner" && user.views.includes("owner");
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
    canCreateMaintenanceIssue: isOwner || user.role === "Housekeeping" || user.role === "Manager" || user.role === "Operations",
    canCreateProcurementRequest: isOwner || user.role === "Housekeeping" || user.role === "Manager" || user.role === "Operations",
  };
}

async function getRequiredTask(env: HousekeepingV2RoomBindings, taskId: number): Promise<HousekeepingTask> {
  const task = await getHousekeepingTask(env, taskId);
  if (!task) throw new HousekeepingV2RoomError("Task not found.", 404);
  return task;
}

async function ensureChecklist(env: HousekeepingV2RoomBindings, task: HousekeepingTask): Promise<void> {
  if (task.taskType !== "TURNOVER") return;
  const now = new Date().toISOString();
  for (let index = 0; index < TURNOVER_CHECKLIST.length; index += 1) {
    const [key, label] = TURNOVER_CHECKLIST[index]!;
    await env.DB.prepare(`
      INSERT OR IGNORE INTO housekeeping_task_checklist_items (
        task_id, item_key, label_key, default_label, required, completed, sort_order, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?)
    `).bind(task.id, key, `housekeeping.checklist.turnover.${key}`, label, index + 1, now, now).run();
  }
}

async function missingChecklistItems(env: HousekeepingV2RoomBindings, task: HousekeepingTask): Promise<string[]> {
  await ensureChecklist(env, task);
  const checklist = await loadChecklist(env, task.id);
  return checklist.filter((item) => item.required && !item.completed).map((item) => item.label);
}

async function loadChecklist(env: HousekeepingV2RoomBindings, taskId: number): Promise<HousekeepingV2ChecklistItem[]> {
  const rows = await env.DB.prepare(`
    SELECT checklist_item_id, item_key, default_label, required, completed, completed_by, completed_at, note
    FROM housekeeping_task_checklist_items
    WHERE task_id = ?
    ORDER BY sort_order, checklist_item_id
  `).bind(taskId).all<ChecklistRow>();
  return (rows.results ?? []).map((row) => ({
    id: row.checklist_item_id,
    key: row.item_key,
    label: row.default_label,
    required: row.required === 1,
    completed: row.completed === 1,
    completedBy: row.completed_by,
    completedAt: row.completed_at,
    note: row.note,
  }));
}

async function syncReleasedTurnoverTasks(env: HousekeepingV2RoomBindings, date: string): Promise<void> {
  const rows = await env.DB.prepare(`
    SELECT ht.task_id, ht.version
    FROM housekeeping_tasks ht
    JOIN bookings b ON b.booking_id = ht.booking_id
    JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
    WHERE ht.task_type = 'TURNOVER'
      AND ht.status = 'WAITING_FOR_RECEPTION'
      AND ht.operational_date = ?
      AND rs.room_released = 1
  `).bind(date).all<{ task_id: number; version: number }>();
  for (const row of rows.results ?? []) {
    await transitionHousekeepingTask(env, row.task_id, {
      action: "release_from_reception",
      expectedVersion: row.version,
      idempotencyKey: `reception-release:${row.task_id}:${row.version}`,
      metadata: { source: "reception_stays.room_released" },
    });
  }
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
      AND (operational_date = ? OR (due_cycle_date <= ? AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED')))
    ORDER BY
      CASE task_type WHEN 'TURNOVER' THEN 1 WHEN 'STANDARD_CLEANING' THEN 2 WHEN 'WATER_REFILL' THEN 3 ELSE 4 END,
      task_id
  `).bind(unitId, date, date).all<{ task_id: number }>();
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
           last_linen_change_at, next_linen_change_due_date, linen_required_override
    FROM housekeeping_room_counters
    WHERE unit_id = ?
  `).bind(unitId).first<CounterRow>();
}

async function loadMaintenance(env: HousekeepingV2RoomBindings, unitId: number): Promise<MaintenanceRow[]> {
  const rows = await env.DB.prepare(`
    SELECT ticket_id, title, category, priority, status, out_of_service, updated_at
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
  if (task.taskType === "STANDARD_CLEANING") return 2;
  if (task.taskType === "WATER_REFILL") return 3;
  return 4;
}

function checkInAt(booking: BookingRow): string {
  return `${booking.arrival_date}T${booking.arrival_time || "14:00"}`;
}

function roomTypeLabel(unit: UnitRow): string {
  return unit.room_type_name || unit.room_name || unit.unit_type || "Accommodation";
}
