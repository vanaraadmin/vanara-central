import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("../src/services/housekeeping-v2-overview.service.ts", import.meta.url), "utf8");
const domain = await readFile(new URL("../src/services/housekeeping-task-domain.service.ts", import.meta.url), "utf8");
const index = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../../src/router/AppRouter.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../../src/pages/HousekeepingV2Page.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("../../src/services/housekeeping-v2.service.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../../src/styles/HousekeepingV2Page.css", import.meta.url), "utf8");

test("housekeeping v2 is additive and preserves the legacy housekeeping workspace", () => {
  assert.match(index, /app\.get\("\/api\/housekeeping"/);
  assert.match(index, /app\.get\("\/api\/housekeeping\/v2\/summary"/);
  assert.match(index, /app\.get\("\/api\/housekeeping\/v2\/tasks"/);
  assert.match(router, /path="housekeeping" element=\{<HousekeepingPage \/>}/);
  assert.match(router, /path="housekeeping-v2" element=\{<HousekeepingV2Page \/>}/);
  assert.match(client, /\/api\/housekeeping\/v2\/tasks/);
});

test("housekeeping v2 uses the task-oriented Sprint 1 domain and idempotency keys", () => {
  assert.match(service, /createHousekeepingTask/);
  assert.match(service, /housekeeping:v2:turnover:\$\{booking\.unit_id}:\$\{booking\.beds24_booking_id}:\$\{date}/);
  assert.match(service, /housekeeping:v2:standard:\$\{booking\.unit_id}:\$\{booking\.beds24_booking_id}:\$\{dueCycleDate}/);
  assert.match(service, /housekeeping:v2:water:\$\{booking\.unit_id}:\$\{date}/);
  assert.match(service, /hasTask\(activeTasks, "TURNOVER"/);
  assert.match(service, /hasTask\(activeTasks, "STANDARD_CLEANING"/);
  assert.match(service, /hasTask\(activeTasks, "WATER_REFILL"/);
});

test("turnover release gate reads the real Reception booking key", () => {
  assert.match(domain, /JOIN reception_stays rs ON rs\.beds24_booking_id = b\.beds24_booking_id/);
  assert.match(domain, /WHERE b\.booking_id = \?/);
  assert.match(service, /room_released === 1 \? "released" : "waiting_for_reception"/);
  assert.doesNotMatch(service, /14:30/);
  assert.doesNotMatch(service, /automatic-fallback/);
});

test("housekeeping v2 generates only approved Sprint 2 task categories", () => {
  assert.match(service, /taskType: "TURNOVER"/);
  assert.match(service, /taskType: "STANDARD_CLEANING"/);
  assert.match(service, /taskType: "WATER_REFILL"/);
  assert.doesNotMatch(service, /taskType: "LINEN_CHANGE"/);
  assert.doesNotMatch(service, /taskType: "ON_DEMAND_CLEANING"/);
});

test("normal cleaning and water refill follow occupied arrived-stay rules", () => {
  assert.match(service, /guest_arrived !== 1/);
  assert.match(service, /booking\.departure_date === date/);
  assert.match(service, /DEFAULT_STANDARD_INTERVAL_DAYS = 3/);
  assert.match(service, /standardCleaningDueCycle/);
  assert.match(service, /completedWaterToday/);
});

test("summary exposes the approved operational counters and fixed section order", () => {
  for (const key of [
    "awaitingReceptionRelease",
    "priorityTurnovers",
    "normalCleaningDue",
    "waterRefillDue",
    "tasksClaimed",
    "tasksInProgress",
    "blockedRooms",
    "completedToday",
    "procurementAttention",
  ]) {
    assert.match(service, new RegExp(key));
  }
  assert.match(service, /"priority-turnover", "normal-cleaning", "water-refill", "ready", "procurement"/);
});

test("compact cards expose required read-model fields", () => {
  for (const key of [
    "unitId",
    "unitName",
    "roomType",
    "bookingId",
    "guestName",
    "stayStatus",
    "arrivalDate",
    "departureDate",
    "nextCheckInAt",
    "taskId",
    "taskType",
    "taskStatus",
    "priority",
    "assignee",
    "isOverdue",
    "isBlocked",
    "blockReason",
    "receptionReleaseState",
    "waterQuantity",
    "linenRequired",
    "alertSummary",
    "maintenanceSummary",
    "capabilities",
  ]) {
    assert.match(service, new RegExp(`${key}:`));
  }
});

test("read model includes alerts, maintenance, next arrival and procurement attention", () => {
  assert.match(service, /FROM reception_room_alerts/);
  assert.match(service, /FROM maintenance_tickets/);
  assert.match(service, /FROM procurement_requests/);
  assert.match(service, /nextArrival/);
  assert.match(service, /procurementAttentionCard/);
  assert.match(service, /json_extract\(metadata_json, '\$\.outOfService'\)/);
});

test("v2 page is a compact home workspace with no checklist, assignment dropdown or mutation controls", () => {
  assert.match(page, /function TaskCard/);
  assert.match(page, /function Section/);
  assert.match(page, /Housekeeping operational summary/);
  assert.match(page, /Room detail coming later/);
  assert.doesNotMatch(page, /AssignmentControl/);
  assert.doesNotMatch(page, /ChecklistItem/);
  assert.doesNotMatch(page, /useMutation/);
  assert.doesNotMatch(page, /<select/);
  assert.doesNotMatch(page, /updateHousekeeping/);
});

test("v2 page covers loading, error, refresh, empty sections and mobile-first cards", () => {
  assert.match(page, /<PageLoading \/>/);
  assert.match(page, /<PageError onRetry/);
  assert.match(page, /onClick=\{\(\) => void housekeeping\.refetch\(\)\}/);
  assert.match(page, /section\.emptyLabel/);
  assert.match(css, /\.housekeeping-v2-summary/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(128px, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 760px\)/);
});
