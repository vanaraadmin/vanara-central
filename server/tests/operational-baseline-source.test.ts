import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/0021_real_resort_room_baseline.sql", import.meta.url), "utf8");
const cleanupMigration = readFileSync(new URL("../migrations/0022_housekeeping_room_state_cleanup.sql", import.meta.url), "utf8");
const roomDetailService = readFileSync(new URL("../src/services/room-detail.service.ts", import.meta.url), "utf8");
const housekeepingOverview = readFileSync(new URL("../src/services/housekeeping-v2-overview.service.ts", import.meta.url), "utf8");
const receptionService = readFileSync(new URL("../src/services/reception.service.ts", import.meta.url), "utf8");
const productRules = readFileSync(new URL("../../documentation/HOUSEKEEPING_PRODUCT_RULES.md", import.meta.url), "utf8");
const dataModel = readFileSync(new URL("../../documentation/12_OPERATIONAL_DATA_MODEL.md", import.meta.url), "utf8");

test("real resort baseline contains the exact Product Owner room snapshot", () => {
  for (const room of ["Bungalow 2", "Bungalow 6", "Bungalow 1", "Bungalow 12", "Bungalow 7", "Villa 10", "Villa 13"]) {
    assert.match(migration, new RegExp(room));
  }
  for (const room of ["Tent 1", "Tent 6", "Yurt 1", "Yurt 6"]) {
    assert.match(migration, new RegExp(room));
  }
  assert.match(migration, /'Seasonal Storage'/);
  assert.match(migration, /'Season Closed'/);
  assert.match(migration, /'06-01'/);
  assert.match(migration, /'11-20'/);
});

test("baseline uses independent operational availability and never manufactures guest data", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS room_operational_availability/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'OPERATING'/);
  assert.match(migration, /CHECK \(status IN \('OPERATING', 'NOT_OPERATING'\)\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS room_operational_availability_events/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+bookings/i);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+reception_stays/i);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+booking_passports/i);
  assert.doesNotMatch(migration, /passport/i);
});

test("baseline stores physical room readiness without manufacturing Housekeeping work", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS room_housekeeping_state/);
  assert.match(migration, /ready_state TEXT NOT NULL DEFAULT 'READY'/);
  assert.match(migration, /CHECK \(ready_state IN \('READY', 'NOT_READY'\)\)/);
  assert.doesNotMatch(migration, /INSERT\s+(OR\s+IGNORE\s+)?INTO\s+housekeeping_tasks/i);
  assert.doesNotMatch(migration, /room-ready-baseline:not-ready:/);
  assert.doesNotMatch(migration, /due_cycle_date,\s*status,\s*priority,\s*source/s);
});

test("cleanup migration cancels only synthetic baseline room-state tasks", () => {
  assert.match(cleanupMigration, /CREATE TABLE IF NOT EXISTS room_housekeeping_state/);
  assert.match(cleanupMigration, /idempotency_key LIKE 'room-ready-baseline:not-ready:%'/);
  assert.match(cleanupMigration, /created_by = 'system-baseline'/);
  assert.match(cleanupMigration, /on_demand_source = 'ROOM_READY_OVERRIDE'/);
  assert.match(cleanupMigration, /Baseline physical room state is not Housekeeping work/);
  assert.match(migration, /source IN \('system', 'reception_release'\) OR task_type = 'WATER_REFILL'/);
  assert.match(migration, /Unit is not operating in the Product Owner baseline/);
  assert.match(migration, /Room is Ready in the Product Owner baseline/);
});

test("bungalow 7 maintenance block is a real out-of-service ticket and is not duplicated", () => {
  assert.match(migration, /'Replace Air Conditioning'/);
  assert.match(migration, /'Air Conditioning'/);
  assert.match(migration, /'High'/);
  assert.match(migration, /out_of_service/);
  assert.match(migration, /NOT EXISTS \(\s*SELECT 1\s*FROM maintenance_tickets mt/s);
});

test("read models consume operational availability instead of frontend constants", () => {
  assert.match(roomDetailService, /loadOperationalAvailabilityForUnit/);
  assert.match(roomDetailService, /loadRoomHousekeepingStateForUnit/);
  assert.match(roomDetailService, /operationalAvailability/);
  assert.match(housekeepingOverview, /COALESCE\(roa\.status, 'OPERATING'\) = 'OPERATING'/);
  assert.match(housekeepingOverview, /context\.operationalAvailabilityStatus === "NOT_OPERATING"/);
  assert.match(housekeepingOverview, /if \(maintenanceBlocked\) return \[\]/);
  assert.doesNotMatch(receptionService, /operationalAvailability\.status === "NOT_OPERATING"/);
  assert.match(receptionService, /storedHousekeepingState\.readyState === "NOT_READY"/);
});

test("physical housekeeping condition is authoritative state and not inferred from tasks", () => {
  assert.match(roomDetailService, /function roomReadyState\(storedState: RoomHousekeepingState\): RoomReadyState/);
  assert.match(roomDetailService, /return storedState\.readyState/);
  assert.doesNotMatch(roomDetailService, /tasks\.some\(taskAffectsReadyState\)/);
  assert.match(productRules, /single authoritative source for physical Housekeeping Status is `room_housekeeping_state`/);
  assert.match(productRules, /READY \/ NOT_READY must never be inferred/);
  assert.match(dataModel, /single authoritative source for READY \//);
  assert.match(dataModel, /Tasks are transient operational work/);
});
