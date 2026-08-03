import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const roomService = await readFile(new URL("../src/services/housekeeping-v2-room.service.ts", import.meta.url), "utf8");
const overviewService = await readFile(new URL("../src/services/housekeeping-v2-overview.service.ts", import.meta.url), "utf8");
const roomDetailService = await readFile(new URL("../src/services/room-detail.service.ts", import.meta.url), "utf8");
const roomsWorkspaceService = await readFile(new URL("../src/services/rooms-workspace.service.ts", import.meta.url), "utf8");
const index = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../../src/router/AppRouter.tsx", import.meta.url), "utf8");
const homePage = await readFile(new URL("../../src/pages/HousekeepingV2Page.tsx", import.meta.url), "utf8");
const roomWorkspace = await readFile(new URL("../../src/pages/RoomDetailPage.tsx", import.meta.url), "utf8");
const roomExpandedWorkspace = await readFile(new URL("../../src/components/rooms/RoomExpandedWorkspace.tsx", import.meta.url), "utf8");
const turnoverCard = await readFile(new URL("../../src/components/rooms/TurnoverCard.tsx", import.meta.url), "utf8");
const turnoverPresentation = await readFile(new URL("../../src/config/turnoverPresentation.ts", import.meta.url), "utf8");
const client = await readFile(new URL("../../src/services/housekeeping-v2.service.ts", import.meta.url), "utf8");
const roomClient = await readFile(new URL("../../src/services/room-detail.service.ts", import.meta.url), "utf8");

test("housekeeping task navigation reuses the Room Workspace", () => {
  assert.match(index, /app\.get\("\/api\/housekeeping\/v2\/rooms\/:unitId"/);
  assert.match(router, /function HousekeepingRoomRedirect/);
  assert.match(router, /path="housekeeping\/rooms\/:unitId" element=\{<HousekeepingRoomRedirect \/>}/);
  assert.match(router, /path="housekeeping\/checklist\/:roomId" element=\{<HousekeepingRoomRedirect \/>}/);
  assert.match(router, /path="rooms\/:roomId" element=\{<RoomDetailPage \/>}/);
  assert.match(homePage, /className="housekeeping-v2-room-link" to=\{`\/rooms\/\$\{card\.unitId}\?taskId=\$\{card\.taskId}`\}/);
  assert.doesNotMatch(homePage, /housekeeping-v2-task-link|Open room/);
  assert.doesNotMatch(router, /import HousekeepingRoomPage/);
  assert.doesNotMatch(router, /readyChecklist|checklistPlaceholder/);
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
  for (const action of ["claim", "release-claim", "start", "complete", "skip", "cancel", "reopen", "force-release"]) {
    assert.match(index, new RegExp(`/api/housekeeping/v2/tasks/:taskId/${action}`));
  }
  assert.doesNotMatch(index, /\/api\/housekeeping\/v2\/tasks\/:taskId\/checklist/);
  assert.match(index, /\/api\/housekeeping\/v2\/rooms\/:unitId\/on-demand-cleaning/);
  assert.match(index, /\/api\/housekeeping\/v2\/rooms\/:unitId\/linen-required/);
  assert.match(roomService, /expectedVersion is required/);
  assert.match(roomService, /housekeeping_task_stale_version/);
  assert.match(client, /expectedVersion/);
  assert.doesNotMatch(client, /createOnDemandCleaning/);
  assert.match(client, /markLinenRequired/);
});

test("server-derived capabilities enforce assignment, owner force release and maintenance blocking", () => {
  assert.match(roomService, /function taskCapabilitiesForUser/);
  assert.match(roomService, /housekeepingOperationalTaskCapabilities\(task, user, \{ maintenanceBlocked \}\)/);
  assert.match(roomService, /canStart: capabilities\.canStartCleaning/);
  assert.match(roomService, /canComplete: capabilities\.canFinishCleaning \|\| \(task\.taskType === "WATER_REFILL" && capabilities\.canCompleteTask\)/);
  assert.doesNotMatch(roomService, /canCompleteTurnoverFromCurrentState/);
  assert.match(roomService, /canForceRelease: task\.taskType === "TURNOVER" && task\.status === "WAITING_FOR_RECEPTION" && isOwner/);
  assert.match(roomService, /out_of_service = 1/);
});

test("all housekeeping read models consume the central task capability provider", () => {
  for (const source of [roomService, overviewService, roomDetailService, roomsWorkspaceService]) {
    assert.match(source, /housekeepingOperationalTaskCapabilities/);
    assert.doesNotMatch(source, /task\.taskType === "TURNOVER" && task\.status === "IN_PROGRESS" &&/);
  }
  assert.match(overviewService, /canStart: capabilities\.canStartCleaning/);
  assert.match(overviewService, /canComplete: capabilities\.canFinishCleaning \|\| \(task\.taskType === "WATER_REFILL" && capabilities\.canCompleteTask\)/);
  assert.match(roomDetailService, /canStart: capabilities\.canStartCleaning/);
  assert.match(roomDetailService, /canComplete: capabilities\.canFinishCleaning \|\| \(task\.taskType === "WATER_REFILL" && capabilities\.canCompleteTask\)/);
  assert.match(roomsWorkspaceService, /capabilities\.canStartCleaning/);
  assert.match(roomsWorkspaceService, /capabilities\.canFinishCleaning \|\| \(row\.active_task_type === "WATER_REFILL" && capabilities\.canCompleteTask\)/);
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

test("task detail uses intervention help and trust completion instead of detailed checklists", () => {
  assert.doesNotMatch(roomService, /TURNOVER_CHECKLIST|STANDARD_CLEANING_CHECKLIST|LINEN_CHANGE_CHECKLIST/);
  assert.doesNotMatch(roomService, /INSERT OR IGNORE INTO housekeeping_task_checklist_items/);
  assert.doesNotMatch(roomService, /missingChecklistItems|Checklist incomplete:/);
  assert.doesNotMatch(roomService, /updateHousekeepingV2ChecklistItem/);
  assert.match(roomService, /canEditChecklist: false/);
  assert.match(roomWorkspace, /Finish Cleaning/);
  assert.match(roomWorkspace, /Finish Full Cleaning/);
  assert.match(roomWorkspace, /task\.capabilities\.canComplete && task\.taskType === "STANDARD_CLEANING"/);
  assert.doesNotMatch(roomWorkspace, /function Checklist|updateHousekeepingTaskChecklist|Complete checklist/);
  assert.doesNotMatch(client, /updateHousekeepingTaskChecklist/);
});

test("on-demand and linen override preserve explicit counter choices", () => {
  assert.match(roomService, /normalizeOnDemandCleaningInput/);
  assert.doesNotMatch(roomService, /On-demand cleaning note is required/);
  assert.match(roomService, /taskType: "ON_DEMAND_CLEANING"/);
  assert.match(roomService, /source: "HOUSEKEEPING_MANUAL"/);
  assert.match(roomService, /action: "start"/);
  assert.match(roomService, /`\$\{idempotencyKey}:start`/);
  assert.match(roomService, /On-demand completion requires Cleaning or Full Cleaning selection/);
  assert.match(roomService, /linen_override_selected/);
  assert.match(roomService, /linen_override_cancelled/);
  assert.doesNotMatch(roomWorkspace, /Linen required/);
});

test("Housekeeping UI cannot initiate On-Demand Cleaning", () => {
  assert.match(index, /\/api\/housekeeping\/v2\/rooms\/:unitId\/on-demand-cleaning/);
  assert.match(index, /\/api\/rooms\/:id\/on-demand-cleaning/);
  assert.match(roomClient, /createRoomOnDemandCleaning/);
  assert.match(roomWorkspace, /Create On-Demand Cleaning/);
  assert.doesNotMatch(homePage, /createOnDemandCleaning|on-demand-cleaning/);
  assert.doesNotMatch(client, /createOnDemandCleaning|on-demand-cleaning/);
});

test("Housekeeping no longer owns a duplicate room detail surface", () => {
  assert.doesNotMatch(router, /<HousekeepingRoomPage/);
  assert.doesNotMatch(homePage, /Room context|Reception state|Recent activity/);
  assert.doesNotMatch(homePage, /resolveReception/);
  assert.doesNotMatch(client, /alerts.*resolve/);
});

test("Room Workspace owns active housekeeping task and room operations", () => {
  assert.match(roomWorkspace, /Task Status/);
  assert.match(roomWorkspace, /room\.housekeeping\.tasks/);
  assert.match(roomWorkspace, /isTaskExecution \? \(/);
  assert.match(roomWorkspace, /<TaskExecutionPage room=\{room\.data\} roomId=\{roomId\} task=\{executionTask\} \/>/);
  assert.match(roomWorkspace, /<TurnoverPanel room=\{room\.data\} roomId=\{roomId\} \/>/);
  assert.match(roomWorkspace, /getRoomDetailTurnover\(room\)/);
  assert.match(roomDetailService, /function roomOccupancyLabel/);
  assert.match(roomDetailService, /occupancyStatus:\s*roomOccupancyLabel\(operations\)/);
  assert.doesNotMatch(roomWorkspace, /ReceptionPanel/);
  assert.match(roomWorkspace, /room\.procurement/);
  assert.doesNotMatch(homePage, /function Checklist/);
  assert.match(homePage, /OwnerAssignmentControl/);
  assert.match(homePage, /card\.capabilities\.canReassign/);
});

test("Housekeeping task execution page contains only execution UI", () => {
  const taskExecutionPage = roomWorkspace.slice(
    roomWorkspace.indexOf("function TaskExecutionPage"),
    roomWorkspace.indexOf("function RoomTaskActions"),
  );

  assert.match(roomWorkspace, /function TaskExecutionPage/);
  assert.match(taskExecutionPage, /taskDetailLabel\(task\)/);
  assert.match(taskExecutionPage, /taskExecutionStatus\(task\)/);
  assert.match(taskExecutionPage, /<TaskExecutionChecklist task=\{task\} \/>/);
  assert.match(taskExecutionPage, /<TaskExecutionPrimaryAction action=\{action\} task=\{task\} \/>/);
  assert.match(roomWorkspace, /function TaskExecutionMaintenance/);
  assert.match(roomWorkspace, /No issue/);
  assert.match(roomWorkspace, /Report Issue/);
  assert.doesNotMatch(taskExecutionPage, /Create On-Demand Cleaning/);
  assert.doesNotMatch(taskExecutionPage, /<TurnoverPanel/);
  assert.doesNotMatch(taskExecutionPage, /<ProcurementPanel/);
  assert.doesNotMatch(taskExecutionPage, /<TimelinePanel/);
  assert.doesNotMatch(taskExecutionPage, /<ChatContextPanel/);
});

test("Housekeeping room path uses Turnover language instead of Reception workflow copy", () => {
  assert.match(roomExpandedWorkspace, /turnover \? \([\s\S]*<TurnoverCard[\s\S]*<HousekeepingCard[\s\S]*<MaintenanceCard/);
  assert.match(roomWorkspace, /<TurnoverPanel room=\{room\.data\} roomId=\{roomId\} \/>[\s\S]*<HousekeepingPanel/);
  assert.match(turnoverCard, /eyebrow="Turnover"/);
  assert.match(turnoverCard, /title="Current State"/);
  assert.match(turnoverPresentation, /Waiting for Today's Check-out[\s\S]*Guest has not completed today's check-out/);
  assert.match(turnoverPresentation, /Today's Check-out Completed[\s\S]*Room released\. Waiting for today's check-in/);
  assert.match(turnoverPresentation, /Waiting for Today's Check-in[\s\S]*Room is waiting for today's check-in/);
  assert.match(turnoverPresentation, /Guest Waiting For Room[\s\S]*Guest has checked in\. Room is not ready yet/);
  assert.match(turnoverPresentation, /Ready for Today's Check-in[\s\S]*Room is ready for today's check-in/);
  assert.match(turnoverPresentation, /return null/);
  assert.doesNotMatch(turnoverPresentation, /Start Cleaning|Finish Cleaning|Cleaning In Progress|Ready to start cleaning|Task #/);
  assert.doesNotMatch(`${homePage}\n${turnoverCard}`, /Passport|Deposit|Open Reception|Arrival Due|Reception internal|room release|guest arrived/);
});

test("Room Workspace labels physical housekeeping condition as clean or dirty", () => {
  assert.match(roomWorkspace, /Cleaning Status/);
  assert.match(roomWorkspace, /<option value="READY">CLEAN<\/option>/);
  assert.match(roomWorkspace, /<option value="NOT_READY">DIRTY<\/option>/);
  assert.match(roomDetailService, /label:\s*"Clean"/);
  assert.match(roomDetailService, /label:\s*"Dirty"/);
  assert.doesNotMatch(roomWorkspace, />NOT READY<|>READY<|Room Status could not be changed/);
  assert.doesNotMatch(roomDetailService, /label:\s*"No active Housekeeping"|label:\s*"Not Ready"/);
});

test("Room Workspace task actions refresh on stale or changed task data", () => {
  assert.match(roomWorkspace, /onSettled: async \(\) =>/);
  assert.match(roomWorkspace, /queryClient\.invalidateQueries\(\{ queryKey: \["room-detail", roomId\] \}\)/);
  assert.match(roomWorkspace, /queryClient\.invalidateQueries\(\{ queryKey: \["housekeeping-v2"\] \}\)/);
  assert.match(roomWorkspace, /This task changed\. The room is refreshing\./);
  assert.doesNotMatch(roomWorkspace, />Claim<|>Release<|Release claim|claimHousekeepingTask|releaseHousekeepingClaim/);
});

test("Room Workspace keeps carried-over cleaning as the same active task without SLA wording", () => {
  assert.match(roomDetailService, /function taskIsCarriedOver/);
  assert.match(roomDetailService, /task\.operationalDate < today/);
  assert.match(roomDetailService, /Was scheduled previously\. Please do this first today\./);
  assert.match(roomDetailService, /roomTaskBelongsToCurrentStay/);
  assert.match(roomDetailService, /task\.isCarriedOver/);
  assert.doesNotMatch(roomWorkspace, /task\.isCarriedOver \? "Priority" : task\.priority/);
  assert.doesNotMatch(roomDetailService, /Cleaning overdue|overdue by|SLA/i);
});

test("Sprint 3 keeps Passport out of scope", () => {
  assert.doesNotMatch(roomService, /PassportWorkflow|passport-ocr|OCR|booking-passports/);
  assert.doesNotMatch(homePage, /PassportWorkflow|passport-ocr|OCR/);
  assert.doesNotMatch(client, /passport/i);
});

test("housekeeping generation uses internal booking ids while UI still exposes Beds24 booking ids", () => {
  assert.match(overviewService, /bookingId: booking\.booking_id/);
  assert.match(overviewService, /beds24_booking_id/);
  assert.match(roomService, /beds24BookingId/);
  assert.match(roomService, /WHERE booking_id = \?/);
});
