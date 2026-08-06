import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

import worker from "../src/index.ts";
import { getStaffOverview } from "../src/services/staff-overview.service.ts";
import type { CurrentUser, ModuleKey } from "../src/services/current-user.service.ts";
import type { HousekeepingTaskStatus, HousekeepingTaskType } from "../src/services/housekeeping-task-domain.service.ts";

type Permission = { module_key: ModuleKey; can_access: number; can_edit: number };
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

const USER_ROW = {
  user_id: "staff-1",
  full_name: "Nok Staff",
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

const STAFF_OVERVIEW_TEST_DATE = "2026-08-03";
const STAFF_OVERVIEW_TEST_NOW = new Date("2026-08-03T05:00:00.000Z");
const RECENT_BOOKING_EVENT_AT = "2026-08-03T04:59:00.000Z";

test.before(() => {
  mock.timers.enable({ apis: ["Date"], now: STAFF_OVERVIEW_TEST_NOW });
});

test.after(() => {
  mock.timers.reset();
});

function currentUser(
  permissions: Array<{ module: ModuleKey; canAccess: boolean; canEdit: boolean }>,
  role: CurrentUser["role"] = "Operations",
  views: CurrentUser["views"] = ["staff"],
  preferredLanguage: CurrentUser["preferredLanguage"] = "en",
): CurrentUser {
  return {
    id: USER_ROW.user_id,
    displayName: USER_ROW.full_name,
    fullName: USER_ROW.full_name,
    profilePhotoUrl: null,
    role,
    preferredLanguage,
    username: USER_ROW.username,
    email: null,
    status: "active",
    views,
    permissions,
    actionPermissions: [],
    lastLoginAt: null,
  };
}

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeStaffDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return Promise.resolve({ meta: { changes: 0, last_row_id: 0 } }); }
}

class FakeStaffDB {
  private housekeepingTasks: TaskRow[] = [
    taskRow({
      task_id: 1,
      task_type: "STANDARD_CLEANING",
      status: "IN_PROGRESS",
      assigned_user_id: USER_ROW.user_id,
      assigned_user_name: USER_ROW.full_name,
      started_at: "2026-08-03T03:00:00.000Z",
    }),
    taskRow({
      task_id: 2,
      task_type: "WATER_REFILL",
      status: "AVAILABLE_FOR_CLAIM",
    }),
    taskRow({
      task_id: 3,
      task_type: "ON_DEMAND_CLEANING",
      status: "COMPLETED",
      completed_at: "2026-08-03T04:00:00.000Z",
    }),
  ];

  constructor(private permissions: Permission[], private options: { authenticated?: boolean; staffView?: boolean; housekeepingTasks?: TaskRow[] } = {}) {
    if (options.housekeepingTasks) this.housekeepingTasks = options.housekeepingTasks;
  }

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async all<T>(sql: string, _params: unknown[]) {
    void _params;
    if (sql.includes("SELECT view_key FROM user_views")) {
      return { results: this.options.staffView === false ? [{ view_key: "owner" }] as T[] : [{ view_key: "staff" }] as T[] };
    }
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) return { results: this.permissions as T[] };
    if (sql.includes("FROM booking_events")) {
      return {
        results: [
          {
            booking_event_id: 501,
            event_type: "new",
            beds24_booking_id: 9001,
            event_accommodation: "Villa 10",
            event_source: "Booking.com",
            occurred_at: RECENT_BOOKING_EVENT_AT,
            guest_name: "Mali Guest",
            country: "Thailand",
            country_code: "TH",
            unit_id: 1,
            unit_name: "Villa 10",
            arrival_date: "2026-08-01",
            departure_date: "2026-08-03",
            booking_status: "Confirmed",
            adults: 2,
            children: 0,
            price: 12000,
            api_source: "Beds24",
            channel: "Direct",
          },
        ] as T[],
      };
    }
    if (sql.includes("COALESCE(roa.status, 'OPERATING') AS operational_availability_status")) {
      return {
        results: [
          { unit_id: 1, unit_name: "Villa 10", unit_type: "villa", room_type_name: "Garden Villa", room_name: "Garden Villa", operational_availability_status: "OPERATING" },
          { unit_id: 2, unit_name: "Bungalow 1", unit_type: "bungalow", room_type_name: "Bungalow", room_name: "Bungalow", operational_availability_status: "OPERATING" },
        ] as T[],
      };
    }
    if (sql.includes("FROM units u") && sql.includes("LEFT JOIN room_operational_availability") && sql.includes("LEFT JOIN room_housekeeping_state")) {
      return {
        results: [
          {
            unit_id: 1,
            unit_name: "Villa 10",
            unit_type: "villa",
            room_type_name: "Garden Villa",
            room_name: "Garden Villa",
            position: 1,
            availability_status: "OPERATING",
            ready_state: "NOT_READY",
            booking_id: 101,
            beds24_booking_id: 9001,
            guest_name: "Mali Guest",
            country: "Thailand",
            country_code: "TH",
            arrival_date: "2026-08-01",
            departure_date: "2026-08-06",
            api_source: "Beds24",
            channel: "Direct",
            active_task_count: 2,
            active_task_id: 1,
            active_task_version: 1,
            active_task_status: "IN_PROGRESS",
            active_task_type: "STANDARD_CLEANING",
            active_task_priority: "NORMAL",
            active_task_assignee: USER_ROW.full_name,
            active_ticket_count: 0,
            blocking_ticket_count: 0,
            primary_maintenance_ticket_id: null,
            primary_maintenance_title: null,
          },
          {
            unit_id: 2,
            unit_name: "Bungalow 1",
            unit_type: "bungalow",
            room_type_name: "Bungalow",
            room_name: "Bungalow",
            position: 2,
            availability_status: "OPERATING",
            ready_state: "READY",
            booking_id: null,
            guest_name: null,
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
          },
        ] as T[],
      };
    }
    if (sql.includes("FROM bookings b") && sql.includes("JOIN units u ON u.unit_id = b.unit_id") && sql.includes("rs.guest_arrived")) {
      const hasReleasedTurnover = this.housekeepingTasks.some((task) => task.task_type === "TURNOVER" && task.operational_date === STAFF_OVERVIEW_TEST_DATE);
      return {
        results: [{
          booking_id: 101,
          beds24_booking_id: 9001,
          unit_id: 1,
          guest_name: "Mali Guest",
          arrival_date: "2026-08-01",
          departure_date: hasReleasedTurnover ? STAFF_OVERVIEW_TEST_DATE : "2026-08-06",
          arrival_time: "14:00",
          channel: "Direct",
          api_source: "Beds24",
          status: "Confirmed",
          guest_arrived: 1,
          room_released: hasReleasedTurnover ? 1 : 0,
        }] as T[],
      };
    }
    if (sql.includes("WITH latest_housekeeping")) {
      return {
        results: [
          {
            unit_id: 1,
            unit_name: "Villa 10",
            housekeeping_id: 1,
            housekeeping_status: "Dirty",
            assigned_to: null,
            assigned_user_id: null,
            assigned_user_name: null,
            assigned_at: null,
            updated_at: "2026-07-30T00:00:00.000Z",
            updated_by: USER_ROW.user_id,
            updated_by_name: USER_ROW.full_name,
            checklist_json: null,
            has_today_arrival: 1,
            has_current_occupancy: 0,
            has_scheduled_checkout_today: 0,
          },
          {
            unit_id: 2,
            unit_name: "Villa 11",
            housekeeping_id: 2,
            housekeeping_status: "Ready",
            assigned_to: null,
            assigned_user_id: null,
            assigned_user_name: null,
            assigned_at: null,
            updated_at: "2026-07-30T00:00:00.000Z",
            updated_by: USER_ROW.user_id,
            updated_by_name: USER_ROW.full_name,
            checklist_json: null,
            has_today_arrival: 0,
            has_current_occupancy: 0,
            has_scheduled_checkout_today: 0,
          },
        ] as T[],
      };
    }
    if (sql.includes("FROM housekeeping_tasks ht") && sql.includes("rs.room_released = 1")) return { results: [] as T[] };
    if (sql.includes("FROM housekeeping_tasks")) return { results: [...this.housekeepingTasks] as T[] };
    if (sql.includes("FROM housekeeping_room_counters")) return { results: [] as T[] };
    if (sql.includes("FROM reception_room_alerts")) return { results: [] as T[] };
    if (sql.includes("FROM maintenance_tickets") && sql.includes("GROUP BY room_id")) return { results: [] as T[] };
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
    if (sql.includes("FROM bookings b") && sql.includes("ORDER BY u.position")) {
      return {
        results: [{
          beds24_booking_id: 9001,
          guest_name: "Mali Guest",
          unit_id: 1,
          unit_name: "Villa 10",
          room_type_name: "Garden Villa",
          adults: 2,
          children: 0,
          arrival_date: "2026-07-30",
          departure_date: "2026-07-31",
          channel: "Beds24",
          api_source: "Beds24",
          api_reference: "B24-9001",
          status: "Confirmed",
        }] as T[],
      };
    }
    if (sql.includes("FROM reception_guest_notes")) return { results: [] as T[] };
    if (sql.includes("FROM reception_events")) return { results: [] as T[] };
    if (sql.includes("FROM maintenance_tickets t")) {
      return {
        results: [{
          ticket_id: 7001,
          title: "AC noise",
          description: "AC is noisy.",
          category: "Air Conditioning",
          priority: "High",
          status: "Waiting Parts",
          room_id: 1,
          room_name: "Villa 10",
          accommodation_id: 11,
          accommodation_name: "Garden Villa",
          location_area: null,
          assignment_type: "INTERNAL",
          assigned_user_id: USER_ROW.user_id,
          assigned_user_name: USER_ROW.full_name,
          external_assignee_label: null,
          external_assignee_note: null,
          reported_by: "owner-local",
          reported_by_name: "Owner",
          created_at: "2026-07-30T00:00:00.000Z",
          updated_at: "2026-07-30T00:00:00.000Z",
          assigned_at: "2026-07-30T00:00:00.000Z",
          started_at: null,
          resolved_at: null,
          closed_at: null,
          resolved_by: null,
          resolved_by_name: null,
          closed_by: null,
          closed_by_name: null,
          out_of_service: 0,
          waiting_reason: "Part needed",
          note_count: 0,
          photo_count: 0,
        }] as T[],
      };
    }
    return { results: [] as T[] };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT s.session_id")) {
      if (this.options.authenticated === false) return null;
      return {
        session_id: "session-1",
        expires_at: "2999-01-01T00:00:00.000Z",
        ...USER_ROW,
      } as T;
    }
    if (sql.includes("SELECT * FROM reception_stays WHERE beds24_booking_id")) return null;
    if (sql.includes("SELECT beds24_booking_id FROM bookings WHERE beds24_booking_id")) return { beds24_booking_id: params[0] } as T;
    return null;
  }
}

function taskRow(overrides: Partial<TaskRow>): TaskRow {
  return {
    task_id: 1,
    task_type: "STANDARD_CLEANING",
    unit_id: 1,
    booking_id: 101,
    stay_id: 9001,
    operational_date: "2026-08-03",
    due_cycle_date: "2026-08-03",
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
    created_at: "2026-08-03T02:00:00.000Z",
    updated_at: "2026-08-03T02:00:00.000Z",
    ...overrides,
  };
}

function env(permissions: Permission[], options?: { authenticated?: boolean; staffView?: boolean; housekeepingTasks?: TaskRow[] }) {
  return {
    DB: new FakeStaffDB(permissions, options) as unknown as D1Database,
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
const roomsAccess: Permission = { module_key: "rooms", can_access: 1, can_edit: 0 };
const housekeepingAccess: Permission = { module_key: "housekeeping", can_access: 1, can_edit: 0 };
const maintenanceAccess: Permission = { module_key: "maintenance", can_access: 1, can_edit: 0 };
const procurementAccess: Permission = { module_key: "procurement", can_access: 1, can_edit: 0 };
const socialAutomationAccess: Permission = { module_key: "social-automation", can_access: 1, can_edit: 1 };
const ownerDashboardAccess: Permission = { module_key: "owner-dashboard", can_access: 1, can_edit: 0 };

test("staff overview returns the complete operational workspace set for the Staff visual experience", async () => {
  const overview = await getStaffOverview(env([]), currentUser([]), STAFF_OVERVIEW_TEST_DATE);
  assert.deepEqual(overview.cards.map((card) => card.id), ["reception", "rooms", "housekeeping", "maintenance", "procurement"]);
  assert.deepEqual(overview.cards.map((card) => card.href), ["/reception", "/rooms", "/housekeeping", "/maintenance", "/procurement"]);
  assert.equal(JSON.stringify(overview).includes("owner-dashboard"), false);
});

test("staff overview housekeeping summary derives from the Housekeeping V2 task engine", async () => {
  const overview = await getStaffOverview(env([housekeepingAccess]), currentUser([{ module: "housekeeping", canAccess: true, canEdit: false }]), STAFF_OVERVIEW_TEST_DATE);
  const card = overview.cards.find((item) => item.id === "housekeeping");
  assert.ok(card);

  assert.deepEqual(card.metrics, [
    { label: "To Clean", value: 0, tone: "good" },
    { label: "Cleaning In Progress", value: 1, tone: "attention" },
    { label: "Completed Cleaning Today", value: 0, tone: "good" },
    { label: "Water Due", value: 1, tone: "attention" },
  ]);
  assert.equal(card.metrics.length, 4);
  assert.equal(card.metrics.some((metric) => metric.label === "Blocked"), false);
  assert.equal(card.metrics.some((metric) => metric.label === "Completed Today"), false);
  assert.equal(card.summaryLine1, "0 To Clean / 1 Cleaning In Progress");
  assert.equal(card.summaryLine2, "0 Completed Cleaning Today / 1 Water Due");
});

test("staff overview surfaces released priority turnover as actionable cleaning work", async () => {
  const overview = await getStaffOverview(
    env([housekeepingAccess], {
      housekeepingTasks: [
        taskRow({
          task_id: 41,
          task_type: "TURNOVER",
          status: "AVAILABLE_FOR_CLAIM",
          priority: "URGENT",
          source: "reception_release",
        }),
        taskRow({
          task_id: 42,
          task_type: "WATER_REFILL",
          status: "AVAILABLE_FOR_CLAIM",
        }),
      ],
    }),
    currentUser([{ module: "housekeeping", canAccess: true, canEdit: false }]),
    STAFF_OVERVIEW_TEST_DATE,
  );
  const card = overview.cards.find((item) => item.id === "housekeeping");
  assert.ok(card);
  assert.equal(card.metrics.find((metric) => metric.label === "Priority Turnover")?.value, 1);
  assert.equal(card.metrics.find((metric) => metric.label === "Priority Turnover")?.tone, "urgent");
  assert.equal(card.metrics.find((metric) => metric.label === "Normal To Clean")?.value, 0);
  assert.equal(card.metrics.some((metric) => metric.label === "To Clean"), false);
  assert.equal(card.summaryLine1, "1 Priority Turnover / 0 Normal To Clean");
  assert.equal(card.summaryLine1.includes("1 Priority Turnover"), true);
  assert.equal(card.summaryLine2, "0 Cleaning In Progress / 0 Water Due");
});

test("staff overview priority turnover presentation does not own checkout release behavior", () => {
  const source = readFileSync(new URL("../src/services/staff-overview.service.ts", import.meta.url), "utf8");
  assert.equal(source.includes("ensureTurnoverReleasedForCheckout"), false);
  assert.equal(source.includes("release_from_reception"), false);
  assert.equal(source.includes("completeReceptionEvent"), false);
  assert.equal(source.includes("reception_stays"), false);
});

test("staff overview rooms summary exposes reconciled operating counters from the Rooms read model", async () => {
  const overview = await getStaffOverview(env([roomsAccess]), currentUser([{ module: "rooms", canAccess: true, canEdit: false }]), STAFF_OVERVIEW_TEST_DATE);
  const card = overview.cards.find((item) => item.id === "rooms");
  assert.ok(card);

  assert.deepEqual(card.metrics, [
    { label: "Occupied", value: 1, tone: "neutral" },
    { label: "Vacant", value: 1, tone: "good" },
    { label: "Maintenance Blocked", value: 0, tone: "neutral" },
    { label: "Season Closed", value: 0, tone: "neutral" },
  ]);
  assert.equal(card.metrics[0].value + card.metrics[1].value + card.metrics[2].value + card.metrics[3].value, 2);
  assert.equal(card.summaryLine1, "1 Occupied / 1 Vacant");
  assert.equal(card.summaryLine2, "0 Maintenance Blocked / 0 Season Closed");
});

test("staff overview supports users with multiple permissions without owner data", async () => {
  const overview = await getStaffOverview(env([movementsAccess, roomsAccess, maintenanceAccess, procurementAccess]), currentUser([
    { module: "movements", canAccess: true, canEdit: false },
    { module: "rooms", canAccess: true, canEdit: false },
    { module: "maintenance", canAccess: true, canEdit: false },
    { module: "procurement", canAccess: true, canEdit: false },
  ]));
  assert.deepEqual(overview.cards.map((card) => card.id), ["reception", "rooms", "housekeeping", "maintenance", "procurement"]);
  assert.equal(JSON.stringify(overview).includes("owner-dashboard"), false);
  assert.equal(JSON.stringify(overview).includes("Dashboard Owner"), false);
});

test("staff overview module perimeter is identical for English and Thai staff and excludes Guest Messages", async () => {
  const permissions = [
    { module: "movements" as ModuleKey, canAccess: true, canEdit: false },
    { module: "rooms" as ModuleKey, canAccess: true, canEdit: false },
    { module: "housekeeping" as ModuleKey, canAccess: true, canEdit: false },
    { module: "maintenance" as ModuleKey, canAccess: true, canEdit: false },
    { module: "procurement" as ModuleKey, canAccess: true, canEdit: false },
    { module: "messages" as ModuleKey, canAccess: true, canEdit: false },
    { module: "chat" as ModuleKey, canAccess: true, canEdit: false },
  ];
  const enOverview = await getStaffOverview(env([movementsAccess, roomsAccess, maintenanceAccess, procurementAccess]), currentUser(permissions, "Operations", ["staff"], "en"));
  const thOverview = await getStaffOverview(env([movementsAccess, roomsAccess, maintenanceAccess, procurementAccess]), currentUser(permissions, "Operations", ["staff"], "th"));

  assert.deepEqual(thOverview.cards.map((card) => card.id), enOverview.cards.map((card) => card.id));
  assert.equal(enOverview.cards.some((card) => card.id === "messages" || card.href === "/messages"), false);
  assert.equal(thOverview.cards.some((card) => card.id === "messages" || card.href === "/messages"), false);
});

test("staff overview exposes Social Automation only to owners with the social module", async () => {
  const ownerOverview = await getStaffOverview(
    env([socialAutomationAccess]),
    currentUser([{ module: "social-automation", canAccess: true, canEdit: true }], "Owner", ["staff", "owner"]),
    STAFF_OVERVIEW_TEST_DATE,
  );
  const ownerCard = ownerOverview.cards.find((card) => card.id === "social");
  assert.ok(ownerCard);
  assert.equal(ownerCard.title, "Social Automation");
  assert.equal(ownerCard.href, "/social-automation");

  const staffOverview = await getStaffOverview(
    env([socialAutomationAccess]),
    currentUser([{ module: "social-automation", canAccess: true, canEdit: true }], "Operations", ["staff"]),
    STAFF_OVERVIEW_TEST_DATE,
  );
  assert.equal(staffOverview.cards.some((card) => card.id === "social"), false);
});

test("staff overview does not return an empty operational home for active Staff users without explicit module grants", async () => {
  const overview = await getStaffOverview(env([]), currentUser([]));
  assert.equal(overview.cards.length, 5);
  assert.equal(overview.cards.some((card) => card.id === "chat"), false);
});

test("staff overview includes the persisted recent booking event feed", async () => {
  const overview = await getStaffOverview(env([]), currentUser([]));
  assert.deepEqual(overview.bookingPulseCapabilities, { canViewBookingValue: false });
  assert.deepEqual(overview.bookingEvents, [
    {
      eventId: `9001:NEW:${RECENT_BOOKING_EVENT_AT}`,
      bookingId: "9001",
      eventType: "NEW",
      eventTimestamp: RECENT_BOOKING_EVENT_AT,
      guestName: "Mali Guest",
      nationality: "Thailand",
      countryCode: "TH",
      unitId: 1,
      unitName: "Villa 10",
      unitNames: ["Villa 10"],
      roomQuantity: 1,
      compactUnitLabel: "Villa 10",
      assignmentComplete: true,
      source: "Booking.com",
      arrivalDate: "2026-08-01",
      departureDate: "2026-08-03",
      stayNights: 2,
      bookingStatus: "Confirmed",
      guestCount: 2,
      totalPrice: null,
    },
  ]);
});

test("staff overview exposes booking value only through the server-side financial capability", async () => {
  const operationsOverview = await getStaffOverview(
    env([ownerDashboardAccess]),
    currentUser([{ module: "owner-dashboard", canAccess: true, canEdit: false }], "Operations"),
  );
  const managerOverview = await getStaffOverview(
    env([ownerDashboardAccess]),
    currentUser([{ module: "owner-dashboard", canAccess: true, canEdit: false }], "Manager"),
  );
  const ownerOverview = await getStaffOverview(
    env([ownerDashboardAccess]),
    currentUser([{ module: "owner-dashboard", canAccess: true, canEdit: false }], "Owner", ["staff", "owner"]),
  );

  assert.equal(operationsOverview.bookingPulseCapabilities.canViewBookingValue, false);
  assert.equal(operationsOverview.bookingEvents[0]?.totalPrice, null);
  assert.equal(managerOverview.bookingPulseCapabilities.canViewBookingValue, false);
  assert.equal(managerOverview.bookingEvents[0]?.totalPrice, null);
  assert.equal(ownerOverview.bookingPulseCapabilities.canViewBookingValue, true);
  assert.equal(ownerOverview.bookingEvents[0]?.totalPrice, 12000);
});

test("staff overview API enforces authentication and staff view", async () => {
  assert.equal((await request("/api/staff/overview", { method: "GET" }, env([], { authenticated: false }))).status, 401);
  assert.equal((await request("/api/staff/overview", { method: "GET", headers: { cookie: "vanara_session=x" } }, env([], { staffView: false }))).status, 403);
  const response = await request("/api/staff/overview", { method: "GET", headers: { cookie: "vanara_session=x" } }, env([housekeepingAccess]));
  assert.equal(response.status, 200);
  const body = await json(response);
  const data = body.data as {
    bookingEvents: Array<{ eventType: string; guestName: string; unitName: string }>;
    cards: Array<{ id: string; href: string; metrics: Array<{ label: string; value: number }> }>;
  };
  const cards = data.cards;
  assert.equal(data.bookingEvents[0]?.eventType, "NEW");
  assert.equal(data.bookingEvents[0]?.guestName, "Mali Guest");
  assert.equal(data.bookingEvents[0]?.unitName, "Villa 10");
  assert.equal(cards.length, 5);
  assert.deepEqual(cards.map((card) => card.id), ["reception", "rooms", "housekeeping", "maintenance", "procurement"]);
  const housekeeping = cards.find((card) => card.id === "housekeeping");
  assert.ok(housekeeping);
  assert.equal(housekeeping.href, "/housekeeping");
  assert.equal(housekeeping.metrics.find((metric) => metric.label === "To Clean")?.value, 0);
  assert.equal(housekeeping.metrics.find((metric) => metric.label === "Cleaning In Progress")?.value, 1);
  assert.equal(housekeeping.metrics.find((metric) => metric.label === "Water Due")?.value, 1);
});
