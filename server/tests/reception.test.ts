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
import { countryCodeFrom, countryFlagUrlFrom } from "../src/services/country-flags.service.ts";
import { getBangkokDate } from "../src/services/today.service.ts";
import type { ModuleKey } from "../src/services/current-user.service.ts";

type Permission = { module_key: ModuleKey; can_access: number; can_edit: number };
type ActionPermission = { action_key: "can_complete_checkin_checkout"; allowed: number };

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
  country: "Thailand",
  country_code: "TH",
  status: "Confirmed",
};
type TestBooking = typeof BOOKING;

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

  constructor(private permissions: Permission[], private authenticated = true, private actionPermissions: ActionPermission[] = [], private bookingInput: TestBooking | TestBooking[] = BOOKING) {}

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
    if (sql.includes("SELECT view_key FROM user_views")) return { results: [{ view_key: "staff" }] as T[] };
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) return { results: this.permissions as T[] };
    if (sql.includes("SELECT action_key, allowed FROM user_action_permissions")) return { results: this.actionPermissions as T[] };
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
    if (sql.includes("FROM bookings b") && sql.includes("ORDER BY u.position")) {
      return { results: this.operationalBookings() as T[] };
    }
    if (sql.includes("FROM reception_guest_notes")) return { results: [...this.notes].reverse() as T[] };
    if (sql.includes("FROM reception_events")) return { results: [...this.events].reverse() as T[] };
    if (sql.includes("FROM reception_room_alerts")) return { results: this.alerts.filter((alert) => alert.status === "active") as T[] };
    if (sql.includes("FROM maintenance_tickets") && sql.includes("WHERE room_id =")) return { results: [] as T[] };
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

function env(permissions: Permission[], authenticated = true, actionPermissions: ActionPermission[] = [], booking: TestBooking | TestBooking[] = BOOKING) {
  return {
    DB: new FakeReceptionDB(permissions, authenticated, actionPermissions, booking) as unknown as D1Database,
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
const receptionCompletion: ActionPermission = { action_key: "can_complete_checkin_checkout", allowed: 1 };

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
  assert.deepEqual(normalizeCompleteReceptionCheckInInput({}), { passportPhotographed: false, depositCollected: false });
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

test("reception endpoints enforce authentication and movements permissions directly", async () => {
  assert.equal((await request("/api/reception", { method: "GET" }, env([], false))).status, 401);
  assert.equal((await request("/api/reception", { method: "GET", headers: { cookie: "vanara_session=x" } }, env([]))).status, 403);

  const overview = await request("/api/reception", { method: "GET", headers: { cookie: "vanara_session=x" } }, env([movementsAccess]));
  assert.equal(overview.status, 200);
  const overviewPayload = (await json(overview)).data as { arrivals: Array<{ nationality: string | null; nationalityFlag: string | null; nationalityFlagUrl: string | null }>; summary: { arrivals: number } };
  assert.equal(overviewPayload.summary.arrivals, 1);
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

test("reception completion endpoints require dedicated action permission", async () => {
  const response = await request("/api/reception/stays/9001/check-in-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
  }, env([movementsEdit]));
  assert.equal(response.status, 403);
});

test("reception completion endpoints persist irreversible today's operational events", async () => {
  const data = env([movementsAccess], true, [receptionCompletion]);
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

  const checkOutData = env([movementsAccess], true, [receptionCompletion], { ...BOOKING, arrival_date: YESTERDAY, departure_date: TODAY });
  const checkOut = await request("/api/reception/stays/9001/check-out-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ roomInspected: true, keysReturned: true }),
  }, checkOutData);
  assert.equal(checkOut.status, 200);
  const payload = (await json(checkOut)).data as { checkOut: { guestLeft: boolean; roomReleased: boolean } };
  assert.equal(payload.checkOut.guestLeft, true);
  assert.equal(payload.checkOut.roomReleased, true);
});

test("complete check-in creates persistent room alerts and resolving them updates the stay", async () => {
  const data = env([movementsAccess], true, [receptionCompletion]);
  const db = data.DB as unknown as FakeReceptionDB;
  const checkIn = await request("/api/reception/stays/9001/check-in-completed", {
    method: "POST",
    headers: { cookie: "vanara_session=x", "content-type": "application/json" },
    body: JSON.stringify({ passportPhotographed: false, depositCollected: false }),
  }, data);

  assert.equal(checkIn.status, 200);
  assert.deepEqual(db.alerts.map((alert) => [alert.beds24_booking_id, alert.unit_id, alert.alert_type, alert.status]), [
    [9001, 1, "passport_missing", "active"],
    [9001, 1, "deposit_pending", "active"],
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
  const data = env([movementsAccess], true, [receptionCompletion], { ...BOOKING, arrival_date: YESTERDAY, departure_date: TODAY });
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
  const data = env([movementsAccess], true, [receptionCompletion], { ...BOOKING, arrival_date: TOMORROW, departure_date: addDateOnlyDays(TOMORROW, 2) });
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
