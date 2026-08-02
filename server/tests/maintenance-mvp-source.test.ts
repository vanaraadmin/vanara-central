import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const maintenancePage = readFileSync(new URL("../../src/pages/MaintenancePage.tsx", import.meta.url), "utf8");
const maintenanceDetail = readFileSync(new URL("../../src/pages/MaintenanceDetailPage.tsx", import.meta.url), "utf8");
const maintenanceGallery = readFileSync(new URL("../../src/components/MaintenancePhotoGallery.tsx", import.meta.url), "utf8");
const createMaintenance = readFileSync(new URL("../../src/pages/CreateMaintenancePage.tsx", import.meta.url), "utf8");
const housekeepingV2 = readFileSync(new URL("../../src/pages/HousekeepingV2Page.tsx", import.meta.url), "utf8");
const roomDetail = readFileSync(new URL("../../src/pages/RoomDetailPage.tsx", import.meta.url), "utf8");
const receptionPage = readFileSync(new URL("../../src/pages/ReceptionPage.tsx", import.meta.url), "utf8");
const receptionService = readFileSync(new URL("../src/services/reception.service.ts", import.meta.url), "utf8");
const staffOverviewService = readFileSync(new URL("../src/services/staff-overview.service.ts", import.meta.url), "utf8");

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

test("maintenance home is an expandable operational queue", () => {
  assert.match(maintenancePage, /useOutsidePointerDown/);
  assert.match(maintenancePage, /activeExpandedTicketId/);
  assert.match(maintenancePage, /aria-expanded=\{expanded\}/);
  assert.match(maintenancePage, /maintenance-ticket__details/);
  assert.match(maintenancePage, /Open issue/);
  assert.doesNotMatch(maintenancePage, /<Link\s+className=\{`maintenance-ticket/);
});

test("maintenance detail keeps only the approved intervention details", () => {
  assert.match(maintenanceDetail, /MaintenancePhotoGallery/);
  assert.match(maintenanceDetail, /Timeline/);
  assert.match(maintenanceDetail, /Description/);
  assert.doesNotMatch(maintenanceDetail, /NotesPanel|addMaintenanceNote|addMaintenancePhoto|Reported by|Created<\/dt>|Updated<\/dt>/);
});

test("maintenance photos use a compact gallery with fullscreen preview", () => {
  assert.match(maintenanceGallery, /maintenance-photo-grid/);
  assert.match(maintenanceGallery, /role="dialog"/);
  assert.match(maintenanceGallery, /Escape/);
  assert.match(maintenanceGallery, /photo\.url/);
});

test("blocking maintenance is surfaced in Reception, Staff Home, and Room Workspace", () => {
  assert.match(receptionService, /Maintenance Out Of Service/);
  assert.match(staffOverviewService, /label: "Blocking"/);
  assert.match(roomDetail, /hasActiveTicket/);
  assert.match(roomDetail, /!hasActiveTicket/);
});

test("maintenance creation requires an explicit Room or Other target", () => {
  assert.match(createMaintenance, /maintenance-target-field/);
  assert.match(createMaintenance, /targetType/);
  assert.match(createMaintenance, /"ROOM"/);
  assert.match(createMaintenance, /"OTHER"/);
  assert.match(createMaintenance, /Restaurant/);
  assert.match(createMaintenance, /Utilities/);
  assert.match(createMaintenance, /Area/);
  assert.doesNotMatch(createMaintenance, /Room optional/);
});
