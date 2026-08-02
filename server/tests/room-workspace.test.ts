import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import { normalizeHousekeepingChecklistInput } from "../src/services/housekeeping-overview.service.ts";
import { normalizeRoomOperationalAvailabilityInput } from "../src/services/room-operational-state.service.ts";
import { normalizeRoomHousekeepingInput, normalizeRoomNoteInput } from "../src/services/room-detail.service.ts";
import type { ModuleKey } from "../src/services/current-user.service.ts";

type Permission = { module_key: ModuleKey; can_access: number; can_edit: number };

const UNIT = {
  unit_id: 1,
  unit_name: "Villa 10",
  unit_type: "villa",
  room_type_id: 11,
  room_type_name: "Garden Villa",
  room_name: "Garden Villa",
};

const ACTIVE_USER = {
  user_id: "staff-1",
  full_name: "Nok Operations",
  profile_photo_url: null,
  role: "Operations",
  preferred_language: "en",
  username: "nok",
  email: null,
  password_hash: "not-returned",
  status: "active",
  created_at: "2026-07-30T00:00:00.000Z",
  updated_at: "2026-07-30T00:00:00.000Z",
  last_login_at: null,
};

const OTHER_USER = {
  ...ACTIVE_USER,
  user_id: "staff-2",
  full_name: "Mai Housekeeping",
  username: "mai",
};

const DISABLED_USER = {
  ...ACTIVE_USER,
  user_id: "staff-disabled",
  full_name: "Disabled Staff",
  username: "disabled",
  status: "disabled",
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeRoomDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

class FakeRoomDB {
  notes: Array<Record<string, unknown>> = [];
  housekeeping: Array<Record<string, unknown>> = [];
  tasks: Array<Record<string, unknown>> = [];
  taskEvents: Array<Record<string, unknown>> = [];
  availability: Array<Record<string, unknown>> = [];
  availabilityEvents: Array<Record<string, unknown>> = [];
  housekeepingState: Array<Record<string, unknown>> = [];
  housekeepingStateEvents: Array<Record<string, unknown>> = [];
  tickets: Array<Record<string, unknown>> = [];
  events: Array<Record<string, unknown>> = [];

  constructor(private permissions: Permission[], private options: { authenticated?: boolean; user?: typeof ACTIVE_USER } = {}) {}

  prepare(sql: string) { return new FakeStmt(this, sql); }
  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(stmts.map((stmt) => stmt.run()));
  }

  async all<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT view_key FROM user_views")) return { results: [{ view_key: "staff" }] as T[] };
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) return { results: this.permissions as T[] };
    if (sql.includes("FROM users u") && sql.includes("ORDER BY u.full_name")) {
      return {
        results: [ACTIVE_USER, OTHER_USER].map((user) => ({
          user_id: user.user_id,
          full_name: user.full_name,
          status: user.status,
          can_access: 1,
        })) as T[],
      };
    }
    if (sql.includes("WITH latest_housekeeping")) {
      return {
        results: [{
          unit_id: UNIT.unit_id,
          unit_name: UNIT.unit_name,
          housekeeping_id: this.housekeeping.at(-1)?.housekeeping_id ?? null,
          housekeeping_status: this.housekeeping.at(-1)?.status ?? null,
          assigned_to: this.housekeeping.at(-1)?.assigned_to ?? null,
          assigned_user_id: this.housekeeping.at(-1)?.assigned_user_id ?? null,
          assigned_user_name: this.housekeeping.at(-1)?.assigned_user_name ?? null,
          assigned_at: this.housekeeping.at(-1)?.assigned_at ?? null,
          updated_at: this.housekeeping.at(-1)?.updated_at ?? null,
          updated_by: this.housekeeping.at(-1)?.updated_by ?? null,
          updated_by_name: this.housekeeping.at(-1)?.updated_by_name ?? null,
          checklist_json: this.housekeeping.at(-1)?.checklist_json ?? null,
          has_today_arrival: 0,
          has_current_occupancy: 1,
          has_scheduled_checkout_today: 0,
        }] as T[],
      };
    }
    if (sql.includes("FROM room_notes") && sql.includes("WHERE unit_id =")) {
      return { results: [...this.notes].reverse() as T[] };
    }
    if (sql.includes("FROM maintenance_tickets") && sql.includes("WHERE room_id =")) {
      const roomId = Number(params[0]);
      return { results: this.tickets.filter((ticket) => Number(ticket.room_id) === roomId).map((ticket) => ({ ticket_id: ticket.ticket_id })) as T[] };
    }
    if (sql.includes("FROM maintenance_ticket_notes")) return { results: [] as T[] };
    if (sql.includes("FROM maintenance_ticket_photos")) return { results: [] as T[] };
    if (sql.includes("FROM maintenance_ticket_events")) return { results: this.events as T[] };
    if (sql.includes("FROM housekeeping_tasks ht")) return { results: [] as T[] };
    if (sql.includes("FROM housekeeping_tasks")) {
      const unitId = Number(params[0]);
      const rows = this.tasks
        .filter((task) => !unitId || Number(task.unit_id) === unitId)
        .filter((task) => !sql.includes("room-ready-baseline:not-ready:%") || !String(task.idempotency_key ?? "").startsWith("room-ready-baseline:not-ready:"));
      if (sql.includes("SELECT task_id")) return { results: rows.map((task) => ({ task_id: task.task_id })) as T[] };
      return { results: rows as T[] };
    }
    if (sql.includes("FROM room_operational_availability")) return { results: this.availability as T[] };
    if (sql.includes("FROM room_housekeeping_state")) return { results: this.housekeepingState as T[] };
    if (sql.includes("FROM housekeeping_task_events")) return { results: this.taskEvents as T[] };
    if (sql.includes("FROM housekeeping_room_counters")) return { results: [] as T[] };
    if (sql.includes("FROM reception_room_alerts")) return { results: [] as T[] };
    if (sql.includes("FROM procurement_requests")) return { results: [{ count: 0, latest_request: null }] as T[] };
    return { results: [] as T[] };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT s.session_id")) {
      if (this.options.authenticated === false) return null;
      return {
        session_id: "session-1",
        expires_at: "2999-01-01T00:00:00.000Z",
        ...(this.options.user ?? ACTIVE_USER),
      } as T;
    }
    if (sql.includes("FROM users u") && sql.includes("user_module_permissions")) {
      const id = String(params[0]);
      const user = [ACTIVE_USER, OTHER_USER, DISABLED_USER].find((item) => item.user_id === id);
      return user ? {
        user_id: user.user_id,
        full_name: user.full_name,
        status: user.status,
        can_access: user.user_id === "staff-disabled" ? 1 : 1,
      } as T : null;
    }
    if (sql.includes("SELECT unit_id FROM units WHERE unit_id")) {
      return Number(params[0]) === UNIT.unit_id ? { unit_id: UNIT.unit_id } as T : null;
    }
    if (sql.includes("FROM room_operational_availability") && sql.includes("WHERE unit_id")) {
      return (this.availability.find((row) => row.unit_id === params[0]) ?? null) as T | null;
    }
    if (sql.includes("FROM room_housekeeping_state") && sql.includes("WHERE unit_id")) {
      return (this.housekeepingState.find((row) => row.unit_id === params[0]) ?? null) as T | null;
    }
    if (sql.includes("SELECT unit_id, room_type_id FROM units WHERE unit_id")) {
      return Number(params[0]) === UNIT.unit_id ? { unit_id: UNIT.unit_id, room_type_id: UNIT.room_type_id } as T : null;
    }
    if (sql.includes("SELECT u.unit_id") && sql.includes("WHERE u.unit_id")) {
      return Number(params[0]) === UNIT.unit_id ? UNIT as T : null;
    }
    if (sql.includes("FROM bookings b")) return null;
    if (sql.includes("FROM bookings") && sql.includes("arrival_date <=")) {
      return Number(params[0]) === UNIT.unit_id ? {
        booking_id: 501,
        beds24_booking_id: 9001,
        guest_name: "Mali Guest",
        arrival_date: "2026-07-29",
        departure_date: "2026-07-31",
        adults: 2,
        children: 1,
        api_source: "Beds24",
        channel: null,
        api_reference: "B24-9001",
        reference: null,
      } as T : null;
    }
    if (sql.includes("FROM housekeeping") && sql.includes("ORDER BY")) {
      return (this.housekeeping.at(-1) ?? null) as T | null;
    }
    if (sql.includes("FROM housekeeping_tasks WHERE idempotency_key")) {
      return (this.tasks.find((task) => task.idempotency_key === params[0]) ?? null) as T | null;
    }
    if (sql.includes("FROM housekeeping_task_events WHERE task_id")) {
      const event = this.taskEvents.find((item) => item.task_id === params[0] && item.idempotency_key === params[1]);
      return event ? { task_id: params[0] } as T : null;
    }
    if (sql.includes("FROM housekeeping_tasks WHERE task_id")) {
      return (this.tasks.find((task) => task.task_id === params[0]) ?? null) as T | null;
    }
    if (sql.includes("FROM maintenance_tickets") && sql.includes("out_of_service = 1") && sql.includes("LIMIT 1")) {
      const roomId = Number(params[0]);
      const title = String(params[1]).trim().toLowerCase();
      const description = String(params[2]).trim().toLowerCase();
      const ticket = this.tickets
        .filter((item) => Number(item.room_id) === roomId
          && Number(item.out_of_service) === 1
          && String(item.title).trim().toLowerCase() === title
          && String(item.description).trim().toLowerCase() === description
          && !["Resolved", "Closed"].includes(String(item.status)))
        .at(-1);
      return ticket ? { ticket_id: ticket.ticket_id } as T : null;
    }
    if (sql.includes("SELECT * FROM room_notes WHERE note_id")) {
      return (this.notes.find((note) => note.note_id === params[0]) ?? null) as T | null;
    }
    if (sql.includes("FROM chat_conversations")) return null;
    if (sql.includes("FROM maintenance_tickets t") && sql.includes("WHERE t.ticket_id")) {
      const ticket = this.tickets.find((item) => item.ticket_id === params[0]);
      return ticket ? { ...ticket, room_name: UNIT.unit_name, accommodation_name: UNIT.room_type_name, note_count: 0, photo_count: 0 } as T : null;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO housekeeping_tasks")) {
      const task_id = this.tasks.length + 1;
      const task = {
        task_id,
        task_type: params[0],
        unit_id: params[1],
        booking_id: params[2],
        stay_id: params[3],
        operational_date: params[4],
        due_cycle_date: params[5],
        status: params[6],
        priority: params[7],
        source: params[8],
        on_demand_source: params[9],
        idempotency_key: params[10],
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
        created_at: params[15],
        updated_at: params[16],
      };
      this.tasks.push(task);
      return { meta: { changes: 1, last_row_id: task_id } };
    }
    if (sql.includes("INSERT OR IGNORE INTO housekeeping_task_events")) {
      const event_id = this.taskEvents.length + 1;
      const hardcodedRoomReady = sql.includes("'room_ready_override'");
      this.taskEvents.push(hardcodedRoomReady ? {
        event_id,
        task_id: params[0],
        event_type: "room_ready_override",
        actor_user_id: params[1],
        actor_name: params[2],
        previous_status: params[3],
        new_status: params[4],
        reason: params[5],
        metadata_json: params[6],
        idempotency_key: params[7],
        created_at: params[8],
      } : {
        event_id,
        task_id: params[0],
        event_type: params[1],
        actor_user_id: params[2],
        actor_name: params[3],
        previous_status: params[4],
        new_status: params[5],
        reason: params[6],
        metadata_json: params[7],
        idempotency_key: params[8],
        created_at: params[9],
      });
      return { meta: { changes: 1, last_row_id: event_id } };
    }
    if (sql.includes("UPDATE housekeeping_tasks SET")) {
      const task = this.tasks.find((item) => item.task_id === params.at(-2) && item.version === params.at(-1));
      if (!task) return { meta: { changes: 0, last_row_id: 0 } };
      task.status = params[0];
      task.version = Number(task.version) + 1;
      task.updated_at = params[1];
      task.updated_by = params[2];
      task.updated_by_name = params[3];
      if (sql.includes("cancelled_at = ?")) {
        task.cancelled_at = params[4];
        task.cancellation_reason = params[5];
      }
      if (sql.includes("completed_at = ?")) {
        task.completed_at = params[4];
      }
      return { meta: { changes: 1, last_row_id: task.task_id } };
    }
    if (sql.includes("INSERT INTO room_operational_availability")) {
      const existing = this.availability.find((row) => row.unit_id === params[0]);
      const next = {
        unit_id: params[0],
        status: params[1],
        reason: params[2],
        seasonal_start: params[3],
        seasonal_end: params[4],
        updated_by: params[5],
        updated_by_name: params[6],
        created_at: existing?.created_at ?? params[7],
        updated_at: params[8],
      };
      if (existing) Object.assign(existing, next);
      else this.availability.push(next);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT OR IGNORE INTO room_operational_availability_events")) {
      const event_id = this.availabilityEvents.length + 1;
      this.availabilityEvents.push({
        event_id,
        unit_id: params[0],
        event_type: "availability_changed",
        actor_user_id: params[1],
        actor_name: params[2],
        previous_status: params[3],
        new_status: params[4],
        previous_reason: params[5],
        new_reason: params[6],
        previous_seasonal_start: params[7],
        new_seasonal_start: params[8],
        previous_seasonal_end: params[9],
        new_seasonal_end: params[10],
        idempotency_key: params[11],
        created_at: params[12],
      });
      return { meta: { changes: 1, last_row_id: event_id } };
    }
    if (sql.includes("INSERT INTO room_housekeeping_state")) {
      const existing = this.housekeepingState.find((row) => row.unit_id === params[0]);
      const next = {
        unit_id: params[0],
        ready_state: params[1],
        reason: params[2],
        source: params[3],
        updated_by: params[4],
        updated_by_name: params[5],
        created_at: existing?.created_at ?? params[6],
        updated_at: params[7],
      };
      if (existing) Object.assign(existing, next);
      else this.housekeepingState.push(next);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT OR IGNORE INTO room_housekeeping_state_events")) {
      const event_id = this.housekeepingStateEvents.length + 1;
      this.housekeepingStateEvents.push({
        event_id,
        unit_id: params[0],
        event_type: "ready_state_changed",
        actor_user_id: params[1],
        actor_name: params[2],
        previous_ready_state: params[3],
        new_ready_state: params[4],
        previous_reason: params[5],
        new_reason: params[6],
        source: params[7],
        idempotency_key: params[8],
        created_at: params[9],
      });
      return { meta: { changes: 1, last_row_id: event_id } };
    }
    if (sql.includes("INSERT INTO room_notes")) {
      const note_id = this.notes.length + 1;
      this.notes.push({
        note_id,
        unit_id: params[0],
        author_id: params[1],
        author_name: params[2],
        author_role: params[3],
        body: params[4],
        created_at: params[5],
        updated_at: params[6],
      });
      return { meta: { changes: 1, last_row_id: note_id } };
    }
    if (sql.includes("INSERT INTO housekeeping") && sql.includes("'Dirty'")) {
      const housekeeping_id = this.housekeeping.length + 1;
      this.housekeeping.push({
        housekeeping_id,
        unit_id: params[0],
        booking_id: params[1],
        work_date: params[2],
        status: "Dirty",
        assigned_to: null,
        started_at: null,
        completed_at: null,
        notes: null,
        created_at: params[3],
        updated_at: params[4],
        assigned_user_id: null,
        assigned_user_name: null,
        assigned_at: null,
        updated_by: params[5],
        updated_by_name: params[6],
        checklist_json: params[7],
      });
      return { meta: { changes: 1, last_row_id: housekeeping_id } };
    }
    if (sql.includes("INSERT INTO housekeeping")) {
      if (sql.includes("WHERE NOT EXISTS")) {
        const unitId = params.at(-2);
        const workDate = params.at(-1);
        const exists = this.housekeeping.some((row) => row.unit_id === unitId && row.work_date === workDate);
        if (exists) return { meta: { changes: 0, last_row_id: 0 } };
      }
      const housekeeping_id = this.housekeeping.length + 1;
      const literalCleaning = sql.includes("'Cleaning'");
      this.housekeeping.push({
        housekeeping_id,
        unit_id: params[0],
        booking_id: params[1],
        work_date: params[2],
        status: literalCleaning ? "Cleaning" : params[3],
        assigned_to: literalCleaning ? params[3] : params[4],
        started_at: literalCleaning ? params[4] : params[5],
        completed_at: literalCleaning ? null : params[6],
        notes: null,
        created_at: literalCleaning ? params[5] : params[7],
        updated_at: literalCleaning ? params[6] : params[8],
        assigned_user_id: literalCleaning ? params[7] : params[9],
        assigned_user_name: literalCleaning ? params[8] : params[10],
        assigned_at: literalCleaning ? params[9] : params[11],
        updated_by: literalCleaning ? params[10] : params[12],
        updated_by_name: literalCleaning ? params[11] : params[13],
        checklist_json: literalCleaning ? params[12] : params[14],
      });
      return { meta: { changes: 1, last_row_id: housekeeping_id } };
    }
    if (sql.includes("UPDATE housekeeping") && sql.includes("SET checklist_json")) {
      const item = this.housekeeping.find((row) => row.housekeeping_id === params[4]);
      if (item) {
        item.checklist_json = params[0];
        item.updated_by = params[1];
        item.updated_by_name = params[2];
        item.updated_at = params[3];
      }
      return { meta: { changes: item ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE housekeeping") && sql.includes("SET status = 'Dirty'")) {
      const item = this.housekeeping.find((row) => row.housekeeping_id === params[3]);
      if (item) {
        item.status = "Dirty";
        item.assigned_to = null;
        item.assigned_user_id = null;
        item.assigned_user_name = null;
        item.assigned_at = null;
        item.started_at = null;
        item.completed_at = null;
        item.updated_by = params[0];
        item.updated_by_name = params[1];
        item.updated_at = params[2];
      }
      return { meta: { changes: item ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE housekeeping") && sql.includes("SET status = 'Cleaning'")) {
      const item = this.housekeeping.find((row) => row.housekeeping_id === params[9]);
      if (item) {
        item.status = "Cleaning";
        item.assigned_to = params[0];
        item.assigned_user_id = params[1];
        item.assigned_user_name = params[2];
        item.assigned_at = params[3];
        item.started_at = item.started_at ?? params[4];
        item.completed_at = null;
        item.checklist_json = params[5];
        item.updated_by = params[6];
        item.updated_by_name = params[7];
        item.updated_at = params[8];
      }
      return { meta: { changes: item ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE housekeeping")) {
      const item = this.housekeeping.find((row) => row.housekeeping_id === params[11]);
      if (item && sql.includes("? != 'Cleaning'")) {
        const status = String(params[12]);
        const management = Number(params[13]) === 1;
        const actorId = String(params[16]);
        if (status === "Cleaning" && !management && !(item.status === "Dirty" && item.assigned_user_id === null)) {
          return { meta: { changes: 0, last_row_id: 0 } };
        }
        if ((status === "Ready" || status === "Dirty") && !management && item.assigned_user_id !== actorId) {
          return { meta: { changes: 0, last_row_id: 0 } };
        }
      }
      if (item) {
        item.status = params[0];
        item.assigned_to = params[1];
        item.assigned_user_id = params[2];
        item.assigned_user_name = params[3];
        item.assigned_at = params[4];
        item.started_at = params[5];
        item.completed_at = params[6];
        item.checklist_json = params[7];
        item.updated_by = params[8];
        item.updated_by_name = params[9];
        item.updated_at = params[10];
      }
      return { meta: { changes: item ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO maintenance_tickets")) {
      const ticket_id = this.tickets.length + 1;
      this.tickets.push({
        ticket_id,
        title: params[0],
        description: params[1],
        category: params[2],
        priority: params[3],
        status: params[4],
        room_id: params[5],
        accommodation_id: params[6],
        location_area: params[7],
        assignment_type: params[8],
        assigned_user_id: params[9],
        assigned_user_name: params[10],
        external_assignee_label: params[11],
        external_assignee_note: params[12],
        reported_by: params[13],
        reported_by_name: params[14],
        created_at: params[15],
        updated_at: params[16],
        assigned_at: params[17],
        started_at: null,
        resolved_at: null,
        closed_at: null,
        resolved_by: null,
        resolved_by_name: null,
        closed_by: null,
        closed_by_name: null,
        out_of_service: params[18],
        waiting_reason: null,
      });
      return { meta: { changes: 1, last_row_id: ticket_id } };
    }
    if (sql.includes("INSERT INTO maintenance_ticket_events")) {
      const event_id = this.events.length + 1;
      this.events.push({
        event_id,
        ticket_id: params[0],
        event_type: params[1],
        from_value: params[2],
        to_value: params[3],
        actor_id: params[4],
        actor_name: params[5],
        created_at: params[6],
      });
      return { meta: { changes: 1, last_row_id: event_id } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }
}

function env(permissions: Permission[], options?: { authenticated?: boolean; user?: typeof ACTIVE_USER }) {
  return {
    DB: new FakeRoomDB(permissions, options) as unknown as D1Database,
    BEDS24_BASE_URL: "https://api.beds24.com/v2",
    BEDS24_LONG_LIFE_TOKEN: "test",
  };
}

const roomsAccess: Permission = { module_key: "rooms", can_access: 1, can_edit: 0 };
const roomsEdit: Permission = { module_key: "rooms", can_access: 1, can_edit: 1 };
const housekeepingAccess: Permission = { module_key: "housekeeping", can_access: 1, can_edit: 0 };
const housekeepingEdit: Permission = { module_key: "housekeeping", can_access: 1, can_edit: 1 };
const maintenanceEdit: Permission = { module_key: "maintenance", can_access: 1, can_edit: 1 };

async function request(path: string, init: RequestInit, data: ReturnType<typeof env>) {
  return worker.fetch(new Request(`https://local.test${path}`, init), data as never, {} as never);
}

async function json(response: Response) {
  return response.json() as Promise<{ success: boolean; data?: unknown; error?: string }>;
}

test("room workspace accepts only supported room readiness states", () => {
  assert.deepEqual(normalizeRoomHousekeepingInput({ status: "Ready", reason: " Inspected ", idempotencyKey: "ready-1" }), {
    status: "READY",
    reason: "Inspected",
    idempotencyKey: "ready-1",
  });
  assert.deepEqual(normalizeRoomHousekeepingInput({ status: "not ready" }), {
    status: "NOT_READY",
    reason: null,
    idempotencyKey: null,
  });
  assert.throws(() => normalizeRoomHousekeepingInput({ status: "Inspected" }), /Room status is invalid/);
  assert.throws(() => normalizeRoomHousekeepingInput({ status: "Ready", updatedBy: "fake-user" }), /unsupported field/);
  assert.throws(() => normalizeHousekeepingChecklistInput({ itemId: "bathroom", completed: true, author: "fake-user" }), /unsupported field/);
});

test("room workspace accepts only supported operational availability states", () => {
  assert.deepEqual(normalizeRoomOperationalAvailabilityInput({
    status: "not operating",
    reason: " Season Closed ",
    seasonalStart: "06-01",
    seasonalEnd: "11-20",
    idempotencyKey: "availability-1",
  }), {
    status: "NOT_OPERATING",
    reason: "Season Closed",
    seasonalStart: "06-01",
    seasonalEnd: "11-20",
    idempotencyKey: "availability-1",
  });
  assert.deepEqual(normalizeRoomOperationalAvailabilityInput({ status: "Operating" }), {
    status: "OPERATING",
    reason: null,
    seasonalStart: null,
    seasonalEnd: null,
    idempotencyKey: null,
  });
  assert.throws(() => normalizeRoomOperationalAvailabilityInput({ status: "Ready" }), /Operational availability status is invalid/);
  assert.throws(() => normalizeRoomOperationalAvailabilityInput({ status: "Operating", roomStatus: "READY" }), /unsupported field/);
  assert.throws(() => normalizeRoomOperationalAvailabilityInput({ status: "Not Operating", seasonalStart: "13-01" }), /seasonalStart is invalid/);
});

test("room workspace notes must be real operational text", () => {
  assert.deepEqual(normalizeRoomNoteInput({ body: " Guest requested extra towels. " }), {
    body: "Guest requested extra towels.",
  });
  assert.throws(() => normalizeRoomNoteInput({ body: " " }), /Note is required/);
});

test("room housekeeping endpoint supports owner manager ready override only", async () => {
  assert.equal((await request("/api/rooms/1/housekeeping", { method: "PATCH" }, env([], { authenticated: false }))).status, 401);
  assert.equal((await request("/api/rooms/1/housekeeping", { method: "PATCH", headers: { cookie: "vanara_session=x" } }, env([housekeepingEdit]))).status, 403);
  assert.equal((await request("/api/rooms/1/housekeeping", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "NOT_READY" }) }, env([roomsAccess], { user: { ...ACTIVE_USER, role: "Housekeeping" } }))).status, 403);
  assert.equal((await request("/api/rooms/1/housekeeping", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Inspected" }) }, env([roomsAccess], { user: { ...ACTIVE_USER, role: "Owner" } }))).status, 400);
  assert.equal((await request("/api/rooms/999/housekeeping", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "READY" }) }, env([roomsAccess], { user: { ...ACTIVE_USER, role: "Owner" } }))).status, 404);

  const data = env([roomsAccess], { user: { ...ACTIVE_USER, role: "Owner" } });
  const response = await request("/api/rooms/1/housekeeping", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "NOT_READY", reason: "Owner saw sand", idempotencyKey: "room-ready-test-1" }) }, data);
  const responseBody = await json(response);
  assert.equal(response.status, 200, JSON.stringify(responseBody));
  const body = responseBody.data as { housekeeping: { readyState: string; tasks: Array<{ taskType: string }> } };
  assert.equal(body.housekeeping.readyState, "NOT_READY");
  assert.equal(body.housekeeping.tasks.some((task) => task.taskType === "STANDARD_CLEANING"), true);
  assert.equal(data.DB.tasks.length, 1);
  assert.equal(data.DB.tasks.at(-1)?.source, "manual");
  assert.equal(data.DB.tasks.at(-1)?.on_demand_source, "ROOM_READY_OVERRIDE");
  assert.equal(data.DB.taskEvents.filter((event) => event.event_type === "created").length, 1);
  assert.equal(data.DB.taskEvents.filter((event) => event.event_type === "room_ready_override").length, 1);

  const ready = await request("/api/rooms/1/housekeeping", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "READY", reason: "Owner inspected", idempotencyKey: "room-ready-test-2" }) }, data);
  assert.equal(ready.status, 200, await ready.text());
  assert.equal(data.DB.tasks.at(-1)?.status, "CANCELLED");
  assert.equal(data.DB.tasks.at(-1)?.completed_at, null);
  assert.equal(data.DB.taskEvents.some((event) => event.event_type === "cancel" && event.reason === "Owner inspected"), true);
});

test("operational availability endpoint is owner manager only and independent from housekeeping readiness", async () => {
  assert.equal((await request("/api/rooms/1/operational-availability", { method: "PATCH" }, env([], { authenticated: false }))).status, 401);
  assert.equal((await request("/api/rooms/1/operational-availability", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "NOT_OPERATING" }) }, env([roomsAccess], { user: { ...ACTIVE_USER, role: "Housekeeping" } }))).status, 403);
  assert.equal((await request("/api/rooms/1/operational-availability", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "READY" }) }, env([roomsAccess], { user: { ...ACTIVE_USER, role: "Owner" } }))).status, 400);
  assert.equal((await request("/api/rooms/999/operational-availability", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "OPERATING" }) }, env([roomsAccess], { user: { ...ACTIVE_USER, role: "Owner" } }))).status, 404);

  const data = env([roomsAccess], { user: { ...ACTIVE_USER, role: "Owner" } });
  const notOperating = await request("/api/rooms/1/operational-availability", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "NOT_OPERATING", reason: "Season Closed", seasonalStart: "06-01", seasonalEnd: "11-20", idempotencyKey: "availability-test-1" }) }, data);
  const notOperatingBody = await json(notOperating);
  assert.equal(notOperating.status, 200, JSON.stringify(notOperatingBody));
  assert.equal((notOperatingBody.data as { operationalAvailability: { status: string; reason: string; seasonalLabel: string } }).operationalAvailability.status, "NOT_OPERATING");
  assert.equal((notOperatingBody.data as { operationalAvailability: { status: string; reason: string; seasonalLabel: string } }).operationalAvailability.reason, "Season Closed");
  assert.equal((notOperatingBody.data as { operationalAvailability: { status: string; reason: string; seasonalLabel: string } }).operationalAvailability.seasonalLabel, "1 Jun - 20 Nov");
  assert.equal(data.DB.tasks.length, 0);
  assert.equal(data.DB.availabilityEvents.length, 1);

  const notReady = await request("/api/rooms/1/housekeeping", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "NOT_READY", reason: "Physical cleaning required", idempotencyKey: "room-ready-independent-1" }) }, data);
  assert.equal(notReady.status, 200, await notReady.text());
  assert.equal(data.DB.availability[0]?.status, "NOT_OPERATING");
  assert.equal(data.DB.tasks.length, 1);

  const operating = await request("/api/rooms/1/operational-availability", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "OPERATING", idempotencyKey: "availability-test-2" }) }, data);
  const operatingBody = await json(operating);
  assert.equal(operating.status, 200, JSON.stringify(operatingBody));
  assert.equal((operatingBody.data as { operationalAvailability: { status: string }; housekeeping: { readyState: string } }).operationalAvailability.status, "OPERATING");
  assert.equal((operatingBody.data as { operationalAvailability: { status: string }; housekeeping: { readyState: string } }).housekeeping.readyState, "NOT_READY");
  assert.equal(data.DB.tasks.length, 1);
});

test("room workspace ignores legacy housekeeping rows for readiness", async () => {
  const data = env([roomsAccess], { user: { ...ACTIVE_USER, role: "Owner" } });
  data.DB.housekeeping.push({
    housekeeping_id: 99,
    unit_id: UNIT.unit_id,
    status: "Dirty",
    assigned_to: null,
    assigned_user_id: null,
    assigned_user_name: null,
    assigned_at: null,
    updated_at: "2026-07-01T00:00:00.000Z",
  });

  const response = await request("/api/rooms/1", { method: "GET", headers: { cookie: "vanara_session=x" } }, data);
  const body = await json(response);
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal((body.data as { housekeeping: { readyState: string; primaryStatus: string }; roomStatus: string }).housekeeping.readyState, "READY");
  assert.equal((body.data as { housekeeping: { readyState: string; primaryStatus: string }; roomStatus: string }).housekeeping.primaryStatus, "No active Housekeeping");
  assert.notEqual((body.data as { roomStatus: string }).roomStatus, "Dirty");
});

test("room workspace shows baseline physical NOT_READY without creating a Housekeeping task", async () => {
  const data = env([roomsAccess], { user: { ...ACTIVE_USER, role: "Owner" } });
  data.DB.housekeepingState.push({
    unit_id: UNIT.unit_id,
    ready_state: "NOT_READY",
    reason: "Product Owner physical baseline.",
    source: "real_resort_room_baseline",
    updated_at: "2026-08-02T08:15:05.000Z",
  });

  const response = await request("/api/rooms/1", { method: "GET", headers: { cookie: "vanara_session=x" } }, data);
  const body = await json(response);

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal((body.data as { housekeeping: { readyState: string; primaryStatus: string; tasks: unknown[]; notes: string | null }; roomStatus: string }).housekeeping.readyState, "NOT_READY");
  assert.equal((body.data as { housekeeping: { primaryStatus: string } }).housekeeping.primaryStatus, "No active Housekeeping");
  assert.equal((body.data as { housekeeping: { tasks: unknown[] } }).housekeeping.tasks.length, 0);
  assert.equal((body.data as { housekeeping: { notes: string | null } }).housekeeping.notes, "Product Owner physical baseline.");
  assert.equal((body.data as { roomStatus: string }).roomStatus, "Not Ready");
  assert.equal(data.DB.tasks.length, 0);
});

test("room workspace ignores historical baseline task rows and uses physical state instead", async () => {
  const data = env([roomsAccess], { user: { ...ACTIVE_USER, role: "Owner" } });
  data.DB.housekeepingState.push({
    unit_id: UNIT.unit_id,
    ready_state: "NOT_READY",
    reason: "Product Owner physical baseline.",
    source: "real_resort_room_baseline",
    updated_at: "2026-08-02T08:15:05.000Z",
  });
  data.DB.tasks.push({
    task_id: 77,
    task_type: "STANDARD_CLEANING",
    unit_id: UNIT.unit_id,
    booking_id: null,
    stay_id: null,
    operational_date: "2026-08-02",
    due_cycle_date: "2026-08-02",
    status: "AVAILABLE_FOR_CLAIM",
    priority: "NORMAL",
    source: "manual",
    on_demand_source: "ROOM_READY_OVERRIDE",
    idempotency_key: "room-ready-baseline:not-ready:1",
    blocking_reason: null,
    assigned_user_id: null,
    assigned_user_name: null,
    version: 1,
    created_at: "2026-08-02T08:15:05.000Z",
    updated_at: "2026-08-02T08:15:05.000Z",
  });

  const response = await request("/api/rooms/1", { method: "GET", headers: { cookie: "vanara_session=x" } }, data);
  const body = await json(response);

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal((body.data as { housekeeping: { readyState: string; tasks: Array<{ id: number }> } }).housekeeping.readyState, "NOT_READY");
  assert.equal((body.data as { housekeeping: { tasks: Array<{ id: number }> } }).housekeeping.tasks.some((task) => task.id === 77), false);
});

test("room workspace does not infer physical NOT_READY from an active housekeeping task", async () => {
  const data = env([roomsAccess], { user: { ...ACTIVE_USER, role: "Owner" } });
  data.DB.tasks.push({
    task_id: 87,
    task_type: "STANDARD_CLEANING",
    unit_id: UNIT.unit_id,
    booking_id: null,
    stay_id: null,
    operational_date: "2026-08-02",
    due_cycle_date: "2026-08-02",
    status: "AVAILABLE_FOR_CLAIM",
    priority: "NORMAL",
    source: "manual",
    on_demand_source: "ROOM_READY_OVERRIDE",
    idempotency_key: "room-ready:not-ready:runtime",
    blocking_reason: null,
    assigned_user_id: null,
    assigned_user_name: null,
    version: 1,
    created_at: "2026-08-02T08:15:05.000Z",
    updated_at: "2026-08-02T08:15:05.000Z",
  });

  const response = await request("/api/rooms/1", { method: "GET", headers: { cookie: "vanara_session=x" } }, data);
  const body = await json(response);

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal((body.data as { housekeeping: { readyState: string; tasks: Array<{ id: number }> } }).housekeeping.readyState, "READY");
  assert.equal((body.data as { housekeeping: { tasks: Array<{ id: number }> } }).housekeeping.tasks.some((task) => task.id === 87), true);
});

test("starting real cleaning work persists physical NOT_READY instead of relying on inference", async () => {
  const data = env([roomsAccess, housekeepingEdit], { user: { ...ACTIVE_USER, role: "Owner" } });
  data.DB.tasks.push({
    task_id: 89,
    task_type: "STANDARD_CLEANING",
    unit_id: UNIT.unit_id,
    booking_id: null,
    stay_id: null,
    operational_date: "2026-08-02",
    due_cycle_date: "2026-08-02",
    status: "AVAILABLE_FOR_CLAIM",
    priority: "NORMAL",
    source: "manual",
    on_demand_source: "ROOM_READY_OVERRIDE",
    idempotency_key: "room-ready:not-ready:start",
    blocking_reason: null,
    assigned_user_id: null,
    assigned_user_name: null,
    version: 1,
    created_at: "2026-08-02T08:15:05.000Z",
    updated_at: "2026-08-02T08:15:05.000Z",
  });

  const started = await request("/api/housekeeping/v2/tasks/89/start", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "start-cleaning-89" }),
  }, data);

  assert.equal(started.status, 200, await started.text());
  assert.equal(data.DB.tasks.at(-1)?.status, "IN_PROGRESS");
  assert.equal(data.DB.housekeepingState.at(-1)?.ready_state, "NOT_READY");
  assert.equal(data.DB.housekeepingStateEvents.some((event) => event.source === "housekeeping_task_started"), true);
});

test("completing real cleaning work returns the physical room state to READY", async () => {
  const data = env([roomsAccess, housekeepingEdit], { user: { ...ACTIVE_USER, role: "Owner" } });
  data.DB.housekeepingState.push({
    unit_id: UNIT.unit_id,
    ready_state: "NOT_READY",
    reason: "Cleaning in progress.",
    source: "room_workspace_manual_cleaning_request",
    updated_at: "2026-08-02T08:15:05.000Z",
  });
  data.DB.tasks.push({
    task_id: 88,
    task_type: "STANDARD_CLEANING",
    unit_id: UNIT.unit_id,
    booking_id: null,
    stay_id: null,
    operational_date: "2026-08-02",
    due_cycle_date: "2026-08-02",
    status: "IN_PROGRESS",
    priority: "NORMAL",
    source: "manual",
    on_demand_source: "ROOM_READY_OVERRIDE",
    idempotency_key: "room-ready:not-ready:1",
    blocking_reason: null,
    assigned_user_id: ACTIVE_USER.user_id,
    assigned_user_name: ACTIVE_USER.full_name,
    version: 1,
    created_at: "2026-08-02T08:15:05.000Z",
    updated_at: "2026-08-02T08:15:05.000Z",
  });

  const complete = await request("/api/housekeeping/v2/tasks/88/complete", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "complete-cleaning-88" }),
  }, data);
  assert.equal(complete.status, 200, await complete.text());
  assert.equal(data.DB.tasks.at(-1)?.status, "COMPLETED");
  assert.equal(data.DB.housekeepingState.at(-1)?.ready_state, "READY");
  assert.equal(data.DB.housekeepingStateEvents.some((event) => event.source === "housekeeping_task_completed"), true);
});

test("housekeeping workflow endpoint supports quick actions and checklist updates", async () => {
  assert.equal((await request("/api/housekeeping/rooms/1", { method: "PATCH" }, env([], { authenticated: false }))).status, 401);
  assert.equal((await request("/api/housekeeping/rooms/1", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Cleaning" }) }, env([housekeepingAccess]))).status, 403);
  assert.equal((await request("/api/housekeeping/rooms/999", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Cleaning" }) }, env([housekeepingEdit]))).status, 404);
  const data = env([housekeepingEdit]);
  const started = await request("/api/housekeeping/rooms/1", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Cleaning" }) }, data);
  assert.equal(started.status, 200);
  assert.equal(data.DB.housekeeping.at(-1)?.assigned_user_id, ACTIVE_USER.user_id);
  assert.equal(typeof data.DB.housekeeping.at(-1)?.assigned_at, "string");
  const checked = await request("/api/housekeeping/rooms/1/checklist", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ itemId: "bathroom", completed: true }) }, data);
  assert.equal(checked.status, 200);
  assert.match(String(data.DB.housekeeping.at(-1)?.checklist_json), /"bathroom".*"completed":true/);
  const dirty = await request("/api/housekeeping/rooms/1", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Dirty" }) }, data);
  assert.equal(dirty.status, 200);
  assert.equal(data.DB.housekeeping.at(-1)?.assigned_user_id, null);
  assert.equal(data.DB.housekeeping.at(-1)?.assigned_at, null);
});

test("housekeeping assignment control protects staff ownership and conflicts", async () => {
  const data = env([housekeepingEdit], { user: { ...ACTIVE_USER, role: "Housekeeping" } });
  assert.equal((await request("/api/housekeeping/rooms/1", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Cleaning", assignedUserId: OTHER_USER.user_id }) }, data)).status, 400);

  const firstTake = await request("/api/housekeeping/rooms/1", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Cleaning" }) }, data);
  assert.equal(firstTake.status, 200);
  const secondTake = await request("/api/housekeeping/rooms/1", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Cleaning" }) }, data);
  assert.equal(secondTake.status, 409);

  const otherStaff = env([housekeepingEdit], { user: { ...OTHER_USER, role: "Housekeeping" } });
  otherStaff.DB.housekeeping = data.DB.housekeeping;
  assert.equal((await request("/api/housekeeping/rooms/1", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Ready" }) }, otherStaff)).status, 403);
  assert.equal((await request("/api/housekeeping/rooms/1", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Dirty" }) }, otherStaff)).status, 403);

  const ready = await request("/api/housekeeping/rooms/1", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ status: "Ready" }) }, data);
  assert.equal(ready.status, 200);
  assert.equal(data.DB.housekeeping.at(-1)?.status, "Ready");
  assert.equal(data.DB.housekeeping.at(-1)?.assigned_user_id, ACTIVE_USER.user_id);
});

test("management assignment can assign reassign and remove active housekeeping users", async () => {
  assert.equal((await request("/api/housekeeping/assignable-users", { method: "GET" }, env([], { authenticated: false }))).status, 401);
  assert.equal((await request("/api/housekeeping/assignable-users", {
    method: "GET",
    headers: { cookie: "vanara_session=x" },
  }, env([housekeepingEdit], { user: { ...ACTIVE_USER, role: "Housekeeping" } }))).status, 403);
  const assignable = await request("/api/housekeeping/assignable-users", {
    method: "GET",
    headers: { cookie: "vanara_session=x" },
  }, env([housekeepingEdit]));
  assert.equal(assignable.status, 200);
  assert.deepEqual((await json(assignable)).data, [
    { id: ACTIVE_USER.user_id, displayName: ACTIVE_USER.full_name },
    { id: OTHER_USER.user_id, displayName: OTHER_USER.full_name },
  ]);

  const staffAttempt = await request("/api/housekeeping/rooms/1/assignment", {
    method: "PATCH",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ assignedUserId: OTHER_USER.user_id }),
  }, env([housekeepingEdit], { user: { ...ACTIVE_USER, role: "Housekeeping" } }));
  assert.equal(staffAttempt.status, 403);

  const data = env([housekeepingEdit]);
  assert.equal((await request("/api/housekeeping/rooms/1/assignment", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ assignedUserId: OTHER_USER.user_id, assignedAt: "fake" }) }, data)).status, 400);
  assert.equal((await request("/api/housekeeping/rooms/1/assignment", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ assignedUserId: "missing-user" }) }, data)).status, 400);
  assert.equal((await request("/api/housekeeping/rooms/1/assignment", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ assignedUserId: DISABLED_USER.user_id }) }, data)).status, 400);

  const assigned = await request("/api/housekeeping/rooms/1/assignment", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ assignedUserId: OTHER_USER.user_id }) }, data);
  assert.equal(assigned.status, 200);
  assert.equal(data.DB.housekeeping.at(-1)?.assigned_user_id, OTHER_USER.user_id);
  const reassigned = await request("/api/housekeeping/rooms/1/assignment", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ assignedUserId: ACTIVE_USER.user_id }) }, data);
  assert.equal(reassigned.status, 200);
  assert.equal(data.DB.housekeeping.at(-1)?.assigned_user_id, ACTIVE_USER.user_id);
  assert.notEqual(data.DB.housekeeping.at(-1)?.assigned_at, null);
  assert.equal(typeof data.DB.housekeeping.at(-1)?.assigned_at, "string");

  const removed = await request("/api/housekeeping/rooms/1/assignment", { method: "PATCH", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ assignedUserId: null }) }, data);
  assert.equal(removed.status, 200);
  assert.equal(data.DB.housekeeping.at(-1)?.status, "Dirty");
  assert.equal(data.DB.housekeeping.at(-1)?.assigned_user_id, null);
});

test("room notes endpoint enforces direct API authorization and persists server-derived author data", async () => {
  assert.equal((await request("/api/rooms/1/notes", { method: "POST" }, env([], { authenticated: false }))).status, 401);
  assert.equal((await request("/api/rooms/1/notes", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ body: "Note" }) }, env([]))).status, 403);
  assert.equal((await request("/api/rooms/1/notes", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ body: "Note" }) }, env([roomsAccess]))).status, 403);
  assert.equal((await request("/api/rooms/1/notes", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ body: " " }) }, env([roomsEdit]))).status, 400);
  assert.equal((await request("/api/rooms/999/notes", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ body: "Note" }) }, env([roomsEdit]))).status, 404);
  const response = await request("/api/rooms/1/notes", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ body: "  Real room note  " }) }, env([roomsEdit]));
  const body = await json(response);
  assert.equal(response.status, 201);
  assert.equal((body.data as { body: string; authorName: string }).body, "Real room note");
  assert.equal((body.data as { body: string; authorName: string }).authorName, ACTIVE_USER.full_name);
});

test("room maintenance endpoint requires room access and creates a ticket through maintenance persistence", async () => {
  assert.equal((await request("/api/rooms/1/maintenance/tickets", { method: "POST" }, env([], { authenticated: false }))).status, 401);
  assert.equal((await request("/api/rooms/1/maintenance/tickets", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ title: "Leak", description: "Sink", category: "Water", priority: "High" }) }, env([maintenanceEdit]))).status, 403);
  assert.equal((await request("/api/rooms/1/maintenance/tickets", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ title: "Leak", description: "Sink", priority: "Critical" }) }, env([roomsAccess]))).status, 400);
  assert.equal((await request("/api/rooms/999/maintenance/tickets", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ title: "Leak", description: "Sink", priority: "High" }) }, env([roomsAccess]))).status, 404);
  const data = env([roomsAccess]);
  const response = await request("/api/rooms/1/maintenance/tickets", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ title: "Leak", description: "Sink cabinet leak", priority: "High", outOfService: true }) }, data);
  const body = await json(response);
  assert.equal(response.status, 201);
  assert.equal((body.data as { roomId: number; accommodationId: number; reportedByName: string; outOfService: boolean }).roomId, UNIT.unit_id);
  assert.equal((body.data as { roomId: number; accommodationId: number; reportedByName: string; outOfService: boolean }).accommodationId, UNIT.room_type_id);
  assert.equal((body.data as { roomId: number; accommodationId: number; reportedByName: string; outOfService: boolean }).reportedByName, ACTIVE_USER.full_name);
  assert.equal((body.data as { roomId: number; accommodationId: number; reportedByName: string; outOfService: boolean }).outOfService, true);
  const ticketId = (body.data as { id: number }).id;
  const db = data.DB as unknown as FakeRoomDB;
  assert.equal(db.tickets.length, 1);
  const auditCount = db.events.length;

  const replay = await request("/api/rooms/1/maintenance/tickets", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ title: "Leak", description: "Sink cabinet leak", priority: "High", outOfService: true }) }, data);
  const replayBody = await json(replay);
  assert.equal(replay.status, 201);
  assert.equal((replayBody.data as { id: number }).id, ticketId);
  assert.equal(db.tickets.length, 1);
  assert.equal(db.events.length, auditCount);
});

test("maintenance target model enforces Room or Other and Other never affects Room Workspace", async () => {
  assert.equal((await request("/api/maintenance/tickets", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ title: "Loose handle", description: "Door handle", priority: "Low" }) }, env([maintenanceEdit]))).status, 400);
  assert.equal((await request("/api/maintenance/tickets", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ targetType: "ROOM", title: "Loose handle", description: "Door handle", priority: "Low" }) }, env([maintenanceEdit]))).status, 400);
  assert.equal((await request("/api/maintenance/tickets", { method: "POST", headers: { cookie: "vanara_session=x", "content-type": "application/json" }, body: JSON.stringify({ targetType: "OTHER", title: "Loose handle", description: "Door handle", priority: "Low" }) }, env([maintenanceEdit]))).status, 400);

  const data = env([maintenanceEdit, roomsAccess]);
  const created = await request("/api/maintenance/tickets", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ targetType: "OTHER", title: "Restaurant fan", description: "Fan vibration", priority: "High", locationArea: "Restaurant", outOfService: true }),
  }, data);
  const body = await json(created);
  assert.equal(created.status, 201);
  assert.equal((body.data as { targetType: string; roomId: number | null; locationArea: string; outOfService: boolean }).targetType, "OTHER");
  assert.equal((body.data as { targetType: string; roomId: number | null; locationArea: string; outOfService: boolean }).roomId, null);
  assert.equal((body.data as { targetType: string; roomId: number | null; locationArea: string; outOfService: boolean }).locationArea, "Restaurant");
  assert.equal((body.data as { targetType: string; roomId: number | null; locationArea: string; outOfService: boolean }).outOfService, true);

  const room = await request("/api/rooms/1", { method: "GET", headers: { cookie: "vanara_session=x" } }, data);
  const roomBody = await json(room);
  assert.equal(room.status, 200);
  assert.equal((roomBody.data as { maintenance: { openIssues: number; outOfService: boolean } }).maintenance.openIssues, 0);
  assert.equal((roomBody.data as { maintenance: { openIssues: number; outOfService: boolean } }).maintenance.outOfService, false);
});
