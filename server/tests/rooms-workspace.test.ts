import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import { getRoomsWorkspaceOverview } from "../src/services/rooms-workspace.service.ts";
import type { ModuleKey } from "../src/services/current-user.service.ts";

type Permission = { module_key: ModuleKey; can_access: number; can_edit: number };
type FakeRoomRow = Record<string, unknown>;

const USER_ROW = {
  user_id: "rooms-1",
  full_name: "Rooms Operator",
  profile_photo_url: null,
  role: "Operations",
  preferred_language: "en",
  username: "rooms",
  email: null,
  password_hash: "not-returned",
  status: "active",
  created_at: "2026-07-30T00:00:00.000Z",
  updated_at: "2026-07-30T00:00:00.000Z",
  last_login_at: null,
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeRoomsDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return Promise.resolve({ meta: { changes: 0, last_row_id: 0 } }); }
}

class FakeRoomsDB {
  constructor(private permissions: Permission[], private options: { authenticated?: boolean; rooms?: FakeRoomRow[] } = {}) {}

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async all<T>(sql: string, _params: unknown[]) {
    void _params;
    if (sql.includes("SELECT view_key FROM user_views")) return { results: [{ view_key: "staff" }] as T[] };
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) return { results: this.permissions as T[] };
    if (sql.includes("FROM units u") && sql.includes("LEFT JOIN room_operational_availability") && sql.includes("LEFT JOIN room_housekeeping_state")) {
      return { results: (this.options.rooms ?? defaultRooms()) as T[] };
    }
    return { results: [] as T[] };
  }

  async first<T>(sql: string, _params: unknown[]) {
    void _params;
    if (sql.includes("SELECT s.session_id")) {
      if (this.options.authenticated === false) return null;
      return {
        session_id: "session-1",
        expires_at: "2999-01-01T00:00:00.000Z",
        ...USER_ROW,
      } as T;
    }
    return null;
  }
}

function roomRow(overrides: Partial<Record<string, unknown>>) {
  return {
    unit_id: 1,
    unit_name: "Bungalow 1",
    unit_type: "bungalow",
    room_type_name: "Bungalow",
    room_name: "Bungalow",
    position: null,
    availability_status: "OPERATING",
    availability_reason: null,
    seasonal_start: null,
    seasonal_end: null,
    ready_state: "READY",
    booking_id: null,
    beds24_booking_id: null,
    guest_name: null,
    country: null,
    country_code: null,
    arrival_date: null,
    departure_date: null,
    api_source: null,
    channel: null,
    active_task_count: 0,
    active_task_status: null,
    active_task_type: null,
    active_task_assignee: null,
    active_ticket_count: 0,
    blocking_ticket_count: 0,
    primary_maintenance_title: null,
    ...overrides,
  };
}

function defaultRooms() {
  return [
    roomRow({
      unit_id: 7,
      unit_name: "Bungalow 7",
      ready_state: "NOT_READY",
      active_ticket_count: 1,
      blocking_ticket_count: 1,
      primary_maintenance_title: "Replace Air Conditioning",
    }),
    roomRow({
      unit_id: 13,
      unit_name: "Villa 13",
      unit_type: "villa",
      room_type_name: "Garden Villa",
      availability_status: "NOT_OPERATING",
      availability_reason: "Seasonal Storage",
      seasonal_start: "06-01",
      seasonal_end: "11-20",
      ready_state: "NOT_READY",
    }),
    roomRow({
      unit_id: 21,
      unit_name: "Tent 1",
      unit_type: "yurt",
      room_type_name: "Yurt/Tent",
      availability_status: "NOT_OPERATING",
      availability_reason: "Season Closed",
      seasonal_start: "06-01",
      seasonal_end: "11-20",
      ready_state: "NOT_READY",
    }),
    roomRow({
      unit_id: 2,
      unit_name: "Bungalow 2",
      ready_state: "READY",
    }),
    roomRow({
      unit_id: 3,
      unit_name: "Bungalow 3",
      ready_state: "READY",
      booking_id: 301,
      beds24_booking_id: 9301,
      guest_name: "Mali Guest",
      country: "Thailand",
      country_code: "TH",
      arrival_date: "2026-08-01",
      departure_date: "2026-08-07",
      api_source: "Direct",
    }),
    roomRow({
      unit_id: 4,
      unit_name: "Bungalow 4",
      ready_state: "READY",
      active_task_count: 1,
      active_task_status: "IN_PROGRESS",
      active_task_type: "STANDARD_CLEANING",
      active_task_assignee: "Dao",
    }),
    roomRow({
      unit_id: 5,
      unit_name: "Bungalow 5",
      ready_state: "READY",
      active_ticket_count: 1,
      blocking_ticket_count: 0,
      primary_maintenance_title: "Fix bathroom light",
    }),
    roomRow({
      unit_id: 6,
      unit_name: "Bungalow 6",
      ready_state: "READY",
      active_task_count: 1,
      active_task_status: "AVAILABLE_FOR_CLAIM",
      active_task_type: "STANDARD_CLEANING",
    }),
  ];
}

function env(permissions: Permission[], options?: { authenticated?: boolean; rooms?: FakeRoomRow[] }) {
  return {
    DB: new FakeRoomsDB(permissions, options) as unknown as D1Database,
  };
}

async function request(path: string, init: RequestInit, data: ReturnType<typeof env>) {
  return worker.fetch(new Request(`https://local.test${path}`, init), data as never, {} as never);
}

async function json(response: Response) {
  return response.json() as Promise<{ success: boolean; data?: unknown; error?: string }>;
}

const roomsAccess: Permission = { module_key: "rooms", can_access: 1, can_edit: 0 };

function byName<T extends { roomName: string }>(rooms: T[], name: string): T {
  const room = rooms.find((item) => item.roomName === name);
  assert.ok(room, `${name} must exist`);
  return room;
}

test("rooms workspace read model returns every independent operational dimension", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");

  const bungalow7 = byName(overview.rooms, "Bungalow 7");
  assert.equal(bungalow7.operational.availability.state, "OPERATING");
  assert.equal(bungalow7.operational.occupancy.state, "VACANT");
  assert.equal(bungalow7.operational.housekeeping.condition, "NOT_READY");
  assert.equal(bungalow7.operational.housekeeping.workState, "NONE");
  assert.equal(bungalow7.operational.maintenance.state, "BLOCKING");
});

test("room workspace preserves product room ordering", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");

  assert.deepEqual(overview.rooms.map((room) => room.roomName), [
    "Bungalow 2",
    "Bungalow 3",
    "Bungalow 4",
    "Bungalow 5",
    "Bungalow 6",
    "Bungalow 7",
    "Villa 13",
    "Tent 1",
  ]);
});

test("READY comes only from room_housekeeping_state and active tasks remain separate", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");
  const scheduled = byName(overview.rooms, "Bungalow 6");
  const inProgress = byName(overview.rooms, "Bungalow 4");

  assert.equal(scheduled.operational.housekeeping.condition, "READY");
  assert.equal(scheduled.operational.housekeeping.workState, "AVAILABLE");
  assert.equal(scheduled.operational.housekeeping.activeTaskType, "Cleaning");

  assert.equal(inProgress.operational.housekeeping.condition, "READY");
  assert.equal(inProgress.operational.housekeeping.workState, "IN_PROGRESS");
  assert.equal(inProgress.operational.housekeeping.activeTaskType, "Cleaning");
  assert.equal(inProgress.operational.housekeeping.assignedTo, "Dao");
});

test("maintenance states distinguish blocking active and clear", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");

  assert.equal(byName(overview.rooms, "Bungalow 7").operational.maintenance.state, "BLOCKING");
  assert.equal(byName(overview.rooms, "Bungalow 7").operational.maintenance.primaryTitle, "Replace Air Conditioning");
  assert.equal(byName(overview.rooms, "Bungalow 5").operational.maintenance.state, "ACTIVE");
  assert.equal(byName(overview.rooms, "Bungalow 2").operational.maintenance.state, "CLEAR");
});

test("not operating reason and season dates are returned for seasonal rooms", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");
  const villa13 = byName(overview.rooms, "Villa 13");
  const tent1 = byName(overview.rooms, "Tent 1");

  assert.equal(villa13.operational.availability.state, "NOT_OPERATING");
  assert.equal(villa13.operational.availability.reason, "Seasonal Storage");
  assert.equal(villa13.operational.availability.startDate, "06-01");
  assert.equal(villa13.operational.availability.endDate, "11-20");
  assert.equal(villa13.operational.availability.seasonLabel, "1 June - 20 November");
  assert.equal(villa13.operational.housekeeping.condition, "NOT_READY");

  assert.equal(tent1.operational.availability.state, "NOT_OPERATING");
  assert.equal(tent1.operational.availability.reason, "Season Closed");
  assert.equal(tent1.operational.housekeeping.condition, "NOT_READY");
});

test("occupied rooms expose current guest and vacant rooms expose no guest", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");
  const occupied = byName(overview.rooms, "Bungalow 3");
  const vacant = byName(overview.rooms, "Bungalow 2");

  assert.equal(occupied.operational.occupancy.state, "OCCUPIED");
  assert.equal(occupied.operational.occupancy.guestName, "Mali Guest");
  assert.equal(occupied.operational.occupancy.bookingId, 9301);
  assert.equal(occupied.operational.occupancy.source, "Direct");
  assert.deepEqual(occupied.currentStay, {
    guestName: "Mali Guest",
    nationality: "Thailand",
    source: "Direct",
    arrivalDate: "2026-08-01",
    departureDate: "2026-08-07",
    stayNights: 6,
  });

  assert.equal(vacant.operational.occupancy.state, "VACANT");
  assert.equal(vacant.operational.occupancy.guestName, null);
  assert.equal(vacant.operational.occupancy.bookingId, null);
  assert.equal(vacant.currentStay, null);
});

test("guest card read model follows arrived occupancy and does not expose reception-only fields", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");
  const occupied = byName(overview.rooms, "Bungalow 3");

  assert.ok(occupied.currentStay);
  assert.equal(occupied.currentStay.guestName, "Mali Guest");
  assert.equal(occupied.currentStay.nationality, "Thailand");
  assert.equal(occupied.currentStay.source, "Direct");
  assert.equal(occupied.currentStay.arrivalDate, "2026-08-01");
  assert.equal(occupied.currentStay.departureDate, "2026-08-07");
  assert.equal(occupied.currentStay.stayNights, 6);
  assert.equal("passport" in occupied.currentStay, false);
  assert.equal("deposit" in occupied.currentStay, false);
  assert.equal("email" in occupied.currentStay, false);
  assert.equal("phone" in occupied.currentStay, false);
});

test("rooms workspace read model exposes compact operational summary counts", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");

  assert.deepEqual(overview.summary, {
    total: 8,
    occupied: 1,
    notOperating: 2,
    notReady: 3,
    maintenance: 2,
  });
});

test("rooms workspace endpoint requires Rooms access and returns the read model", async () => {
  assert.equal((await request("/api/rooms", { method: "GET" }, env([roomsAccess], { authenticated: false }))).status, 401);
  assert.equal((await request("/api/rooms", { method: "GET", headers: { cookie: "vanara_session=x" } }, env([]))).status, 403);

  const response = await request("/api/rooms", { method: "GET", headers: { cookie: "vanara_session=x" } }, env([roomsAccess]));
  const body = await json(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal((body.data as { rooms: unknown[] }).rooms.length, 8);
});
