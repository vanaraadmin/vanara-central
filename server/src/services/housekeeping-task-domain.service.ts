import type { CurrentUser } from "./current-user.service.js";

export type HousekeepingTaskType = "TURNOVER" | "STANDARD_CLEANING" | "LINEN_CHANGE" | "WATER_REFILL" | "ON_DEMAND_CLEANING";
export type HousekeepingTaskStatus =
  | "WAITING_FOR_RECEPTION"
  | "AVAILABLE_FOR_CLAIM"
  | "CLAIMED"
  | "IN_PROGRESS"
  | "CHECKLIST_COMPLETE"
  | "READY_FOR_INSPECTION"
  | "READY"
  | "COMPLETED"
  | "BLOCKED"
  | "SKIPPED"
  | "CANCELLED";
export type HousekeepingTaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type HousekeepingTaskSource = "system" | "reception_release" | "manual" | "physical_sign" | "guest_request" | "maintenance" | "migration";
export type HousekeepingTransitionAction =
  | "release_from_reception"
  | "claim"
  | "release_claim"
  | "start"
  | "checklist_complete"
  | "mark_ready"
  | "complete"
  | "block"
  | "skip"
  | "cancel";

export interface HousekeepingTaskBindings {
  DB: D1Database;
}

export interface HousekeepingActor {
  id: string | null;
  displayName: string | null;
}

export interface HousekeepingTask {
  id: number;
  taskType: HousekeepingTaskType;
  unitId: number;
  bookingId: number | null;
  stayId: number | null;
  operationalDate: string;
  dueCycleDate: string | null;
  status: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  blockingReason: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  checklistCompletedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  source: HousekeepingTaskSource;
  onDemandSource: string | null;
  idempotencyKey: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface HousekeepingTaskRow {
  task_id: number;
  task_type: HousekeepingTaskType;
  unit_id: number;
  booking_id: number | null;
  stay_id: number | null;
  operational_date: string;
  due_cycle_date: string | null;
  status: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  blocking_reason: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  claimed_at: string | null;
  started_at: string | null;
  checklist_completed_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  source: HousekeepingTaskSource;
  on_demand_source: string | null;
  idempotency_key: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateHousekeepingTaskInput {
  taskType: HousekeepingTaskType;
  unitId: number;
  bookingId?: number | null;
  stayId?: number | null;
  operationalDate: string;
  dueCycleDate?: string | null;
  priority?: HousekeepingTaskPriority;
  source?: HousekeepingTaskSource;
  onDemandSource?: string | null;
  idempotencyKey?: string | null;
  receptionReleased?: boolean;
  creationMetadata?: Record<string, unknown>;
}

export interface TransitionHousekeepingTaskInput {
  action: HousekeepingTransitionAction;
  expectedVersion: number;
  actor?: HousekeepingActor | CurrentUser | null;
  idempotencyKey?: string | null;
  reason?: string | null;
  assignTo?: HousekeepingActor | CurrentUser | null;
  metadata?: Record<string, unknown>;
  completion?: HousekeepingCompletionInput;
}

export interface HousekeepingCompletionInput {
  standardCleaningCompleted?: boolean;
  linenChangeCompleted?: boolean;
  waterRefillCompleted?: boolean;
  completedAt?: string;
}

export interface HousekeepingRoomCounter {
  unitId: number;
  activeBookingId: number | null;
  activeStayId: number | null;
  lastStandardCleaningAt: string | null;
  nextStandardCleaningDueDate: string | null;
  standardCleaningIntervalDays: number;
  lastLinenChangeAt: string | null;
  nextLinenChangeDueDate: string | null;
  linenIntervalDays: number;
  linenRequiredOverride: boolean;
  linenOverrideReason: string | null;
}

export interface HousekeepingTaskCapabilities {
  canClaim: boolean;
  canStart: boolean;
  canComplete: boolean;
  canSkip: boolean;
  canCancel: boolean;
  requiresReceptionRelease: boolean;
}

export type HousekeepingTaskDomainErrorCode =
  | "housekeeping_invalid_task_type"
  | "housekeeping_invalid_task_status"
  | "housekeeping_invalid_transition"
  | "housekeeping_task_stale_version"
  | "housekeeping_task_not_found"
  | "housekeeping_task_blocked"
  | "housekeeping_task_cancelled"
  | "housekeeping_task_completed"
  | "housekeeping_room_not_released"
  | "housekeeping_idempotency_key_required"
  | "housekeeping_duplicate_task";

export class HousekeepingTaskDomainError extends Error {
  readonly code: HousekeepingTaskDomainErrorCode;

  constructor(code: HousekeepingTaskDomainErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "HousekeepingTaskDomainError";
  }
}

const taskTypes: readonly HousekeepingTaskType[] = ["TURNOVER", "STANDARD_CLEANING", "LINEN_CHANGE", "WATER_REFILL", "ON_DEMAND_CLEANING"];
const taskStatuses: readonly HousekeepingTaskStatus[] = [
  "WAITING_FOR_RECEPTION",
  "AVAILABLE_FOR_CLAIM",
  "CLAIMED",
  "IN_PROGRESS",
  "CHECKLIST_COMPLETE",
  "READY_FOR_INSPECTION",
  "READY",
  "COMPLETED",
  "BLOCKED",
  "SKIPPED",
  "CANCELLED",
];
const terminalStatuses = new Set<HousekeepingTaskStatus>(["COMPLETED", "SKIPPED", "CANCELLED"]);

export function isHousekeepingTaskType(value: string): value is HousekeepingTaskType {
  return taskTypes.includes(value as HousekeepingTaskType);
}

export function isHousekeepingTaskStatus(value: string): value is HousekeepingTaskStatus {
  return taskStatuses.includes(value as HousekeepingTaskStatus);
}

export function housekeepingTaskCapabilities(task: Pick<HousekeepingTask, "taskType" | "status">): HousekeepingTaskCapabilities {
  return {
    canClaim: task.status === "AVAILABLE_FOR_CLAIM",
    canStart: task.taskType !== "WATER_REFILL" && (task.status === "AVAILABLE_FOR_CLAIM" || task.status === "CLAIMED"),
    canComplete: canCompleteStatus(task.taskType, task.status),
    canSkip: (task.taskType === "WATER_REFILL" || task.taskType === "STANDARD_CLEANING") && (task.status === "AVAILABLE_FOR_CLAIM" || task.status === "CLAIMED" || task.status === "IN_PROGRESS"),
    canCancel: !terminalStatuses.has(task.status),
    requiresReceptionRelease: task.taskType === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION",
  };
}

export function initialHousekeepingTaskStatus(input: Pick<CreateHousekeepingTaskInput, "taskType" | "receptionReleased">): HousekeepingTaskStatus {
  if (!isHousekeepingTaskType(input.taskType)) {
    throw new HousekeepingTaskDomainError("housekeeping_invalid_task_type", "Housekeeping task type is invalid.");
  }
  if (input.taskType === "TURNOVER") return input.receptionReleased ? "AVAILABLE_FOR_CLAIM" : "WAITING_FOR_RECEPTION";
  return "AVAILABLE_FOR_CLAIM";
}

export async function isReceptionRoomReleased(env: HousekeepingTaskBindings, bookingId: number): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT rs.room_released
    FROM bookings b
    JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
    WHERE b.booking_id = ?
  `).bind(bookingId).first<{ room_released: number }>();
  return row?.room_released === 1;
}

export async function syncReleasedTurnoverTasks(env: HousekeepingTaskBindings, date: string, actor?: HousekeepingActor | CurrentUser | null): Promise<void> {
  const rows = await env.DB.prepare(`
    SELECT DISTINCT ht.task_id, ht.version
    FROM housekeeping_tasks ht
    JOIN bookings b ON b.booking_id = ht.booking_id
    JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
    WHERE ht.task_type = 'TURNOVER'
      AND ht.status = 'WAITING_FOR_RECEPTION'
      AND ht.operational_date = ?
      AND rs.room_released = 1
  `).bind(date).all<{ task_id: number; version: number }>();
  for (const row of rows.results ?? []) {
    try {
      await transitionHousekeepingTask(env, row.task_id, {
        action: "release_from_reception",
        expectedVersion: row.version,
        actor,
        idempotencyKey: `reception-release:${row.task_id}:${row.version}`,
        metadata: { source: "reception_stays.room_released" },
      });
    } catch (error: unknown) {
      if (error instanceof HousekeepingTaskDomainError && (error.code === "housekeeping_task_stale_version" || error.code === "housekeeping_invalid_transition")) {
        const current = await getHousekeepingTask(env, row.task_id);
        if (current?.taskType === "TURNOVER" && current.status !== "WAITING_FOR_RECEPTION") continue;
      }
      throw error;
    }
  }
}

export async function createHousekeepingTask(env: HousekeepingTaskBindings, input: CreateHousekeepingTaskInput, actor?: HousekeepingActor | CurrentUser | null): Promise<HousekeepingTask> {
  const idempotencyKey = normalizeOptionalText(input.idempotencyKey);
  if (idempotencyKey) {
    const existing = await findTaskByIdempotencyKey(env, idempotencyKey);
    if (existing) return existing;
  }

  const receptionReleased = input.taskType === "TURNOVER" && input.bookingId ? await isReceptionRoomReleased(env, input.bookingId) : input.receptionReleased === true;
  const status = initialHousekeepingTaskStatus({ taskType: input.taskType, receptionReleased });
  const now = new Date().toISOString();
  const normalizedActor = normalizeActor(actor);
  let result: D1Result;
  try {
    result = await env.DB.prepare(`
      INSERT INTO housekeeping_tasks (
        task_type, unit_id, booking_id, stay_id, operational_date, due_cycle_date, status, priority,
        source, on_demand_source, idempotency_key, created_by, created_by_name, updated_by, updated_by_name,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      input.taskType,
      input.unitId,
      input.bookingId ?? null,
      input.stayId ?? null,
      input.operationalDate,
      input.dueCycleDate ?? input.operationalDate,
      status,
      input.priority ?? "NORMAL",
      input.source ?? "system",
      normalizeOptionalText(input.onDemandSource),
      idempotencyKey,
      normalizedActor.id,
      normalizedActor.displayName,
      normalizedActor.id,
      normalizedActor.displayName,
      now,
      now,
    ).run();
  } catch (error: unknown) {
    const mapped = mapConstraintError(error);
    if (mapped.code === "housekeeping_duplicate_task" && idempotencyKey) {
      const existing = await findTaskByIdempotencyKey(env, idempotencyKey);
      if (existing) return existing;
    }
    throw mapped;
  }

  const created = await getHousekeepingTask(env, Number(result.meta.last_row_id));
  if (!created) throw new HousekeepingTaskDomainError("housekeeping_task_not_found", "Housekeeping task could not be loaded after creation.");
  await insertTaskEvent(env, created.id, "created", null, created.status, normalizedActor, null, { taskType: created.taskType, ...(input.creationMetadata ?? {}) }, idempotencyKey ? `${idempotencyKey}:created` : null, now);
  return created;
}

export async function getHousekeepingTask(env: HousekeepingTaskBindings, taskId: number): Promise<HousekeepingTask | null> {
  const row = await env.DB.prepare("SELECT * FROM housekeeping_tasks WHERE task_id = ?").bind(taskId).first<HousekeepingTaskRow>();
  return row ? mapTask(row) : null;
}

export async function transitionHousekeepingTask(env: HousekeepingTaskBindings, taskId: number, input: TransitionHousekeepingTaskInput): Promise<HousekeepingTask> {
  const replayed = await replayCompletedTransition(env, taskId, input.idempotencyKey);
  if (replayed) return replayed;

  const current = await getHousekeepingTask(env, taskId);
  if (!current) throw new HousekeepingTaskDomainError("housekeeping_task_not_found", "Housekeeping task was not found.");
  if (current.version !== input.expectedVersion) throw new HousekeepingTaskDomainError("housekeeping_task_stale_version", "Housekeeping task has changed. Refresh and try again.");

  const now = new Date().toISOString();
  const actor = normalizeActor(input.actor);
  const next = nextTransitionState(current, input);
  const update = buildTransitionUpdate(current, next, input, actor, now);
  const result = await env.DB.prepare(update.sql).bind(...update.params).run();
  if (Number(result.meta.changes ?? 0) !== 1) throw new HousekeepingTaskDomainError("housekeeping_task_stale_version", "Housekeeping task has changed. Refresh and try again.");

  await insertTaskEvent(env, current.id, input.action, current.status, next, actor, normalizeOptionalText(input.reason), input.metadata ?? null, normalizeOptionalText(input.idempotencyKey), now);
  const updated = await getHousekeepingTask(env, taskId);
  if (!updated) throw new HousekeepingTaskDomainError("housekeeping_task_not_found", "Housekeeping task was not found after transition.");

  if (input.action === "complete") await applyCompletionCounters(env, updated, input.completion ?? {}, now);
  return updated;
}

export async function applyCompletionCounters(env: HousekeepingTaskBindings, task: HousekeepingTask, completion: HousekeepingCompletionInput, now = new Date().toISOString()): Promise<void> {
  const completedAt = completion.completedAt ?? task.completedAt ?? now;
  const updateStandard = task.taskType === "STANDARD_CLEANING" || task.taskType === "TURNOVER" ? completion.standardCleaningCompleted !== false : completion.standardCleaningCompleted === true;
  const updateLinen = task.taskType === "LINEN_CHANGE" || completion.linenChangeCompleted === true;

  if (!updateStandard && !updateLinen) return;

  const existing = await env.DB.prepare("SELECT * FROM housekeeping_room_counters WHERE unit_id = ?").bind(task.unitId).first<{
    standard_cleaning_interval_days: number;
    linen_interval_days: number;
  }>();
  const standardInterval = existing?.standard_cleaning_interval_days ?? 3;
  const linenInterval = existing?.linen_interval_days ?? 3;
  const nextStandard = addDays(dateOnly(completedAt), standardInterval);
  const nextLinen = addDays(dateOnly(completedAt), linenInterval);
  const current = await env.DB.prepare("SELECT counter_id FROM housekeeping_room_counters WHERE unit_id = ?").bind(task.unitId).first<{ counter_id: number }>();

  if (!current) {
    await env.DB.prepare(`
      INSERT INTO housekeeping_room_counters (
        unit_id, active_booking_id, active_stay_id,
        last_standard_cleaning_at, last_standard_cleaning_task_id, next_standard_cleaning_due_date,
        standard_cleaning_interval_days, last_linen_change_at, last_linen_change_task_id,
        next_linen_change_due_date, linen_interval_days, linen_required_override,
        linen_override_reason, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      task.unitId,
      task.bookingId,
      task.stayId,
      updateStandard ? completedAt : null,
      updateStandard ? task.id : null,
      updateStandard ? nextStandard : null,
      standardInterval,
      updateLinen ? completedAt : null,
      updateLinen ? task.id : null,
      updateLinen ? nextLinen : null,
      linenInterval,
      updateLinen ? 0 : 0,
      null,
      now,
      now,
    ).run();
    return;
  }

  const assignments: string[] = ["active_booking_id = ?", "active_stay_id = ?", "updated_at = ?"];
  const params: unknown[] = [task.bookingId, task.stayId, now];
  if (updateStandard) {
    assignments.push("last_standard_cleaning_at = ?", "last_standard_cleaning_task_id = ?", "next_standard_cleaning_due_date = ?");
    params.push(completedAt, task.id, nextStandard);
  }
  if (updateLinen) {
    assignments.push("last_linen_change_at = ?", "last_linen_change_task_id = ?", "next_linen_change_due_date = ?", "linen_required_override = 0", "linen_override_reason = NULL");
    params.push(completedAt, task.id, nextLinen);
  }
  params.push(task.unitId);
  await env.DB.prepare(`UPDATE housekeeping_room_counters SET ${assignments.join(", ")} WHERE unit_id = ?`).bind(...params).run();
}

function nextTransitionState(task: HousekeepingTask, input: TransitionHousekeepingTaskInput): HousekeepingTaskStatus {
  if (task.status === "CANCELLED") throw new HousekeepingTaskDomainError("housekeeping_task_cancelled", "Cancelled housekeeping task cannot transition.");
  if (task.status === "COMPLETED") throw new HousekeepingTaskDomainError("housekeeping_task_completed", "Completed housekeeping task cannot transition.");
  if (task.status === "BLOCKED" && input.action !== "cancel") throw new HousekeepingTaskDomainError("housekeeping_task_blocked", "Blocked housekeeping task cannot start or complete.");

  switch (input.action) {
    case "release_from_reception":
      if (task.taskType !== "TURNOVER" || task.status !== "WAITING_FOR_RECEPTION") invalidTransition();
      return "AVAILABLE_FOR_CLAIM";
    case "claim":
      if (task.status !== "AVAILABLE_FOR_CLAIM") invalidTransition();
      return "CLAIMED";
    case "release_claim":
      if (task.status !== "CLAIMED") invalidTransition();
      return "AVAILABLE_FOR_CLAIM";
    case "start":
      if (task.taskType === "WATER_REFILL" || (task.status !== "AVAILABLE_FOR_CLAIM" && task.status !== "CLAIMED")) invalidTransition();
      return "IN_PROGRESS";
    case "checklist_complete":
      if (task.taskType !== "TURNOVER" || task.status !== "IN_PROGRESS") invalidTransition();
      return "CHECKLIST_COMPLETE";
    case "mark_ready":
      if (task.taskType !== "TURNOVER" || task.status !== "CHECKLIST_COMPLETE") invalidTransition();
      return "READY";
    case "complete":
      if (!canCompleteStatus(task.taskType, task.status)) invalidTransition();
      return "COMPLETED";
    case "block":
      if (terminalStatuses.has(task.status)) invalidTransition();
      return "BLOCKED";
    case "skip":
      if (!housekeepingTaskCapabilities(task).canSkip) invalidTransition();
      return "SKIPPED";
    case "cancel":
      return "CANCELLED";
  }
}

function canCompleteStatus(taskType: HousekeepingTaskType, status: HousekeepingTaskStatus): boolean {
  if (taskType === "TURNOVER") return status === "READY";
  if (taskType === "WATER_REFILL") return status === "AVAILABLE_FOR_CLAIM" || status === "CLAIMED" || status === "IN_PROGRESS";
  return status === "IN_PROGRESS";
}

function buildTransitionUpdate(task: HousekeepingTask, nextStatus: HousekeepingTaskStatus, input: TransitionHousekeepingTaskInput, actor: HousekeepingActor, now: string) {
  const assignments = ["status = ?", "version = version + 1", "updated_at = ?", "updated_by = ?", "updated_by_name = ?"];
  const params: unknown[] = [nextStatus, now, actor.id, actor.displayName];
  const assignee = normalizeActor(input.assignTo ?? input.actor);

  if (input.action === "claim") {
    assignments.push("assigned_user_id = ?", "assigned_user_name = ?", "claimed_at = ?");
    params.push(assignee.id, assignee.displayName, now);
  }
  if (input.action === "start" && !task.assignedUserId) {
    assignments.push("assigned_user_id = ?", "assigned_user_name = ?", "claimed_at = ?");
    params.push(assignee.id, assignee.displayName, now);
  }
  if (input.action === "complete" && task.taskType === "WATER_REFILL" && !task.assignedUserId) {
    assignments.push("assigned_user_id = ?", "assigned_user_name = ?", "claimed_at = ?");
    params.push(assignee.id, assignee.displayName, now);
  }
  if (input.action === "release_claim") {
    assignments.push("assigned_user_id = NULL", "assigned_user_name = NULL", "claimed_at = NULL");
  }
  if (input.action === "start") assignments.push("started_at = ?");
  if (input.action === "start") params.push(now);
  if (input.action === "checklist_complete") assignments.push("checklist_completed_at = ?");
  if (input.action === "checklist_complete") params.push(now);
  if (input.action === "mark_ready") assignments.push("ready_at = ?");
  if (input.action === "mark_ready") params.push(now);
  if (input.action === "complete" && task.status !== "COMPLETED") assignments.push("completed_at = ?");
  if (input.action === "complete" && task.status !== "COMPLETED") params.push(now);
  if (input.action === "block") assignments.push("blocking_reason = ?");
  if (input.action === "block") params.push(normalizeOptionalText(input.reason));
  if (input.action === "skip") assignments.push("skipped_at = ?");
  if (input.action === "skip") params.push(now);
  if (input.action === "cancel") assignments.push("cancelled_at = ?", "cancellation_reason = ?");
  if (input.action === "cancel") params.push(now, normalizeOptionalText(input.reason));

  params.push(task.id, input.expectedVersion);
  return {
    sql: `UPDATE housekeeping_tasks SET ${assignments.join(", ")} WHERE task_id = ? AND version = ?`,
    params,
  };
}

async function replayCompletedTransition(env: HousekeepingTaskBindings, taskId: number, idempotencyKey?: string | null): Promise<HousekeepingTask | null> {
  const key = normalizeOptionalText(idempotencyKey);
  if (!key) return null;
  const event = await env.DB.prepare("SELECT task_id FROM housekeeping_task_events WHERE task_id = ? AND idempotency_key = ?").bind(taskId, key).first<{ task_id: number }>();
  if (!event) return null;
  return getHousekeepingTask(env, taskId);
}

async function findTaskByIdempotencyKey(env: HousekeepingTaskBindings, idempotencyKey: string): Promise<HousekeepingTask | null> {
  const row = await env.DB.prepare("SELECT * FROM housekeeping_tasks WHERE idempotency_key = ?").bind(idempotencyKey).first<HousekeepingTaskRow>();
  return row ? mapTask(row) : null;
}

async function insertTaskEvent(
  env: HousekeepingTaskBindings,
  taskId: number,
  eventType: string,
  previousStatus: HousekeepingTaskStatus | null,
  newStatus: HousekeepingTaskStatus,
  actor: HousekeepingActor,
  reason: string | null,
  metadata: Record<string, unknown> | null,
  idempotencyKey: string | null,
  now: string,
): Promise<void> {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO housekeeping_task_events (
      task_id, event_type, actor_user_id, actor_name, previous_status, new_status,
      reason, metadata_json, idempotency_key, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    taskId,
    eventType,
    actor.id,
    actor.displayName,
    previousStatus,
    newStatus,
    reason,
    metadata ? JSON.stringify(metadata) : null,
    idempotencyKey,
    now,
  ).run();
}

function mapTask(row: HousekeepingTaskRow): HousekeepingTask {
  return {
    id: row.task_id,
    taskType: row.task_type,
    unitId: row.unit_id,
    bookingId: row.booking_id,
    stayId: row.stay_id,
    operationalDate: row.operational_date,
    dueCycleDate: row.due_cycle_date,
    status: row.status,
    priority: row.priority,
    blockingReason: row.blocking_reason,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    claimedAt: row.claimed_at,
    startedAt: row.started_at,
    checklistCompletedAt: row.checklist_completed_at,
    readyAt: row.ready_at,
    completedAt: row.completed_at,
    skippedAt: row.skipped_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    source: row.source,
    onDemandSource: row.on_demand_source,
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeActor(actor?: HousekeepingActor | CurrentUser | null): HousekeepingActor {
  if (!actor) return { id: null, displayName: null };
  return {
    id: "id" in actor ? actor.id : null,
    displayName: "displayName" in actor ? actor.displayName : null,
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function invalidTransition(): never {
  throw new HousekeepingTaskDomainError("housekeeping_invalid_transition", "Housekeeping task transition is invalid.");
}

function mapConstraintError(error: unknown): HousekeepingTaskDomainError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("unique")) return new HousekeepingTaskDomainError("housekeeping_duplicate_task", "Duplicate housekeeping task.");
  return new HousekeepingTaskDomainError("housekeeping_invalid_transition", message);
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
