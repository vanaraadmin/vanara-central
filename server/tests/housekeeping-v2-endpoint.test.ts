import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import type { ModuleKey } from "../src/services/current-user.service.ts";
import type { HousekeepingTaskStatus, HousekeepingTaskType } from "../src/services/housekeeping-task-domain.service.ts";

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
  unit_id: number;
  active_booking_id: number | null;
  active_stay_id: number | null;
  next_standard_cleaning_due_date: string | null;
  standard_cleaning_interval_days: number | null;
  next_linen_change_due_date: string | null;
  linen_required_override: number | null;
  linen_override_reason: string | null;
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeHousekeepingV2DB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

class FakeHousekeepingV2DB {
  tasks: TaskRow[] = [];
  events: Array<{ task_id: number; event_type: string; idempotency_key: string | null }> = [];
  counters: CounterRow[] = [];
  bookings = [
    booking(101, 900101, 1, "Bungalow Guest", 1, 0),
    booking(102, 900102, 2, "Tent Guest", 2, 2),
    booking(103, 900103, 3, "Villa Guest", 4, 3),
  ];
  nextTaskId = 1;
  raceWaterInsertKey: string | null = null;

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async all<T>(sql: string, params: unknown[] = []) {
    if (sql.includes("SELECT view_key FROM user_views")) return { results: [{ view_key: "staff" }] as T[] };
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) {
      return {
        results: [
          { module_key: "housekeeping" as ModuleKey, can_access: 1, can_edit: 1 },
          { module_key: "rooms" as ModuleKey, can_access: 1, can_edit: 1 },
        ] as T[],
      };
    }
    if (sql.includes("SELECT action_key, allowed FROM user_action_permissions")) return { results: [] as T[] };
    if (sql.includes("FROM units u")) {
      return {
        results: [
          { unit_id: 1, unit_name: "Bungalow 1", unit_type: "bungalow", room_type_name: "Bungalow", room_name: "Bungalow" },
          { unit_id: 2, unit_name: "Tent 1", unit_type: "other", room_type_name: "Tent", room_name: "Tent" },
          { unit_id: 3, unit_name: "Villa 1", unit_type: "villa", room_type_name: "Villa", room_name: "Villa" },
        ] as T[],
      };
    }
    if (sql.includes("FROM bookings b")) {
      return {
        results: this.bookings.filter((row) => params.length === 0 || !sql.includes("WHERE b.unit_id = ?") || row.unit_id === params[0]) as T[],
      };
    }
    if (sql.includes("FROM housekeeping_tasks ht") && sql.includes("rs.room_released = 1")) {
      const rows = this.tasks
        .filter((task) => task.task_type === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION" && task.operational_date === params[0])
        .filter((task) => this.bookings.some((bookingRow) => bookingRow.booking_id === task.booking_id && bookingRow.room_released === 1))
        .map((task) => ({ task_id: task.task_id, version: task.version }));
      return { results: rows as T[] };
    }
    if (sql.includes("FROM housekeeping_tasks ht")) return { results: [] as T[] };
    if (sql.includes("FROM housekeeping_tasks")) {
      const rows = sql.includes("WHERE unit_id = ?") ? this.tasks.filter((task) => task.unit_id === params[0]) : this.tasks;
      return { results: [...rows] as T[] };
    }
    if (sql.includes("FROM housekeeping_room_counters")) return { results: [...this.counters] as T[] };
    if (sql.includes("FROM reception_room_alerts")) return { results: [] as T[] };
    if (sql.includes("FROM maintenance_tickets")) return { results: [] as T[] };
    if (sql.includes("FROM housekeeping_task_checklist_items")) return { results: [] as T[] };
    if (sql.includes("FROM housekeeping_task_events")) return { results: this.events.map((event, index) => ({
      event_id: index + 1,
      task_id: event.task_id,
      event_type: event.event_type,
      actor_name: "Housekeeping User",
      previous_status: null,
      new_status: "AVAILABLE_FOR_CLAIM",
      reason: null,
      created_at: "2026-08-01T00:00:00.000Z",
    })) as T[] };
    if (sql.includes("FROM housekeeping_water_quantity_config")) {
      return {
        results: [
          { room_type: "Bungalow", default_bottles: 2 },
          { room_type: "Yurt", default_bottles: 2 },
          { room_type: "Tent", default_bottles: 2 },
          { room_type: "Villa", default_bottles: 4 },
        ] as T[],
      };
    }
    return { results: [] as T[] };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT s.session_id")) return userRow() as T;
    if (sql.includes("FROM units u")) {
      const units = [
        { unit_id: 1, unit_name: "Bungalow 1", unit_type: "bungalow", room_type_name: "Bungalow", room_name: "Bungalow" },
        { unit_id: 2, unit_name: "Tent 1", unit_type: "other", room_type_name: "Tent", room_name: "Tent" },
        { unit_id: 3, unit_name: "Villa 1", unit_type: "villa", room_type_name: "Villa", room_name: "Villa" },
      ];
      return (units.find((unit) => unit.unit_id === params[0]) as T) ?? null;
    }
    if (sql.includes("SELECT beds24_booking_id FROM bookings WHERE booking_id = ?")) {
      const row = this.bookings.find((bookingRow) => bookingRow.booking_id === params[0]);
      return row ? ({ beds24_booking_id: row.beds24_booking_id } as T) : null;
    }
    if (sql.includes("FROM housekeeping_tasks WHERE idempotency_key")) {
      return (this.tasks.find((task) => task.idempotency_key === params[0]) as T) ?? null;
    }
    if (sql.includes("FROM housekeeping_task_events WHERE task_id")) {
      const taskId = Number(params[0]);
      const idempotencyKey = params[1] as string | null;
      const event = this.events.find((item) => item.task_id === taskId && item.idempotency_key === idempotencyKey);
      return event ? ({ task_id: taskId } as T) : null;
    }
    if (sql.includes("FROM housekeeping_tasks WHERE task_id")) {
      return (this.tasks.find((task) => task.task_id === params[0]) as T) ?? null;
    }
    if (sql.includes("FROM housekeeping_room_counters")) {
      return (this.counters.find((counter) => counter.unit_id === params[0]) as T) ?? null;
    }
    if (sql.includes("FROM procurement_requests")) return { count: 0, latest_request: null } as T;
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO housekeeping_tasks")) return this.insertTask(params);
    if (sql.includes("INSERT OR IGNORE INTO housekeeping_task_events")) return this.insertEvent(params);
    if (sql.includes("INSERT OR IGNORE INTO housekeeping_task_checklist_items")) return { meta: { changes: 1, last_row_id: 1 } };
    if (sql.includes("INSERT INTO housekeeping_room_counters") && sql.includes("last_standard_cleaning_at")) return this.insertCompletionCounter(params);
    if (sql.includes("INSERT INTO housekeeping_room_counters")) return this.upsertCounter(params);
    if (sql.includes("UPDATE housekeeping_tasks SET")) return this.updateTask(sql, params);
    if (sql.includes("UPDATE housekeeping_room_counters SET")) return { meta: { changes: 1, last_row_id: 0 } };
    return { meta: { changes: 0, last_row_id: 0 } };
  }

  private insertTask(params: unknown[]) {
    const idempotencyKey = params[10] as string | null;
    if (idempotencyKey === this.raceWaterInsertKey) {
      this.raceWaterInsertKey = null;
      const existing = taskFromParams(params, this.nextTaskId++);
      this.tasks.push(existing);
      this.events.push({ task_id: existing.task_id, event_type: "created", idempotency_key: `${idempotencyKey}:created` });
      throw new Error("UNIQUE constraint failed: housekeeping_tasks.unit_id, housekeeping_tasks.operational_date");
    }
    if (this.tasks.some((task) => task.idempotency_key === idempotencyKey)) throw new Error("UNIQUE constraint failed: housekeeping_tasks.idempotency_key");
    const task = taskFromParams(params, this.nextTaskId++);
    this.tasks.push(task);
    return { meta: { changes: 1, last_row_id: task.task_id } };
  }

  private insertEvent(params: unknown[]) {
    const taskId = Number(params[0]);
    const idempotencyKey = params[8] as string | null;
    if (idempotencyKey && this.events.some((event) => event.task_id === taskId && event.idempotency_key === idempotencyKey)) {
      return { meta: { changes: 0, last_row_id: 0 } };
    }
    this.events.push({ task_id: taskId, event_type: String(params[1]), idempotency_key: idempotencyKey });
    return { meta: { changes: 1, last_row_id: this.events.length } };
  }

  private upsertCounter(params: unknown[]) {
    const unitId = Number(params[0]);
    const existing = this.counters.find((counter) => counter.unit_id === unitId);
    const next = {
      unit_id: unitId,
      active_booking_id: params[1] as number | null,
      active_stay_id: params[2] as number | null,
      next_standard_cleaning_due_date: existing?.next_standard_cleaning_due_date ?? null,
      standard_cleaning_interval_days: existing?.standard_cleaning_interval_days ?? 3,
      next_linen_change_due_date: existing?.next_linen_change_due_date ?? null,
      linen_required_override: 1,
      linen_override_reason: params[3] as string | null,
    };
    if (existing) Object.assign(existing, next);
    else this.counters.push(next);
    return { meta: { changes: 1, last_row_id: unitId } };
  }

  private insertCompletionCounter(params: unknown[]) {
    const unitId = Number(params[0]);
    const existing = this.counters.find((counter) => counter.unit_id === unitId);
    const next = {
      unit_id: unitId,
      active_booking_id: params[1] as number | null,
      active_stay_id: params[2] as number | null,
      next_standard_cleaning_due_date: params[5] as string | null,
      standard_cleaning_interval_days: params[6] as number | null,
      next_linen_change_due_date: params[9] as string | null,
      linen_required_override: 0,
      linen_override_reason: null,
    };
    if (existing) Object.assign(existing, next);
    else this.counters.push(next);
    return { meta: { changes: 1, last_row_id: unitId } };
  }

  private updateTask(sql: string, params: unknown[]) {
    const taskId = Number(params.at(-2));
    const expectedVersion = Number(params.at(-1));
    const task = this.tasks.find((item) => item.task_id === taskId && item.version === expectedVersion);
    if (!task) return { meta: { changes: 0, last_row_id: 0 } };
    const now = String(params[1]);
    task.status = params[0] as HousekeepingTaskStatus;
    task.updated_at = now;
    task.version += 1;
    if (sql.includes("assigned_user_id = ?")) {
      task.assigned_user_id = params[4] as string;
      task.assigned_user_name = params[5] as string;
      task.claimed_at = String(params[6]);
    }
    if (sql.includes("started_at = ?")) task.started_at = String(params[4]);
    if (sql.includes("completed_at = ?")) task.completed_at = String(params[4]);
    if (sql.includes("skipped_at = ?")) task.skipped_at = String(params[4]);
    if (sql.includes("cancelled_at = ?")) task.cancelled_at = String(params[4]);
    if (sql.includes("assigned_user_id = NULL")) {
      task.assigned_user_id = null;
      task.assigned_user_name = null;
      task.claimed_at = null;
    }
    return { meta: { changes: 1, last_row_id: taskId } };
  }
}

function userRow() {
  return {
    session_id: "session-1",
    expires_at: "2099-01-01T00:00:00.000Z",
    user_id: "housekeeping-user",
    full_name: "Housekeeping User",
    profile_photo_url: null,
    role: "Housekeeping",
    preferred_language: "en",
    username: "housekeeping",
    email: null,
    password_hash: "omitted",
    status: "active",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    last_login_at: null,
  };
}

function booking(bookingId: number, beds24BookingId: number, unitId: number, guestName: string, adults: number, children: number) {
  return {
    booking_id: bookingId,
    beds24_booking_id: beds24BookingId,
    unit_id: unitId,
    guest_name: guestName,
    arrival_date: "2026-08-01",
    departure_date: "2026-08-03",
    arrival_time: "14:00",
    adults,
    children,
    channel: "Direct",
    api_source: "beds24",
    status: "confirmed",
    guest_arrived: 1,
    room_released: 0,
  };
}

function taskFromParams(params: unknown[], taskId: number): TaskRow {
  return {
    task_id: taskId,
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
    created_at: String(params[15]),
    updated_at: String(params[16]),
  };
}

function storedTask(overrides: Partial<TaskRow>): TaskRow {
  return {
    task_id: 500,
    task_type: "STANDARD_CLEANING",
    unit_id: 1,
    booking_id: 101,
    stay_id: 900101,
    operational_date: "2026-08-01",
    due_cycle_date: "2026-08-01",
    status: "AVAILABLE_FOR_CLAIM",
    priority: "NORMAL",
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
    source: "system",
    on_demand_source: null,
    idempotency_key: null,
    version: 1,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function env(db: FakeHousekeepingV2DB) {
  return {
    DB: db as unknown as D1Database,
    BEDS24_BASE_URL: "https://api.beds24.com/v2",
    BEDS24_LONG_LIFE_TOKEN: "token",
    VANARA_DATABASE_ENVIRONMENT: "test",
    VANARA_DATABASE_NAME: "test",
    VANARA_DATABASE_ID: "test",
  };
}

async function request(path: string, db: FakeHousekeepingV2DB) {
  return worker.fetch(new Request(`https://local.test${path}`, { headers: { cookie: "vanara_session=x" } }), env(db) as never, {} as never);
}

async function post(path: string, db: FakeHousekeepingV2DB, payload: unknown) {
  return worker.fetch(new Request(`https://local.test${path}`, {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify(payload),
  }), env(db) as never, {} as never);
}

test("housekeeping v2 tasks returns 200 when repeated water refill creation replays by idempotency key and fixed room-type quantity", async () => {
  const db = new FakeHousekeepingV2DB();
  db.raceWaterInsertKey = "housekeeping:v2:water:1:2026-08-01";

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-01", db);
  const body = await response.json() as { success: boolean; data: { tasks: Array<{ unitId: number; taskType: string | null; waterQuantity: number | null }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.success, true);
  assert.equal(db.tasks.filter((task) => task.task_type === "WATER_REFILL" && task.unit_id === 1).length, 1);
  assert.equal(db.events.filter((event) => event.event_type === "created" && event.task_id === 1).length, 1);

  const quantities = new Map(body.data.tasks.filter((card) => card.taskType === "WATER_REFILL").map((card) => [card.unitId, card.waterQuantity]));
  assert.equal(quantities.get(1), 2);
  assert.equal(quantities.get(2), 2);
  assert.equal(quantities.get(3), 4);
});

test("housekeeping v2 standard cleaning uses current stay baseline and ignores stale counters", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [
    { ...booking(201, 920201, 1, "Current Guest", 3, 2), arrival_date: "2026-08-01", departure_date: "2026-08-06" },
  ];
  db.counters = [{
    unit_id: 1,
    active_booking_id: 999,
    active_stay_id: 999999,
    next_standard_cleaning_due_date: "2026-07-30",
    standard_cleaning_interval_days: 3,
    next_linen_change_due_date: null,
    linen_required_override: 0,
    linen_override_reason: null,
  }];

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-04", db);
  const body = await response.json() as { success: boolean; data: { tasks: Array<{ unitId: number; taskType: string | null; reasonCodes: string[] }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.success, true);
  const standard = db.tasks.find((task) => task.task_type === "STANDARD_CLEANING");
  assert.equal(standard?.due_cycle_date, "2026-08-04");
  assert.equal(standard?.stay_id, 920201);
  assert.equal(body.data.tasks.some((card) => card.unitId === 1 && card.taskType === "STANDARD_CLEANING" && card.reasonCodes.includes("cleaning_due_today")), true);
});

test("standard cleaning due today stays in Normal with original operational date", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [
    { ...booking(301, 930301, 1, "Current Guest", 2, 4), arrival_date: "2026-07-30", departure_date: "2026-08-05" },
  ];

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const body = await response.json() as { success: boolean; data: { summary: { normalCleaningDue: number }; sections: Array<{ id: string; cards: Array<{ taskId: number; taskType: string; operationalDate: string; currentQueue: string; reasonCodes: string[] }> }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.success, true);
  const normal = body.data.sections.find((section) => section.id === "normal-cleaning")?.cards ?? [];
  const priority = body.data.sections.find((section) => section.id === "priority-turnover")?.cards ?? [];
  const standard = normal.find((card) => card.taskType === "STANDARD_CLEANING");
  assert.ok(standard);
  assert.equal(standard.operationalDate, "2026-08-02");
  assert.equal(standard.currentQueue, "normal-cleaning");
  assert.equal(standard.reasonCodes.includes("cleaning_due_today"), true);
  assert.equal(priority.some((card) => card.taskType === "STANDARD_CLEANING"), false);
  assert.equal(body.data.summary.normalCleaningDue, 1);
});

test("standard cleaning can be completed as Full Cleaning and updates cleaning plus linen counters", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [
    { ...booking(301, 930301, 1, "Current Guest", 2, 4), arrival_date: "2026-07-30", departure_date: "2026-08-05" },
  ];

  const initial = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const initialBody = await initial.json() as { success: boolean; data: { sections: Array<{ id: string; cards: Array<{ taskId: number; taskType: string }> }> } };
  assert.equal(initial.status, 200, JSON.stringify(initialBody));
  const standard = initialBody.data.sections.find((section) => section.id === "normal-cleaning")?.cards.find((card) => card.taskType === "STANDARD_CLEANING");
  assert.ok(standard);

  const claimed = await post(`/api/housekeeping/v2/tasks/${standard.taskId}/claim`, db, { expectedVersion: 1 });
  assert.equal(claimed.status, 200, await claimed.text());
  const started = await post(`/api/housekeeping/v2/tasks/${standard.taskId}/start`, db, { expectedVersion: 2 });
  assert.equal(started.status, 200, await started.text());
  const completed = await post(`/api/housekeeping/v2/tasks/${standard.taskId}/complete`, db, {
    expectedVersion: 3,
    completion: { standardCleaningCompleted: true, linenChangeCompleted: true },
  });
  assert.equal(completed.status, 200, await completed.text());

  const counter = db.counters.find((item) => item.unit_id === 1);
  assert.equal(counter?.next_standard_cleaning_due_date, "2026-08-05");
  assert.equal(counter?.next_linen_change_due_date, "2026-08-05");

  const afterComplete = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const completedBody = await afterComplete.json() as { success: boolean; data: { summary: { normalCleaningDue: number }; sections: Array<{ id: string; cards: Array<{ taskId: number; taskType: string }> }> } };
  assert.equal(afterComplete.status, 200, JSON.stringify(completedBody));
  assert.equal(completedBody.data.summary.normalCleaningDue, 0);
  assert.equal(completedBody.data.sections.find((section) => section.id === "normal-cleaning")?.cards.some((card) => card.taskId === standard.taskId), false);
  assert.equal(db.tasks.filter((task) => task.task_type === "STANDARD_CLEANING" && task.unit_id === 1).length, 1);
});

test("previous-day standard cleaning moves to Priority without duplication or lost assignment history", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [
    { ...booking(101, 900101, 1, "Bungalow Guest", 1, 0), arrival_date: "2026-08-01", departure_date: "2026-08-05" },
  ];
  db.tasks.push(storedTask({
    task_id: 51,
    task_type: "STANDARD_CLEANING",
    unit_id: 1,
    booking_id: 101,
    stay_id: 900101,
    operational_date: "2026-08-01",
    due_cycle_date: "2026-08-01",
    status: "CLAIMED",
    priority: "NORMAL",
    assigned_user_id: "hk-ada",
    assigned_user_name: "Ada",
  }));
  db.events.push({ task_id: 51, event_type: "claim", idempotency_key: "claim:51" });

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const body = await response.json() as { success: boolean; data: { summary: { priorityTurnovers: number; normalCleaningDue: number }; sections: Array<{ id: string; cards: Array<{ taskId: number; taskType: string; operationalDate: string; currentQueue: string; displayReason: string | null; assignee: string | null; reasonCodes: string[] }> }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.success, true);
  const priority = body.data.sections.find((section) => section.id === "priority-turnover")?.cards ?? [];
  const normal = body.data.sections.find((section) => section.id === "normal-cleaning")?.cards ?? [];
  const standard = priority.find((card) => card.taskId === 51);
  assert.ok(standard);
  assert.equal(standard.taskType, "STANDARD_CLEANING");
  assert.equal(standard.operationalDate, "2026-08-01");
  assert.equal(standard.currentQueue, "priority-turnover");
  assert.equal(standard.displayReason, "Was due yesterday");
  assert.equal(standard.assignee, "Ada");
  assert.equal(standard.reasonCodes.includes("standard_cleaning_previous_day"), true);
  assert.equal(normal.some((card) => card.taskId === 51), false);
  assert.equal(db.tasks.filter((task) => task.task_type === "STANDARD_CLEANING" && task.unit_id === 1).length, 1);
  assert.equal(db.events.some((event) => event.task_id === 51 && event.event_type === "claim"), true);
  assert.equal(body.data.summary.priorityTurnovers, 1);
  assert.equal(body.data.summary.normalCleaningDue, 0);

  const repeated = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  assert.equal(repeated.status, 200, await repeated.text());
  assert.equal(db.tasks.filter((task) => task.task_type === "STANDARD_CLEANING" && task.unit_id === 1).length, 1);
  assert.equal(db.events.filter((event) => event.task_id === 51).length, 1);
});

test("housekeeping v2 cards appear in exactly one visible queue", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [
    { ...booking(101, 900101, 1, "Bungalow Guest", 1, 0), arrival_date: "2026-08-01", departure_date: "2026-08-05" },
  ];
  db.tasks.push(
    storedTask({
      task_id: 91,
      task_type: "STANDARD_CLEANING",
      unit_id: 1,
      booking_id: 101,
      stay_id: 900101,
      operational_date: "2026-08-01",
      due_cycle_date: "2026-08-01",
    }),
    storedTask({
      task_id: 92,
      task_type: "ON_DEMAND_CLEANING",
      unit_id: 1,
      booking_id: 101,
      stay_id: 900101,
      operational_date: "2026-08-02",
      due_cycle_date: "2026-08-02",
      source: "manual",
      on_demand_source: "ROOM_WORKSPACE",
    }),
  );

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const body = await response.json() as { success: boolean; data: { sections: Array<{ id: string; cards: Array<{ taskId: number; currentQueue: string }> }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  const sectionCards = body.data.sections.flatMap((section) => section.cards.map((card) => ({ sectionId: section.id, ...card })));
  assert.equal(sectionCards.every((card) => card.sectionId === card.currentQueue), true);
  assert.equal(new Set(sectionCards.map((card) => card.taskId)).size, sectionCards.length);
});

test("clean rooms with no active work are absent from Housekeeping queues", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [];

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const body = await response.json() as { success: boolean; data: { tasks: Array<unknown>; sections: Array<{ id: string; emptyLabel: string; cards: Array<unknown> }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.success, true);
  assert.equal(body.data.tasks.length, 0);
  assert.deepEqual(body.data.sections.map((section) => [section.id, section.emptyLabel, section.cards.length]), [
    ["priority-turnover", "No priority work.", 0],
    ["normal-cleaning", "No normal cleaning work.", 0],
    ["water-refill", "No water refills.", 0],
  ]);
});

test("completed and cancelled standard cleaning tasks do not escalate", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [
    { ...booking(101, 900101, 1, "Bungalow Guest", 1, 0), arrival_date: "2026-08-01", departure_date: "2026-08-05" },
  ];
  db.tasks.push(
    storedTask({ task_id: 61, task_type: "STANDARD_CLEANING", operational_date: "2026-08-01", due_cycle_date: "2026-08-01", status: "COMPLETED", completed_at: "2026-08-01T09:00:00.000Z" }),
    storedTask({ task_id: 62, task_type: "STANDARD_CLEANING", operational_date: "2026-08-01", due_cycle_date: "2026-08-01", status: "CANCELLED", cancelled_at: "2026-08-01T09:00:00.000Z" }),
  );

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const body = await response.json() as { success: boolean; data: { sections: Array<{ id: string; cards: Array<{ taskType: string }> }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  const standardCards = body.data.sections.flatMap((section) => section.cards).filter((card) => card.taskType === "STANDARD_CLEANING");
  assert.equal(standardCards.length, 0);
});

test("previous-stay standard cleaning does not escalate into a new active stay", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [
    { ...booking(202, 920202, 1, "New Guest", 2, 0), arrival_date: "2026-08-02", departure_date: "2026-08-06" },
  ];
  db.tasks.push(storedTask({
    task_id: 71,
    task_type: "STANDARD_CLEANING",
    unit_id: 1,
    booking_id: 201,
    stay_id: 920201,
    operational_date: "2026-08-01",
    due_cycle_date: "2026-08-01",
  }));

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const body = await response.json() as { success: boolean; data: { tasks: Array<{ taskId: number; taskType: string }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.data.tasks.some((card) => card.taskId === 71), false);
  assert.equal(body.data.tasks.some((card) => card.taskType === "STANDARD_CLEANING"), false);
});

test("previous-day on-demand cleaning becomes Priority while Water remains in Water", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [
    { ...booking(101, 900101, 1, "Bungalow Guest", 1, 3), arrival_date: "2026-08-01", departure_date: "2026-08-05" },
  ];
  db.tasks.push(
    storedTask({
      task_id: 81,
      task_type: "ON_DEMAND_CLEANING",
      unit_id: 1,
      booking_id: 101,
      stay_id: 900101,
      operational_date: "2026-08-01",
      due_cycle_date: "2026-08-01",
      source: "manual",
      on_demand_source: "ROOM_WORKSPACE",
    }),
    storedTask({
      task_id: 82,
      task_type: "WATER_REFILL",
      unit_id: 1,
      booking_id: 101,
      stay_id: 900101,
      operational_date: "2026-08-01",
      due_cycle_date: "2026-08-01",
    }),
  );

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const body = await response.json() as { success: boolean; data: { summary: { priorityTurnovers: number; normalCleaningDue: number; waterRefillDue: number }; sections: Array<{ id: string; cards: Array<{ taskId: number; taskType: string; currentQueue: string; reasonCodes: string[]; waterQuantity: number | null }> }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  const priority = body.data.sections.find((section) => section.id === "priority-turnover")?.cards ?? [];
  const normal = body.data.sections.find((section) => section.id === "normal-cleaning")?.cards ?? [];
  const water = body.data.sections.find((section) => section.id === "water-refill")?.cards ?? [];
  assert.equal(priority.some((card) => card.taskId === 81 && card.reasonCodes.includes("on_demand_previous_day")), true);
  assert.equal(normal.some((card) => card.taskId === 81), false);
  assert.equal(priority.some((card) => card.taskType === "WATER_REFILL"), false);
  assert.equal(water.some((card) => card.taskType === "WATER_REFILL" && card.waterQuantity === 2), true);
  assert.equal(body.data.summary.priorityTurnovers, 1);
  assert.equal(body.data.summary.normalCleaningDue, 0);
  assert.equal(body.data.summary.waterRefillDue, 1);
});

test("turnover remains Priority and keeps Reception release gate unchanged", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [
    { ...booking(401, 940401, 1, "Departing Guest", 2, 0), arrival_date: "2026-08-01", departure_date: "2026-08-02", room_released: 0 },
  ];

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const body = await response.json() as { success: boolean; data: { sections: Array<{ id: string; cards: Array<{ taskType: string; currentQueue: string; reasonCodes: string[] }> }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  const priority = body.data.sections.find((section) => section.id === "priority-turnover")?.cards ?? [];
  assert.equal(priority.some((card) => card.taskType === "TURNOVER" && card.currentQueue === "priority-turnover" && card.reasonCodes.includes("waiting_reception")), true);
});

test("released turnover is claimable from Housekeeping Priority without opening room detail first", async () => {
  const db = new FakeHousekeepingV2DB();
  db.bookings = [
    { ...booking(402, 940402, 1, "Released Guest", 2, 0), arrival_date: "2026-08-01", departure_date: "2026-08-02", room_released: 1 },
  ];
  db.tasks.push(storedTask({
    task_id: 93,
    task_type: "TURNOVER",
    unit_id: 1,
    booking_id: 402,
    stay_id: 940402,
    operational_date: "2026-08-02",
    due_cycle_date: "2026-08-02",
    status: "WAITING_FOR_RECEPTION",
    priority: "HIGH",
  }));

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-02", db);
  const body = await response.json() as { success: boolean; data: { sections: Array<{ id: string; cards: Array<{ taskId: number; taskType: string; taskStatus: string; reasonCodes: string[]; capabilities: { canClaim: boolean } }> }> } };

  assert.equal(response.status, 200, JSON.stringify(body));
  const turnover = body.data.sections.find((section) => section.id === "priority-turnover")?.cards.find((card) => card.taskId === 93);
  assert.ok(turnover);
  assert.equal(turnover.taskType, "TURNOVER");
  assert.equal(turnover.taskStatus, "AVAILABLE_FOR_CLAIM");
  assert.equal(turnover.capabilities.canClaim, true);
  assert.equal(turnover.reasonCodes.includes("waiting_reception"), false);
  assert.equal(db.tasks.filter((task) => task.task_type === "TURNOVER" && task.unit_id === 1).length, 1);
  assert.equal(db.events.filter((event) => event.task_id === 93 && event.event_type === "release_from_reception").length, 1);
});

test("housekeeping v2 linen override creates a normal-cleaning linen task without automatic linen interval generation", async () => {
  const db = new FakeHousekeepingV2DB();
  db.counters = [{
    unit_id: 1,
    active_booking_id: 101,
    active_stay_id: 900101,
    next_standard_cleaning_due_date: null,
    standard_cleaning_interval_days: 3,
    next_linen_change_due_date: "2026-08-20",
    linen_required_override: 1,
    linen_override_reason: "Guest request",
  }];

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-01", db);
  const body = await response.json() as { success: boolean; data: { sections: Array<{ id: string; cards: Array<{ taskType: string | null; reasonCodes: string[] }> }> } };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(db.tasks.some((task) => task.task_type === "LINEN_CHANGE" && task.due_cycle_date === "2026-08-01"), true);
  const normal = body.data.sections.find((section) => section.id === "normal-cleaning");
  assert.equal(normal?.cards.some((card) => card.taskType === "LINEN_CHANGE" && card.reasonCodes.includes("linen_override")), true);
});

test("housekeeping v2 room can create on-demand cleaning with optional note and explicit manual source", async () => {
  const db = new FakeHousekeepingV2DB();
  const response = await post("/api/housekeeping/v2/rooms/1/on-demand-cleaning?date=2026-08-01", db, {
    source: "HOUSEKEEPING_MANUAL",
    priority: "normal",
    includeLinen: true,
    idempotencyKey: "on-demand-1",
  });
  const body = await response.json() as { success: boolean; data: { housekeeping: { tasks: Array<{ taskType: string; checklist: { total: number } }> } } };

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.success, true);
  assert.equal(db.tasks.some((task) => task.task_type === "ON_DEMAND_CLEANING" && task.source === "manual" && task.on_demand_source === "HOUSEKEEPING_MANUAL"), true);
  assert.equal(body.data.housekeeping.tasks.some((task) => task.taskType === "ON_DEMAND_CLEANING"), true);
});

test("room workspace on-demand cleaning appears in Housekeeping Normal and is removed after completion", async () => {
  const db = new FakeHousekeepingV2DB();

  const created = await post("/api/rooms/1/on-demand-cleaning?date=2026-08-01", db, {
    source: "ROOM_WORKSPACE",
    priority: "normal",
    note: "Guest asked for cleaning",
  });
  assert.equal(created.status, 200, await created.text());

  const afterCreate = await request("/api/housekeeping/v2/tasks?date=2026-08-01", db);
  const createdBody = await afterCreate.json() as { success: boolean; data: { summary: { normalCleaningDue: number }; sections: Array<{ id: string; cards: Array<{ taskId: number; taskType: string }> }> } };
  assert.equal(afterCreate.status, 200, JSON.stringify(createdBody));
  assert.equal(createdBody.data.summary.normalCleaningDue, 1);
  const normal = createdBody.data.sections.find((section) => section.id === "normal-cleaning");
  const task = normal?.cards.find((card) => card.taskType === "ON_DEMAND_CLEANING");
  assert.ok(task);

  const claimed = await post(`/api/housekeeping/v2/tasks/${task.taskId}/claim`, db, { expectedVersion: 1 });
  assert.equal(claimed.status, 200, await claimed.text());
  const started = await post(`/api/housekeeping/v2/tasks/${task.taskId}/start`, db, { expectedVersion: 2 });
  assert.equal(started.status, 200, await started.text());
  const completed = await post(`/api/housekeeping/v2/tasks/${task.taskId}/complete`, db, {
    expectedVersion: 3,
    completion: { standardCleaningCompleted: true, linenChangeCompleted: false },
  });
  assert.equal(completed.status, 200, await completed.text());

  const afterComplete = await request("/api/housekeeping/v2/tasks?date=2026-08-01", db);
  const completedBody = await afterComplete.json() as { success: boolean; data: { summary: { normalCleaningDue: number }; sections: Array<{ id: string; cards: Array<{ taskId: number; taskType: string }> }> } };
  assert.equal(afterComplete.status, 200, JSON.stringify(completedBody));
  assert.equal(completedBody.data.summary.normalCleaningDue, 0);
  assert.equal(completedBody.data.sections.find((section) => section.id === "normal-cleaning")?.cards.some((card) => card.taskId === task.taskId), false);
  assert.equal(db.tasks.filter((item) => item.task_type === "ON_DEMAND_CLEANING" && item.unit_id === 1).length, 1);
});
