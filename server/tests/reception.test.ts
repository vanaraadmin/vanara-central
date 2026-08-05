import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import {
  normalizeCompleteReceptionCheckInInput,
  normalizeCompleteReceptionCheckOutInput,
  normalizeReceptionCheckInInput,
  normalizeReceptionCheckOutInput,
  normalizeReceptionNotesInput,
} from "../src/services/reception.service.ts";
import { extractPassportData, extractPassportReview, PassportOcrError } from "../src/services/passport-ocr.service.ts";
import { createBookingPassport, listBookingPassports } from "../src/services/booking-passports.service.ts";
import { countryCodeFrom, countryFlagUrlFrom } from "../src/services/country-flags.service.ts";
import { getBangkokDate } from "../src/services/today.service.ts";
import type { ModuleKey } from "../src/services/current-user.service.ts";
import type { HousekeepingTaskPriority, HousekeepingTaskSource, HousekeepingTaskStatus, HousekeepingTaskType } from "../src/services/housekeeping-task-domain.service.ts";

type Permission = { module_key: ModuleKey; can_access: number; can_edit: number };
type ActionPermission = { action_key: "can_complete_checkin_checkout"; allowed: number };
type PassportOcrPayload = {
  success: boolean;
  objectKey?: string;
  passport?: {
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    passportNumber: string | null;
    nationality: string | null;
    gender: string | null;
    birthDate: string | null;
  };
  timing?: { model: string; pass1Ms: number; pass2Ms: number; consensusMs: number; totalMs: number };
  error?: { code: string; message: string };
};
type PassportClassificationPayload = {
  success: boolean;
  classification?: {
    isPassport: boolean;
    isPassportBiodataPage: boolean;
    passportConfidence: number;
    passportComplete: boolean;
    mrzVisible: boolean;
    excessiveGlare: boolean;
    unreadableBlur: boolean;
    unreadableDarkness: boolean;
    recommendation: string;
  };
  decision?: { ready: boolean; code: string; messageKey: string; message: string };
  timing?: { model: string; classificationMs: number };
  error?: { code: string; message: string };
};

const ACTIVE_RECEPTION_USER = {
  user_id: "reception-1",
  full_name: "Nok Reception",
  profile_photo_url: null,
  role: "Reception",
  preferred_language: "en",
  username: "nok",
  email: null,
  password_hash: "not-returned",
  status: "active",
  created_at: "2026-07-30T00:00:00.000Z",
  updated_at: "2026-07-30T00:00:00.000Z",
  last_login_at: null,
};

const TODAY = getBangkokDate();
const YESTERDAY = addDateOnlyDays(TODAY, -1);
const TOMORROW = addDateOnlyDays(TODAY, 1);

function addDateOnlyDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

const BOOKING = {
  booking_id: 501,
  beds24_booking_id: 9001,
  guest_name: "Mali Guest",
  unit_id: 1,
  unit_name: "Villa 10",
  room_type_id: 11,
  room_type_name: "Garden Villa",
  adults: 2,
  children: 1,
  arrival_date: TODAY,
  departure_date: TOMORROW,
  channel: "Beds24",
  api_source: "Beds24",
  api_reference: "B24-9001",
  email: "guest@example.com",
  phone: "+66 81 234 5678",
  mobile: null,
  country: "Thailand",
  country_code: "TH",
  status: "Confirmed",
};
type TestBooking = typeof BOOKING;
type HousekeepingTaskRow = {
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
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeReceptionDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

class FakeReceptionDB {
  stays = new Map<number, Record<string, unknown>>();
  notes: Array<Record<string, unknown>> = [];
  events: Array<Record<string, unknown>> = [];
  alerts: Array<Record<string, unknown>> = [];
  passports: Array<Record<string, unknown>> = [];
  housekeepingTasks: HousekeepingTaskRow[] = [];
  housekeepingEvents: Array<{ task_id: number; event_type: string; idempotency_key: string | null }> = [];
  nextHousekeepingTaskId = 1;
  failPassportInsert = false;

  constructor(
    private permissions: Permission[],
    private authenticated = true,
    private actionPermissions: ActionPermission[] = [],
    private bookingInput: TestBooking | TestBooking[] = BOOKING,
    private views: string[] = ["staff"],
  ) {}

  private get bookings() {
    return Array.isArray(this.bookingInput) ? this.bookingInput : [this.bookingInput];
  }

  private get booking() {
    return this.bookings[0] ?? BOOKING;
  }

  private operationalBookings() {
    return this.bookings.filter((booking) => ["confirmed", "new"].includes(booking.status.trim().toLowerCase()));
  }

  prepare(sql: string) { return new FakeStmt(this, sql); }
  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(stmts.map((stmt) => stmt.run()));
  }

  async all<T>(sql: string, _params: unknown[]) {
    void _params;
    if (sql.includes("SELECT view_key FROM user_views")) return { results: this.views.map((view_key) => ({ view_key })) as T[] };
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) return { results: this.permissions as T[] };
    if (sql.includes("SELECT action_key, allowed FROM user_action_permissions")) return { results: this.actionPermissions as T[] };
    if (sql.includes("COALESCE(roa.status, 'OPERATING') AS operational_availability_status")) {
      return {
        results: this.bookings.map((booking) => ({
          unit_id: booking.unit_id,
          unit_name: booking.unit_name,
          unit_type: booking.room_type_name.toLowerCase().includes("villa") ? "villa" : "other",
          room_type_name: booking.room_type_name,
          room_name: booking.room_type_name,
          operational_availability_status: "OPERATING",
        })) as T[],
      };
    }
    if (sql.includes("FROM bookings b") && sql.includes("JOIN units u ON u.unit_id = b.unit_id") && sql.includes("rs.guest_arrived")) {
      return {
        results: this.operationalBookings().map((booking) => {
          const stay = this.stays.get(booking.beds24_booking_id);
          return {
            booking_id: booking.booking_id,
            beds24_booking_id: booking.beds24_booking_id,
            unit_id: booking.unit_id,
            guest_name: booking.guest_name,
            arrival_date: booking.arrival_date,
            departure_date: booking.departure_date,
            arrival_time: null,
            channel: booking.channel,
            api_source: booking.api_source,
            status: booking.status,
            guest_arrived: stay?.guest_arrived ?? 0,
            room_released: stay?.room_released ?? 0,
          };
        }) as T[],
      };
    }
    if (sql.includes("FROM housekeeping_tasks ht") && sql.includes("rs.room_released = 1")) {
      const rows = this.housekeepingTasks
        .filter((task) => task.task_type === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION" && task.operational_date === _params[0])
        .filter((task) => this.operationalBookings().some((booking) => {
          const stay = this.stays.get(booking.beds24_booking_id);
          return stay?.room_released === 1 && (task.booking_id === booking.booking_id || task.stay_id === booking.beds24_booking_id);
        }))
        .map((task) => ({ task_id: task.task_id, version: task.version }));
      return { results: rows as T[] };
    }
    if (sql.includes("WITH latest_housekeeping")) {
      return {
        results: [{
          unit_id: this.booking.unit_id,
          unit_name: this.booking.unit_name,
          housekeeping_id: null,
          housekeeping_status: null,
          assigned_to: null,
          assigned_user_id: null,
          assigned_user_name: null,
          assigned_at: null,
          updated_at: null,
          updated_by: null,
          updated_by_name: null,
          checklist_json: null,
          has_today_arrival: 1,
          has_current_occupancy: 0,
          has_scheduled_checkout_today: 0,
        }] as T[],
      };
    }
    if (sql.includes("FROM housekeeping_tasks ht")) return { results: [] as T[] };
    if (sql.includes("FROM housekeeping_tasks")) {
      const rows = sql.includes("WHERE unit_id = ?")
        ? this.housekeepingTasks.filter((task) => task.unit_id === Number(_params[0]))
        : this.housekeepingTasks;
      return { results: [...rows] as T[] };
    }
    if (sql.includes("FROM housekeeping_room_counters")) return { results: [] as T[] };
    if (sql.includes("FROM bookings b") && sql.includes("ORDER BY u.position")) {
      return { results: this.operationalBookings() as T[] };
    }
    if (sql.includes("FROM reception_guest_notes")) return { results: [...this.notes].reverse() as T[] };
    if (sql.includes("FROM reception_events")) return { results: [...this.events].reverse() as T[] };
    if (sql.includes("FROM reception_room_alerts")) return { results: this.alerts.filter((alert) => alert.status === "active") as T[] };
    if (sql.includes("FROM booking_passports")) {
      const bookingId = Number(_params[0]);
      const source = _params.length > 1 ? _params[1] : undefined;
      return { results: this.passports.filter((passport) => (
        passport.booking_id === bookingId
        && (source === undefined || passport.source === source)
      )) as T[] };
    }
    if (sql.includes("FROM maintenance_tickets") && sql.includes("WHERE room_id =")) return { results: [] as T[] };
    if (sql.includes("FROM maintenance_tickets") && sql.includes("GROUP BY room_id")) return { results: [] as T[] };
    if (sql.includes("FROM housekeeping_task_checklist_items")) return { results: [] as T[] };
    if (sql.includes("FROM housekeeping_task_events")) {
      return { results: this.housekeepingEvents.map((event, index) => ({
        event_id: index + 1,
        task_id: event.task_id,
        event_type: event.event_type,
        actor_name: ACTIVE_RECEPTION_USER.full_name,
        previous_status: null,
        new_status: "AVAILABLE_FOR_CLAIM",
        reason: null,
        created_at: "2026-08-01T00:00:00.000Z",
      })) as T[] };
    }
    if (sql.includes("FROM housekeeping_water_quantity_config")) {
      return { results: [{ room_type: "Garden Villa", default_bottles: 4 }] as T[] };
    }
    return { results: [] as T[] };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT s.session_id")) {
      if (!this.authenticated) return null;
      return {
        session_id: "session-1",
        expires_at: "2999-01-01T00:00:00.000Z",
        ...ACTIVE_RECEPTION_USER,
      } as T;
    }
    if (sql.includes("SELECT beds24_booking_id") && sql.includes("FROM bookings") && sql.includes("WHERE beds24_booking_id")) {
      const booking = this.operationalBookings().find((item) => item.beds24_booking_id === Number(params[0]));
      return booking ? { beds24_booking_id: booking.beds24_booking_id } as T : null;
    }
    if (sql.includes("SELECT * FROM reception_stays WHERE beds24_booking_id")) {
      return (this.stays.get(Number(params[0])) ?? null) as T | null;
    }
    if (sql.includes("FROM housekeeping_tasks WHERE idempotency_key")) {
      return (this.housekeepingTasks.find((task) => task.idempotency_key === params[0]) as T) ?? null;
    }
    if (sql.includes("FROM housekeeping_task_events WHERE task_id")) {
      const taskId = Number(params[0]);
      const idempotencyKey = params[1] as string | null;
      const event = this.housekeepingEvents.find((item) => item.task_id === taskId && item.idempotency_key === idempotencyKey);
      return event ? ({ task_id: taskId } as T) : null;
    }
    if (sql.includes("FROM housekeeping_tasks WHERE task_id")) {
      return (this.housekeepingTasks.find((task) => task.task_id === Number(params[0])) as T) ?? null;
    }
    if (sql.includes("FROM housekeeping_tasks") && sql.includes("task_type = 'TURNOVER'")) {
      const unitId = Number(params[0]);
      const operationalDate = String(params[1]);
      const bookingId = Number(params[2]);
      const stayId = Number(params[3]);
      const row = this.housekeepingTasks
        .filter((task) => task.task_type === "TURNOVER" && task.unit_id === unitId && task.operational_date === operationalDate && (task.booking_id === bookingId || task.stay_id === stayId))
        .sort((left, right) => housekeepingStatusOrder(left.status) - housekeepingStatusOrder(right.status) || left.task_id - right.task_id)[0] ?? null;
      return row as T | null;
    }
    if (sql.includes("SELECT rs.room_released")) {
      const booking = this.operationalBookings().find((item) => item.booking_id === Number(params[0]));
      const stay = booking ? this.stays.get(booking.beds24_booking_id) : null;
      return stay ? ({ room_released: stay.room_released } as T) : null;
    }
    if (sql.includes("FROM housekeeping_room_counters")) return null;
    if (sql.includes("FROM bookings b") && sql.includes("WHERE b.beds24_booking_id")) {
      return (this.operationalBookings().find((item) => item.beds24_booking_id === Number(params[0])) ?? null) as T | null;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO reception_stays")) {
      const bookingId = Number(params[0]);
      this.stays.set(bookingId, {
        beds24_booking_id: bookingId,
        guest_arrived: 0,
        passport_collected: 0,
        deposit_collected: 0,
        welcome_completed: 0,
        keys_delivered: 0,
        guest_left: 0,
        keys_returned: 0,
        deposit_returned: 0,
        room_released: 0,
        special_notes: null,
        created_at: params[1],
        updated_at: params[2],
      });
      return { meta: { changes: 1, last_row_id: 1 } };
    }
    if (sql.includes("SET guest_arrived = 1, passport_collected")) {
      const row = this.stays.get(Number(params[3]));
      if (row) {
        row.guest_arrived = 1;
        row.passport_collected = params[0];
        row.deposit_collected = params[1];
        row.welcome_completed = 1;
        row.keys_delivered = 1;
        row.updated_at = params[2];
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE reception_stays SET guest_arrived = 1")) {
      const row = this.stays.get(Number(params[1]));
      if (row) {
        row.guest_arrived = 1;
        row.updated_at = params[0];
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE reception_stays SET guest_arrived")) {
      const row = this.stays.get(Number(params[2]));
      if (row) {
        row.guest_arrived = params[0];
        row.updated_at = params[1];
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE reception_stays SET passport_collected = 1")) {
      const row = this.stays.get(Number(params[1]));
      if (row) {
        row.passport_collected = 1;
        row.updated_at = params[0];
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE reception_stays SET deposit_collected = 1")) {
      const row = this.stays.get(Number(params[1]));
      if (row) {
        row.deposit_collected = 1;
        row.updated_at = params[0];
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("SET guest_left = 1, keys_returned = 1")) {
      const row = this.stays.get(Number(params[2]));
      if (row) {
        row.guest_left = 1;
        row.keys_returned = 1;
        row.deposit_returned = params[0];
        row.room_released = 1;
        row.updated_at = params[1];
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE reception_stays SET guest_left = 1, room_released = 1")) {
      const row = this.stays.get(Number(params[1]));
      if (row) {
        row.guest_left = 1;
        row.room_released = 1;
        row.updated_at = params[0];
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE reception_stays SET guest_left")) {
      const row = this.stays.get(Number(params[2]));
      if (row) {
        row.guest_left = params[0];
        row.updated_at = params[1];
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE reception_stays SET special_notes")) {
      const row = this.stays.get(Number(params[2]));
      if (row) {
        row.special_notes = params[0];
        row.updated_at = params[1];
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO reception_guest_notes")) {
      const note_id = this.notes.length + 1;
      this.notes.push({
        note_id,
        beds24_booking_id: params[0],
        author_id: params[1],
        author_name: params[2],
        author_role: params[3],
        body: params[4],
        created_at: params[5],
      });
      return { meta: { changes: 1, last_row_id: note_id } };
    }
    if (sql.includes("INSERT INTO reception_events")) {
      const event_id = this.events.length + 1;
      this.events.push({
        event_id,
        beds24_booking_id: params[0],
        action: params[1],
        from_value: params[2],
        to_value: params[3],
        actor_id: params[4],
        actor_name: params[5],
        created_at: params[6],
      });
      return { meta: { changes: 1, last_row_id: event_id } };
    }
    if (sql.includes("INSERT INTO housekeeping_tasks")) {
      const existing = this.housekeepingTasks.find((task) => task.idempotency_key === params[10]);
      if (existing) throw new Error("UNIQUE constraint failed: housekeeping_tasks.idempotency_key");
      const task = housekeepingTaskFromParams(params, this.nextHousekeepingTaskId++);
      this.housekeepingTasks.push(task);
      return { meta: { changes: 1, last_row_id: task.task_id } };
    }
    if (sql.includes("UPDATE housekeeping_tasks SET")) {
      const taskId = Number(params.at(-2));
      const expectedVersion = Number(params.at(-1));
      const task = this.housekeepingTasks.find((item) => item.task_id === taskId && item.version === expectedVersion);
      if (!task) return { meta: { changes: 0, last_row_id: 0 } };
      task.status = params[0] as HousekeepingTaskStatus;
      task.updated_at = String(params[1]);
      task.version += 1;
      return { meta: { changes: 1, last_row_id: taskId } };
    }
    if (sql.includes("INSERT OR IGNORE INTO housekeeping_task_events")) {
      const taskId = Number(params[0]);
      const idempotencyKey = params[8] as string | null;
      if (idempotencyKey && this.housekeepingEvents.some((event) => event.task_id === taskId && event.idempotency_key === idempotencyKey)) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      this.housekeepingEvents.push({ task_id: taskId, event_type: String(params[1]), idempotency_key: idempotencyKey });
      return { meta: { changes: 1, last_row_id: this.housekeepingEvents.length } };
    }
    if (sql.includes("INSERT OR IGNORE INTO housekeeping_task_checklist_items")) {
      return { meta: { changes: 1, last_row_id: 1 } };
    }
    if (sql.includes("INSERT INTO housekeeping_room_counters") || sql.includes("UPDATE housekeeping_room_counters SET")) {
      return { meta: { changes: 1, last_row_id: 1 } };
    }
    if (sql.includes("INSERT INTO reception_room_alerts")) {
      const existing = this.alerts.find((alert) => alert.beds24_booking_id === params[0] && alert.alert_type === params[2]);
      if (existing) {
        existing.unit_id = params[1];
        existing.title = params[3];
        existing.status = "active";
        existing.resolved_by = null;
        existing.resolved_by_name = null;
        existing.resolved_at = null;
        existing.updated_at = params[7];
      } else {
        this.alerts.push({
          alert_id: this.alerts.length + 1,
          beds24_booking_id: params[0],
          unit_id: params[1],
          alert_type: params[2],
          title: params[3],
          status: "active",
          created_by: params[4],
          created_by_name: params[5],
          created_at: params[6],
          updated_at: params[7],
        });
      }
      return { meta: { changes: 1, last_row_id: this.alerts.length } };
    }
    if (sql.includes("INSERT INTO booking_passports")) {
      if (this.failPassportInsert) throw new Error("D1 unavailable");
      const id = this.passports.length + 1;
      this.passports.push({
        id,
        booking_id: params[0],
        object_key: params[1],
        source: params[2],
        first_name: params[3],
        middle_name: params[4],
        last_name: params[5],
        passport_number: params[6],
        nationality: params[7],
        gender: params[8],
        birth_date: params[9],
        expiry_date: params[10],
        document_type: params[11],
        issuing_country: params[12],
        mrz_line_1: params[13],
        mrz_line_2: params[14],
        mrz_validation_json: params[15],
        field_verification_json: params[16],
        manual_corrections_json: params[17],
        quality_gate_json: params[18],
        tm30_status: params[21],
        created_at: params[25],
      });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (sql.includes("UPDATE reception_room_alerts")) {
      const alert = this.alerts.find((item) => item.beds24_booking_id === params[4] && item.alert_type === params[5] && item.status === "active");
      if (alert) {
        alert.status = "resolved";
        alert.resolved_by = params[0];
        alert.resolved_by_name = params[1];
        alert.resolved_at = params[2];
        alert.updated_at = params[3];
      }
      return { meta: { changes: alert ? 1 : 0, last_row_id: 0 } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }
}

function housekeepingStatusOrder(status: HousekeepingTaskStatus): number {
  if (status === "WAITING_FOR_RECEPTION") return 0;
  if (!["COMPLETED", "SKIPPED", "CANCELLED"].includes(status)) return 1;
  return 2;
}

function housekeepingTaskFromParams(params: unknown[], taskId: number): HousekeepingTaskRow {
  return {
    task_id: taskId,
    task_type: params[0] as HousekeepingTaskType,
    unit_id: Number(params[1]),
    booking_id: params[2] as number | null,
    stay_id: params[3] as number | null,
    operational_date: String(params[4]),
    due_cycle_date: params[5] as string | null,
    status: params[6] as HousekeepingTaskStatus,
    priority: params[7] as HousekeepingTaskPriority,
    source: params[8] as HousekeepingTaskSource,
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

function storedHousekeepingTask(overrides: Partial<HousekeepingTaskRow>): HousekeepingTaskRow {
  return {
    task_id: 500,
    task_type: "TURNOVER",
    unit_id: 1,
    booking_id: 501,
    stay_id: 9001,
    operational_date: TODAY,
    due_cycle_date: TODAY,
    status: "WAITING_FOR_RECEPTION",
    priority: "URGENT",
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
    idempotency_key: "housekeeping:v2:turnover:1:9001:stored",
    version: 1,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

class FakePassportR2 {
  objects = new Map<string, { body: R2PutValue; options?: R2PutOptions }>();
  constructor(private failPut = false, private failDelete = false) {}

  async put(key: string, body: R2PutValue, options?: R2PutOptions) {
    if (this.failPut) throw new Error("R2 unavailable");
    this.objects.set(key, { body, options });
    return { key } as R2Object;
  }

  async get() {
    return null;
  }

  async delete(key: string) {
    if (this.failDelete) throw new Error("R2 delete unavailable");
    this.objects.delete(key);
    return undefined;
  }

  async head() {
    return null;
  }
}

function env(permissions: Permission[], authenticated = true, actionPermissions: ActionPermission[] = [], booking: TestBooking | TestBooking[] = BOOKING, r2 = new FakePassportR2(), views: string[] = ["staff"]) {
  return {
    DB: new FakeReceptionDB(permissions, authenticated, actionPermissions, booking, views) as unknown as D1Database,
    R2_STORAGE: r2 as unknown as R2Bucket,
    OPENAI_API_KEY: "test-openai-key",
    BEDS24_BASE_URL: "https://api.beds24.com/v2",
    BEDS24_LONG_LIFE_TOKEN: "test",
  };
}

async function request(path: string, init: RequestInit, data: ReturnType<typeof env>) {
  return worker.fetch(new Request(`https://local.test${path}`, init), data as never, {} as never);
}

async function json(response: Response) {
  return response.json() as Promise<{ success: boolean; data?: unknown; error?: string }>;
}

const movementsAccess: Permission = { module_key: "movements", can_access: 1, can_edit: 0 };
const movementsEdit: Permission = { module_key: "movements", can_access: 1, can_edit: 1 };
const housekeepingAccess: Permission = { module_key: "housekeeping", can_access: 1, can_edit: 0 };

test("country flags normalize Beds24 country codes to image URLs", () => {
  assert.equal(countryCodeFrom("BE"), "BE");
  assert.equal(countryFlagUrlFrom("BE"), "https://flagcdn.com/24x18/be.png");
  assert.equal(countryCodeFrom("fi"), "FI");
  assert.equal(countryFlagUrlFrom("fi"), "https://flagcdn.com/24x18/fi.png");
  assert.equal(countryCodeFrom("Belgium"), "BE");
  assert.equal(countryFlagUrlFrom("Finland"), "https://flagcdn.com/24x18/fi.png");
  assert.equal(countryFlagUrlFrom("not-a-country"), null);
});

test("reception DTO normalizers accept only server-owned workflow fields", () => {
  assert.deepEqual(normalizeReceptionCheckInInput({ field: "guestArrived", completed: true }), {
    field: "guestArrived",
    completed: true,
  });
  assert.deepEqual(normalizeReceptionCheckOutInput({ field: "guestLeft", completed: true }), {
    field: "guestLeft",
    completed: true,
  });
  assert.deepEqual(normalizeReceptionNotesInput({ body: "  Guest prefers quiet check-in.  " }), {
    body: "Guest prefers quiet check-in.",
    specialNotes: undefined,
  });
  assert.deepEqual(normalizeCompleteReceptionCheckInInput({}), { passportRegistrationCompleted: false, depositCollected: false });
  assert.deepEqual(normalizeCompleteReceptionCheckOutInput({ roomInspected: true, keysReturned: true, depositReturned: true }), {
    roomInspected: true,
    keysReturned: true,
    depositReturned: true,
  });
  assert.throws(() => normalizeReceptionCheckInInput({ field: "roomReady", completed: true }), /Check-in field is invalid/);
  assert.throws(() => normalizeReceptionCheckOutInput({ field: "keysReturned", completed: "yes" }), /completed is required/);
  assert.throws(() => normalizeReceptionNotesInput({ body: " ", authorId: "fake" }), /unsupported field/);
  assert.throws(() => normalizeCompleteReceptionCheckOutInput({ roomInspected: true, keysReturned: true, actor: "fake" }), /unsupported field/);
});

test("reception endpoints enforce authentication while Staff can open the operational workspace", async () => {
  assert.equal((await request("/api/reception", { method: "GET" }, env([], false))).status, 401);
  assert.equal((await request("/api/reception", { method: "GET", headers: { cookie: "vanara_session=x" } }, env([]))).status, 200);

  const overview = await request("/api/reception", { method: "GET", headers: { cookie: "vanara_session=x" } }, env([movementsAccess]));
  assert.equal(overview.status, 200);
  const overviewPayload = (await json(overview)).data as { arrivals: Array<{ email: string | null; phone: string | null; nationality: string | null; nationalityFlag: string | null; nationalityFlagUrl: string | null }>; summary: { arrivals: number } };
  assert.equal(overviewPayload.summary.arrivals, 1);
  assert.equal(overviewPayload.arrivals[0]?.email, "guest@example.com");
  assert.equal(overviewPayload.arrivals[0]?.phone, "+66 81 234 5678");
  assert.equal(overviewPayload.arrivals[0]?.nationality, "Thailand");
  assert.equal(overviewPayload.arrivals[0]?.nationalityFlag, "🇹🇭");
  assert.equal(overviewPayload.arrivals[0]?.nationalityFlagUrl, "https://flagcdn.com/24x18/th.png");

  assert.equal((await request("/api/reception/stays/9001/check-in", {
    method: "PATCH",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ field: "guestArrived", completed: true }),
  }, env([movementsAccess]))).status, 403);
});

test("reception overview excludes every cancelled group room while unrelated active bookings remain", async () => {
  const cancelledGroup = [88628736, 88628737, 88628738, 88628739, 88628740].map((bookingId, index) => ({
    ...BOOKING,
    booking_id: 800 + index,
    beds24_booking_id: bookingId,
    guest_name: "Cristiana Colac",
    unit_id: index + 1,
    unit_name: `Bungalow ${index + 1}`,
    arrival_date: "2026-12-27",
    departure_date: "2027-01-02",
    api_reference: `B24-${bookingId}`,
    status: "Cancelled",
  }));
  const activeUnrelated = {
    ...BOOKING,
    booking_id: 900,
    beds24_booking_id: 99000001,
    guest_name: "Active Guest",
    unit_id: 20,
    unit_name: "Villa 20",
    arrival_date: "2026-12-27",
    departure_date: "2027-01-02",
    api_reference: "B24-99000001",
    status: "Confirmed",
  };

  const response = await request(
    "/api/reception?date=2026-12-27",
    { method: "GET", headers: { cookie: "vanara_session=x" } },
    env([movementsAccess], true, [], [...cancelledGroup, activeUnrelated]),
  );

  assert.equal(response.status, 200);
  const payload = (await json(response)).data as { arrivals: Array<{ bookingId: number }>; summary: { arrivals: number } };
  assert.equal(payload.summary.arrivals, 1);
  assert.deepEqual(payload.arrivals.map((stay) => stay.bookingId), [99000001]);
});

test("passport OCR endpoint stores one image and returns strict passport data", async (t) => {
  const r2 = new FakePassportR2();
  const data = env([movementsAccess], true, [], BOOKING, r2);
  const visualPassport = {
    documentType: "P",
    issuingCountry: "UTO",
    surname: "ERIKSSON",
    givenNames: "ANNA MARIA",
    passportNumberVisual: "L898902C3",
    nationality: "UTO",
    dateOfBirth: "1974-08-12",
    sex: "F",
    expiryDate: "2012-04-15",
    fieldStatus: {
      documentType: "READ",
      issuingCountry: "READ",
      surname: "READ",
      givenNames: "READ",
      passportNumberVisual: "READ",
      nationality: "READ",
      dateOfBirth: "READ",
      sex: "READ",
      expiryDate: "READ",
    },
  };
  const mrzPassport = {
    mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
    mrzLine2: "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
    mrzPassportNumber: "L898902C3",
    passportNumberVisual: "L898902C3",
    fieldStatus: {
      mrzLine1: "READ",
      mrzLine2: "READ",
      mrzPassportNumber: "READ",
      passportNumberVisual: "READ",
    },
  };
  const originalFetch = globalThis.fetch;
  const calls: Array<{ model: string; images: number; prompt: string; schema: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-openai-key");
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      input: Array<{ content: Array<{ type: string; text?: string; image_url?: string }> }>;
      text: { format: { type: string; strict: boolean; schema: { additionalProperties: boolean } } };
    };
    const images = body.input[0]?.content.filter((item) => item.type === "input_image") ?? [];
    const prompt = body.input[0]?.content[0]?.text ?? "";
    calls.push({ model: body.model, images: images.length, prompt, schema: body.text.format.schema });
    assert.equal(body.model, "gpt-5.6-terra");
    assert.equal("temperature" in body, false);
    assert.equal(body.input[0]?.content[1]?.type, "input_image");
    assert.ok(body.input[0]?.content[1]?.image_url?.startsWith("data:image/jpeg;base64,"));
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    assert.equal(JSON.stringify(body.text.format.schema).includes("rawVisualText"), false);
    assert.equal(JSON.stringify(body.text.format.schema).includes("imageQualityAssessment"), false);
    if (prompt.includes("human-readable biodata")) {
      assert.equal(images.length, 1);
      assert.equal(JSON.stringify(body.text.format.schema).includes("mrzLine1"), false);
      return new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: JSON.stringify(visualPassport) }] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    assert.match(prompt, /machine-readable passport fields/);
    assert.equal(images.length, 2);
    assert.equal(JSON.stringify(body.text.format.schema).includes("givenNames"), false);
    return new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify(mrzPassport) }] }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const expectedPassport = {
    firstName: "ANNA MARIA",
    middleName: null,
    lastName: "ERIKSSON",
    passportNumber: "L898902C3",
    nationality: "UTO",
    gender: "F",
    birthDate: "1974-08-12",
  };

  const formData = new FormData();
  formData.set("passport", new File([new Uint8Array([1, 2, 3])], "passport.jpg", { type: "image/jpeg" }));
  formData.set("passportNumberCrop", new File([new Uint8Array([4, 5, 6])], "number.jpg", { type: "image/jpeg" }));
  formData.set("mrzCrop", new File([new Uint8Array([7, 8, 9])], "mrz.jpg", { type: "image/jpeg" }));
  const response = await request("/api/reception/passports/ocr", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);

  assert.equal(response.status, 200);
  const payload = await response.json() as PassportOcrPayload;
  assert.equal(payload.success, true);
  assert.ok(payload.objectKey?.startsWith("passports/"));
  assert.deepEqual([...r2.objects.keys()], [payload.objectKey]);
  assert.equal(r2.objects.get(payload.objectKey ?? "")?.options?.customMetadata, undefined);
  assert.equal(payload.passport?.passportNumber, expectedPassport.passportNumber);
  assert.equal(payload.passport?.firstName, expectedPassport.firstName);
  assert.ok(payload.passport?.verification);
  assert.equal(payload.timing?.model, "gpt-5.6-terra+gpt-5.6-terra");
  assert.equal(typeof payload.timing?.pass1Ms, "number");
  assert.equal(payload.timing?.pass2Ms, 0);
  assert.equal(payload.timing?.conditionalVerificationInvoked, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.images).sort(), [1, 2]);
  assert.equal(typeof payload.timing?.consensusMs, "number");
});

test("passport OCR primary visual and MRZ reads start in parallel with focused payloads", async () => {
  let visualRelease: (() => void) | null = null;
  let visualStarted = false;
  let mrzStarted = false;
  const fetcher = (async (_input: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      model: string;
      input: Array<{ content: Array<{ type: string; text?: string; image_url?: string }> }>;
    };
    const prompt = body.input[0]?.content[0]?.text ?? "";
    const images = body.input[0]?.content.filter((item) => item.type === "input_image") ?? [];
    if (prompt.includes("human-readable biodata")) {
      visualStarted = true;
      assert.equal(images.length, 1);
      await new Promise<void>((resolve) => {
        visualRelease = resolve;
      });
      return new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({
          documentType: "P",
          issuingCountry: "UTO",
          surname: "ERIKSSON",
          givenNames: "ANNA MARIA",
          passportNumberVisual: "L898902C3",
          nationality: "UTO",
          dateOfBirth: "1974-08-12",
          sex: "F",
          expiryDate: "2012-04-15",
          fieldStatus: {
            documentType: "READ",
            issuingCountry: "READ",
            surname: "READ",
            givenNames: "READ",
            passportNumberVisual: "READ",
            nationality: "READ",
            dateOfBirth: "READ",
            sex: "READ",
            expiryDate: "READ",
          },
        }) }] }],
      }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "visual-request" } });
    }
    mrzStarted = true;
    assert.equal(visualStarted, true);
    assert.equal(images.length, 2);
    visualRelease?.();
    return new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({
        mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
        mrzLine2: "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
        mrzPassportNumber: "L898902C3",
        passportNumberVisual: "L898902C3",
        fieldStatus: {
          mrzLine1: "READ",
          mrzLine2: "READ",
          mrzPassportNumber: "READ",
          passportNumberVisual: "READ",
        },
      }) }] }],
    }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "mrz-request" } });
  }) as typeof fetch;

  const passport = await extractPassportReview(
    { OPENAI_API_KEY: "test-openai-key" },
    {
      image: new Uint8Array([1, 2, 3]).buffer,
      passportNumberCrop: new Uint8Array([4, 5, 6]).buffer,
      mrzCrop: new Uint8Array([7, 8, 9]).buffer,
      contentType: "image/jpeg",
    },
    fetcher,
  );

  assert.equal(visualStarted, true);
  assert.equal(mrzStarted, true);
  assert.equal(passport.verification?.timing?.visualOpenAiRequestId, "visual-request");
  assert.equal(passport.verification?.timing?.mrzOpenAiRequestId, "mrz-request");
  assert.equal(passport.verification?.timing?.conditionalVerificationInvoked, false);
});

test("passport OCR invokes Sol verifier only when visual and MRZ passport numbers conflict", async () => {
  const models: string[] = [];
  let verifierImages = 0;
  let verifierPrompt = "";
  let verifierSchema = "";
  const fetcher = (async (_input: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      model: string;
      input: Array<{ content: Array<{ type: string; text?: string; image_url?: string }> }>;
      text: { format: { schema: unknown } };
    };
    models.push(body.model);
    const prompt = body.input[0]?.content[0]?.text ?? "";
    const images = body.input[0]?.content.filter((item) => item.type === "input_image") ?? [];
    if (body.model === "gpt-5.6-sol") {
      verifierImages = images.length;
      verifierPrompt = prompt;
      verifierSchema = JSON.stringify(body.text.format.schema);
      return new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({
          resolved: true,
          passportNumber: "L898902C3",
          confidence: 0.94,
          needsManualConfirmation: false,
        }) }] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const responseText = prompt.includes("human-readable biodata")
      ? JSON.stringify({
        documentType: "P",
        issuingCountry: "UTO",
        surname: "ERIKSSON",
        givenNames: "ANNA MARIA",
        passportNumberVisual: "X898902C3",
        nationality: "UTO",
        dateOfBirth: "1974-08-12",
        sex: "F",
        expiryDate: "2012-04-15",
        fieldStatus: {
          documentType: "READ",
          issuingCountry: "READ",
          surname: "READ",
          givenNames: "READ",
          passportNumberVisual: "READ",
          nationality: "READ",
          dateOfBirth: "READ",
          sex: "READ",
          expiryDate: "READ",
        },
      })
      : JSON.stringify({
        mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
        mrzLine2: "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
        mrzPassportNumber: "L898902C3",
        passportNumberVisual: "L898902C3",
        fieldStatus: {
          mrzLine1: "READ",
          mrzLine2: "READ",
          mrzPassportNumber: "READ",
          passportNumberVisual: "READ",
        },
      });
    return new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: responseText }] }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const passport = await extractPassportReview(
    { OPENAI_API_KEY: "test-openai-key" },
    {
      image: new Uint8Array([1, 2, 3]).buffer,
      passportNumberCrop: new Uint8Array([4, 5, 6]).buffer,
      mrzCrop: new Uint8Array([7, 8, 9]).buffer,
      contentType: "image/jpeg",
    },
    fetcher,
  );

  assert.deepEqual(models, ["gpt-5.6-terra", "gpt-5.6-terra", "gpt-5.6-sol"]);
  assert.equal(passport.verification?.timing?.conditionalVerificationInvoked, true);
  assert.equal(passport.verification?.timing?.verifierTriggerCode, "PASSPORT_NUMBER_CONFLICT");
  assert.equal(verifierImages, 2);
  assert.match(verifierPrompt, /Trigger code: PASSPORT_NUMBER_CONFLICT/);
  assert.doesNotMatch(verifierPrompt, /given names|surname|nationality|date of birth/i);
  assert.match(verifierSchema, /needsManualConfirmation/);
  assert.doesNotMatch(verifierSchema, /mrzLine1|givenNames|surname/);
});

test("passport OCR verifier timeout preserves primary results for manual confirmation review", async () => {
  const passport = await extractPassportReview(
    { OPENAI_API_KEY: "test-openai-key" },
    {
      image: new Uint8Array([1, 2, 3]).buffer,
      passportNumberCrop: new Uint8Array([4, 5, 6]).buffer,
      mrzCrop: new Uint8Array([7, 8, 9]).buffer,
      contentType: "image/jpeg",
    },
    (async (_input: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        model: string;
        input: Array<{ content: Array<{ type: string; text?: string }> }>;
      };
      const prompt = body.input[0]?.content[0]?.text ?? "";
      if (body.model === "gpt-5.6-sol") throw new DOMException("Aborted", "AbortError");
      const responseText = prompt.includes("human-readable biodata")
        ? JSON.stringify({
          documentType: "P",
          issuingCountry: "UTO",
          surname: "ERIKSSON",
          givenNames: "ANNA MARIA",
          passportNumberVisual: "X898902C3",
          nationality: "UTO",
          dateOfBirth: "1974-08-12",
          sex: "F",
          expiryDate: "2012-04-15",
          fieldStatus: {
            documentType: "READ",
            issuingCountry: "READ",
            surname: "READ",
            givenNames: "READ",
            passportNumberVisual: "READ",
            nationality: "READ",
            dateOfBirth: "READ",
            sex: "READ",
            expiryDate: "READ",
          },
        })
        : JSON.stringify({
          mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
          mrzLine2: "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
          mrzPassportNumber: "L898902C3",
          passportNumberVisual: "L898902C3",
          fieldStatus: {
            mrzLine1: "READ",
            mrzLine2: "READ",
            mrzPassportNumber: "READ",
            passportNumberVisual: "READ",
          },
        });
      return new Response(JSON.stringify({
        output: [{ content: [{ type: "output_text", text: responseText }] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  );

  assert.equal(passport.passportNumber, "L898902C3");
  assert.equal(passport.firstName, "ANNA MARIA");
  assert.equal(passport.verification?.timing?.conditionalVerificationInvoked, true);
  assert.equal(passport.verification?.timing?.verifierTimedOut, true);
  assert.equal(passport.verification?.timing?.manualConfirmationRequired, true);
  assert.equal(passport.verification?.consensus.fields.passportNumber.state, "NEEDS_CONFIRMATION");
  assert.ok(passport.verification?.consensus.fields.passportNumber.issues.includes("VERIFICATION_TIMEOUT"));
});

test("passport OCR timeout reports the precise failed stage after both primary calls start", async () => {
  let mrzStarted = false;
  await assert.rejects(
    extractPassportReview(
      { OPENAI_API_KEY: "test-openai-key" },
      {
        image: new Uint8Array([1, 2, 3]).buffer,
        passportNumberCrop: new Uint8Array([4, 5, 6]).buffer,
        mrzCrop: new Uint8Array([7, 8, 9]).buffer,
        contentType: "image/jpeg",
      },
      (async (_input: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { input: Array<{ content: Array<{ type: string; text?: string }> }> };
        const prompt = body.input[0]?.content[0]?.text ?? "";
        if (prompt.includes("human-readable biodata")) {
          throw new DOMException("Aborted", "AbortError");
        }
        mrzStarted = true;
        return new Response(JSON.stringify({
          output: [{ content: [{ type: "output_text", text: JSON.stringify({
            mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
            mrzLine2: "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
            mrzPassportNumber: "L898902C3",
            passportNumberVisual: "L898902C3",
            fieldStatus: {
              mrzLine1: "READ",
              mrzLine2: "READ",
              mrzPassportNumber: "READ",
              passportNumberVisual: "READ",
            },
          }) }] }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    ),
    (error: unknown) => error instanceof PassportOcrError && error.code === "openai_timeout" && error.stage === "visual_biodata",
  );
  assert.equal(mrzStarted, true);
});

test("passport classification endpoint checks a biodata page without storing to R2", async (t) => {
  const r2 = new FakePassportR2();
  const data = env([movementsAccess], true, [], BOOKING, r2);
  const classification = {
    isPassport: true,
    isPassportBiodataPage: true,
    passportConfidence: 0.91,
    passportComplete: true,
    mrzVisible: true,
    excessiveGlare: false,
    unreadableBlur: false,
    unreadableDarkness: false,
    recommendation: "Ready to scan.",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      input: Array<{ content: Array<{ type: string; text?: string; image_url?: string }> }>;
      text: { format: { type: string; strict: boolean; schema: { additionalProperties: boolean } } };
    };
    assert.equal(body.model, "gpt-5.6-terra");
    assert.match(body.input[0]?.content[0]?.text ?? "", /Do not perform OCR/);
    assert.ok(body.input[0]?.content[1]?.image_url?.startsWith("data:image/jpeg;base64,"));
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    return new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify(classification) }] }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const formData = new FormData();
  formData.set("passport", new File([new Uint8Array([1, 2, 3])], "passport.jpg", { type: "image/jpeg" }));
  const response = await request("/api/reception/passports/classify", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);

  assert.equal(response.status, 200);
  const payload = await response.json() as PassportClassificationPayload;
  assert.equal(payload.success, true);
  assert.equal(payload.classification?.passportComplete, true);
  assert.deepEqual(payload.decision, { ready: true, code: "passport_ready", messageKey: "passport.ready", message: "Ready to scan." });
  assert.equal(payload.timing?.model, "gpt-5.6-terra");
  assert.equal(typeof payload.timing?.classificationMs, "number");
  assert.equal(r2.objects.size, 0);
});

test("passport classification endpoint blocks non-passport images before OCR", async (t) => {
  const data = env([movementsAccess]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify({
      isPassport: false,
      isPassportBiodataPage: false,
      passportConfidence: 0.01,
      passportComplete: false,
      mrzVisible: false,
      excessiveGlare: false,
      unreadableBlur: false,
      unreadableDarkness: false,
      recommendation: "This is not a passport.",
    }) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const formData = new FormData();
  formData.set("passport", new File([new Uint8Array([1, 2, 3])], "table.png", { type: "image/png" }));
  const response = await request("/api/reception/passports/classify", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);

  assert.equal(response.status, 200);
  const payload = await response.json() as PassportClassificationPayload;
  assert.equal(payload.success, true);
  assert.deepEqual(payload.decision, { ready: false, code: "not_a_passport", messageKey: "passport.notPassport", message: "This is not a passport." });
});

test("passport OCR endpoint rejects images larger than 10 MB", async () => {
  const r2 = new FakePassportR2();
  const data = env([movementsAccess], true, [], BOOKING, r2);
  const formData = new FormData();
  formData.set("passport", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "passport.jpg", { type: "image/jpeg" }));
  const response = await request("/api/reception/passports/ocr", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);

  assert.equal(response.status, 413);
  const payload = await response.json() as PassportOcrPayload;
  assert.equal(payload.success, false);
  assert.equal(payload.error?.code, "passport_upload_too_large");
  assert.equal(r2.objects.size, 0);
});

test("passport OCR endpoint rejects unsupported formats before storage and OCR", async () => {
  const r2 = new FakePassportR2();
  const data = env([movementsAccess], true, [], BOOKING, r2);
  const formData = new FormData();
  formData.set("passport", new File(["not an image"], "passport.pdf", { type: "application/pdf" }));
  const response = await request("/api/reception/passports/ocr", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);

  assert.equal(response.status, 400);
  const payload = await response.json() as PassportOcrPayload;
  assert.equal(payload.success, false);
  assert.equal(payload.error?.code, "passport_upload_invalid");
  assert.equal(r2.objects.size, 0);
});

test("passport OCR endpoint returns a storage error when R2 upload fails", async () => {
  const data = env([movementsAccess], true, [], BOOKING, new FakePassportR2(true));
  const formData = new FormData();
  formData.set("passport", new File([new Uint8Array([1, 2, 3])], "passport.jpg", { type: "image/jpeg" }));
  const response = await request("/api/reception/passports/ocr", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);

  assert.equal(response.status, 502);
  const payload = await response.json() as PassportOcrPayload;
  assert.equal(payload.success, false);
  assert.equal(payload.error?.code, "passport_storage_failed");
});

test("passport OCR endpoint rejects OpenAI output that does not match the strict passport schema", async (t) => {
  const data = env([movementsAccess]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify({ firstName: "MALI", extra: "not allowed" }) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const formData = new FormData();
  formData.set("passport", new File([new Uint8Array([1, 2, 3])], "passport.png", { type: "image/png" }));
  const response = await request("/api/reception/passports/ocr", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);

  assert.equal(response.status, 502);
  const payload = await response.json() as PassportOcrPayload;
  assert.equal(payload.success, false);
  assert.equal(payload.error?.code, "passport_schema_invalid");
});

test("passport OCR endpoint rolls back the R2 image after OCR failure", async (t) => {
  const r2 = new FakePassportR2();
  const data = env([movementsAccess], true, [], BOOKING, r2);
  const logs: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify({ firstName: "MALI", extra: "not allowed" }) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  console.log = (message?: unknown) => {
    logs.push(String(message));
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  });

  const formData = new FormData();
  formData.set("passport", new File([new Uint8Array([1, 2, 3])], "passport.png", { type: "image/png" }));
  const response = await request("/api/reception/passports/ocr", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);

  assert.equal(response.status, 502);
  assert.equal(r2.objects.size, 0);
  assert.ok(logs.some((line) => line.includes("passport_orphan_rollback") && line.includes("ocr_failed")));
});

test("passport OCR rollback logs deletion failure without masking the OCR error", async (t) => {
  const r2 = new FakePassportR2(false, true);
  const data = env([movementsAccess], true, [], BOOKING, r2);
  const warnings: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify({ firstName: "MALI", extra: "not allowed" }) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  const formData = new FormData();
  formData.set("passport", new File([new Uint8Array([1, 2, 3])], "passport.png", { type: "image/png" }));
  const response = await request("/api/reception/passports/ocr", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);
  const payload = await response.json() as PassportOcrPayload;

  assert.equal(response.status, 502);
  assert.equal(payload.error?.code, "passport_schema_invalid");
  assert.equal(r2.objects.size, 1);
  assert.ok(warnings.some((line) => line.includes("passport_orphan_rollback_failed") && line.includes("R2 delete unavailable")));
});

test("passport OCR service passes an abort signal and returns a structured timeout error", async () => {
  await assert.rejects(
    extractPassportData(
      { OPENAI_API_KEY: "test-openai-key" },
      { image: new Uint8Array([1, 2, 3]).buffer, contentType: "image/png" },
      async (_input, init) => {
        assert.ok(init.signal instanceof AbortSignal);
        throw new DOMException("Aborted", "AbortError");
      },
    ),
    (error: unknown) => error instanceof PassportOcrError && error.code === "openai_timeout",
  );
});

test("booking passports repository persists and retrieves passports by booking id", async () => {
  const data = env([movementsAccess]);
  const passport = await createBookingPassport(data, {
    bookingId: 9001,
    objectKey: "passports/2026-07-31/test-one.jpg",
    passport: {
      firstName: "MALI",
      middleName: null,
      lastName: "GUEST",
      passportNumber: "AB1234567",
      nationality: "THAI",
      gender: "F",
      birthDate: "1990-01-15",
    },
  });

  assert.equal(passport.id, 1);
  assert.equal(passport.bookingId, 9001);
  assert.equal(passport.objectKey, "passports/2026-07-31/test-one.jpg");
  assert.equal(passport.source, "reception_ocr_flow");
  assert.deepEqual(await listBookingPassports(data, 9001), [passport]);
});

test("booking passport completion ignores records without reception OCR provenance", async () => {
  const data = env([movementsAccess]);
  const db = data.DB as unknown as FakeReceptionDB;
  db.passports.push({
    id: 1,
    booking_id: 9001,
    object_key: "passports/2026-07-31/manual.jpg",
    source: "manual_sql",
    first_name: "FAKE",
    middle_name: null,
    last_name: "PASSPORT",
    passport_number: "MANUAL",
    nationality: "THAI",
    gender: "F",
    birth_date: "1990-01-15",
    created_at: "2026-07-31T00:00:00.000Z",
  });

  assert.deepEqual(await listBookingPassports(data, 9001), []);
});

test("booking passports retrieval supports multiple and zero passport bookings", async () => {
  const data = env([movementsAccess]);
  await createBookingPassport(data, {
    bookingId: 9001,
    objectKey: "passports/2026-07-31/test-one.jpg",
    passport: {
      firstName: "MALI",
      middleName: null,
      lastName: "GUEST",
      passportNumber: "AB1234567",
      nationality: "THAI",
      gender: "F",
      birthDate: "1990-01-15",
    },
  });
  await createBookingPassport(data, {
    bookingId: 9001,
    objectKey: "passports/2026-07-31/test-two.jpg",
    passport: {
      firstName: "NOK",
      middleName: null,
      lastName: "GUEST",
      passportNumber: "CD7654321",
      nationality: "THAI",
      gender: "F",
      birthDate: "1992-04-20",
    },
  });

  assert.equal((await listBookingPassports(data, 9001)).length, 2);
  assert.deepEqual(await listBookingPassports(data, 9002), []);
});

test("booking scoped passport OCR endpoint persists the extracted passport after OCR success", async (t) => {
  const r2 = new FakePassportR2();
  const data = env([movementsAccess], true, [], BOOKING, r2);
  const db = data.DB as unknown as FakeReceptionDB;
  const visualPassport = {
    documentType: "P",
    issuingCountry: "UTO",
    surname: "ERIKSSON",
    givenNames: "ANNA MARIA",
    passportNumberVisual: "L898902C3",
    nationality: "UTO",
    dateOfBirth: "1974-08-12",
    sex: "F",
    expiryDate: "2012-04-15",
    fieldStatus: {
      documentType: "READ",
      issuingCountry: "READ",
      surname: "READ",
      givenNames: "READ",
      passportNumberVisual: "READ",
      nationality: "READ",
      dateOfBirth: "READ",
      sex: "READ",
      expiryDate: "READ",
    },
  };
  const mrzPassport = {
    mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
    mrzLine2: "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
    mrzPassportNumber: "L898902C3",
    passportNumberVisual: null,
    fieldStatus: {
      mrzLine1: "READ",
      mrzLine2: "READ",
      mrzPassportNumber: "READ",
      passportNumberVisual: "NOT_FOUND",
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify(
      String(init?.body).includes("human-readable biodata") ? visualPassport : mrzPassport,
    ) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const formData = new FormData();
  formData.set("passport", new File([new Uint8Array([1, 2, 3])], "passport.jpg", { type: "image/jpeg" }));
  const response = await request("/api/reception/stays/9001/passports/ocr", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);

  assert.equal(response.status, 200);
  const payload = await response.json() as PassportOcrPayload;
  assert.equal(payload.success, true);
  assert.equal(db.passports.length, 1);
  assert.equal(db.passports[0]?.booking_id, 9001);
  assert.equal(db.passports[0]?.object_key, payload.objectKey);
  assert.equal(db.passports[0]?.passport_number, "L898902C3");

  const saved = await request("/api/reception/stays/9001/passports", {
    method: "GET",
    headers: { cookie: "vanara_session=x" },
  }, data);
  assert.equal(saved.status, 200);
  const savedPayload = await saved.json() as { success: boolean; data?: Array<{ bookingId: number; objectKey: string }> };
  assert.equal(savedPayload.success, true);
  assert.deepEqual(savedPayload.data?.map((passport) => [passport.bookingId, passport.objectKey]), [[9001, payload.objectKey]]);
});

test("booking scoped passport OCR endpoint rolls back R2 after persistence failure", async (t) => {
  const r2 = new FakePassportR2();
  const data = env([movementsAccess], true, [], BOOKING, r2);
  const db = data.DB as unknown as FakeReceptionDB;
  db.failPassportInsert = true;
  const visualPassport = {
    documentType: "P",
    issuingCountry: "UTO",
    surname: "ERIKSSON",
    givenNames: "ANNA MARIA",
    passportNumberVisual: "L898902C3",
    nationality: "UTO",
    dateOfBirth: "1974-08-12",
    sex: "F",
    expiryDate: "2012-04-15",
    fieldStatus: {
      documentType: "READ",
      issuingCountry: "READ",
      surname: "READ",
      givenNames: "READ",
      passportNumberVisual: "READ",
      nationality: "READ",
      dateOfBirth: "READ",
      sex: "READ",
      expiryDate: "READ",
    },
  };
  const mrzPassport = {
    mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
    mrzLine2: "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
    mrzPassportNumber: "L898902C3",
    passportNumberVisual: null,
    fieldStatus: {
      mrzLine1: "READ",
      mrzLine2: "READ",
      mrzPassportNumber: "READ",
      passportNumberVisual: "NOT_FOUND",
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify(
      String(init?.body).includes("human-readable biodata") ? visualPassport : mrzPassport,
    ) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const formData = new FormData();
  formData.set("passport", new File([new Uint8Array([1, 2, 3])], "passport.jpg", { type: "image/jpeg" }));
  const response = await request("/api/reception/stays/9001/passports/ocr", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
    body: formData,
  }, data);
  const payload = await response.json() as PassportOcrPayload;

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error?.message, "D1 unavailable");
  assert.equal(r2.objects.size, 0);
  assert.equal(db.passports.length, 0);
});

test("reception completion endpoints require authentication and staff operational access", async () => {
  const unauthenticated = await request("/api/reception/stays/9001/check-in-completed", {
    method: "POST",
  }, env([movementsAccess], false));
  assert.equal(unauthenticated.status, 401);

  const forbidden = await request("/api/reception/stays/9001/check-in-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
  }, env([], true, [], BOOKING, new FakePassportR2(), []));
  assert.equal(forbidden.status, 403);
});

test("staff operational access completes reception events and preserves actor audit", async () => {
  const data = env([movementsAccess]);
  const db = data.DB as unknown as FakeReceptionDB;
  const checkIn = await request("/api/reception/stays/9001/check-in-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
  }, data);
  assert.equal(checkIn.status, 200);
  assert.equal(((await json(checkIn)).data as { checkIn: { guestArrived: boolean } }).checkIn.guestArrived, true);

  const duplicate = await request("/api/reception/stays/9001/check-in-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
  }, data);
  assert.equal(duplicate.status, 409);

  assert.equal(db.events.at(-1)?.action, "checkInCompleted");
  assert.equal(db.events.at(-1)?.actor_id, ACTIVE_RECEPTION_USER.user_id);
  assert.equal(db.events.at(-1)?.actor_name, ACTIVE_RECEPTION_USER.full_name);

  const checkOutData = env([movementsAccess], true, [], { ...BOOKING, arrival_date: YESTERDAY, departure_date: TODAY });
  const checkOutDb = checkOutData.DB as unknown as FakeReceptionDB;
  const checkOut = await request("/api/reception/stays/9001/check-out-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ roomInspected: true, keysReturned: true }),
  }, checkOutData);
  assert.equal(checkOut.status, 200);
  const payload = (await json(checkOut)).data as { checkOut: { guestLeft: boolean; roomReleased: boolean } };
  assert.equal(payload.checkOut.guestLeft, true);
  assert.equal(payload.checkOut.roomReleased, true);
  assert.equal(checkOutDb.events.at(-1)?.actor_id, ACTIVE_RECEPTION_USER.user_id);
  assert.equal(checkOutDb.events.at(-1)?.actor_name, ACTIVE_RECEPTION_USER.full_name);
});

test("completed checkout immediately creates released priority turnover work", async () => {
  const data = env([movementsAccess, housekeepingAccess], true, [], { ...BOOKING, arrival_date: YESTERDAY, departure_date: TODAY });
  const db = data.DB as unknown as FakeReceptionDB;

  const checkout = await request("/api/reception/stays/9001/check-out-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ roomInspected: true, keysReturned: true }),
  }, data);
  assert.equal(checkout.status, 200);

  const tasks = await request(`/api/housekeeping/v2/tasks?date=${TODAY}`, {
    method: "GET",
    headers: { cookie: "vanara_session=x" },
  }, data);
  const body = await json(tasks) as {
    success: boolean;
    data?: {
      summary: { toClean: number };
      sections: Array<{ id: string; cards: Array<{ taskType: string; taskStatus: string; currentQueue: string; isBlocked: boolean; capabilities: { canStart: boolean } }> }>;
    };
  };

  assert.equal(tasks.status, 200, JSON.stringify(body));
  const priority = body.data?.sections.find((section) => section.id === "priority-turnover");
  assert.equal(priority?.cards.length, 1);
  const card = priority?.cards[0];
  assert.equal(card?.taskType, "TURNOVER");
  assert.equal(card?.taskStatus, "AVAILABLE_FOR_CLAIM");
  assert.equal(card?.currentQueue, "priority-turnover");
  assert.equal(card?.isBlocked, false);
  assert.equal(card?.capabilities.canStart, true);
  assert.equal(body.data?.summary.toClean, 1);
  assert.equal(db.housekeepingTasks.filter((task) => task.task_type === "TURNOVER").length, 1);

  const secondRead = await request(`/api/housekeeping/v2/tasks?date=${TODAY}`, {
    method: "GET",
    headers: { cookie: "vanara_session=x" },
  }, data);
  assert.equal(secondRead.status, 200);
  assert.equal(db.housekeepingTasks.filter((task) => task.task_type === "TURNOVER").length, 1);
});

test("completed checkout releases historical turnover linked only by Beds24 stay id", async () => {
  const data = env([movementsAccess, housekeepingAccess], true, [], { ...BOOKING, arrival_date: YESTERDAY, departure_date: TODAY });
  const db = data.DB as unknown as FakeReceptionDB;
  db.housekeepingTasks.push(storedHousekeepingTask({
    task_id: 700,
    booking_id: null,
    stay_id: 9001,
    operational_date: TODAY,
    due_cycle_date: TODAY,
    status: "WAITING_FOR_RECEPTION",
  }));

  const checkout = await request("/api/reception/stays/9001/check-out-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ roomInspected: true, keysReturned: true }),
  }, data);
  assert.equal(checkout.status, 200);

  const task = db.housekeepingTasks.find((item) => item.task_id === 700);
  assert.equal(task?.status, "AVAILABLE_FOR_CLAIM");
  assert.equal(db.housekeepingTasks.filter((item) => item.task_type === "TURNOVER").length, 1);

  const tasks = await request(`/api/housekeeping/v2/tasks?date=${TODAY}`, {
    method: "GET",
    headers: { cookie: "vanara_session=x" },
  }, data);
  const body = await json(tasks) as { data?: { sections: Array<{ id: string; cards: Array<{ taskId: number; taskStatus: string }> }> } };
  assert.equal(tasks.status, 200, JSON.stringify(body));
  const priority = body.data?.sections.find((section) => section.id === "priority-turnover");
  assert.equal(priority?.cards.length, 1);
  assert.equal(priority?.cards[0]?.taskId, 700);
  assert.equal(priority?.cards[0]?.taskStatus, "AVAILABLE_FOR_CLAIM");
});

test("complete check-in creates persistent room alerts and resolving them updates the stay", async () => {
  const data = env([movementsAccess]);
  const db = data.DB as unknown as FakeReceptionDB;
  const checkIn = await request("/api/reception/stays/9001/check-in-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ passportRegistrationCompleted: false, depositCollected: false }),
  }, data);

  assert.equal(checkIn.status, 200);
  assert.deepEqual(db.alerts.map((alert) => [alert.beds24_booking_id, alert.unit_id, alert.alert_type, alert.title, alert.status]), [
    [9001, 1, "passport_missing", "Passport(s) missing", "active"],
    [9001, 1, "deposit_pending", "Deposit pending", "active"],
  ]);

  const passport = await request("/api/reception/stays/9001/alerts/passport_missing/resolve", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
  }, data);

  assert.equal(passport.status, 200);
  assert.equal(db.stays.get(9001)?.passport_collected, 1);
  assert.equal(db.alerts.find((alert) => alert.alert_type === "passport_missing")?.status, "resolved");

  const deposit = await request("/api/reception/stays/9001/alerts/deposit_pending/resolve", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
  }, data);

  assert.equal(deposit.status, 200);
  assert.equal(db.stays.get(9001)?.deposit_collected, 1);
  assert.equal(db.alerts.find((alert) => alert.alert_type === "deposit_pending")?.status, "resolved");
});

test("complete check-out enforces inspection keys and collected deposit return", async () => {
  const data = env([movementsAccess], true, [], { ...BOOKING, arrival_date: YESTERDAY, departure_date: TODAY });
  const db = data.DB as unknown as FakeReceptionDB;
  db.stays.set(9001, {
    beds24_booking_id: 9001,
    guest_arrived: 1,
    passport_collected: 1,
    deposit_collected: 1,
    welcome_completed: 1,
    keys_delivered: 1,
    guest_left: 0,
    keys_returned: 0,
    deposit_returned: 0,
    room_released: 0,
    special_notes: null,
    created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z",
  });

  const missingDeposit = await request("/api/reception/stays/9001/check-out-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ roomInspected: true, keysReturned: true }),
  }, data);
  assert.equal(missingDeposit.status, 409);

  const completed = await request("/api/reception/stays/9001/check-out-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ roomInspected: true, keysReturned: true, depositReturned: true }),
  }, data);
  assert.equal(completed.status, 200);
  assert.equal(db.stays.get(9001)?.guest_left, 1);
  assert.equal(db.stays.get(9001)?.keys_returned, 1);
  assert.equal(db.stays.get(9001)?.deposit_returned, 1);
  assert.equal(db.stays.get(9001)?.room_released, 1);
});

test("reception completion rejects future booking dates server-side", async () => {
  const data = env([movementsAccess], true, [], { ...BOOKING, arrival_date: TOMORROW, departure_date: addDateOnlyDays(TOMORROW, 2) });
  const response = await request("/api/reception/stays/9001/check-in-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
  }, data);
  assert.equal(response.status, 409);
});

test("reception workflow and notes persist server-derived audit data", async () => {
  const data = env([movementsEdit]);
  const checkIn = await request("/api/reception/stays/9001/check-in", {
    method: "PATCH",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ field: "guestArrived", completed: true }),
  }, data);
  assert.equal(checkIn.status, 200);
  assert.equal(((await json(checkIn)).data as { checkIn: { guestArrived: boolean } }).checkIn.guestArrived, true);

  const notes = await request("/api/reception/stays/9001/notes", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ body: "  Guest asked for luggage help.  ", specialNotes: "Arrives with child." }),
  }, data);
  assert.equal(notes.status, 200);
  const payload = (await json(notes)).data as { notes: Array<{ body: string; authorName: string }>; specialNotes: string };
  assert.equal(payload.specialNotes, "Arrives with child.");
  assert.equal(payload.notes[0]?.body, "Guest asked for luggage help.");
  assert.equal(payload.notes[0]?.authorName, ACTIVE_RECEPTION_USER.full_name);
});
