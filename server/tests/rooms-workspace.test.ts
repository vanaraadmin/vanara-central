import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import { getRoomsWorkspaceOverview } from "../src/services/rooms-workspace.service.ts";
import type { CurrentUser, ModuleKey } from "../src/services/current-user.service.ts";

type Permission = { module_key: ModuleKey; can_access: number; can_edit: number };
type ActionPermission = { action_key: "can_complete_checkin_checkout"; allowed: number };
type FakeRoomRow = Record<string, unknown>;
type FakeReceptionAlertRow = {
  alert_id: number;
  unit_id: number;
  alert_type: "passport_missing" | "deposit_pending";
  title: string;
  status: "active" | "resolved";
};

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
  constructor(private permissions: Permission[], private actionPermissions: ActionPermission[] = [], private options: { authenticated?: boolean; rooms?: FakeRoomRow[]; alerts?: FakeReceptionAlertRow[] } = {}) {}

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async all<T>(sql: string, _params: unknown[]) {
    void _params;
    if (sql.includes("SELECT view_key FROM user_views")) return { results: [{ view_key: "staff" }] as T[] };
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) return { results: this.permissions as T[] };
    if (sql.includes("SELECT action_key, allowed FROM user_action_permissions")) return { results: this.actionPermissions as T[] };
    if (sql.includes("FROM reception_room_alerts")) return { results: (this.options.alerts ?? []).filter((alert) => alert.status === "active") as T[] };
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
    active_task_id: null,
    active_task_version: null,
    active_task_status: null,
    active_task_type: null,
    active_task_priority: null,
    active_task_assignee: null,
    active_ticket_count: 0,
    blocking_ticket_count: 0,
    primary_maintenance_ticket_id: null,
    primary_maintenance_title: null,
    reception_booking_id: null,
    reception_beds24_booking_id: null,
    reception_arrival_date: null,
    reception_departure_date: null,
    reception_guest_arrived: 0,
    reception_passport_collected: 0,
    reception_deposit_collected: 0,
    reception_welcome_completed: 0,
    reception_keys_delivered: 0,
    reception_guest_left: 0,
    reception_keys_returned: 0,
    reception_deposit_returned: 0,
    reception_room_released: 0,
    reception_updated_at: null,
    passport_completed_at: null,
    deposit_completed_at: null,
    check_in_completed_at: null,
    check_out_completed_at: null,
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
      primary_maintenance_ticket_id: 7001,
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
      reception_booking_id: 301,
      reception_beds24_booking_id: 9301,
      reception_arrival_date: "2026-08-01",
      reception_departure_date: "2026-08-07",
      reception_guest_arrived: 1,
      reception_passport_collected: 1,
      reception_deposit_collected: 1,
      reception_welcome_completed: 1,
      reception_keys_delivered: 1,
      reception_updated_at: "2026-08-01T07:30:00.000Z",
      passport_completed_at: "2026-08-01T07:30:00.000Z",
      deposit_completed_at: "2026-08-01T07:30:00.000Z",
      check_in_completed_at: "2026-08-01T07:30:00.000Z",
    }),
    roomRow({
      unit_id: 4,
      unit_name: "Bungalow 4",
      ready_state: "READY",
      active_task_count: 1,
      active_task_id: 4001,
      active_task_version: 3,
      active_task_status: "IN_PROGRESS",
      active_task_type: "STANDARD_CLEANING",
      active_task_priority: "NORMAL",
      active_task_assignee: "Dao",
    }),
    roomRow({
      unit_id: 5,
      unit_name: "Bungalow 5",
      ready_state: "READY",
      active_ticket_count: 1,
      blocking_ticket_count: 0,
      primary_maintenance_ticket_id: 5001,
      primary_maintenance_title: "Fix bathroom light",
    }),
    roomRow({
      unit_id: 6,
      unit_name: "Bungalow 6",
      ready_state: "READY",
      active_task_count: 1,
      active_task_id: 6001,
      active_task_version: 1,
      active_task_status: "AVAILABLE_FOR_CLAIM",
      active_task_type: "STANDARD_CLEANING",
      active_task_priority: "NORMAL",
    }),
  ];
}

function env(
  permissions: Permission[],
  actionPermissionsOrOptions: ActionPermission[] | { authenticated?: boolean; rooms?: FakeRoomRow[]; alerts?: FakeReceptionAlertRow[] } = [],
  options?: { authenticated?: boolean; rooms?: FakeRoomRow[]; alerts?: FakeReceptionAlertRow[] },
) {
  const actionPermissions = Array.isArray(actionPermissionsOrOptions) ? actionPermissionsOrOptions : [];
  const resolvedOptions = Array.isArray(actionPermissionsOrOptions) ? options : actionPermissionsOrOptions;
  return {
    DB: new FakeRoomsDB(permissions, actionPermissions, resolvedOptions) as unknown as D1Database,
  };
}

async function request(path: string, init: RequestInit, data: ReturnType<typeof env>) {
  return worker.fetch(new Request(`https://local.test${path}`, init), data as never, {} as never);
}

async function json(response: Response) {
  return response.json() as Promise<{ success: boolean; data?: unknown; error?: string }>;
}

const roomsAccess: Permission = { module_key: "rooms", can_access: 1, can_edit: 0 };
const movementsAccess: Permission = { module_key: "movements", can_access: 1, can_edit: 0 };
const receptionCompletion: ActionPermission = { action_key: "can_complete_checkin_checkout", allowed: 1 };

function currentUser(permissions: CurrentUser["permissions"], actionPermissions: CurrentUser["actionPermissions"] = []): CurrentUser {
  return {
    id: "rooms-1",
    displayName: "Rooms Operator",
    fullName: "Rooms Operator",
    profilePhotoUrl: null,
    role: "Operations",
    preferredLanguage: "en",
    username: "rooms",
    email: null,
    status: "active",
    views: ["staff"],
    permissions,
    actionPermissions,
    lastLoginAt: null,
  };
}

const roomsUser = currentUser([{ module: "rooms", canAccess: true, canEdit: false }]);
const housekeepingCapableUser = currentUser([
  { module: "rooms", canAccess: true, canEdit: false },
  { module: "housekeeping", canAccess: true, canEdit: true },
]);
const receptionCapableUser = currentUser(
  [
    { module: "rooms", canAccess: true, canEdit: false },
    { module: "movements", canAccess: true, canEdit: false },
  ],
  [{ action: "can_complete_checkin_checkout", allowed: true }],
);

function byName<T extends { roomName: string }>(rooms: T[], name: string): T {
  const room = rooms.find((item) => item.roomName === name);
  assert.ok(room, `${name} must exist`);
  return room;
}

function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

test("rooms workspace read model returns every independent operational dimension", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");

  const bungalow7 = byName(overview.rooms, "Bungalow 7");
  assert.equal(bungalow7.operational.availability.state, "OPERATING");
  assert.equal(bungalow7.operational.occupancy.state, "VACANT");
  assert.equal(bungalow7.operational.housekeeping.condition, "NOT_READY");
  assert.equal(bungalow7.operational.housekeeping.workState, "NONE");
  assert.equal(bungalow7.operational.maintenance.state, "BLOCKING");
  assert.equal(bungalow7.alertSummary, "Maintenance blocking");
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

test("Housekeeping domain summary exposes work and one primary action without changing room state", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02", housekeepingCapableUser);
  const readyOccupied = byName(overview.rooms, "Bungalow 3");
  const inProgress = byName(overview.rooms, "Bungalow 4");
  const available = byName(overview.rooms, "Bungalow 6");
  const blocked = byName(overview.rooms, "Bungalow 7");

  assert.equal(readyOccupied.housekeeping.primaryStatus, "CLEAN");
  assert.equal(readyOccupied.housekeeping.detail, "No work required");
  assert.deepEqual(readyOccupied.housekeeping.primaryAction, {
    type: "CREATE_ON_DEMAND_CLEANING",
    label: "Start On-demand Cleaning",
    taskId: null,
    version: null,
    completionMode: null,
    target: null,
  });

  assert.equal(available.housekeeping.primaryStatus, "Cleaning Required");
  assert.deepEqual(available.housekeeping.activeTask, {
    id: 6001,
    version: 1,
    taskType: "Cleaning",
    status: "AVAILABLE_FOR_CLAIM",
    priority: "NORMAL",
    assignee: null,
  });
  assert.deepEqual(available.housekeeping.primaryAction, {
    type: "START_HOUSEKEEPING_TASK",
    label: "Start Cleaning",
    taskId: 6001,
    version: 1,
    completionMode: null,
    target: null,
  });

  assert.equal(inProgress.housekeeping.primaryStatus, "Cleaning In Progress");
  assert.equal(inProgress.housekeeping.detail, "Assigned Dao");
  assert.deepEqual(inProgress.housekeeping.primaryAction, {
    type: "COMPLETE_HOUSEKEEPING_TASK",
    label: "Finish Cleaning",
    taskId: 4001,
    version: 3,
    completionMode: "STANDARD",
    target: null,
  });

  assert.equal(blocked.housekeeping.primaryStatus, "Cleaning Blocked");
  assert.equal(blocked.housekeeping.detail, "Maintenance Issue");
  assert.deepEqual(blocked.housekeeping.primaryAction, {
    type: "OPEN_MAINTENANCE",
    label: "Open Maintenance",
    taskId: null,
    version: null,
    completionMode: null,
    target: "/maintenance/7001",
  });
});

test("Housekeeping card defaults to CLEAN when no active task exists even if physical condition is NOT_READY", async () => {
  const rooms = [
    roomRow({
      unit_id: 12,
      unit_name: "Bungalow 12",
      ready_state: "NOT_READY",
      booking_id: 1201,
      beds24_booking_id: 91201,
      guest_name: "Ready Guest",
      arrival_date: "2026-08-01",
      departure_date: "2026-08-05",
    }),
  ];

  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02", housekeepingCapableUser);
  const defaultOverview = await getRoomsWorkspaceOverview(env([roomsAccess], { rooms }), "2026-08-02", housekeepingCapableUser);
  const room = byName(defaultOverview.rooms, "Bungalow 12");

  assert.equal(byName(overview.rooms, "Bungalow 7").operational.housekeeping.condition, "NOT_READY");
  assert.equal(room.operational.housekeeping.condition, "NOT_READY");
  assert.equal(room.housekeeping.primaryStatus, "CLEAN");
  assert.equal(room.housekeeping.detail, "No work required");
  assert.deepEqual(room.housekeeping.primaryAction, {
    type: "CREATE_ON_DEMAND_CLEANING",
    label: "Start On-demand Cleaning",
    taskId: null,
    version: null,
    completionMode: null,
    target: null,
  });
});

test("Housekeeping card prioritizes waiting Reception before cleaning actions", async () => {
  const rooms = [
    roomRow({
      unit_id: 14,
      unit_name: "Bungalow 14",
      ready_state: "NOT_READY",
      active_task_count: 1,
      active_task_id: 14001,
      active_task_version: 2,
      active_task_status: "WAITING_FOR_RECEPTION",
      active_task_type: "TURNOVER",
      active_task_priority: "URGENT",
    }),
  ];

  const overview = await getRoomsWorkspaceOverview(env([roomsAccess], { rooms }), "2026-08-02", housekeepingCapableUser);
  const room = byName(overview.rooms, "Bungalow 14");

  assert.equal(room.housekeeping.primaryStatus, "Waiting For Reception");
  assert.equal(room.housekeeping.detail, "Reception has not released the room");
  assert.equal(room.housekeeping.primaryAction, null);
  assert.equal(room.alertSummary, "Waiting for Reception");
});

test("Housekeeping card displays turnover work as Cleaning Required with Start Cleaning", async () => {
  const rooms = [
    roomRow({
      unit_id: 15,
      unit_name: "Bungalow 15",
      ready_state: "NOT_READY",
      active_task_count: 1,
      active_task_id: 15001,
      active_task_version: 1,
      active_task_status: "AVAILABLE_FOR_CLAIM",
      active_task_type: "TURNOVER",
      active_task_priority: "URGENT",
    }),
  ];

  const overview = await getRoomsWorkspaceOverview(env([roomsAccess], { rooms }), "2026-08-02", housekeepingCapableUser);
  const room = byName(overview.rooms, "Bungalow 15");

  assert.equal(room.housekeeping.primaryStatus, "Cleaning Required");
  assert.equal(room.housekeeping.detail, "Turnover");
  assert.deepEqual(room.housekeeping.primaryAction, {
    type: "START_HOUSEKEEPING_TASK",
    label: "Start Cleaning",
    taskId: 15001,
    version: 1,
    completionMode: null,
    target: null,
  });
});

test("maintenance states distinguish blocking active and clear", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");

  assert.equal(byName(overview.rooms, "Bungalow 7").operational.maintenance.state, "BLOCKING");
  assert.equal(byName(overview.rooms, "Bungalow 7").operational.maintenance.primaryTitle, "Replace Air Conditioning");
  assert.equal(byName(overview.rooms, "Bungalow 5").operational.maintenance.state, "ACTIVE");
  assert.equal(byName(overview.rooms, "Bungalow 2").operational.maintenance.state, "CLEAR");
});

test("Maintenance domain summary exposes clear active and blocking ticket actions", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02", roomsUser);

  assert.deepEqual(byName(overview.rooms, "Bungalow 2").maintenance.primaryAction, {
    type: "REPORT_ISSUE",
    label: "Report Issue",
    target: "/maintenance/new?roomId=2&source=rooms",
  });
  assert.deepEqual(byName(overview.rooms, "Bungalow 5").maintenance.primaryAction, {
    type: "CONTINUE_WORK",
    label: "Continue Work",
    target: "/maintenance/5001",
  });
  assert.deepEqual(byName(overview.rooms, "Bungalow 7").maintenance.primaryAction, {
    type: "OPEN_TICKET",
    label: "Open Ticket",
    target: "/maintenance/7001",
  });
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

test("Rooms occupancy comes from operational bookings, not Reception guest arrival flags", async () => {
  const rooms = [
    roomRow({
      unit_id: 18,
      unit_name: "Bungalow 18",
      booking_id: 1801,
      beds24_booking_id: 91801,
      guest_name: "Booking Engine Guest",
      arrival_date: "2026-08-01",
      departure_date: "2026-08-05",
      reception_booking_id: 1801,
      reception_beds24_booking_id: 91801,
      reception_arrival_date: "2026-08-01",
      reception_departure_date: "2026-08-05",
      reception_guest_arrived: 0,
    }),
    roomRow({
      unit_id: 19,
      unit_name: "Bungalow 19",
    }),
  ];

  const overview = await getRoomsWorkspaceOverview(env([roomsAccess], { rooms }), "2026-08-03");
  const occupied = byName(overview.rooms, "Bungalow 18");

  assert.equal(occupied.operational.occupancy.state, "OCCUPIED");
  assert.equal(occupied.currentStay?.guestName, "Booking Engine Guest");
  assert.deepEqual(overview.summary, {
    total: 2,
    occupied: 1,
    vacant: 1,
    maintenanceBlocked: 0,
    seasonClosed: 0,
  });
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

test("occupied in-house rooms return Reception phase and quiet completed steps", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02", roomsUser);
  const occupied = byName(overview.rooms, "Bungalow 3");

  assert.equal(occupied.reception.phase, "IN_HOUSE");
  assert.equal(occupied.reception.passport.state, "COMPLETE");
  assert.equal(occupied.reception.passport.completedAt, "2026-08-01T07:30:00.000Z");
  assert.equal(occupied.reception.deposit.state, "COMPLETE");
  assert.equal(occupied.reception.checkIn.state, "COMPLETE");
  assert.equal(occupied.reception.checkOut.state, "NOT_REQUIRED");
  assert.equal(occupied.reception.primaryAction, null);
});

test("arrival due rooms expose pending Reception steps and capability-gated action", async () => {
  const rooms = [
    roomRow({
      unit_id: 8,
      unit_name: "Bungalow 8",
      reception_booking_id: 801,
      reception_beds24_booking_id: 9801,
      reception_arrival_date: "2026-08-02",
      reception_departure_date: "2026-08-05",
    }),
  ];

  const readOnly = await getRoomsWorkspaceOverview(env([roomsAccess], { rooms }), "2026-08-02", roomsUser);
  const actionable = await getRoomsWorkspaceOverview(env([roomsAccess], { rooms }), "2026-08-02", receptionCapableUser);

  assert.equal(byName(readOnly.rooms, "Bungalow 8").reception.phase, "ARRIVAL_DUE");
  assert.equal(byName(readOnly.rooms, "Bungalow 8").reception.passport.state, "PENDING");
  assert.equal(byName(readOnly.rooms, "Bungalow 8").reception.deposit.state, "PENDING");
  assert.equal(byName(readOnly.rooms, "Bungalow 8").reception.checkIn.state, "PENDING");
  assert.equal(byName(readOnly.rooms, "Bungalow 8").reception.checkOut.state, "NOT_REQUIRED");
  assert.equal(byName(readOnly.rooms, "Bungalow 8").reception.primaryAction, null);
  assert.equal(byName(readOnly.rooms, "Bungalow 8").alertSummary, "Guest arriving today");
  assert.deepEqual(byName(actionable.rooms, "Bungalow 8").reception.primaryAction, {
    type: "COLLECT_PASSPORT",
    label: "Collect Passport",
    target: "/reception",
  });
});

test("departure due rooms prioritize checkout action over missing passport", async () => {
  const rooms = [
    roomRow({
      unit_id: 9,
      unit_name: "Bungalow 9",
      reception_booking_id: 901,
      reception_beds24_booking_id: 9901,
      reception_arrival_date: "2026-08-01",
      reception_departure_date: "2026-08-02",
      reception_guest_arrived: 1,
      reception_welcome_completed: 1,
      reception_keys_delivered: 1,
    }),
  ];

  const overview = await getRoomsWorkspaceOverview(env([roomsAccess], { rooms }), "2026-08-02", receptionCapableUser);
  const room = byName(overview.rooms, "Bungalow 9");

  assert.equal(room.reception.phase, "DEPARTURE_DUE");
  assert.equal(room.reception.passport.state, "PENDING");
  assert.equal(room.reception.checkIn.state, "PENDING");
  assert.equal(room.reception.checkOut.state, "PENDING");
  assert.equal(room.alertSummary, "Guest departing today");
  assert.deepEqual(room.reception.primaryAction, {
    type: "COMPLETE_CHECK_OUT",
    label: "Complete Check-out",
    target: "/reception",
  });
});

test("completed checkout phase comes from Reception checkout state", async () => {
  const rooms = [
    roomRow({
      unit_id: 10,
      unit_name: "Bungalow 10",
      reception_booking_id: 1001,
      reception_beds24_booking_id: 91001,
      reception_arrival_date: "2026-08-01",
      reception_departure_date: "2026-08-02",
      reception_guest_arrived: 1,
      reception_passport_collected: 1,
      reception_welcome_completed: 1,
      reception_keys_delivered: 1,
      reception_guest_left: 1,
      reception_keys_returned: 1,
      reception_room_released: 1,
      reception_updated_at: "2026-08-02T05:00:00.000Z",
      check_out_completed_at: "2026-08-02T05:00:00.000Z",
    }),
  ];

  const overview = await getRoomsWorkspaceOverview(env([roomsAccess], { rooms }), "2026-08-02", receptionCapableUser);
  const room = byName(overview.rooms, "Bungalow 10");

  assert.equal(room.reception.phase, "CHECKED_OUT");
  assert.equal(room.reception.checkOut.state, "COMPLETE");
  assert.equal(room.reception.checkOut.completedAt, "2026-08-02T05:00:00.000Z");
  assert.equal(room.reception.primaryAction, null);
});

test("vacant rooms with no operational Reception state return NONE and no card action", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02", receptionCapableUser);
  const vacant = byName(overview.rooms, "Bungalow 2");

  assert.equal(vacant.reception.phase, "NONE");
  assert.deepEqual(vacant.reception.passport, { state: "NOT_REQUIRED", completedAt: null });
  assert.deepEqual(vacant.reception.alerts, []);
  assert.equal(vacant.reception.primaryAction, null);
});

test("unresolved Reception alerts are exposed and resolved alerts are excluded", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess], {
    alerts: [
      { alert_id: 1, unit_id: 2, alert_type: "passport_missing", title: "Legacy title", status: "active" },
      { alert_id: 2, unit_id: 2, alert_type: "deposit_pending", title: "Deposit pending", status: "resolved" },
    ],
  }), "2026-08-02", roomsUser);
  const room = byName(overview.rooms, "Bungalow 2");

  assert.equal(room.reception.phase, "NONE");
  assert.deepEqual(room.reception.alerts, [
    { id: 1, type: "passport_missing", label: "Passport Missing", tone: "warning" },
  ]);
  assert.equal(room.alertSummary, "Passport missing");
});

test("late checkout is exposed as a Reception alert summary, not a cleaning state", async () => {
  const rooms = [
    roomRow({
      unit_id: 16,
      unit_name: "Bungalow 16",
      reception_booking_id: 1601,
      reception_beds24_booking_id: 91601,
      reception_arrival_date: "2026-08-01",
      reception_departure_date: "2026-08-01",
      reception_guest_arrived: 1,
      reception_welcome_completed: 1,
      reception_keys_delivered: 1,
      reception_room_released: 0,
      ready_state: "READY",
    }),
  ];

  const overview = await getRoomsWorkspaceOverview(env([roomsAccess], { rooms }), "2026-08-02", roomsUser);
  const room = byName(overview.rooms, "Bungalow 16");

  assert.equal(room.operational.housekeeping.condition, "READY");
  assert.equal(room.alertSummary, "Late checkout");
  assert.equal(room.housekeeping.primaryStatus, "CLEAN");
});

test("Reception primary actions require the existing Reception action capability", async () => {
  const today = todayBangkok();
  const rooms = [
    roomRow({
      unit_id: 11,
      unit_name: "Bungalow 11",
      reception_booking_id: 1101,
      reception_beds24_booking_id: 91101,
      reception_arrival_date: today,
      reception_departure_date: addDays(today, 2),
    }),
  ];

  const withoutAction = await request(
    "/api/rooms",
    { method: "GET", headers: { cookie: "vanara_session=x" } },
    env([roomsAccess, movementsAccess], [], { rooms }),
  );
  const withAction = await request(
    "/api/rooms",
    { method: "GET", headers: { cookie: "vanara_session=x" } },
    env([roomsAccess, movementsAccess], [receptionCompletion], { rooms }),
  );
  const withoutBody = await json(withoutAction);
  const withBody = await json(withAction);
  const withoutRoom = byName((withoutBody.data as { rooms: Array<{ roomName: string; reception: { primaryAction: unknown } }> }).rooms, "Bungalow 11");
  const withRoom = byName((withBody.data as { rooms: Array<{ roomName: string; reception: { primaryAction: unknown } }> }).rooms, "Bungalow 11");

  assert.equal(withoutAction.status, 200);
  assert.equal(withAction.status, 200);
  assert.equal(withoutRoom.reception.primaryAction, null);
  assert.deepEqual(withRoom.reception.primaryAction, {
    type: "COLLECT_PASSPORT",
    label: "Collect Passport",
    target: "/reception",
  });
});

test("Rooms executive summary categories are mutually exclusive and reconcile to total units", async () => {
  const overview = await getRoomsWorkspaceOverview(env([roomsAccess]), "2026-08-02");
  const categorizedTotal = overview.summary.occupied
    + overview.summary.vacant
    + overview.summary.maintenanceBlocked
    + overview.summary.seasonClosed;

  assert.deepEqual(overview.summary, {
    total: 8,
    occupied: 1,
    vacant: 4,
    maintenanceBlocked: 1,
    seasonClosed: 2,
  });
  assert.equal(categorizedTotal, overview.summary.total);
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
