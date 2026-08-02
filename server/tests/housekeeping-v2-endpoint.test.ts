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
  nextTaskId = 1;
  raceWaterInsertKey: string | null = null;

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async all<T>(sql: string) {
    if (sql.includes("SELECT view_key FROM user_views")) return { results: [{ view_key: "staff" }] as T[] };
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) {
      return { results: [{ module_key: "housekeeping" as ModuleKey, can_access: 1, can_edit: 1 }] as T[] };
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
        results: [
          booking(101, 900101, 1, "Bungalow Guest", 1, 0),
          booking(102, 900102, 2, "Tent Guest", 2, 2),
          booking(103, 900103, 3, "Villa Guest", 4, 3),
        ] as T[],
      };
    }
    if (sql.includes("FROM housekeeping_tasks")) return { results: [...this.tasks] as T[] };
    if (sql.includes("FROM housekeeping_room_counters")) return { results: [] as T[] };
    if (sql.includes("FROM reception_room_alerts")) return { results: [] as T[] };
    if (sql.includes("FROM maintenance_tickets")) return { results: [] as T[] };
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
    if (sql.includes("FROM housekeeping_tasks WHERE idempotency_key")) {
      return (this.tasks.find((task) => task.idempotency_key === params[0]) as T) ?? null;
    }
    if (sql.includes("FROM housekeeping_tasks WHERE task_id")) {
      return (this.tasks.find((task) => task.task_id === params[0]) as T) ?? null;
    }
    if (sql.includes("FROM procurement_requests")) return { count: 0, latest_request: null } as T;
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO housekeeping_tasks")) return this.insertTask(params);
    if (sql.includes("INSERT OR IGNORE INTO housekeeping_task_events")) return this.insertEvent(params);
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

test("housekeeping v2 tasks returns 200 when repeated water refill creation replays by idempotency key", async () => {
  const db = new FakeHousekeepingV2DB();
  db.raceWaterInsertKey = "housekeeping:v2:water:1:2026-08-01";

  const response = await request("/api/housekeeping/v2/tasks?date=2026-08-01", db);
  const body = await response.json() as { success: boolean; data: { tasks: Array<{ unitId: number; taskType: string | null; waterQuantity: number | null }> } };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(db.tasks.filter((task) => task.task_type === "WATER_REFILL" && task.unit_id === 1).length, 1);
  assert.equal(db.events.filter((event) => event.event_type === "created" && event.task_id === 1).length, 1);

  const quantities = new Map(body.data.tasks.filter((card) => card.taskType === "WATER_REFILL").map((card) => [card.unitId, card.waterQuantity]));
  assert.equal(quantities.get(1), 2);
  assert.equal(quantities.get(2), 2);
  assert.equal(quantities.get(3), 4);
});
