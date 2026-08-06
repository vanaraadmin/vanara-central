import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const en = readFileSync(new URL("../../src/i18n/en.ts", import.meta.url), "utf8");
const th = readFileSync(new URL("../../src/i18n/th.ts", import.meta.url), "utf8");
const messagesPage = readFileSync(new URL("../../src/pages/MessagesPage.tsx", import.meta.url), "utf8");
const dashboardPage = readFileSync(new URL("../../src/pages/DashboardPage.tsx", import.meta.url), "utf8");
const movementsPage = readFileSync(new URL("../../src/pages/MovementsPage.tsx", import.meta.url), "utf8");
const passportWorkflow = readFileSync(new URL("../../src/components/passport/PassportWorkflow.tsx", import.meta.url), "utf8");
const passportMessages = readFileSync(new URL("../../src/components/passport/passport-messages.ts", import.meta.url), "utf8");
const staffLabels = readFileSync(new URL("../../src/utils/staff-i18n-labels.ts", import.meta.url), "utf8");
const staffPage = readFileSync(new URL("../../src/pages/StaffPage.tsx", import.meta.url), "utf8");
const staffOverviewService = readFileSync(new URL("../src/services/staff-overview.service.ts", import.meta.url), "utf8");
const housekeepingCard = readFileSync(new URL("../../src/components/rooms/HousekeepingCard.tsx", import.meta.url), "utf8");
const maintenanceCard = readFileSync(new URL("../../src/components/rooms/MaintenanceCard.tsx", import.meta.url), "utf8");
const roomOperationalSummaryCard = readFileSync(new URL("../../src/components/rooms/RoomOperationalSummaryCard.tsx", import.meta.url), "utf8");

test("staff-facing Thai dictionary uses Somkiat-approved practical labels", () => {
  for (const text of [
    "หน้าควบคุมงาน",
    "ทางลัด",
    "ข้อความจากแขก",
    "ตรวจแล้วส่ง",
    "กำลังเติมน้ำ",
    "งานซ่อม",
    "เช็กพาสปอร์ตไม่สำเร็จ",
    "อ่านพาสปอร์ตไม่สำเร็จ",
    "เลือกวันเข้าและวันออกเพื่อเช็กห้องว่าง",
  ]) {
    assert.match(th, new RegExp(text));
  }

  for (const key of [
    "completedCleaningToday",
    "maintenanceClear",
    "maintenanceActive",
    "freeTextRequest",
    "ownerDecision",
    "maintenanceBlocked",
  ]) {
    assert.match(en + th, new RegExp(`${key}:`));
  }

  for (const formalOrWrong of [
    "กำลังดำเนินการ",
    "ส่วนงาน",
    "สถานะปัจจุบัน",
    "มอบหมายงานทำความสะอาด",
    "ทำเครื่องหมายว่าส่งแล้ว",
    "ปฏิเสธ",
    "ทิกเก็ต",
    "แดชบอร์ด",
  ]) {
    assert.doesNotMatch(th, new RegExp(formalOrWrong));
  }
});

test("Guest Messages staff UI is wired through i18n and keeps guest-message workflow separate", () => {
  for (const key of [
    "guestMessagesNeedsReply",
    "guestMessagesWaitingGuest",
    "guestMessagesApproveAndSend",
    "guestMessagesRetrySend",
    "guestMessagesBookingContext",
    "guestMessagesUnreadCount",
  ]) {
    assert.match(en + th, new RegExp(`${key}:`));
    assert.match(messagesPage, new RegExp(`"${key}"|translate\\("${key}"`));
  }

  assert.doesNotMatch(messagesPage, />Guest Messages<|>Needs Reply<|>Approve & Send<|>Retry Send<|>Booking Context</);
});

test("Dashboard and Movements staff pages translate reachable legacy/control labels", () => {
  for (const key of [
    "controlRoom",
    "downloadTm30",
    "quickAccess",
    "operationalAlerts",
    "refreshArrivalsDepartures",
    "verifyDocuments",
    "assignKeys",
    "scheduledCheckout",
  ]) {
    assert.match(en + th, new RegExp(`${key}:`));
  }

  assert.match(dashboardPage, /translate\("controlRoom"\)/);
  assert.match(dashboardPage, /translateStaffLabel/);
  assert.match(movementsPage, /translate\("verifyDocuments"\)/);
  assert.match(movementsPage, /translateStaffLabel/);
});

test("Passport staff-facing edge messages avoid visible OCR/OpenAI wording in Thai", () => {
  for (const key of [
    "passportVisualCandidate",
    "passportMrzCandidate",
    "passportGivenNamesNeedReview",
    "passportCheckFailed",
    "passportOcrFailed",
    "passportOpenAiTimeout",
    "passportMrzValidationFailed",
  ]) {
    assert.match(en + th, new RegExp(`${key}:`));
  }

  assert.match(passportWorkflow, /translate\("passportVisualCandidate"\)/);
  assert.match(passportWorkflow, /translate\("passportGivenNamesNeedReview"\)/);
  assert.match(passportMessages, /PASSPORT_MESSAGE_I18N_KEYS/);
  assert.doesNotMatch(th, /OCR|OpenAI|MRZ/);
});

test("staff label helper preserves operational meaning for compact statuses", () => {
  for (const mapping of [
    'ARRIVAL: "checkIn"',
    'ARRIVALS: "arrivals"',
    'DEPARTURE: "checkOut"',
    'DEPARTURES: "departures"',
    'VACANT: "vacant"',
    'OCCUPIED: "occupied"',
    'ACTIVE: "maintenanceActive"',
    'CLEAR: "maintenanceClear"',
    '"COMPLETED CLEANING TODAY": "completedCleaningToday"',
    '"CLEANING IN PROGRESS": "cleaningInProgress"',
    '"WATER IN PROGRESS": "waterInProgress"',
    '"ROOMS TO CLEAN": "roomsToClean"',
    '"OPEN ISSUES": "openIssues"',
    '"ACTIVE USERS": "activeUsers"',
    'OCCUPANCY: "occupancy"',
    '"CLEANING REQUIRED": "toClean"',
    '"NO TECHNICAL ISSUE.": "noIssue"',
    '"NO ISSUES": "noIssue"',
    '"REPORT ISSUE": "reportIssue"',
    '"START CLEANING": "startCleaning"',
  ]) {
    assert.match(staffLabels, new RegExp(mapping.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Staff Home Thai source translates greeting, metrics, and summary lines without Google Translate", () => {
  assert.match(en + th, /sawasdee:/);
  assert.match(staffPage, /language === "th" \? `\$\{translate\("sawasdee"\)\} \$\{name\}` : `\$\{translate\("sawasdee"\)\}, \$\{name\}`/);
  assert.doesNotMatch(staffPage, /sawasdeeName|Good morning/);
  assert.match(staffPage, /translateStaffSummaryLabel/);
  assert.match(staffPage, /label: translateStaffSummaryLabel\(metric\.label, translate\)/);
  assert.match(staffPage, /translateStaffLabel\(label, translate\)/);
  assert.match(staffPage, /rooms:\s*"roomsDescription"/);
  assert.match(staffPage, /reception:\s*"movementsDescription"/);
  assert.match(staffPage, /housekeeping:\s*"housekeepingDescription"/);
  assert.match(staffPage, /maintenance:\s*"maintenanceDescription"/);
  assert.match(staffPage, /procurement:\s*"procurementDescription"/);
  for (const serverDescription of [
    "Compact resort room overview.",
    "Today guest movement agenda.",
    "Clean rooms in operational priority.",
    "Open technical issues and assignments.",
    "Send simple purchase requests.",
  ]) {
    assert.doesNotMatch(staffOverviewService, new RegExp(serverDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(staffLabels, /VACANT:\s*"vacant"/);
  assert.match(staffLabels, /OCCUPIED:\s*"occupied"/);
  assert.match(staffLabels, /ACTIVE:\s*"maintenanceActive"/);
  assert.match(staffLabels, /CLEAR:\s*"maintenanceClear"/);
  assert.match(staffLabels, /"COMPLETED CLEANING TODAY":\s*"completedCleaningToday"/);
  assert.match(staffPage, /"Free-text request":\s*"freeTextRequest"/);
  assert.match(staffPage, /"Owner decision":\s*"ownerDecision"/);
  assert.doesNotMatch(th, /:\s*"(Arrival|Arrivals|Departure|Departures|In House|Completed Cleaning Today|Vacant|Clear|Active|Free-text request|Owner decision|Maintenance Blocked)"/);
  assert.doesNotMatch(staffPage, /translation\.service|translateFreeText|\/api\/translations\/free-text/);
});

test("Room Detail Thai source translates generated room and maintenance labels before rendering", () => {
  for (const source of [housekeepingCard, maintenanceCard, roomOperationalSummaryCard]) {
    assert.match(source, /translateStaffLabel/);
  }

  assert.match(housekeepingCard, /detail=\{translateStaffLabel\(housekeeping\.detail, translate\)\}/);
  assert.match(housekeepingCard, /secondaryInfo=\{housekeeping\.secondaryInfo \? translateStaffLabel\(housekeeping\.secondaryInfo, translate\) : null\}/);
  assert.match(maintenanceCard, /secondaryInfo=\{maintenance\.secondaryInfo \? translateStaffLabel\(maintenance\.secondaryInfo, translate\) : null\}/);
  assert.match(roomOperationalSummaryCard, /translateStaffLabel\(item\.detail, translate\)/);

  for (const leftover of [
    "OCCUPANCY",
    "Cleaning required",
    "Start Cleaning",
    "NO ISSUES",
    "No Issues",
    "No technical issue.",
    "Report Issue",
  ]) {
    assert.match(staffLabels, new RegExp(leftover.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
