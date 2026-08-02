import { operationalBookingStatusSql } from "./booking-status.service.js";
import { getBangkokDate } from "./today.service.js";

export interface RoomsWorkspaceBindings {
  DB: D1Database;
}

export type RoomsWorkspaceAvailabilityStatus = "Operating" | "Not Operating";
export type RoomsWorkspaceOccupancyStatus = "Occupied" | "Vacant";
export type RoomsWorkspaceHousekeepingStatus = "Ready" | "Not Ready";
export type RoomsWorkspaceMaintenanceStatus = "Clear" | "Maintenance";

interface RoomWorkspaceRow {
  unit_id: number;
  unit_name: string;
  unit_type: string | null;
  room_type_name: string | null;
  room_name: string | null;
  position: number | null;
  availability_status: "OPERATING" | "NOT_OPERATING" | null;
  ready_state: "READY" | "NOT_READY" | null;
  booking_id: number | null;
  guest_name: string | null;
  api_source: string | null;
  channel: string | null;
  open_issues: number | null;
  out_of_service: number | null;
}

export interface RoomsWorkspaceRoom {
  unitId: number;
  roomName: string;
  roomType: string;
  accommodationType: "Bungalow" | "Villa" | "Tent" | "Other";
  sortGroup: "bungalow" | "villa" | "tent" | "other";
  sortNumber: number;
  heroImageKey: string;
  occupancy: {
    status: RoomsWorkspaceOccupancyStatus;
    guestName: string | null;
    source: string | null;
  };
  operationalAvailability: {
    status: RoomsWorkspaceAvailabilityStatus;
  };
  housekeeping: {
    status: RoomsWorkspaceHousekeepingStatus;
  };
  maintenance: {
    status: RoomsWorkspaceMaintenanceStatus;
    openIssues: number;
    outOfService: boolean;
  };
}

export interface RoomsWorkspaceOverview {
  rooms: RoomsWorkspaceRoom[];
  summary: {
    total: number;
    occupied: number;
    notOperating: number;
    notReady: number;
    maintenance: number;
  };
}

function roomNumber(name: string): number {
  const match = name.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 9999;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function roomFamily(row: Pick<RoomWorkspaceRow, "unit_name" | "unit_type" | "room_type_name" | "room_name">): RoomsWorkspaceRoom["sortGroup"] {
  const unitName = row.unit_name.toLowerCase();
  if (unitName.includes("bungalow")) return "bungalow";
  if (unitName.includes("villa")) return "villa";
  if (unitName.includes("tent") || unitName.includes("yurt")) return "tent";

  const fallback = `${row.unit_type ?? ""} ${row.room_type_name ?? ""} ${row.room_name ?? ""}`.toLowerCase();
  if (fallback.includes("bungalow")) return "bungalow";
  if (fallback.includes("villa")) return "villa";
  if (fallback.includes("tent") || fallback.includes("yurt")) return "tent";
  return "other";
}

function accommodationType(group: RoomsWorkspaceRoom["sortGroup"]): RoomsWorkspaceRoom["accommodationType"] {
  if (group === "bungalow") return "Bungalow";
  if (group === "villa") return "Villa";
  if (group === "tent") return "Tent";
  return "Other";
}

function familyRank(group: RoomsWorkspaceRoom["sortGroup"]): number {
  if (group === "bungalow") return 1;
  if (group === "villa") return 2;
  if (group === "tent") return 3;
  return 4;
}

function roomType(row: RoomWorkspaceRow): string {
  return row.room_type_name || row.room_name || row.unit_type || "Accommodation";
}

function sourceLabel(row: RoomWorkspaceRow): string | null {
  return row.api_source || row.channel || null;
}

function mapRoom(row: RoomWorkspaceRow): RoomsWorkspaceRoom {
  const group = roomFamily(row);
  const maintenanceOpenIssues = row.open_issues ?? 0;
  const outOfService = row.out_of_service === 1;

  return {
    unitId: row.unit_id,
    roomName: row.unit_name,
    roomType: roomType(row),
    accommodationType: accommodationType(group),
    sortGroup: group,
    sortNumber: roomNumber(row.unit_name),
    heroImageKey: normalizeKey(row.unit_name),
    occupancy: {
      status: row.booking_id ? "Occupied" : "Vacant",
      guestName: row.booking_id ? row.guest_name || "Guest name unavailable" : null,
      source: row.booking_id ? sourceLabel(row) : null,
    },
    operationalAvailability: {
      status: row.availability_status === "NOT_OPERATING" ? "Not Operating" : "Operating",
    },
    housekeeping: {
      status: row.ready_state === "NOT_READY" ? "Not Ready" : "Ready",
    },
    maintenance: {
      status: maintenanceOpenIssues > 0 ? "Maintenance" : "Clear",
      openIssues: maintenanceOpenIssues,
      outOfService,
    },
  };
}

export async function getRoomsWorkspaceOverview(env: RoomsWorkspaceBindings, date = getBangkokDate()): Promise<RoomsWorkspaceOverview> {
  const rows = await env.DB.prepare(`
    SELECT
      u.unit_id,
      u.unit_name,
      u.unit_type,
      rt.room_type_name,
      rt.room_name,
      u.position,
      COALESCE(roa.status, 'OPERATING') AS availability_status,
      COALESCE(rhs.ready_state, 'READY') AS ready_state,
      b.booking_id,
      b.guest_name,
      b.api_source,
      b.channel,
      COALESCE(mt.open_issues, 0) AS open_issues,
      COALESCE(mt.out_of_service, 0) AS out_of_service
    FROM units u
    LEFT JOIN room_types rt ON rt.room_type_id = u.room_type_id
    LEFT JOIN room_operational_availability roa ON roa.unit_id = u.unit_id
    LEFT JOIN room_housekeeping_state rhs ON rhs.unit_id = u.unit_id
    LEFT JOIN bookings b ON b.booking_id = (
      SELECT b2.booking_id
      FROM bookings b2
      WHERE b2.unit_id = u.unit_id
        AND b2.arrival_date <= ?1
        AND b2.departure_date > ?1
        AND ${operationalBookingStatusSql("b2.status")}
      ORDER BY b2.arrival_date DESC, b2.booking_id DESC
      LIMIT 1
    )
    LEFT JOIN (
      SELECT room_id, COUNT(*) AS open_issues, MAX(out_of_service) AS out_of_service
      FROM maintenance_tickets
      WHERE room_id IS NOT NULL
        AND status NOT IN ('Resolved', 'Closed')
      GROUP BY room_id
    ) mt ON mt.room_id = u.unit_id
    WHERE u.active = 1
  `).bind(date).all<RoomWorkspaceRow>();

  const rooms = (rows.results ?? [])
    .map(mapRoom)
    .sort((left, right) =>
      familyRank(left.sortGroup) - familyRank(right.sortGroup)
      || left.sortNumber - right.sortNumber
      || left.roomName.localeCompare(right.roomName)
      || left.unitId - right.unitId
    );

  return {
    rooms,
    summary: {
      total: rooms.length,
      occupied: rooms.filter((room) => room.occupancy.status === "Occupied").length,
      notOperating: rooms.filter((room) => room.operationalAvailability.status === "Not Operating").length,
      notReady: rooms.filter((room) => room.housekeeping.status === "Not Ready").length,
      maintenance: rooms.filter((room) => room.maintenance.status === "Maintenance").length,
    },
  };
}
