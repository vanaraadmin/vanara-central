import { operationalBookingStatusSql } from "./booking-status.service.js";
import type { HousekeepingTaskStatus, HousekeepingTaskType } from "./housekeeping-task-domain.service.js";
import { getBangkokDate } from "./today.service.js";

export interface RoomsWorkspaceBindings {
  DB: D1Database;
}

export type RoomOperationalAvailability = "OPERATING" | "NOT_OPERATING";
export type RoomOccupancyState = "VACANT" | "OCCUPIED";
export type RoomHousekeepingCondition = "READY" | "NOT_READY";
export type RoomHousekeepingWorkState = "NONE" | "AVAILABLE" | "IN_PROGRESS" | "BLOCKED";
export type RoomMaintenanceState = "CLEAR" | "ACTIVE" | "BLOCKING";

interface RoomWorkspaceRow {
  unit_id: number;
  unit_name: string;
  unit_type: string | null;
  room_type_name: string | null;
  room_name: string | null;
  position: number | null;
  availability_status: RoomOperationalAvailability | null;
  availability_reason: string | null;
  seasonal_start: string | null;
  seasonal_end: string | null;
  ready_state: "READY" | "NOT_READY" | null;
  booking_id: number | null;
  beds24_booking_id: number | null;
  guest_name: string | null;
  country: string | null;
  country_code: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  api_source: string | null;
  channel: string | null;
  active_task_count: number | null;
  active_task_status: HousekeepingTaskStatus | null;
  active_task_type: HousekeepingTaskType | null;
  active_task_assignee: string | null;
  active_ticket_count: number | null;
  blocking_ticket_count: number | null;
  primary_maintenance_title: string | null;
}

export interface RoomsWorkspaceRoom {
  unitId: number;
  roomName: string;
  roomType: string;
  accommodationType: "Bungalow" | "Villa" | "Tent" | "Other";
  sortGroup: "bungalow" | "villa" | "tent" | "other";
  sortNumber: number;
  heroImageKey: string;
  currentStay: RoomCurrentStaySummary | null;
  operational: RoomOperationalSummary;
}

export interface RoomCurrentStaySummary {
  guestName: string;
  nationality: string | null;
  source: string | null;
  arrivalDate: string;
  departureDate: string;
  stayNights: number | null;
}

export interface RoomOperationalSummary {
  availability: {
    state: RoomOperationalAvailability;
    reason: string | null;
    startDate: string | null;
    endDate: string | null;
    seasonLabel: string | null;
  };
  occupancy: {
    state: RoomOccupancyState;
    guestName: string | null;
    bookingId: number | null;
    source: string | null;
  };
  housekeeping: {
    condition: RoomHousekeepingCondition;
    workState: RoomHousekeepingWorkState;
    activeTaskType: string | null;
    assignedTo: string | null;
  };
  maintenance: {
    state: RoomMaintenanceState;
    activeTicketCount: number;
    blockingTicketCount: number;
    primaryTitle: string | null;
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

function monthDayLabel(value: string | null): string | null {
  if (!value || !/^\d{2}-\d{2}$/.test(value)) return null;
  const [month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(2026, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(date);
}

function seasonLabel(startDate: string | null, endDate: string | null): string | null {
  const start = monthDayLabel(startDate);
  const end = monthDayLabel(endDate);
  return start && end ? `${start} - ${end}` : null;
}

function dateOnlyToTime(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(`${value}T00:00:00+07:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function stayNights(arrivalDate: string | null, departureDate: string | null): number | null {
  const arrival = dateOnlyToTime(arrivalDate);
  const departure = dateOnlyToTime(departureDate);
  if (arrival === null || departure === null) return null;
  const nights = Math.round((departure - arrival) / 86_400_000);
  return nights >= 0 ? nights : null;
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

function nationalitySource(row: RoomWorkspaceRow): string | null {
  return row.country || row.country_code || null;
}

function taskTypeLabel(taskType: HousekeepingTaskType | null): string | null {
  if (!taskType) return null;
  if (taskType === "TURNOVER") return "Turnover";
  if (taskType === "STANDARD_CLEANING" || taskType === "ON_DEMAND_CLEANING") return "Cleaning";
  if (taskType === "LINEN_CHANGE") return "Full Cleaning";
  if (taskType === "WATER_REFILL") return "Water refill";
  return "Housekeeping";
}

function housekeepingWorkState(row: RoomWorkspaceRow): RoomHousekeepingWorkState {
  if (!row.active_task_count) return "NONE";
  if (row.active_task_status === "BLOCKED") return "BLOCKED";
  if (row.active_task_status === "IN_PROGRESS" || row.active_task_status === "CHECKLIST_COMPLETE" || row.active_task_status === "READY_FOR_INSPECTION") return "IN_PROGRESS";
  return "AVAILABLE";
}

function maintenanceState(row: RoomWorkspaceRow): RoomMaintenanceState {
  if ((row.blocking_ticket_count ?? 0) > 0) return "BLOCKING";
  if ((row.active_ticket_count ?? 0) > 0) return "ACTIVE";
  return "CLEAR";
}

function mapRoom(row: RoomWorkspaceRow): RoomsWorkspaceRoom {
  const group = roomFamily(row);
  const occupancyState = row.beds24_booking_id ? "OCCUPIED" : "VACANT";
  const guestName = row.guest_name || "Guest name unavailable";
  const staySource = sourceLabel(row);

  return {
    unitId: row.unit_id,
    roomName: row.unit_name,
    roomType: roomType(row),
    accommodationType: accommodationType(group),
    sortGroup: group,
    sortNumber: roomNumber(row.unit_name),
    heroImageKey: normalizeKey(row.unit_name),
    currentStay: occupancyState === "OCCUPIED" && row.arrival_date && row.departure_date
      ? {
          guestName,
          nationality: nationalitySource(row),
          source: staySource,
          arrivalDate: row.arrival_date,
          departureDate: row.departure_date,
          stayNights: stayNights(row.arrival_date, row.departure_date),
        }
      : null,
    operational: {
      availability: {
        state: row.availability_status === "NOT_OPERATING" ? "NOT_OPERATING" : "OPERATING",
        reason: row.availability_reason,
        startDate: row.seasonal_start,
        endDate: row.seasonal_end,
        seasonLabel: seasonLabel(row.seasonal_start, row.seasonal_end),
      },
      occupancy: {
        state: occupancyState,
        guestName: occupancyState === "OCCUPIED" ? guestName : null,
        bookingId: occupancyState === "OCCUPIED" ? row.beds24_booking_id : null,
        source: occupancyState === "OCCUPIED" ? staySource : null,
      },
      housekeeping: {
        condition: row.ready_state === "NOT_READY" ? "NOT_READY" : "READY",
        workState: housekeepingWorkState(row),
        activeTaskType: taskTypeLabel(row.active_task_type),
        assignedTo: row.active_task_assignee,
      },
      maintenance: {
        state: maintenanceState(row),
        activeTicketCount: row.active_ticket_count ?? 0,
        blockingTicketCount: row.blocking_ticket_count ?? 0,
        primaryTitle: row.primary_maintenance_title,
      },
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
      roa.reason AS availability_reason,
      roa.seasonal_start,
      roa.seasonal_end,
      COALESCE(rhs.ready_state, 'READY') AS ready_state,
      b.booking_id,
      b.beds24_booking_id,
      b.guest_name,
      b.country,
      b.country_code,
      b.arrival_date,
      b.departure_date,
      b.api_source,
      b.channel,
      COALESCE(ht_count.active_task_count, 0) AS active_task_count,
      ht.active_task_status,
      ht.active_task_type,
      ht.active_task_assignee,
      COALESCE(mt.active_ticket_count, 0) AS active_ticket_count,
      COALESCE(mt.blocking_ticket_count, 0) AS blocking_ticket_count,
      mt.primary_maintenance_title
    FROM units u
    LEFT JOIN room_types rt ON rt.room_type_id = u.room_type_id
    LEFT JOIN room_operational_availability roa ON roa.unit_id = u.unit_id
    LEFT JOIN room_housekeeping_state rhs ON rhs.unit_id = u.unit_id
    LEFT JOIN bookings b ON b.booking_id = (
      SELECT b2.booking_id
      FROM bookings b2
      LEFT JOIN reception_stays rs2 ON rs2.beds24_booking_id = b2.beds24_booking_id
      WHERE b2.unit_id = u.unit_id
        AND b2.arrival_date <= ?1
        AND b2.departure_date > ?1
        AND ${operationalBookingStatusSql("b2.status")}
        AND rs2.guest_arrived = 1
      ORDER BY b2.arrival_date DESC, b2.booking_id DESC
      LIMIT 1
    )
    LEFT JOIN (
      SELECT unit_id, COUNT(*) AS active_task_count
      FROM housekeeping_tasks
      WHERE status IN ('WAITING_FOR_RECEPTION', 'AVAILABLE_FOR_CLAIM', 'CLAIMED', 'IN_PROGRESS', 'CHECKLIST_COMPLETE', 'READY_FOR_INSPECTION', 'READY', 'BLOCKED')
        AND (idempotency_key IS NULL OR idempotency_key NOT LIKE 'room-ready-baseline:not-ready:%')
        AND (operational_date = ?1 OR due_cycle_date <= ?1)
      GROUP BY unit_id
    ) ht_count ON ht_count.unit_id = u.unit_id
    LEFT JOIN (
      SELECT unit_id, status AS active_task_status, task_type AS active_task_type, assigned_user_name AS active_task_assignee
      FROM (
        SELECT
          ht.*,
          ROW_NUMBER() OVER (
            PARTITION BY ht.unit_id
            ORDER BY
              CASE
                WHEN ht.status = 'BLOCKED' THEN 1
                WHEN ht.status IN ('IN_PROGRESS', 'CHECKLIST_COMPLETE', 'READY_FOR_INSPECTION') THEN 2
                ELSE 3
              END,
              CASE ht.task_type
                WHEN 'TURNOVER' THEN 1
                WHEN 'ON_DEMAND_CLEANING' THEN 2
                WHEN 'STANDARD_CLEANING' THEN 3
                WHEN 'LINEN_CHANGE' THEN 4
                WHEN 'WATER_REFILL' THEN 5
                ELSE 6
              END,
              ht.task_id
          ) AS task_rank
        FROM housekeeping_tasks ht
        WHERE ht.status IN ('WAITING_FOR_RECEPTION', 'AVAILABLE_FOR_CLAIM', 'CLAIMED', 'IN_PROGRESS', 'CHECKLIST_COMPLETE', 'READY_FOR_INSPECTION', 'READY', 'BLOCKED')
          AND (ht.idempotency_key IS NULL OR ht.idempotency_key NOT LIKE 'room-ready-baseline:not-ready:%')
          AND (ht.operational_date = ?1 OR ht.due_cycle_date <= ?1)
      )
      WHERE task_rank = 1
    ) ht ON ht.unit_id = u.unit_id
    LEFT JOIN (
      SELECT
        room_id,
        COUNT(*) AS active_ticket_count,
        SUM(CASE WHEN out_of_service = 1 OR json_extract(metadata_json, '$.outOfService') = 1 THEN 1 ELSE 0 END) AS blocking_ticket_count,
        COALESCE(
          MIN(CASE WHEN out_of_service = 1 OR json_extract(metadata_json, '$.outOfService') = 1 THEN title END),
          MIN(title)
        ) AS primary_maintenance_title
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
      occupied: rooms.filter((room) => room.operational.occupancy.state === "OCCUPIED").length,
      notOperating: rooms.filter((room) => room.operational.availability.state === "NOT_OPERATING").length,
      notReady: rooms.filter((room) => room.operational.housekeeping.condition === "NOT_READY").length,
      maintenance: rooms.filter((room) => room.operational.maintenance.state !== "CLEAR").length,
    },
  };
}
