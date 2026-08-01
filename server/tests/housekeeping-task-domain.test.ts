import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HousekeepingTaskDomainError,
  applyCompletionCounters,
  createHousekeepingTask,
  housekeepingTaskCapabilities,
  initialHousekeepingTaskStatus,
  transitionHousekeepingTask,
  type HousekeepingTaskStatus,
  type HousekeepingTaskType,
} from "../src/services/housekeeping-task-domain.service.ts";

const migration = await readFile(new URL("../migrations/0018_housekeeping_task_domain.sql", import.meta.url), "utf8");
const serviceSource = await readFile(new URL("../src/services/housekeeping-task-domain.service.ts", import.meta.url), "utf8");

type TaskRow = {
  task_id: number;
  task_type: HousekeepingTaskType;
  unit_id: number;
  booking_id: number | null;
  stay_id: number | null;
  operational_date: string;
  due_cycle_date: string | null;
  status: HousekeepingTaskStatus;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
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
  source: "system" | "reception_release" | "manual" | "physical_sign" | "guest_request" | "maintenance" | "migration";
  on_demand_source: string | null;
  idempotency_key: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type CounterRow = {
  counter_id: number;
  unit_id: number;
  active_booking_id: number | null;
  active_stay_id: number | null;
  last_standard_cleaning_at: string | null;
  last_standard_cleaning_task_id: number | null;
  next_standard_cleaning_due_date: string | null;
  standard_cleaning_interval_days: number;
  last_linen_change_at: string | null;
  last_linen_change_task_id: number | null;
  next_linen_change_due_date: string | null;
  linen_interval_days: number;
  linen_required_override: number;
  linen_override_reason: string | null;
  created_at: string;
  updated_at: string;
};

class FakeStmt {
  private params: unknown[] = [];
  private db: FakeHousekeepingTaskDB;
  private sql: string;
  constructor(db: FakeHousekeepingTaskDB, sql: string) {
    this.db = db;
    this.sql = sql;
  }
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  first<T>() {
    return this.db.first<T>(this.sql, this.params);
  }
  run() {
    return this.db.run(this.sql, this.params);
  }
}

class FakeHousekeepingTaskDB {
  tasks: TaskRow[] = [];
  events: Array<{
    task_id: number;
    event_type: string;
    previous_status: string | null;
    new_status: string;
    idempotency_key: string | null;
  }> = [];
  counters: CounterRow[] = [];
  receptionRelease = new Map<number, number>();
  nextTaskId = 1;
  nextCounterId = 1;

  prepare(sql: string) {
    return new FakeStmt(this, sql);
  }

  async first<T>(sql: string, params: unknown[]): Promise<T | null> {
    if (sql.includes("FROM reception_stays")) return ({ room_released: this.receptionRelease.get(Number(params[0])) ?? 0 } as T) ?? null;
    if (sql.includes("FROM housekeeping_tasks WHERE idempotency_key")) return (this.tasks.find((task) => task.idempotency_key === params[0]) as T) ?? null;
    if (sql.includes("FROM housekeeping_tasks WHERE task_id")) return (this.tasks.find((task) => task.task_id === params[0]) as T) ?? null;
    if (sql.includes("FROM housekeeping_task_events")) {
      return (this.events.find((event) => event.task_id === params[0] && event.idempotency_key === params[1]) ? { task_id: params[0] } as T : null);
    }
    if (sql.includes("SELECT * FROM housekeeping_room_counters")) return (this.counters.find((counter) => counter.unit_id === params[0]) as T) ?? null;
    if (sql.includes("SELECT counter_id FROM housekeeping_room_counters")) {
      const counter = this.counters.find((row) => row.unit_id === params[0]);
      return counter ? ({ counter_id: counter.counter_id } as T) : null;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO housekeeping_tasks")) return this.insertTask(params);
    if (sql.includes("UPDATE housekeeping_tasks")) return this.updateTask(sql, params);
    if (sql.includes("INSERT OR IGNORE INTO housekeeping_task_events")) return this.insertEvent(params);
    if (sql.includes("INSERT INTO housekeeping_room_counters")) return this.insertCounter(params);
    if (sql.includes("UPDATE housekeeping_room_counters")) return this.updateCounter(sql, params);
    return { meta: { changes: 0, last_row_id: 0 } };
  }

  private insertTask(params: unknown[]) {
    const row: TaskRow = {
      task_id: this.nextTaskId,
      task_type: params[0] as HousekeepingTaskType,
      unit_id: Number(params[1]),
      booking_id: params[2] as number | null,
      stay_id: params[3] as number | null,
      operational_date: String(params[4]),
      due_cycle_date: params[5] as string | null,
      status: params[6] as HousekeepingTaskStatus,
      priority: params[7] as TaskRow["priority"],
      source: params[8] as TaskRow["source"],
      on_demand_source: params[9] as string | null,
      idempotency_key: params[10] as string | null,
      created_by: params[11] as string | null,
      created_by_name: params[12] as string | null,
      updated_by: params[13] as string | null,
      updated_by_name: params[14] as string | null,
      created_at: String(params[15]),
      updated_at: String(params[16]),
      blocking_reason: null,
      assigned_user_id: null,
      assigned_user_name: null,
      claimed_at: null,
      started_at: null,
      checklist_completed_at: null,
      ready_at: null,
      completed_at: null,
      skipped_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      version: 1,
    };
    if (row.idempotency_key && this.tasks.some((task) => task.idempotency_key === row.idempotency_key)) throw new Error("UNIQUE constraint failed: housekeeping_tasks.idempotency_key");
    if (this.hasActiveDuplicate(row)) throw new Error("UNIQUE constraint failed: housekeeping_tasks active cycle");
    this.tasks.push(row);
    this.nextTaskId += 1;
    return { meta: { changes: 1, last_row_id: row.task_id } };
  }

  private updateTask(sql: string, params: unknown[]) {
    const taskId = Number(params.at(-2));
    const expectedVersion = Number(params.at(-1));
    const task = this.tasks.find((row) => row.task_id === taskId && row.version === expectedVersion);
    if (!task) return { meta: { changes: 0, last_row_id: 0 } };
    task.status = params[0] as HousekeepingTaskStatus;
    task.updated_at = String(params[1]);
    task.updated_by = params[2] as string | null;
    task.updated_by_name = params[3] as string | null;
    task.version += 1;
    let index = 4;
    if (sql.includes("assigned_user_id = ?")) {
      task.assigned_user_id = params[index] as string | null;
      task.assigned_user_name = params[index + 1] as string | null;
      task.claimed_at = String(params[index + 2]);
      index += 3;
    }
    if (sql.includes("assigned_user_id = NULL")) {
      task.assigned_user_id = null;
      task.assigned_user_name = null;
      task.claimed_at = null;
    }
    if (sql.includes("started_at = ?")) task.started_at = String(params[index++]);
    if (sql.includes("checklist_completed_at = ?")) task.checklist_completed_at = String(params[index++]);
    if (sql.includes("ready_at = ?")) task.ready_at = String(params[index++]);
    if (sql.includes("completed_at = ?")) task.completed_at = String(params[index++]);
    if (sql.includes("blocking_reason = ?")) task.blocking_reason = params[index++] as string | null;
    if (sql.includes("skipped_at = ?")) task.skipped_at = String(params[index++]);
    if (sql.includes("cancelled_at = ?")) {
      task.cancelled_at = String(params[index]);
      task.cancellation_reason = params[index + 1] as string | null;
    }
    return { meta: { changes: 1, last_row_id: task.task_id } };
  }

  private insertEvent(params: unknown[]) {
    const taskId = Number(params[0]);
    const idempotencyKey = params[8] as string | null;
    if (idempotencyKey && this.events.some((event) => event.task_id === taskId && event.idempotency_key === idempotencyKey)) {
      return { meta: { changes: 0, last_row_id: 0 } };
    }
    this.events.push({
      task_id: taskId,
      event_type: String(params[1]),
      previous_status: params[4] as string | null,
      new_status: String(params[5]),
      idempotency_key: idempotencyKey,
    });
    return { meta: { changes: 1, last_row_id: this.events.length } };
  }

  private insertCounter(params: unknown[]) {
    this.counters.push({
      counter_id: this.nextCounterId++,
      unit_id: Number(params[0]),
      active_booking_id: params[1] as number | null,
      active_stay_id: params[2] as number | null,
      last_standard_cleaning_at: params[3] as string | null,
      last_standard_cleaning_task_id: params[4] as number | null,
      next_standard_cleaning_due_date: params[5] as string | null,
      standard_cleaning_interval_days: Number(params[6]),
      last_linen_change_at: params[7] as string | null,
      last_linen_change_task_id: params[8] as number | null,
      next_linen_change_due_date: params[9] as string | null,
      linen_interval_days: Number(params[10]),
      linen_required_override: Number(params[11]),
      linen_override_reason: params[12] as string | null,
      created_at: String(params[13]),
      updated_at: String(params[14]),
    });
    return { meta: { changes: 1, last_row_id: this.nextCounterId - 1 } };
  }

  private updateCounter(sql: string, params: unknown[]) {
    const counter = this.counters.find((row) => row.unit_id === params.at(-1));
    if (!counter) return { meta: { changes: 0, last_row_id: 0 } };
    counter.active_booking_id = params[0] as number | null;
    counter.active_stay_id = params[1] as number | null;
    counter.updated_at = String(params[2]);
    let index = 3;
    if (sql.includes("last_standard_cleaning_at")) {
      counter.last_standard_cleaning_at = params[index] as string;
      counter.last_standard_cleaning_task_id = params[index + 1] as number;
      counter.next_standard_cleaning_due_date = params[index + 2] as string;
      index += 3;
    }
    if (sql.includes("last_linen_change_at")) {
      counter.last_linen_change_at = params[index] as string;
      counter.last_linen_change_task_id = params[index + 1] as number;
      counter.next_linen_change_due_date = params[index + 2] as string;
      counter.linen_required_override = 0;
      counter.linen_override_reason = null;
    }
    return { meta: { changes: 1, last_row_id: counter.counter_id } };
  }

  private hasActiveDuplicate(row: TaskRow) {
    return this.tasks.some((task) => {
      const active = !["COMPLETED", "SKIPPED", "CANCELLED"].includes(task.status);
      if (!active || task.task_type !== row.task_type || task.unit_id !== row.unit_id) return false;
      if (row.task_type === "TURNOVER") return task.booking_id === row.booking_id && task.operational_date === row.operational_date;
      if (row.task_type === "STANDARD_CLEANING" || row.task_type === "LINEN_CHANGE") return task.stay_id === row.stay_id && task.due_cycle_date === row.due_cycle_date;
      if (row.task_type === "WATER_REFILL") return task.operational_date === row.operational_date;
      return task.on_demand_source === row.on_demand_source && task.operational_date === row.operational_date;
    });
  }
}

function env(db = new FakeHousekeepingTaskDB()) {
  return { DB: db as unknown as D1Database };
}

function actor(id = "nun") {
  return { id, displayName: id === "nun" ? "Nun" : "Stefano" };
}

async function createTask(taskType: HousekeepingTaskType, db = new FakeHousekeepingTaskDB(), extra: Partial<Parameters<typeof createHousekeepingTask>[1]> = {}) {
  const data = env(db);
  const task = await createHousekeepingTask(data, {
    taskType,
    unitId: 1,
    bookingId: 100,
    stayId: 10,
    operationalDate: "2026-08-01",
    dueCycleDate: "2026-08-01",
    receptionReleased: true,
    ...extra,
  }, actor());
  return { data, db, task };
}

test("housekeeping task migration is additive and keeps legacy housekeeping intact", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS housekeeping_tasks/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS housekeeping_task_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS housekeeping_task_checklist_items/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS housekeeping_room_counters/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS housekeeping_water_quantity_config/);
  assert.doesNotMatch(migration, /DROP TABLE\s+housekeeping/i);
  assert.doesNotMatch(migration, /ALTER TABLE\s+housekeeping/i);
});

test("housekeeping task migration defines uniqueness and water quantity foundations", () => {
  assert.match(migration, /idx_housekeeping_tasks_active_turnover/);
  assert.match(migration, /idx_housekeeping_tasks_active_standard_cleaning/);
  assert.match(migration, /idx_housekeeping_tasks_active_linen_change/);
  assert.match(migration, /idx_housekeeping_tasks_water_refill_cycle/);
  assert.match(migration, /idx_housekeeping_tasks_active_on_demand/);
  assert.match(migration, /idx_housekeeping_tasks_idempotency_key/);
  assert.match(migration, /\('Bungalow', 2/);
  assert.match(migration, /\('Villa', 4/);
  assert.match(migration, /\('Yurt', 2/);
  assert.match(migration, /\('Tent', 2/);
});

test("initial turnover state is gated by Reception room release without time fallback", async () => {
  assert.equal(initialHousekeepingTaskStatus({ taskType: "TURNOVER", receptionReleased: false }), "WAITING_FOR_RECEPTION");
  assert.equal(initialHousekeepingTaskStatus({ taskType: "TURNOVER", receptionReleased: true }), "AVAILABLE_FOR_CLAIM");
  assert.doesNotMatch(serviceSource, /14:30/);

  const db = new FakeHousekeepingTaskDB();
  db.receptionRelease.set(100, 0);
  const waiting = await createHousekeepingTask(env(db), {
    taskType: "TURNOVER",
    unitId: 1,
    bookingId: 100,
    operationalDate: "2026-08-01",
  }, actor());
  assert.equal(waiting.status, "WAITING_FOR_RECEPTION");

  db.receptionRelease.set(101, 1);
  const available = await createHousekeepingTask(env(db), {
    taskType: "TURNOVER",
    unitId: 2,
    bookingId: 101,
    operationalDate: "2026-08-01",
  }, actor());
  assert.equal(available.status, "AVAILABLE_FOR_CLAIM");
});

test("task creation is idempotent and duplicate active tasks are rejected", async () => {
  const db = new FakeHousekeepingTaskDB();
  const first = await createHousekeepingTask(env(db), {
    taskType: "STANDARD_CLEANING",
    unitId: 1,
    stayId: 10,
    operationalDate: "2026-08-01",
    dueCycleDate: "2026-08-01",
    idempotencyKey: "standard-1",
  }, actor());
  const replay = await createHousekeepingTask(env(db), {
    taskType: "STANDARD_CLEANING",
    unitId: 1,
    stayId: 10,
    operationalDate: "2026-08-01",
    dueCycleDate: "2026-08-01",
    idempotencyKey: "standard-1",
  }, actor());
  assert.equal(replay.id, first.id);
  assert.equal(db.events.filter((event) => event.event_type === "created").length, 1);

  await assert.rejects(() => createHousekeepingTask(env(db), {
    taskType: "STANDARD_CLEANING",
    unitId: 1,
    stayId: 10,
    operationalDate: "2026-08-01",
    dueCycleDate: "2026-08-01",
  }, actor()), HousekeepingTaskDomainError);
});

test("valid standard-cleaning transitions increment version and create audit events", async () => {
  const { data, db, task } = await createTask("STANDARD_CLEANING");
  const claimed = await transitionHousekeepingTask(data, task.id, { action: "claim", expectedVersion: task.version, actor: actor() });
  const started = await transitionHousekeepingTask(data, claimed.id, { action: "start", expectedVersion: claimed.version, actor: actor() });
  const completed = await transitionHousekeepingTask(data, started.id, {
    action: "complete",
    expectedVersion: started.version,
    actor: actor(),
    idempotencyKey: "complete-standard",
    completion: { standardCleaningCompleted: true },
  });

  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.version, 4);
  assert.deepEqual(db.events.map((event) => event.event_type), ["created", "claim", "start", "complete"]);
  assert.equal(db.counters[0]?.last_standard_cleaning_task_id, completed.id);
  assert.equal(db.counters[0]?.last_linen_change_task_id, null);
});

test("invalid transitions fail without audit events", async () => {
  const { data, db, task } = await createTask("STANDARD_CLEANING");
  await assert.rejects(() => transitionHousekeepingTask(data, task.id, { action: "complete", expectedVersion: task.version, actor: actor() }), /invalid/);
  assert.deepEqual(db.events.map((event) => event.event_type), ["created"]);
});

test("blocked, cancelled, and completed tasks cannot resume silently", async () => {
  const blockedCase = await createTask("WATER_REFILL", new FakeHousekeepingTaskDB());
  const claimed = await transitionHousekeepingTask(blockedCase.data, blockedCase.task.id, { action: "claim", expectedVersion: blockedCase.task.version, actor: actor() });
  const blocked = await transitionHousekeepingTask(blockedCase.data, claimed.id, { action: "block", expectedVersion: claimed.version, actor: actor(), reason: "Leak" });
  await assert.rejects(() => transitionHousekeepingTask(blockedCase.data, blocked.id, { action: "complete", expectedVersion: blocked.version, actor: actor() }), /Blocked/);

  const cancelledCase = await createTask("LINEN_CHANGE", new FakeHousekeepingTaskDB());
  const cancelled = await transitionHousekeepingTask(cancelledCase.data, cancelledCase.task.id, { action: "cancel", expectedVersion: cancelledCase.task.version, actor: actor(), reason: "Stay changed" });
  await assert.rejects(() => transitionHousekeepingTask(cancelledCase.data, cancelled.id, { action: "claim", expectedVersion: cancelled.version, actor: actor() }), /Cancelled/);

  const completedCase = await createTask("WATER_REFILL", new FakeHousekeepingTaskDB());
  const waterClaimed = await transitionHousekeepingTask(completedCase.data, completedCase.task.id, { action: "claim", expectedVersion: completedCase.task.version, actor: actor() });
  const completed = await transitionHousekeepingTask(completedCase.data, waterClaimed.id, { action: "complete", expectedVersion: waterClaimed.version, actor: actor(), idempotencyKey: "water-complete" });
  await assert.rejects(() => transitionHousekeepingTask(completedCase.data, completed.id, { action: "complete", expectedVersion: completed.version, actor: actor() }), /Completed/);
});

test("completion replay is idempotent and does not duplicate audit events", async () => {
  const { data, db, task } = await createTask("WATER_REFILL");
  const claimed = await transitionHousekeepingTask(data, task.id, { action: "claim", expectedVersion: task.version, actor: actor() });
  const first = await transitionHousekeepingTask(data, claimed.id, { action: "complete", expectedVersion: claimed.version, actor: actor(), idempotencyKey: "same-complete" });
  const replay = await transitionHousekeepingTask(data, first.id, { action: "complete", expectedVersion: first.version, actor: actor(), idempotencyKey: "same-complete" });

  assert.equal(replay.id, first.id);
  assert.equal(db.events.filter((event) => event.event_type === "complete").length, 1);
});

test("stale version returns a stable conflict error and concurrent claim has one winner", async () => {
  const { data, task } = await createTask("ON_DEMAND_CLEANING", new FakeHousekeepingTaskDB(), { onDemandSource: "manual" });
  const winner = await transitionHousekeepingTask(data, task.id, { action: "claim", expectedVersion: task.version, actor: actor("nun") });
  assert.equal(winner.assignedUserId, "nun");

  await assert.rejects(async () => {
    await transitionHousekeepingTask(data, task.id, { action: "claim", expectedVersion: task.version, actor: actor("stefano") });
  }, (error) => error instanceof HousekeepingTaskDomainError && error.code === "housekeeping_task_stale_version");
});

test("turnover transitions require release before claim and support ready completion", async () => {
  const db = new FakeHousekeepingTaskDB();
  db.receptionRelease.set(100, 0);
  const data = env(db);
  const task = await createHousekeepingTask(data, { taskType: "TURNOVER", unitId: 1, bookingId: 100, operationalDate: "2026-08-01" }, actor());
  assert.equal(housekeepingTaskCapabilities(task).requiresReceptionRelease, true);
  await assert.rejects(() => transitionHousekeepingTask(data, task.id, { action: "claim", expectedVersion: task.version, actor: actor() }), /invalid/);

  const available = await transitionHousekeepingTask(data, task.id, { action: "release_from_reception", expectedVersion: task.version, actor: actor() });
  const claimed = await transitionHousekeepingTask(data, available.id, { action: "claim", expectedVersion: available.version, actor: actor() });
  const started = await transitionHousekeepingTask(data, claimed.id, { action: "start", expectedVersion: claimed.version, actor: actor() });
  const checked = await transitionHousekeepingTask(data, started.id, { action: "checklist_complete", expectedVersion: started.version, actor: actor() });
  const ready = await transitionHousekeepingTask(data, checked.id, { action: "mark_ready", expectedVersion: checked.version, actor: actor() });
  const completed = await transitionHousekeepingTask(data, ready.id, { action: "complete", expectedVersion: ready.version, actor: actor(), completion: { standardCleaningCompleted: true, linenChangeCompleted: true } });

  assert.equal(completed.status, "COMPLETED");
  assert.equal(db.counters[0]?.last_standard_cleaning_task_id, completed.id);
  assert.equal(db.counters[0]?.last_linen_change_task_id, completed.id);
});

test("counter updates keep standard cleaning, linen, and water refill independent", async () => {
  const standard = await createTask("STANDARD_CLEANING", new FakeHousekeepingTaskDB());
  await applyCompletionCounters(standard.data, standard.task, { standardCleaningCompleted: true, completedAt: "2026-08-01T09:00:00.000Z" });
  assert.equal(standard.db.counters[0]?.next_standard_cleaning_due_date, "2026-08-04");
  assert.equal(standard.db.counters[0]?.next_linen_change_due_date, null);

  const linen = await createTask("LINEN_CHANGE", new FakeHousekeepingTaskDB());
  linen.db.counters.push({
    counter_id: 1,
    unit_id: 1,
    active_booking_id: 100,
    active_stay_id: 10,
    last_standard_cleaning_at: "2026-08-01T09:00:00.000Z",
    last_standard_cleaning_task_id: 99,
    next_standard_cleaning_due_date: "2026-08-04",
    standard_cleaning_interval_days: 3,
    last_linen_change_at: null,
    last_linen_change_task_id: null,
    next_linen_change_due_date: null,
    linen_interval_days: 3,
    linen_required_override: 1,
    linen_override_reason: "Guest request",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  });
  await applyCompletionCounters(linen.data, linen.task, { linenChangeCompleted: true, completedAt: "2026-08-02T09:00:00.000Z" });
  assert.equal(linen.db.counters[0]?.last_standard_cleaning_task_id, 99);
  assert.equal(linen.db.counters[0]?.next_linen_change_due_date, "2026-08-05");
  assert.equal(linen.db.counters[0]?.linen_required_override, 0);

  const water = await createTask("WATER_REFILL", new FakeHousekeepingTaskDB());
  await applyCompletionCounters(water.data, water.task, { waterRefillCompleted: true, completedAt: "2026-08-03T09:00:00.000Z" });
  assert.equal(water.db.counters.length, 0);
});
