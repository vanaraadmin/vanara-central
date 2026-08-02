import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import { getStaffOverview } from "../src/services/staff-overview.service.ts";
import type { CurrentUser, ModuleKey } from "../src/services/current-user.service.ts";

type Permission = { module_key: ModuleKey; can_access: number; can_edit: number };

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

const RECENT_BOOKING_EVENT_AT = new Date(Date.now() - 60_000).toISOString();

function currentUser(
  permissions: Array<{ module: ModuleKey; canAccess: boolean; canEdit: boolean }>,
  role: CurrentUser["role"] = "Operations",
): CurrentUser {
  return {
    id: USER_ROW.user_id,
    displayName: USER_ROW.full_name,
    fullName: USER_ROW.full_name,
    profilePhotoUrl: null,
    role,
    preferredLanguage: "en",
    username: USER_ROW.username,
    email: null,
    status: "active",
    views: ["staff"],
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
  constructor(private permissions: Permission[], private options: { authenticated?: boolean; staffView?: boolean } = {}) {}

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
            booking_id: 9001,
            guest_name: "Mali Guest",
            api_source: "Beds24",
            channel: "Direct",
            open_issues: 1,
            out_of_service: 1,
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
            open_issues: 0,
            out_of_service: 0,
          },
        ] as T[],
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

function env(permissions: Permission[], options?: { authenticated?: boolean; staffView?: boolean }) {
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
const ownerDashboardAccess: Permission = { module_key: "owner-dashboard", can_access: 1, can_edit: 0 };

test("staff overview filters cards using effective module permissions", async () => {
  const overview = await getStaffOverview(env([housekeepingAccess]), currentUser([{ module: "housekeeping", canAccess: true, canEdit: false }]));
  assert.deepEqual(overview.cards.map((card) => card.id), ["housekeeping"]);
  assert.equal(overview.cards[0]?.href, "/housekeeping");
  assert.equal(overview.cards[0]?.metrics.some((metric) => metric.value === 0), true);
});

test("staff overview supports users with multiple permissions without owner data", async () => {
  const overview = await getStaffOverview(env([movementsAccess, roomsAccess, maintenanceAccess, procurementAccess]), currentUser([
    { module: "movements", canAccess: true, canEdit: false },
    { module: "rooms", canAccess: true, canEdit: false },
    { module: "maintenance", canAccess: true, canEdit: false },
    { module: "procurement", canAccess: true, canEdit: false },
  ]));
  assert.deepEqual(overview.cards.map((card) => card.id), ["reception", "rooms", "availability", "maintenance", "procurement"]);
  assert.equal(JSON.stringify(overview).includes("owner-dashboard"), false);
  assert.equal(JSON.stringify(overview).includes("Dashboard Owner"), false);
});

test("staff overview can return an empty operational home for active users without module access", async () => {
  const overview = await getStaffOverview(env([]), currentUser([]));
  assert.deepEqual(overview.cards, []);
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

  assert.equal(operationsOverview.bookingPulseCapabilities.canViewBookingValue, false);
  assert.equal(operationsOverview.bookingEvents[0]?.totalPrice, null);
  assert.equal(managerOverview.bookingPulseCapabilities.canViewBookingValue, true);
  assert.equal(managerOverview.bookingEvents[0]?.totalPrice, 12000);
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
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.id, "housekeeping");
  assert.equal(cards[0]?.href, "/housekeeping");
  assert.equal(cards[0]?.metrics.find((metric) => metric.label === "To clean")?.value, 0);
});
