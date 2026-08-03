import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staffPage = readFileSync(new URL("../../src/pages/StaffPage.tsx", import.meta.url), "utf8");
const procurementPage = readFileSync(new URL("../../src/pages/ProcurementPage.tsx", import.meta.url), "utf8");
const housekeepingV2Page = readFileSync(new URL("../../src/pages/HousekeepingV2Page.tsx", import.meta.url), "utf8");
const roomsPage = readFileSync(new URL("../../src/pages/RoomsPage.tsx", import.meta.url), "utf8");
const roomCompactRow = readFileSync(new URL("../../src/components/rooms/RoomCompactRow.tsx", import.meta.url), "utf8");
const roomCompactSignals = readFileSync(new URL("../../src/components/rooms/RoomCompactSignals.tsx", import.meta.url), "utf8");
const accommodationTypeIcon = readFileSync(new URL("../../src/components/rooms/AccommodationTypeIcon.tsx", import.meta.url), "utf8");
const roomExpandedWorkspace = readFileSync(new URL("../../src/components/rooms/RoomExpandedWorkspace.tsx", import.meta.url), "utf8");
const guestCard = readFileSync(new URL("../../src/components/rooms/GuestCard.tsx", import.meta.url), "utf8");
const receptionCard = readFileSync(new URL("../../src/components/rooms/ReceptionCard.tsx", import.meta.url), "utf8");
const turnoverCard = readFileSync(new URL("../../src/components/rooms/TurnoverCard.tsx", import.meta.url), "utf8");
const turnoverPresentation = readFileSync(new URL("../../src/config/turnoverPresentation.ts", import.meta.url), "utf8");
const housekeepingCard = readFileSync(new URL("../../src/components/rooms/HousekeepingCard.tsx", import.meta.url), "utf8");
const maintenanceCard = readFileSync(new URL("../../src/components/rooms/MaintenanceCard.tsx", import.meta.url), "utf8");
const roomDomainCard = readFileSync(new URL("../../src/components/rooms/RoomDomainCard.tsx", import.meta.url), "utf8");
const roomOperationalSummaryCard = readFileSync(new URL("../../src/components/rooms/RoomOperationalSummaryCard.tsx", import.meta.url), "utf8");
const roomHero = readFileSync(new URL("../../src/components/rooms/RoomHero.tsx", import.meta.url), "utf8");
const statusPill = readFileSync(new URL("../../src/components/rooms/OperationalStatusPill.tsx", import.meta.url), "utf8");
const presentation = readFileSync(new URL("../../src/config/roomOperationalPresentation.ts", import.meta.url), "utf8");
const roomsService = readFileSync(new URL("../../src/services/rooms-workspace.service.ts", import.meta.url), "utf8");
const staffService = readFileSync(new URL("../src/services/staff-overview.service.ts", import.meta.url), "utf8");
const serverService = readFileSync(new URL("../src/services/rooms-workspace.service.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../../src/styles/RoomsPage.css", import.meta.url), "utf8");

function sourceBlockBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1);
  return source.slice(startIndex, endIndex);
}

test("Staff Home keeps a compact Rooms widget that opens the Rooms Workspace", () => {
  assert.doesNotMatch(staffPage, /HIDDEN_UNTIL_PAGE_READY = new Set<StaffCardId>\(\["rooms"/);
  assert.match(staffPage, /<RecentBookings/);
  assert.doesNotMatch(staffPage, /roomsWorkspace|remainingWorkspaces|staff-workspaces--primary|staff-workspaces--secondary/);
  assert.doesNotMatch(staffPage, /RoomExpandedWorkspace|loadRoomsWorkspace|rooms-home__list/);
  assert.match(staffService, /href:\s*"\/rooms"/);
});

test("Staff Home hierarchy keeps Booking Pulse then Rooms, Availability, Check-In, Housekeeping, Maintenance, Procurement, and Chat", () => {
  const recentBookingsIndex = staffPage.indexOf("<RecentBookings");
  const workspacesIndex = staffPage.indexOf('className="staff-workspaces"');

  assert.match(staffPage, /const WORKSPACE_ORDER: StaffCardId\[\] = \[\s*"rooms",\s*"availability",\s*"reception",\s*"housekeeping",\s*"maintenance",\s*"procurement",\s*"chat",/);
  assert.match(staffPage, /href:\s*"\/availability-prices"/);
  assert.ok(recentBookingsIndex >= 0 && workspacesIndex >= 0);
  assert.ok(recentBookingsIndex < workspacesIndex);
  assert.doesNotMatch(staffPage, /<RoomsPage|RoomExpandedWorkspace|RoomOperationalSummaryCard|GuestCard/);
});

test("Staff Owner UI model keeps one visual component tree and gates only capabilities", () => {
  assert.doesNotMatch(staffPage, /HIDDEN_UNTIL_PAGE_READY/);
  assert.match(staffPage, /chatIcon/);
  assert.match(staffService, /id:\s*"chat"/);
  assert.doesNotMatch(staffService, /id:\s*"availability"/);
  assert.match(procurementPage, /<WorkspaceShell title="Procurement" workspace="procurement" bodyClassName="procurement-page">[\s\S]*<SupplyRequestPage embedded \/>[\s\S]*<ProcurementOwnerPage embedded \/>/);
  assert.doesNotMatch(procurementPage, /return user\.data\.isOwner \?/);
  assert.match(housekeepingV2Page, /card\.capabilities\.canReassign/);
  assert.match(housekeepingV2Page, /Assign Cleaning/);
  assert.match(housekeepingV2Page, /Assign Task/);
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

test("Rooms summaries expose reconciled operational counters from the shared read model", () => {
  const staffRoomsCard = sourceBlockBetween(staffService, 'id: "rooms"', 'id: "housekeeping"');

  for (const field of ["occupied", "vacant", "maintenanceBlocked", "seasonClosed"]) {
    assert.match(serverService, new RegExp(`${field}:`));
    assert.match(staffService, new RegExp(`overview\\.summary\\.${field}`));
  }
  assert.match(serverService, /const operatingRooms = rooms\.filter/);
  assert.match(serverService, /const blockedOperatingRooms = operatingRooms\.filter/);
  assert.match(serverService, /const usableOperatingRooms = operatingRooms\.filter/);
  assert.match(roomsPage, /summary\.vacant/);
  assert.match(roomsPage, /summary\.maintenanceBlocked/);
  assert.match(roomsPage, /summary\.seasonClosed/);
  assert.match(staffRoomsCard, /label:\s*"Occupied"/);
  assert.match(staffRoomsCard, /label:\s*"Vacant"/);
  assert.match(staffRoomsCard, /label:\s*"Maintenance Blocked"/);
  assert.match(staffRoomsCard, /label:\s*"Season Closed"/);
  assert.doesNotMatch(staffRoomsCard, /Ready|Not Ready|Dirty|Cleaning|Water|Housekeeping Tasks/);
  assert.doesNotMatch(staffService, /Vacant Ready|Vacant Not Ready|Not Ready|Dirty/);
});

test("Staff Home Housekeeping summary consumes the V2 operational task engine", () => {
  assert.match(staffService, /getHousekeepingV2Overview/);
  assert.match(staffService, /staffHousekeepingMetrics/);
  assert.match(staffService, /Water Due/);
  assert.match(staffService, /Completed Cleaning Today/);
  assert.match(staffService, /Cleaning In Progress/);
  assert.doesNotMatch(staffService, /getHousekeepingOverview/);
  assert.doesNotMatch(staffService, /cleanFirst \+ overview\.summary\.cleanToday/);
});

test("Rooms rows are compact, expandable inline, and dismiss without navigation", () => {
  assert.match(roomsPage, /useState<number \| null>\(null\)/);
  assert.match(roomsPage, /activeExpandedRoomId/);
  assert.match(roomsPage, /current === roomId \? null : roomId/);
  assert.match(roomsPage, /useOutsidePointerDown\(containerRef, collapse, activeExpandedRoomId !== null\)/);
  assert.match(roomsPage, /event\.key === "Escape"/);
  assert.match(roomCompactRow, /className=\{className\}/);
  assert.match(roomCompactRow, /room-row/);
  assert.match(roomCompactRow, /aria-expanded=\{expanded\}/);
  assert.match(roomCompactRow, /aria-controls=\{detailsId\}/);
  assert.match(roomCompactRow, /aria-label=\{presentation\.accessibleSummary\}/);
  assert.doesNotMatch(roomsPage, /<Link/);
  assert.doesNotMatch(roomCompactRow, /useNavigate|<Link|to=\{|<button[\s\S]*<button/);
});

test("Compact row signals use one centralized presentation mapper", () => {
  assert.match(roomCompactRow, /getRoomCompactPresentation\(room\)/);
  assert.match(roomCompactRow, /RoomCompactSignals presentation=\{presentation\}/);
  assert.match(roomCompactRow, /RoomTerminalState presentation=\{presentation\}/);
  assert.match(roomCompactRow, /AccommodationTypeIcon className="room-row__icon" type=\{room\.accommodationType\}/);
  assert.match(roomCompactRow, /const guestName = presentation\.mode === "STANDARD" \? presentation\.primary\.detail : null/);
  assert.doesNotMatch(roomCompactRow, /room-row__guest[\s\S]*room\.accommodationType|identityDetail|room-compact-row__detail/);
  assert.match(roomCompactSignals, /RoomInlineSignal/);
  assert.match(roomCompactSignals, /room-signals__primary/);
  assert.match(roomCompactSignals, /room-signals__secondary/);
  assert.match(presentation, /export function getRoomCompactPresentation/);
  assert.match(presentation, /mode:\s*"MAINTENANCE_BLOCKED"/);
  assert.match(presentation, /mode:\s*"SEASON_CLOSED"/);
  assert.match(presentation, /secondarySignals[\s\S]*slice\(0, 2\)/);
  assert.match(presentation, /"OUT OF SERVICE"/);
  assert.match(presentation, /"SEASON CLOSED"/);
  assert.match(presentation, /"CLEANING IN PROGRESS"/);
  assert.match(presentation, /"DIRTY"/);
  assert.match(presentation, /"CLEAN"/);
  assert.match(presentation, /"OCCUPIED"/);
  assert.match(presentation, /"VACANT"/);
  assert.doesNotMatch(roomCompactSignals, /OperationalStatusPill/);
  assert.doesNotMatch(roomCompactRow, /RoomHero|heroImage|<img|room\.alertSummary|AVAILABLE_FOR_CLAIM|STANDARD_CLEANING|out_of_service/);
  assert.doesNotMatch(presentation, /getRoomOperationalSignals/);
});

test("Compact row type mark uses local monochrome accommodation icons", () => {
  assert.match(accommodationTypeIcon, /function BungalowIcon/);
  assert.match(accommodationTypeIcon, /function VillaIcon/);
  assert.match(accommodationTypeIcon, /function TentIcon/);
  assert.match(accommodationTypeIcon, /stroke:\s*"currentColor"/);
  assert.doesNotMatch(accommodationTypeIcon, /emoji|img|png|jpg|lucide|SF Symbol/i);
});

test("Compact row CSS prevents uncontrolled status-pill clouds", () => {
  const roomRowCss = sourceBlockBetween(css, ".room-row {", ".rooms-home__item:last-child .room-row");

  assert.match(css, /\.room-row/);
  assert.match(css, /grid-template-columns:\s*40px\s+minmax\(0,\s*1fr\)\s+auto\s+18px/);
  assert.match(css, /min-height:\s*96px/);
  assert.match(css, /padding:\s*17px 18px/);
  assert.match(css, /\.room-row__name[\s\S]*font-size:\s*1\.125rem/);
  assert.match(css, /\.room-row__name[\s\S]*font-weight:\s*650/);
  assert.match(css, /\.room-row__guest[\s\S]*font-size:\s*0\.78rem/);
  assert.match(css, /\.room-signals__primary/);
  assert.match(css, /\.room-signals__secondary/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.match(css, /\.room-signals__secondary \.room-signal:not\(:first-of-type\)/);
  assert.match(roomRowCss, /box-shadow:\s*none/);
  assert.doesNotMatch(css, /\.room-row__signals[\s\S]*flex-wrap:\s*wrap/);
  assert.doesNotMatch(roomCompactSignals, /operational-status-pill/);
});

test("Expanded Rooms Workspace uses a read-only operational summary card", () => {
  assert.match(roomExpandedWorkspace, /RoomOperationalSummaryCard summary=\{room\.operational\}/);
  assert.match(roomOperationalSummaryCard, /Room Status/);
  assert.match(roomOperationalSummaryCard, /<dl className="room-status-grid vc-data-grid room-operational-card__grid">/);
  assert.match(roomOperationalSummaryCard, /room-status-item vc-data-item/);
  for (const label of ["Operational", "Occupancy", "Cleaning", "Maintenance"]) {
    assert.match(presentation, new RegExp(label));
  }
  assert.doesNotMatch(roomOperationalSummaryCard, /onClick|button|input|select|textarea/);
});

test("Expanded Rooms Workspace uses one lifted glass sheet and removes Notes and History", () => {
  assert.match(roomExpandedWorkspace, /className="room-row-expanded-content room-expanded"/);
  assert.match(roomExpandedWorkspace, /VanaraGlassSheet/);
  assert.match(roomExpandedWorkspace, /variant="elevated"/);
  assert.match(roomExpandedWorkspace, /<RoomHero room=\{room\} \/>[\s\S]*<RoomOperationalSummaryCard summary=\{room\.operational\} \/>/);
  assert.match(roomExpandedWorkspace, /turnover \? \([\s\S]*<TurnoverCard[\s\S]*<HousekeepingCard[\s\S]*<MaintenanceCard/);
  assert.doesNotMatch(roomExpandedWorkspace, /<ReceptionCard/);
  assert.doesNotMatch(roomExpandedWorkspace, /WorkspacePlaceholder|title="Notes"|title="History"|Notes|History/);
  assert.match(css, /\.room-expanded-sheet/);
  assert.match(css, /@keyframes room-sheet-lift-in/);
  assert.doesNotMatch(css, /\.room-workspace-container/);
  assert.doesNotMatch(css, /\.room-workspace-card/);
});

test("Expanded Room Workspace header uses accommodation icon instead of room photos", () => {
  assert.match(roomHero, /AccommodationTypeIcon/);
  assert.match(roomHero, /room\.currentStay/);
  assert.doesNotMatch(roomHero, /heroImage|<img|official room|image unavailable|RoomIcon/);
  assert.match(css, /\.room-expanded-sheet__identity-icon/);
  assert.doesNotMatch(roomHero, /room-hero/);
  assert.doesNotMatch(css, /\.room-hero img|object-fit:\s*cover/);
});

test("Expanded Room Workspace uses one forest glass sheet without large white cards", () => {
  assert.match(roomExpandedWorkspace, /<VanaraGlassSheet ariaLabel=\{`\$\{room\.roomName\} details`\} className="room-expanded-sheet" variant="elevated">/);
  assert.doesNotMatch(css, /\.room-expanded-sheet[\s\S]*rgba\(10,\s*43,\s*32,\s*0\.24\)/);
  assert.doesNotMatch(css, /\.room-expanded-section[\s\S]*rgba\(238,\s*244,\s*236,\s*0\.075\)/);
  assert.match(css, /\.room-status-grid/);
  assert.match(css, /\.room-status-item[\s\S]*border-right/);
  assert.doesNotMatch(css, /background:\s*#fff/i);
  assert.doesNotMatch(css, /background:\s*#f7f4ee/i);
  assert.doesNotMatch(css, /\.room-operational-item[\s\S]{0,160}border-radius/);
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

test("Expanded Rooms Workspace renders TurnoverCard before Housekeeping instead of ReceptionCard", () => {
  assert.match(roomExpandedWorkspace, /getRoomsWorkspaceTurnover\(room\)/);
  assert.match(roomExpandedWorkspace, /turnover \? \([\s\S]*<TurnoverCard[\s\S]*roomId=\{room\.unitId\}[\s\S]*turnover=\{turnover\}/);
  assert.doesNotMatch(roomExpandedWorkspace, /WorkspacePlaceholder title="Reception"/);
  assert.match(turnoverCard, /eyebrow="Turnover"/);
  assert.match(turnoverCard, /title="Current State"/);
  assert.match(turnoverPresentation, /Waiting for Today's Check-out[\s\S]*Guest has not completed today's check-out/);
  assert.match(turnoverPresentation, /Today's Check-out Completed[\s\S]*Room released\. Waiting for today's check-in/);
  assert.match(turnoverPresentation, /Waiting for Today's Check-in[\s\S]*Room is waiting for today's check-in/);
  assert.match(turnoverPresentation, /Guest Waiting For Room[\s\S]*Guest has checked in\. Room is not ready yet/);
  assert.match(turnoverPresentation, /Ready for Today's Check-in[\s\S]*Room is ready for today's check-in/);
  assert.match(turnoverPresentation, /return null/);
  assert.doesNotMatch(turnoverPresentation, /Start Cleaning|Finish Cleaning|Cleaning In Progress|Ready to start cleaning|Task #/);
  assert.doesNotMatch(turnoverCard, /Passport|Deposit|Open Reception|Arrival Due|Reception/);
});

test("Housekeeping and Maintenance cards share the RoomDomainCard structure", () => {
  for (const card of [turnoverCard, housekeepingCard, maintenanceCard]) {
    assert.match(card, /RoomDomainCard/);
    assert.match(card, /OperationalStateBlock/);
  }
  assert.doesNotMatch(turnoverCard, /PrimaryActionRow/);
  for (const card of [housekeepingCard, maintenanceCard]) {
    assert.match(card, /PrimaryActionRow/);
  }
  assert.match(housekeepingCard, /Start On-demand Cleaning|action\.label/);
  assert.match(housekeepingCard, /CREATE_STANDARD_CLEANING/);
  assert.match(housekeepingCard, /onCreateStandardCleaning/);
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
  assert.match(serverService, /primaryStatus:\s*"CLEAN"/);
  assert.match(serverService, /"Cleaning Required"/);
  assert.match(serverService, /primaryStatus:\s*"Cleaning In Progress"/);
  assert.match(serverService, /primaryStatus:\s*"Waiting for Check-out"/);
  assert.match(serverService, /primaryStatus:\s*"Cleaning Blocked"/);
  assert.doesNotMatch(serverService, /primaryStatus:\s*"Not Ready"/);
  assert.doesNotMatch(serverService, /detail:\s*"No active Housekeeping task"/);
});

test("Room compact summary aggregates operational alerts without fake cleaning state", () => {
  assert.match(serverService, /alertSummary:\s*compactAlertSummary\(row, reception, date\)/);
  assert.match(serverService, /Maintenance blocking/);
  assert.match(serverService, /Waiting for Check-out/);
  assert.match(serverService, /Guest arriving today/);
  assert.match(serverService, /Late checkout/);
  assert.doesNotMatch(serverService, /alertSummary[\s\S]{0,120}ready_state/);
  assert.doesNotMatch(serverService, /compactAlertSummary[\s\S]*Not Ready/);
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

test("Rooms Workspace no longer imports room hero photographs", () => {
  assert.doesNotMatch(roomsService, /accommodationImageFor|accommodationImages|heroImage:/);
  assert.doesNotMatch(roomsService, /\/assets\/img\//);
  assert.doesNotMatch(roomExpandedWorkspace, /heroImage|<img/);
  assert.doesNotMatch(roomHero, /heroImage|<img|official room|image unavailable|RoomIcon/);
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
  assert.doesNotMatch(serverService, /AND rs2\.guest_arrived = 1/);
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
