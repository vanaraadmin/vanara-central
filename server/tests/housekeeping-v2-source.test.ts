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
const waterFullStayMigration = await readFile(new URL("../migrations/0023_water_refill_full_stay_days.sql", import.meta.url), "utf8");

test("housekeeping workspace routes to the task-oriented v2 workspace while preserving legacy APIs", () => {
  assert.match(index, /app\.get\("\/api\/housekeeping"/);
  assert.match(index, /app\.get\("\/api\/housekeeping\/v2\/summary"/);
  assert.match(index, /app\.get\("\/api\/housekeeping\/v2\/tasks"/);
  assert.match(router, /path="housekeeping" element=\{<Navigate replace to="\/housekeeping-v2" \/>}/);
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
  assert.match(domain, /export async function syncReleasedTurnoverTasks/);
  assert.match(domain, /SELECT DISTINCT ht\.task_id, ht\.version/);
  assert.match(service, /syncReleasedTurnoverTasks\(env, date, user\)/);
  assert.match(service, /room_released === 1 \? "released" : "waiting_for_reception"/);
  assert.doesNotMatch(service, /14:30/);
  assert.doesNotMatch(service, /automatic-fallback/);
});

test("housekeeping v2 generates approved scheduled and manual-cleaning task categories", () => {
  assert.match(service, /taskType: "TURNOVER"/);
  assert.match(service, /taskType: "STANDARD_CLEANING"/);
  assert.match(service, /taskType: "LINEN_CHANGE"/);
  assert.match(service, /taskType: "WATER_REFILL"/);
  assert.match(service, /linen_required_override === 1/);
  assert.doesNotMatch(service, /taskType: "ON_DEMAND_CLEANING"/);
});

test("normal cleaning and water refill follow occupied arrived-stay rules", () => {
  assert.match(service, /guest_arrived !== 1/);
  assert.match(service, /booking\.departure_date === date/);
  assert.match(service, /function isWaterRefillEligible\(booking: BookingRow, date: string\): boolean/);
  assert.match(service, /booking\.arrival_date < date/);
  assert.match(service, /booking\.departure_date > date/);
  assert.match(service, /waterTaskBelongsToEligibleStay/);
  assert.match(service, /isWaterRefillEligible\(context\.activeStay, task\.operationalDate\)/);
  assert.match(service, /DEFAULT_STANDARD_INTERVAL_DAYS = 3/);
  assert.match(service, /standardCleaningDueCycle/);
  assert.match(service, /completedWaterToday/);
  assert.doesNotMatch(service, /\badults\b|\bchildren\b|guest_count|guestCount/);
});

test("water refill cleanup cancels only active tasks outside full occupied stay days", () => {
  assert.match(waterFullStayMigration, /task_type = 'WATER_REFILL'/);
  assert.match(waterFullStayMigration, /status NOT IN \('COMPLETED', 'SKIPPED', 'CANCELLED'\)/);
  assert.match(waterFullStayMigration, /ht\.operational_date <= b\.arrival_date/);
  assert.match(waterFullStayMigration, /ht\.operational_date >= b\.departure_date/);
  assert.match(waterFullStayMigration, /COALESCE\(rs\.guest_arrived, 0\) <> 1/);
  assert.match(waterFullStayMigration, /SET status = 'CANCELLED'/);
  assert.match(waterFullStayMigration, /Water Refill is generated only after arrival day and before departure day/);
});

test("water refill quantity is room-type based and never guest-count based", () => {
  assert.match(service, /function waterQuantityFor\(unit: UnitRow, config: Map<string, number>\): number/);
  assert.match(service, /normalizeRoomType\(label\)/);
  assert.match(service, /normalized\.includes\("villa"\)/);
  assert.match(service, /normalized\.includes\("bungalow"\)/);
  assert.match(service, /normalized\.includes\("yurt"\)/);
  assert.match(service, /normalized\.includes\("tent"\)/);
  assert.match(service, /SELECT room_type, default_bottles/);
  assert.doesNotMatch(service, /\badults\b|\bchildren\b|guest_count|guestCount/);
});

test("summary exposes only the approved actionable Housekeeping counters and fixed section order", () => {
  for (const key of [
    "toClean",
    "cleaningInProgress",
    "completedCleaningToday",
    "waterDue",
  ]) {
    assert.match(service, new RegExp(key));
  }
  assert.doesNotMatch(service, /completedToday:/);
  assert.doesNotMatch(service, /blockedRooms:/);
  assert.doesNotMatch(service, /tasksClaimed:/);
  assert.doesNotMatch(service, /procurementAttention,/);
  assert.match(service, /taskCompletedOn\(task, date\)/);
  assert.match(service, /completed_at IS NOT NULL AND substr\(completed_at, 1, 10\) = \?/);
  assert.match(service, /"priority-turnover", "normal-cleaning", "water-refill"/);
  assert.doesNotMatch(service, /"ready", "procurement"/);
});

test("compact cards expose required read-model fields", () => {
  for (const key of [
    "unitId",
    "unitName",
    "taskId",
    "taskVersion",
    "taskType",
    "taskStatus",
    "priority",
    "operationalDate",
    "currentQueue",
    "displayReason",
    "assignee",
    "isBlocked",
    "blockReason",
    "waterQuantity",
    "reasonCodes",
    "capabilities",
    "canReleaseClaim",
  ]) {
    assert.match(service, new RegExp(`${key}:`));
  }
  for (const removed of ["roomType:", "guestName:", "arrivalDate:", "departureDate:", "nextCheckInAt:", "alertSummary:", "maintenanceSummary:", "linenRequired:", "receptionReleaseState:"]) {
    assert.doesNotMatch(service, new RegExp(removed));
  }
});

test("room-only operational context moved out of the Housekeeping queue", () => {
  assert.match(service, /FROM reception_room_alerts/);
  assert.match(service, /FROM maintenance_tickets/);
  assert.match(service, /FROM procurement_requests/);
  assert.match(service, /nextArrival/);
  assert.match(service, /loadProcurementAttention/);
  assert.doesNotMatch(service, /procurementAttentionCard/);
  assert.match(service, /json_extract\(metadata_json, '\$\.outOfService'\)/);
  assert.doesNotMatch(page, /card\.guestName|card\.arrivalDate|card\.departureDate|card\.roomType|card\.alertSummary|card\.maintenanceSummary/);
});

test("v2 page starts as summary cards and expands only Priority, Normal or Water lists", () => {
  assert.match(page, /function TaskCard/);
  assert.match(page, /function Section/);
  assert.match(page, /Housekeeping operational summary/);
  assert.match(page, /const homeSections/);
  assert.match(page, /useState<HousekeepingV2SectionId \| null>\(null\)/);
  assert.match(page, /activeItemId=\{activeSection\}/);
  assert.match(page, /onItemSelect=\{\(item\) =>/);
  assert.match(page, /expandedSection &&/);
  assert.match(page, /Housekeeping task queue/);
  assert.doesNotMatch(page, /housekeeping\.data\.sections\.map/);
  assert.doesNotMatch(page, /Ready \/ No Action Required|No action required/);
  assert.doesNotMatch(page, /Room detail coming later/);
});

test("expanded v2 rows link room names to Room Workspace and gate task actions by server capabilities", () => {
  assert.match(page, /to=\{`\/rooms\/\$\{card\.unitId}\?taskId=\$\{card\.taskId}`\}/);
  assert.match(page, /card\.capabilities\.canStart/);
  assert.match(page, /card\.capabilities\.canComplete/);
  assert.match(page, /startHousekeepingTask/);
  assert.match(page, /completeHousekeepingTask/);
  assert.match(page, /card\.capabilities\.canClaim/);
  assert.match(page, /card\.capabilities\.canReleaseClaim/);
  assert.doesNotMatch(page, /\/housekeeping\/rooms\/\$\{card\.unitId}/);
  assert.match(page, /OwnerAssignmentControl/);
  assert.match(page, /card\.capabilities\.canReassign/);
  assert.match(page, /loadHousekeepingAssignableUsers/);
  assert.doesNotMatch(page, /createOnDemandCleaning|on-demand-cleaning|Checklist/);
});

test("v2 task cards avoid staff-facing technical wording and raw task state", () => {
  assert.match(page, /Today \$\{formatDate\(housekeeping\.data\.operationalDate\)\}/);
  assert.match(page, /This task changed\. The list is refreshing\./);
  assert.doesNotMatch(page, /Task #|Operational date|expectedVersion|idempotency|conflict code|state machine/);
  assert.doesNotMatch(page, /card\.taskStatus\.replaceAll/);
  assert.doesNotMatch(page, /housekeeping-v2-card__footer|housekeeping-v2-generation|housekeeping-v2-task-link|showTaskSurface/);
});

test("v2 task actions render the next server-authorized step only", () => {
  assert.match(page, /card\.taskType === "WATER_REFILL" && card\.capabilities\.canComplete/);
  assert.match(page, /card\.capabilities\.canStart \?/);
  assert.match(page, /card\.capabilities\.canComplete && card\.taskType === "STANDARD_CLEANING"/);
  assert.match(page, /card\.capabilities\.canComplete && card\.taskType !== "STANDARD_CLEANING" && card\.taskType !== "WATER_REFILL"/);
  assert.match(page, /waterRefillCompleted: true/);
  assert.doesNotMatch(page, /card\.taskType === "ON_DEMAND_CLEANING"\)/);
  assert.match(page, /<span>Complete<\/span>/);
  assert.match(page, /onSettled: \(\) =>/);
  assert.doesNotMatch(page, /Release claim/);
});

test("v2 page uses intervention wording and informational help instead of checklists", () => {
  assert.match(page, /type InterventionType = "cleaning" \| "full-cleaning"/);
  assert.match(page, /function InterventionSheet/);
  assert.match(page, /General room cleaning\./);
  assert.match(page, /Replace bed linen\./);
  assert.match(page, /Please also check room amenities before completion\./);
  assert.match(page, /Finish Cleaning/);
  assert.match(page, /Finish Full Cleaning/);
});

test("summary counters render room-count wording", () => {
  assert.match(page, /function formatRoomCount\(value: number\): string/);
  assert.match(page, /return `\$\{value}/);
  assert.match(page, /value === 1 \? "Room" : "Rooms"/);
  assert.match(page, /function sectionSummaryItems\(sections: HousekeepingV2Section\[\]\): VanaraSummaryItem\[\]/);
  assert.match(page, /value: formatRoomCount\(count\)/);
  assert.match(page, /meta=\{formatRoomCount\(section\.cards\.length\)\}/);
  assert.doesNotMatch(page, /<strong>\{housekeeping\.data\.summary\[item\.summaryKey\]\}<\/strong>/);
  assert.doesNotMatch(page, /<span>\{section\.cards\.length\}<\/span>/);
});

test("water cards stay one-tap and avoid workflow indicators", () => {
  assert.match(page, /if \(card\.taskType === "WATER_REFILL"\) return null/);
  assert.match(page, /card\.taskType === "WATER_REFILL" && card\.capabilities\.canComplete/);
  assert.match(page, /const completeWater = \(\) => action\.mutate\(completeHousekeepingTask\(taskId, version, \{ waterRefillCompleted: true \}\)\)/);
  assert.doesNotMatch(page, /Complete Water|Start Water/);
});

test("read model includes generated Standard Cleaning work and excludes Room-owned cleaning from the queue", () => {
  assert.doesNotMatch(service, /function readyCard/);
  assert.doesNotMatch(service, /No ready rooms to list/);
  assert.match(service, /taskFor\(stayTasks, "STANDARD_CLEANING"\)/);
  assert.match(service, /taskBelongsToRoomReadyOverride/);
  assert.match(service, /if \(taskBelongsToRoomReadyOverride\(task\)\) return false/);
  assert.match(service, /return task\.taskType !== "ON_DEMAND_CLEANING"/);
  assert.doesNotMatch(service, /\.\.\.queueTasks\.filter\(\(task\) => taskBelongsToRoomReadyOverride\(task\)\)/);
  assert.doesNotMatch(service, /taskFor\(stayTasks, "ON_DEMAND_CLEANING"\)/);
  assert.match(service, /function visibleQueueForTask/);
  assert.match(service, /standard_cleaning_previous_day/);
  assert.doesNotMatch(service, /on_demand_previous_day/);
  assert.doesNotMatch(service, /taskType: "ON_DEMAND_CLEANING"/);
});

test("priority escalation is derived from original operational date without enterprise wording", () => {
  assert.match(service, /task\.operationalDate < context\.date/);
  assert.match(service, /return "priority-turnover"/);
  assert.match(service, /return "Was due yesterday"/);
  assert.match(service, /taskBelongsToActiveStay/);
  assert.match(page, /Was due yesterday/);
  assert.doesNotMatch(service, /escalation_level|SLA|breach/);
  assert.doesNotMatch(page, /overdue|breach|escalation level|overdue priority/i);
  assert.doesNotMatch(page, /\bSLA\b/);
});

test("v2 page covers loading, error, refresh, empty sections and mobile-first cards", () => {
  assert.match(page, /<PageLoading \/>/);
  assert.match(page, /<PageError onRetry/);
  assert.match(page, /onClick=\{\(\) => void housekeeping\.refetch\(\)\}/);
  assert.match(page, /section\.emptyLabel/);
  assert.match(service, /No priority work\./);
  assert.match(service, /No normal cleaning work\./);
  assert.match(service, /No water refills\./);
  assert.match(css, /\.housekeeping-v2-summary/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(page, /VanaraSummaryGrid/);
  assert.match(css, /\.housekeeping-v2-card__actions/);
  assert.match(css, /@media \(max-width: 420px\)/);
});
