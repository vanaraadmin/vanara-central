import assert from "node:assert/strict";
import test from "node:test";

import { getDashboardOverview } from "../src/services/dashboard.service.ts";

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeDashboardDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
}

class FakeDashboardDB {
  prepare(sql: string) { return new FakeStmt(this, sql); }

  async all<T>(sql: string, params: unknown[]) {
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
            updated_at: "2026-07-30T07:00:00.000Z",
            updated_by: null,
            updated_by_name: null,
            checklist_json: null,
            has_today_arrival: 1,
            has_current_occupancy: 0,
            has_scheduled_checkout_today: 0,
          },
          {
            unit_id: 2,
            unit_name: "Bungalow 7",
            housekeeping_id: 2,
            housekeeping_status: "Cleaning",
            assigned_to: "Nok",
            assigned_user_id: "staff-housekeeping",
            assigned_user_name: "Nok",
            assigned_at: "2026-07-30T07:15:00.000Z",
            updated_at: "2026-07-30T07:15:00.000Z",
            updated_by: null,
            updated_by_name: null,
            checklist_json: null,
            has_today_arrival: 0,
            has_current_occupancy: 0,
            has_scheduled_checkout_today: 0,
          },
        ] as T[],
      };
    }
    if (sql.includes("FROM maintenance_tickets t")) {
      return {
        results: [
          {
            ticket_id: 10,
            title: "AC issue",
            description: "AC not cooling",
            category: "Air Conditioning",
            priority: "Critical",
            status: "In Progress",
            room_id: 1,
            room_name: "Villa 10",
            accommodation_id: null,
            accommodation_name: null,
            location_area: null,
            assignment_type: "INTERNAL",
            assigned_user_id: "maintenance-1",
            assigned_user_name: "Pon",
            external_assignee_label: null,
            external_assignee_note: null,
            reported_by: "owner",
            reported_by_name: "Owner",
            created_at: "2026-07-30T06:00:00.000Z",
            updated_at: "2026-07-30T06:30:00.000Z",
            assigned_at: "2026-07-30T06:05:00.000Z",
            started_at: "2026-07-30T06:30:00.000Z",
            resolved_at: null,
            closed_at: null,
            resolved_by: null,
            resolved_by_name: null,
            closed_by: null,
            closed_by_name: null,
            out_of_service: 1,
            waiting_reason: null,
            note_count: 0,
            photo_count: 0,
          },
          {
            ticket_id: 11,
            title: "External plumber",
            description: "Waiting for plumber",
            category: "Water",
            priority: "High",
            status: "Waiting Parts",
            room_id: null,
            room_name: null,
            accommodation_id: null,
            accommodation_name: null,
            location_area: "Pond",
            assignment_type: "EXTERNAL",
            assigned_user_id: null,
            assigned_user_name: null,
            external_assignee_label: "Plumber",
            external_assignee_note: "Called",
            reported_by: "owner",
            reported_by_name: "Owner",
            created_at: "2026-07-30T06:00:00.000Z",
            updated_at: "2026-07-30T06:30:00.000Z",
            assigned_at: "2026-07-30T06:05:00.000Z",
            started_at: null,
            resolved_at: null,
            closed_at: null,
            resolved_by: null,
            resolved_by_name: null,
            closed_by: null,
            closed_by_name: null,
            out_of_service: 0,
            waiting_reason: "Waiting for external plumber",
            note_count: 0,
            photo_count: 0,
          },
        ] as T[],
      };
    }
    if (sql.includes("FROM bookings b") && sql.includes("arrival_date =")) return { results: [{ beds24_booking_id: 1, guest_name: "Guest", unit_name: "Villa 10", room_type_name: "Villa", adults: 2, children: 0, arrival_date: String(params[0]), departure_date: "2026-07-31", channel: "Direct", status: "confirmed", api_reference: null }] as T[] };
    if (sql.includes("FROM bookings b") && sql.includes("departure_date =")) return { results: [] as T[] };
    if (sql.includes("SELECT * FROM users ORDER BY full_name")) {
      return {
        results: [
          { user_id: "staff-housekeeping", full_name: "Nok", profile_photo_url: null, role: "Housekeeping", preferred_language: "en", username: "nok", email: null, password_hash: "hidden", status: "active", created_at: "2026-07-30", updated_at: "2026-07-30", last_login_at: null },
          { user_id: "maintenance-1", full_name: "Pon", profile_photo_url: null, role: "Maintenance", preferred_language: "en", username: "pon", email: null, password_hash: "hidden", status: "active", created_at: "2026-07-30", updated_at: "2026-07-30", last_login_at: null },
          { user_id: "disabled-1", full_name: "Disabled", profile_photo_url: null, role: "Maintenance", preferred_language: "en", username: "disabled", email: null, password_hash: "hidden", status: "disabled", created_at: "2026-07-30", updated_at: "2026-07-30", last_login_at: null },
        ] as T[],
      };
    }
    if (sql.includes("SELECT view_key FROM user_views")) return { results: [{ view_key: "staff" }] as T[] };
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) return { results: [] as T[] };
    return { results: [] as T[] };
  }

  async first<T>() {
    return null as T | null;
  }
}

test("dashboard overview aggregates existing module services into a compact DTO", async () => {
  const data = await getDashboardOverview({ DB: new FakeDashboardDB() as unknown as D1Database });

  assert.equal(data.housekeeping.roomsToClean.value, 0);
  assert.equal(data.housekeeping.cleaning.value, 1);
  assert.equal(data.housekeeping.cleaningRequested.value, 1);
  assert.equal(data.maintenance.openIssues.value, 2);
  assert.equal(data.maintenance.criticalIssues.value, 1);
  assert.equal(data.maintenance.waiting.value, 1);
  assert.equal(data.maintenance.outOfService.value, 1);
  assert.equal(data.today.arrivals.value, 1);
  assert.equal(data.today.departures.value, 0);
  assert.equal(data.staff.housekeepingStaff.value, 1);
  assert.equal(data.staff.maintenanceStaff.value, 1);
  assert.equal(data.staff.disabledUsers.value, 1);
  assert.equal(data.alerts.some((item) => item.id === "critical-maintenance"), true);
  assert.equal(data.alerts.some((item) => item.id === "waiting-maintenance"), true);
  assert.equal(data.quickLinks.some((item) => item.href === "/maintenance"), true);
});
