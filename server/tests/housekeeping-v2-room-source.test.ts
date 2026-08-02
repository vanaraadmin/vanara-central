import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const roomService = await readFile(new URL("../src/services/housekeeping-v2-room.service.ts", import.meta.url), "utf8");
const overviewService = await readFile(new URL("../src/services/housekeeping-v2-overview.service.ts", import.meta.url), "utf8");
const index = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../../src/router/AppRouter.tsx", import.meta.url), "utf8");
const homePage = await readFile(new URL("../../src/pages/HousekeepingV2Page.tsx", import.meta.url), "utf8");
const roomPage = await readFile(new URL("../../src/pages/HousekeepingRoomPage.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("../../src/services/housekeeping-v2.service.ts", import.meta.url), "utf8");

test("housekeeping v2 room workspace has a dedicated route and endpoint", () => {
  assert.match(index, /app\.get\("\/api\/housekeeping\/v2\/rooms\/:unitId"/);
  assert.match(router, /path="housekeeping\/rooms\/:unitId" element=\{<HousekeepingRoomPage \/>}/);
  assert.match(homePage, /to=\{`\/housekeeping\/rooms\/\$\{card\.unitId}`\}/);
  assert.doesNotMatch(homePage, /to=\{`\/rooms\/\$\{card\.unitId}`\}/);
});

test("room read model is assembled server-side from real operational sources", () => {
  assert.match(roomService, /FROM bookings b/);
  assert.match(roomService, /LEFT JOIN reception_stays rs ON rs\.beds24_booking_id = b\.beds24_booking_id/);
  assert.match(roomService, /FROM reception_room_alerts/);
  assert.match(roomService, /FROM maintenance_tickets/);
  assert.match(roomService, /FROM housekeeping_room_counters/);
  assert.match(roomService, /FROM housekeeping_task_events/);
  assert.match(roomService, /loadReleaseTimestamp/);
});

test("task actions are additive v2 endpoints with expected version contracts", () => {
  for (const action of ["claim", "release-claim", "start", "checklist", "complete", "skip", "cancel", "reopen", "force-release"]) {
    assert.match(index, new RegExp(`/api/housekeeping/v2/tasks/:taskId/${action}`));
  }
  assert.match(roomService, /expectedVersion is required/);
  assert.match(roomService, /housekeeping_task_stale_version/);
  assert.match(client, /expectedVersion/);
});

test("server-derived capabilities enforce assignment, owner force release and maintenance blocking", () => {
  assert.match(roomService, /function taskCapabilitiesForUser/);
  assert.match(roomService, /isAssigned \|\| isOwner/);
  assert.match(roomService, /canStart: task\.status === "CLAIMED" && released && !maintenanceBlocked && \(isAssigned \|\| isOwner\)/);
  assert.match(roomService, /canComplete: base\.canComplete && released && !maintenanceBlocked && \(isAssigned \|\| isOwner\)/);
  assert.match(roomService, /canForceRelease: task\.taskType === "TURNOVER" && task\.status === "WAITING_FOR_RECEPTION" && isOwner/);
  assert.match(roomService, /out_of_service = 1/);
});

test("Owner Force Room Released updates Reception release and records audit without bulk action", () => {
  assert.match(index, /requireOwner\(user\)/);
  assert.match(roomService, /function normalizeForceReleaseInput/);
  assert.match(roomService, /Reason is required/);
  assert.match(roomService, /UPDATE SET room_released = 1/);
  assert.match(roomService, /housekeepingForceRoomReleased/);
  assert.match(roomService, /action: "release_from_reception"/);
  assert.doesNotMatch(roomService, /bulk/i);
});

test("turnover checklist lives in room detail and completion requires it", () => {
  assert.match(roomService, /TURNOVER_CHECKLIST/);
  assert.match(roomService, /INSERT OR IGNORE INTO housekeeping_task_checklist_items/);
  assert.match(roomService, /missingChecklistItems/);
  assert.match(roomService, /Checklist incomplete:/);
  assert.match(roomPage, /function Checklist/);
  assert.match(roomPage, /Complete turnover/);
});

test("Housekeeping room detail can view but not resolve Reception alerts", () => {
  assert.match(roomPage, /Reception state/);
  assert.match(roomPage, /room\.reception\.alerts/);
  assert.doesNotMatch(roomPage, /resolveReception/);
  assert.doesNotMatch(client, /alerts.*resolve/);
});

test("room workspace preserves compact home and avoids full controls on home cards", () => {
  assert.match(roomPage, /Back to Housekeeping/);
  assert.match(roomPage, /PageLoading/);
  assert.match(roomPage, /PageError/);
  assert.match(roomPage, /No active housekeeping task/);
  assert.doesNotMatch(homePage, /function Checklist/);
  assert.doesNotMatch(homePage, /claimHousekeepingTask/);
});

test("Sprint 3 keeps Passport out of scope", () => {
  assert.doesNotMatch(roomService, /PassportWorkflow|passport-ocr|OCR|booking-passports/);
  assert.doesNotMatch(roomPage, /PassportWorkflow|passport-ocr|OCR/);
  assert.doesNotMatch(client, /passport/i);
});

test("housekeeping generation uses internal booking ids while UI still exposes Beds24 booking ids", () => {
  assert.match(overviewService, /bookingId: booking\.booking_id/);
  assert.match(overviewService, /beds24_booking_id/);
  assert.match(roomService, /beds24BookingId/);
  assert.match(roomService, /WHERE booking_id = \?/);
});
