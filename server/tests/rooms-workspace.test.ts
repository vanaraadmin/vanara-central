import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import { getRoomsWorkspaceOverview } from "../src/services/rooms-workspace.service.ts";
import type { ModuleKey } from "../src/services/current-user.service.ts";

type Permission = { module_key: ModuleKey; can_access: number; can_edit: number };

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
  constructor(private permissions: Permission[], private options: { authenticated?: boolean } = {}) {}

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async all<T>(sql: string, _params: unknown[]) {
    void _params;
    if (sql.includes("SELECT view_key FROM user_views")) return { results: [{ view_key: "staff" }] as T[] };
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) return { results: this.permissions as T[] };
    if (sql.includes("FROM units u") && sql.includes("LEFT JOIN room_operational_availability") && sql.includes("LEFT JOIN room_housekeeping_state")) {
      return {
        results: [
          roomRow({ unit_id: 10, unit_name: "Villa 10", unit_type: "villa", room_type_name: "Garden Villa", ready_state: "NOT_READY", booking_id: 52, guest_name: "Mali Guest", api_source: "Direct" }),
          roomRow({ unit_id: 22, unit_name: "Tent 2", unit_type: "yurt", room_type_name: "Yurt/Tent", availability_status: "NOT_OPERATING" }),
          roomRow({ unit_id: 12, unit_name: "Bungalow 12", unit_type: "bungalow", room_type_name: "Bungalow" }),
          roomRow({ unit_id: 1, unit_name: "Bungalow 1", unit_type: "bungalow", room_type_name: "Bungalow", open_issues: 1, out_of_service: 1 }),
          roomRow({ unit_id: 21, unit_name: "Tent 1", unit_type: "yurt", room_type_name: "Yurt/Tent" }),
        ] as T[],
      };
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
    ready_state: "READY",
    booking_id: null,
    guest_name: null,
    api_source: null,
    channel: null,
    open_issues: 0,
    out_of_service: 0,
    ...overrides,
  };
}

function env(permissions: Permission[], options?: { authenticated?: boolean }) {
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

test("rooms workspace read model sorts rooms by operational product order", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");

  assert.deepEqual(overview.rooms.map((room) => room.roomName), [
    "Bungalow 1",
    "Bungalow 12",
    "Villa 10",
    "Tent 1",
    "Tent 2",
  ]);
  assert.equal(overview.rooms[0]?.maintenance.status, "Maintenance");
  assert.equal(overview.rooms[0]?.maintenance.outOfService, true);
  assert.equal(overview.rooms[2]?.occupancy.status, "Occupied");
  assert.equal(overview.rooms[2]?.occupancy.guestName, "Mali Guest");
  assert.equal(overview.rooms[2]?.housekeeping.status, "Not Ready");
  assert.equal(overview.rooms[4]?.operationalAvailability.status, "Not Operating");
});

test("rooms workspace read model exposes compact operational summary", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");

  assert.deepEqual(overview.summary, {
    total: 5,
    occupied: 1,
    notOperating: 1,
    notReady: 1,
    maintenance: 1,
  });
});

test("rooms workspace endpoint requires Rooms access and returns the read model", async () => {
  assert.equal((await request("/api/rooms", { method: "GET" }, env([roomsAccess], { authenticated: false }))).status, 401);
  assert.equal((await request("/api/rooms", { method: "GET", headers: { cookie: "vanara_session=x" } }, env([]))).status, 403);

  const response = await request("/api/rooms", { method: "GET", headers: { cookie: "vanara_session=x" } }, env([roomsAccess]));
  const body = await json(response);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal((body.data as { rooms: unknown[] }).rooms.length, 5);
});
