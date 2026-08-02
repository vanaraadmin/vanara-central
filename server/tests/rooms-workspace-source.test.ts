import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staffPage = readFileSync(new URL("../../src/pages/StaffPage.tsx", import.meta.url), "utf8");
const roomsPage = readFileSync(new URL("../../src/pages/RoomsPage.tsx", import.meta.url), "utf8");
const roomCompactRow = readFileSync(new URL("../../src/components/rooms/RoomCompactRow.tsx", import.meta.url), "utf8");
const roomCompactSignals = readFileSync(new URL("../../src/components/rooms/RoomCompactSignals.tsx", import.meta.url), "utf8");
const roomExpandedWorkspace = readFileSync(new URL("../../src/components/rooms/RoomExpandedWorkspace.tsx", import.meta.url), "utf8");
const guestCard = readFileSync(new URL("../../src/components/rooms/GuestCard.tsx", import.meta.url), "utf8");
const receptionCard = readFileSync(new URL("../../src/components/rooms/ReceptionCard.tsx", import.meta.url), "utf8");
const housekeepingCard = readFileSync(new URL("../../src/components/rooms/HousekeepingCard.tsx", import.meta.url), "utf8");
const maintenanceCard = readFileSync(new URL("../../src/components/rooms/MaintenanceCard.tsx", import.meta.url), "utf8");
const roomDomainCard = readFileSync(new URL("../../src/components/rooms/RoomDomainCard.tsx", import.meta.url), "utf8");
const roomOperationalSummaryCard = readFileSync(new URL("../../src/components/rooms/RoomOperationalSummaryCard.tsx", import.meta.url), "utf8");
const roomHero = readFileSync(new URL("../../src/components/rooms/RoomHero.tsx", import.meta.url), "utf8");
const statusPill = readFileSync(new URL("../../src/components/rooms/OperationalStatusPill.tsx", import.meta.url), "utf8");
const presentation = readFileSync(new URL("../../src/config/roomOperationalPresentation.ts", import.meta.url), "utf8");
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

test("Staff Home hierarchy keeps Rooms then Booking Pulse then Housekeeping and Maintenance", () => {
  assert.match(staffPage, /const WORKSPACE_ORDER: StaffCardId\[\] = \[\s*"rooms",\s*"housekeeping",\s*"maintenance",/);
  assert.match(staffPage, /staff-workspaces--primary[\s\S]*<RecentBookings[\s\S]*staff-workspaces--secondary/);
  assert.doesNotMatch(staffPage, /<RoomsPage|RoomExpandedWorkspace|RoomOperationalSummaryCard|GuestCard/);
});

test("Rooms Workspace consumes one dedicated read model and cards do not load services", () => {
  assert.match(roomsPage, /loadRoomsWorkspace/);
  assert.match(roomsService, /requestJson<RoomsWorkspaceResponse>\("\/api\/rooms"/);
  assert.doesNotMatch(roomsPage, /loadRoomDetail|loadMaintenance|loadHousekeeping|getReception/);
  assert.doesNotMatch(roomCompactRow, /services\//);
  assert.doesNotMatch(roomCompactSignals, /services\//);
  assert.doesNotMatch(guestCard, /services\//);
  assert.doesNotMatch(receptionCard, /services\//);
  assert.doesNotMatch(housekeepingCard, /services\//);
  assert.doesNotMatch(maintenanceCard, /services\//);
  assert.doesNotMatch(roomDomainCard, /services\//);
  assert.doesNotMatch(roomOperationalSummaryCard, /services\//);
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
  assert.match(roomCompactRow, /aria-controls=\{detailsId\}/);
  assert.doesNotMatch(roomsPage, /useNavigate|<Link/);
  assert.doesNotMatch(roomCompactRow, /<Link|to=\{|<button[\s\S]*<button/);
});

test("Compact row signals are centrally mapped and prioritize operational blockers", () => {
  assert.match(roomCompactRow, /RoomCompactSignals summary=\{room\.operational\}/);
  assert.match(roomCompactSignals, /getRoomOperationalSignals\(summary\)/);
  assert.match(presentation, /signal\("OUT OF SERVICE", "danger", 1/);
  assert.match(presentation, /signal\("NOT OPERATING", "warning", 2/);
  assert.match(presentation, /signal\("CLEANING", "info", 3/);
  assert.match(presentation, /signal\("NOT READY", "warning", 5/);
  assert.match(presentation, /OCCUPIED/);
  assert.match(presentation, /VACANT/);
  assert.match(roomCompactRow, /room\.operational\.occupancy\.state === "OCCUPIED"/);
  assert.doesNotMatch(roomCompactRow, /AVAILABLE_FOR_CLAIM|STANDARD_CLEANING|out_of_service|NOT_OPERATING/);
});

test("Expanded Rooms Workspace uses a read-only operational summary card", () => {
  assert.match(roomExpandedWorkspace, /RoomOperationalSummaryCard summary=\{room\.operational\}/);
  assert.match(roomOperationalSummaryCard, /Room Status/);
  assert.match(roomOperationalSummaryCard, /<dl className="room-operational-card__grid">/);
  for (const label of ["Operational", "Occupancy", "Housekeeping", "Maintenance"]) {
    assert.match(presentation, new RegExp(label));
  }
  assert.doesNotMatch(roomOperationalSummaryCard, /onClick|button|input|select|textarea/);
});

test("Expanded Rooms Workspace uses one parent container and removes Notes and History", () => {
  assert.match(roomExpandedWorkspace, /className="room-workspace-container"/);
  assert.match(roomExpandedWorkspace, /<RoomHero room=\{room\} \/>[\s\S]*<RoomOperationalSummaryCard summary=\{room\.operational\} \/>/);
  assert.match(roomExpandedWorkspace, /<ReceptionCard[\s\S]*<HousekeepingCard[\s\S]*<MaintenanceCard/);
  assert.doesNotMatch(roomExpandedWorkspace, /WorkspacePlaceholder|title="Notes"|title="History"|Notes|History/);
  assert.match(css, /\.room-workspace-container/);
});

test("Expanded Room Workspace uses the cream operational layer", () => {
  assert.match(css, /\.room-workspace-container[\s\S]*#f7f4ee/i);
  assert.match(css, /\.room-workspace-container[\s\S]*color:\s*#0a271c/i);
  assert.match(css, /\.room-workspace-container \.room-workspace-card/);
  assert.match(css, /\.room-workspace-container \.room-domain-card__primary-action/);
});

test("Expanded Rooms Workspace renders GuestCard only for occupied current stays", () => {
  assert.match(roomExpandedWorkspace, /room\.currentStay \? <GuestCard stay=\{room\.currentStay\} \/> : null/);
  assert.doesNotMatch(roomExpandedWorkspace, /WorkspacePlaceholder title="Guest"/);
  assert.match(guestCard, /type GuestCardProps = \{\s*stay: RoomCurrentStaySummary;/);
  assert.match(guestCard, /function GuestIdentity/);
  assert.match(guestCard, /function GuestBookingSummary/);
  assert.match(guestCard, /function GuestStaySummary/);
  assert.match(guestCard, /formatNationalityText\(stay\.nationality\)/);
  assert.match(guestCard, /label="Arrived"/);
  assert.match(guestCard, /label="Leaving"/);
  assert.match(guestCard, /label="Stay"/);
  assert.doesNotMatch(guestCard, /bookingId|Passport|Deposit|Email|Phone|payment|flag|countryCodeToFlag|UNKNOWN|N\/A/);
});

test("Expanded Rooms Workspace renders ReceptionCard only for relevant Reception state", () => {
  assert.match(roomExpandedWorkspace, /ReceptionCard roomId=\{room\.unitId\} roomName=\{room\.roomName\} reception=\{room\.reception\}/);
  assert.doesNotMatch(roomExpandedWorkspace, /WorkspacePlaceholder title="Reception"/);
  assert.match(receptionCard, /shouldRenderReceptionCard/);
  assert.match(receptionCard, /reception\.phase !== "NONE" \|\| reception\.alerts\.length > 0 \|\| reception\.primaryAction !== null/);
  assert.match(receptionCard, /Arrival Due/);
  assert.match(receptionCard, /In House/);
  assert.match(receptionCard, /Departure Due/);
  assert.match(receptionCard, /Checked Out/);
  assert.match(receptionCard, /Passport/);
  assert.match(receptionCard, /Deposit/);
  assert.match(receptionCard, /Check-in/);
  assert.match(receptionCard, /Check-out/);
  assert.match(receptionCard, /Open Reception/);
  assert.match(serverService, /Collect Passport/);
  assert.match(serverService, /Complete Check-in/);
  assert.match(serverService, /Complete Check-out/);
});

test("Housekeeping and Maintenance cards share the RoomDomainCard structure", () => {
  for (const card of [receptionCard, housekeepingCard, maintenanceCard]) {
    assert.match(card, /RoomDomainCard/);
    assert.match(card, /OperationalStateBlock/);
    assert.match(card, /PrimaryActionRow/);
  }
  assert.match(housekeepingCard, /Start On-demand Cleaning|action\.label/);
  assert.match(housekeepingCard, /onCreateOnDemandCleaning/);
  assert.match(housekeepingCard, /onStartTask/);
  assert.match(housekeepingCard, /onCompleteTask/);
  assert.match(housekeepingCard, /OPEN_MAINTENANCE/);
  assert.match(maintenanceCard, /Report Issue|action\.label/);
  assert.match(serverService, /mapHousekeepingSummary/);
  assert.match(serverService, /mapMaintenanceSummary/);
  assert.match(serverService, /primaryAction/);
});

test("Housekeeping card presentation is operational work state only", () => {
  assert.match(serverService, /primaryStatus:\s*"READY"/);
  assert.match(serverService, /"Cleaning Required"/);
  assert.match(serverService, /primaryStatus:\s*"Cleaning In Progress"/);
  assert.match(serverService, /primaryStatus:\s*"Waiting For Reception"/);
  assert.match(serverService, /primaryStatus:\s*"Cleaning Blocked"/);
  assert.doesNotMatch(serverService, /primaryStatus:\s*"Not Ready"/);
  assert.doesNotMatch(serverService, /detail:\s*"No active Housekeeping task"/);
});


test("RoomDomainCard is reusable and not Reception-specific", () => {
  assert.match(roomDomainCard, /type RoomDomainCardProps/);
  assert.match(roomDomainCard, /eyebrow: string/);
  assert.match(roomDomainCard, /title: string/);
  assert.match(roomDomainCard, /children\?: ReactNode/);
  assert.match(roomDomainCard, /status\?: ReactNode/);
  assert.match(roomDomainCard, /footer\?: ReactNode/);
  assert.match(roomDomainCard, /RoomSectionHeader/);
  assert.match(roomDomainCard, /OperationalStateBlock/);
  assert.match(roomDomainCard, /PrimaryActionRow/);
  assert.doesNotMatch(roomDomainCard, /Reception|Passport|Deposit|Check-in|Check-out/);
});

test("Operational status pill supports one reusable tone model", () => {
  for (const tone of ["success", "warning", "danger", "info", "neutral"]) {
    assert.match(statusPill, new RegExp(`operational-status-pill--\\$\\{tone\\}`));
    assert.match(css, new RegExp(`\\.operational-status-pill--${tone}`));
  }
  assert.match(css, /\.operational-status-pill/);
  assert.match(css, /min-height:\s*22px/);
  assert.doesNotMatch(css, /pulse|blink|flash/);
});

test("Accommodation images are centrally mapped with static imports", () => {
  for (const image of ["room1.JPG", "room12.JPG", "room13.JPG", "villa10.JPG", "tent6.JPG"]) {
    assert.match(imageMapping, new RegExp(image.replace(".", "\\.")));
  }
  assert.match(roomsService, /accommodationImageFor\(room\.heroImageKey\)/);
  assert.doesNotMatch(roomsService, /\/assets\/img\//);
});

test("Rooms backend read model keeps all operational dimensions independent", () => {
  assert.match(serverService, /getRoomsWorkspaceOverview/);
  assert.match(serverService, /room_operational_availability/);
  assert.match(serverService, /room_housekeeping_state/);
  assert.match(serverService, /b\.country/);
  assert.match(serverService, /b\.country_code/);
  assert.match(serverService, /b\.arrival_date/);
  assert.match(serverService, /b\.departure_date/);
  assert.match(serverService, /currentStay: occupancyState === "OCCUPIED"/);
  assert.match(serverService, /reception_stays rs2/);
  assert.match(serverService, /rs2\.guest_arrived = 1/);
  assert.match(serverService, /housekeeping_tasks/);
  assert.match(serverService, /room-ready-baseline:not-ready/);
  assert.match(serverService, /ROW_NUMBER\(\) OVER/);
  assert.match(serverService, /maintenance_tickets/);
  assert.match(serverService, /out_of_service = 1/);
  assert.match(serverService, /json_extract\(metadata_json, '\$\.outOfService'\)/);
  assert.match(serverService, /operationalBookingStatusSql/);
  assert.match(serverService, /familyRank/);
  assert.match(serverService, /reception_stays rrs/);
  assert.match(serverService, /reception_room_alerts/);
  assert.match(serverService, /RoomReceptionSummary/);
  assert.match(serverService, /hasActionPermission\(user, "can_complete_checkin_checkout"\)/);
  assert.match(serverService, /hasModulePermission\(user, "movements", "access"\)/);
  assert.doesNotMatch(serverService, /getReceptionOverview/);
});

test("Room Workspace UI copy does not present raw database or task enums", () => {
  const ui = `${roomCompactRow}\n${roomCompactSignals}\n${guestCard}\n${receptionCard}\n${maintenanceCard}\n${roomDomainCard}\n${roomOperationalSummaryCard}\n${presentation}`;
  for (const raw of ["AVAILABLE_FOR_CLAIM", "STANDARD_CLEANING", "ROOM_READY_OVERRIDE", "out_of_service", "guest_arrived", "metadata_json"]) {
    assert.doesNotMatch(ui, new RegExp(raw));
  }
});

test("Rooms Workspace does not introduce a parallel Reception API", () => {
  assert.match(roomsService, /requestJson<RoomsWorkspaceResponse>\("\/api\/rooms"/);
  assert.doesNotMatch(roomsService, /\/api\/reception/);
  assert.doesNotMatch(serverService, /app\.(get|post|patch|delete)\("\/api\/rooms\/:id\/reception/);
});
