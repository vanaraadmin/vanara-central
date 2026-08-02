import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staffPage = readFileSync(new URL("../../src/pages/StaffPage.tsx", import.meta.url), "utf8");
const roomsPage = readFileSync(new URL("../../src/pages/RoomsPage.tsx", import.meta.url), "utf8");
const roomCompactRow = readFileSync(new URL("../../src/components/rooms/RoomCompactRow.tsx", import.meta.url), "utf8");
const roomExpandedWorkspace = readFileSync(new URL("../../src/components/rooms/RoomExpandedWorkspace.tsx", import.meta.url), "utf8");
const roomHero = readFileSync(new URL("../../src/components/rooms/RoomHero.tsx", import.meta.url), "utf8");
const statusPill = readFileSync(new URL("../../src/components/rooms/OperationalStatusPill.tsx", import.meta.url), "utf8");
const imageMapping = readFileSync(new URL("../../src/config/accommodationImages.ts", import.meta.url), "utf8");
const roomsService = readFileSync(new URL("../../src/services/rooms-workspace.service.ts", import.meta.url), "utf8");
const staffService = readFileSync(new URL("../src/services/staff-overview.service.ts", import.meta.url), "utf8");
const serverService = readFileSync(new URL("../src/services/rooms-workspace.service.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../../src/styles/RoomsPage.css", import.meta.url), "utf8");

test("Staff Home keeps a compact Rooms widget that opens the Rooms Workspace", () => {
  assert.doesNotMatch(staffPage, /HIDDEN_UNTIL_PAGE_READY = new Set<StaffCardId>\(\["rooms"/);
  assert.match(staffPage, /roomsWorkspace/);
  assert.match(staffPage, /workspace=\{roomsWorkspace\}/);
  assert.match(staffPage, /<RecentBookings/);
  assert.doesNotMatch(staffPage, /RoomExpandedWorkspace|loadRoomsWorkspace|rooms-home__list/);
  assert.match(staffService, /href:\s*"\/rooms"/);
});

test("Rooms Workspace consumes one dedicated read model and cards do not load services", () => {
  assert.match(roomsPage, /loadRoomsWorkspace/);
  assert.match(roomsService, /requestJson<RoomsWorkspaceResponse>\("\/api\/rooms"/);
  assert.doesNotMatch(roomsPage, /loadRoomDetail|loadMaintenance|loadHousekeeping|getReception/);
  assert.doesNotMatch(roomCompactRow, /services\//);
  assert.doesNotMatch(roomExpandedWorkspace, /services\//);
  assert.doesNotMatch(roomHero, /services\//);
});

test("Rooms rows are compact, expandable inline, and dismiss without navigation", () => {
  assert.match(roomsPage, /useState<number \| null>\(null\)/);
  assert.match(roomsPage, /activeExpandedRoomId/);
  assert.match(roomsPage, /current === roomId \? null : roomId/);
  assert.match(roomsPage, /useOutsidePointerDown\(containerRef, collapse, activeExpandedRoomId !== null\)/);
  assert.match(roomsPage, /event\.key === "Escape"/);
  assert.match(roomCompactRow, /className="room-row"/);
  assert.match(roomCompactRow, /aria-expanded=\{expanded\}/);
  assert.doesNotMatch(roomsPage, /useNavigate|<Link/);
  assert.doesNotMatch(roomCompactRow, /<Link|to=\{/);
});

test("Expanded Rooms Workspace is the approved Sprint 1 skeleton", () => {
  for (const section of ["RoomHero", "Operational Summary", "Guest", "Reception", "Housekeeping", "Maintenance", "Notes", "History"]) {
    assert.match(roomExpandedWorkspace, new RegExp(section));
  }
  assert.match(roomHero, /room\.heroImage/);
  assert.doesNotMatch(roomExpandedWorkspace, /Create On Demand|Report Issue|Save|Complete/);
});

test("OperationalStatusPill exposes the required compact variants", () => {
  for (const variant of ["Operating", "Not Operating", "Occupied", "Vacant", "Ready", "Not Ready", "Maintenance", "Clear"]) {
    assert.match(statusPill, new RegExp(`"${variant}"`));
  }
  assert.match(css, /\.operational-status-pill/);
  assert.match(css, /min-height:\s*24px/);
});

test("Accommodation images are centrally mapped with static imports", () => {
  for (const image of ["room1.JPG", "room12.JPG", "room13.JPG", "villa10.JPG", "tent6.JPG"]) {
    assert.match(imageMapping, new RegExp(image.replace(".", "\\.")));
  }
  assert.match(roomsService, /accommodationImageFor\(room\.heroImageKey\)/);
  assert.doesNotMatch(roomsService, /\/assets\/img\//);
});

test("Rooms backend read model keeps ordering and state ownership server-side", () => {
  assert.match(serverService, /getRoomsWorkspaceOverview/);
  assert.match(serverService, /room_operational_availability/);
  assert.match(serverService, /room_housekeeping_state/);
  assert.match(serverService, /maintenance_tickets/);
  assert.match(serverService, /operationalBookingStatusSql/);
  assert.match(serverService, /familyRank/);
});
