import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const maintenancePage = readFileSync(new URL("../../src/pages/MaintenancePage.tsx", import.meta.url), "utf8");
const maintenanceDetail = readFileSync(new URL("../../src/pages/MaintenanceDetailPage.tsx", import.meta.url), "utf8");
const createMaintenance = readFileSync(new URL("../../src/pages/CreateMaintenancePage.tsx", import.meta.url), "utf8");
const housekeepingV2 = readFileSync(new URL("../../src/pages/HousekeepingV2Page.tsx", import.meta.url), "utf8");
const receptionPage = readFileSync(new URL("../../src/pages/ReceptionPage.tsx", import.meta.url), "utf8");

test("maintenance MVP UI exposes only four statuses and three priorities", () => {
  assert.match(maintenanceDetail, /"Open", "In Progress", "Waiting Parts", "Completed"/);
  assert.match(maintenanceDetail, /"Low", "Normal", "High"/);
  assert.match(createMaintenance, /"Low", "Normal", "High"/);
  assert.doesNotMatch(`${maintenancePage}\n${maintenanceDetail}\n${createMaintenance}`, /"Assigned"| "Resolved"| "Closed"| "Critical"| "Medium"/);
  assert.doesNotMatch(createMaintenance, /External technician|Category/);
});

test("maintenance entry points remain in operational workspaces", () => {
  assert.match(housekeepingV2, /source=housekeeping/);
  assert.match(receptionPage, /source=reception/);
  assert.match(receptionPage, /reception-maintenance-badge/);
});
