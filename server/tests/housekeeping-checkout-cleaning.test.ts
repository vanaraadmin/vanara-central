import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  housekeepingWorkKind,
  housekeepingWorkTitle,
} from "../src/services/housekeeping-task-presentation.service.ts";

test("checkout cleaning and true turnover have distinct canonical presentation kinds", () => {
  assert.equal(housekeepingWorkKind("TURNOVER", "NORMAL"), "CHECKOUT_CLEANING");
  assert.equal(housekeepingWorkKind("TURNOVER", "LOW"), "CHECKOUT_CLEANING");
  assert.equal(housekeepingWorkKind("TURNOVER", "HIGH"), "PRIORITY_TURNOVER");
  assert.equal(housekeepingWorkKind("TURNOVER", "URGENT"), "PRIORITY_TURNOVER");
  assert.equal(housekeepingWorkTitle("CHECKOUT_CLEANING"), "Check-out Cleaning");
  assert.equal(housekeepingWorkTitle("PRIORITY_TURNOVER"), "Priority Turnover");
});

test("other housekeeping task kinds keep their existing visible meaning", () => {
  assert.equal(housekeepingWorkKind("STANDARD_CLEANING", "NORMAL"), "NORMAL_CLEANING");
  assert.equal(housekeepingWorkKind("LINEN_CHANGE", "HIGH"), "FULL_CLEANING");
  assert.equal(housekeepingWorkKind("WATER_REFILL", "NORMAL"), "WATER_REFILL");
  assert.equal(housekeepingWorkKind("ON_DEMAND_CLEANING", "NORMAL"), "ON_DEMAND_CLEANING");
});

test("all reachable Housekeeping surfaces use workKind and mobile rows remain readable through iPhone Max width", async () => {
  const [overview, staff, roomDetail, roomsWorkspace, page, css, en, th, labels] = await Promise.all([
    readFile(new URL("../src/services/housekeeping-v2-overview.service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/staff-overview.service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/room-detail.service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/rooms-workspace.service.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/HousekeepingV2Page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/styles/HousekeepingV2Page.css", import.meta.url), "utf8"),
    readFile(new URL("../../src/i18n/en.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/i18n/th.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/utils/staff-i18n-labels.ts", import.meta.url), "utf8"),
  ]);

  assert.match(overview, /workKind: housekeepingWorkKind\(taskType, priority\)/);
  assert.match(overview, /toClean: cleaningCards\.filter\(\(card\) => !IN_PROGRESS_STATUSES\.has\(card\.taskStatus\)\)\.length/);
  assert.match(staff, /task\.workKind === "PRIORITY_TURNOVER"/);
  assert.match(roomDetail, /task\.workKind === "PRIORITY_TURNOVER"/);
  assert.doesNotMatch(roomDetail, /task\.priority === "HIGH" \|\| task\.taskType === "TURNOVER"/);
  assert.match(roomsWorkspace, /function taskPresentationPriority[\s\S]*taskType === "TURNOVER" && !hasIncomingToday[\s\S]*return "NORMAL"/);
  assert.match(roomsWorkspace, /housekeepingWorkTitle\(housekeepingWorkKind\(taskType, taskPresentationPriority/);
  assert.match(page, /card\.workKind === "CHECKOUT_CLEANING"\) return translate\("checkOutCleaning"\)/);
  assert.doesNotMatch(page, /card\.taskType === "TURNOVER"\) return card\.currentQueue/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.housekeeping-v2-task-row\s*\{[\s\S]*grid-template-columns:\s*36px minmax\(0, 1fr\) 18px;/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.housekeeping-v2-room-link,[\s\S]*font-size:\s*1\.125rem;[\s\S]*white-space:\s*normal;/);
  assert.match(en, /checkOutCleaning: "Check-out Cleaning"/);
  assert.match(th, /checkOutCleaning: "ทำความสะอาดหลังเช็กเอาต์"/);
  assert.match(labels, /"CHECK-OUT CLEANING": "checkOutCleaning"/);
});
