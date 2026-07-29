export type HousekeepingWorkflowStatus = "To Clean" | "Cleaning In Progress" | "Ready";
export type RoomOccupancyStatus = "Occupied" | "Checked Out" | "Ready for Guest";
export type OperationalGroupId = "clean-first" | "clean-today" | "ready" | "occupied";
export type CheckoutCompletionSource = "reception" | "automatic-fallback" | "none";

export interface HousekeepingBindings {
  DB: D1Database;
}

interface HousekeepingRow {
  unit_id: number;
  unit_name: string | null;
  housekeeping_status: string | null;
  has_today_arrival: number;
  has_current_occupancy: number;
  has_scheduled_checkout_today: number;
}

export interface HousekeepingRoom {
  id: string;
  unitId: number;
  unitName: string;
  group: OperationalGroupId;
  operationalPriority: "Clean First" | "Clean Today" | "Ready" | "Occupied";
  occupancyStatus: RoomOccupancyStatus;
  housekeepingStatus: HousekeepingWorkflowStatus;
  checkoutCompleted: boolean;
  checkoutCompletionSource: CheckoutCompletionSource;
  newGuestToday: boolean;
}

export interface HousekeepingGroup {
  id: OperationalGroupId;
  title: string;
  icon: string;
  rooms: HousekeepingRoom[];
}

export interface HousekeepingOverview {
  date: string;
  groups: HousekeepingGroup[];
  rooms: HousekeepingRoom[];
  summary: {
    cleanFirst: number;
    cleanToday: number;
    cleaningInProgress: number;
    ready: number;
    occupied: number;
    total: number;
  };
  capabilities: {
    checkoutCompletionSource: "missing-reception-flag";
    automaticFallbackAfter: "14:30";
  };
}

const GROUP_ORDER: OperationalGroupId[] = ["clean-first", "clean-today", "ready", "occupied"];

const GROUP_META: Record<OperationalGroupId, { title: string; icon: string }> = {
  "clean-first": { title: "Clean First", icon: "🔥" },
  "clean-today": { title: "Clean Today", icon: "🧹" },
  ready: { title: "Ready", icon: "✅" },
  occupied: { title: "Occupied", icon: "🏠" },
};

function bangkokNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function normalizeHousekeepingStatus(status: string | null): HousekeepingWorkflowStatus {
  const normalized = status?.trim().toLowerCase() ?? "";

  if (normalized === "cleaning" || normalized === "in progress") return "Cleaning In Progress";
  if (normalized === "ready" || normalized === "clean" || normalized === "completed") return "Ready";
  if (normalized === "dirty" || normalized === "to clean" || normalized === "pending") return "To Clean";

  return "Ready";
}

function checkoutSource(row: HousekeepingRow, bangkokMinutes: number): CheckoutCompletionSource {
  const receptionConfirmed = false;
  if (receptionConfirmed) return "reception";

  const scheduledCheckoutToday = row.has_scheduled_checkout_today === 1;
  const noStayExtensionRegistered = scheduledCheckoutToday;
  const afterSafetyCutoff = bangkokMinutes >= 14 * 60 + 30;

  if (scheduledCheckoutToday && noStayExtensionRegistered && afterSafetyCutoff) {
    return "automatic-fallback";
  }

  return "none";
}

function toRoom(row: HousekeepingRow, bangkokMinutes: number): HousekeepingRoom {
  const housekeepingStatus = normalizeHousekeepingStatus(row.housekeeping_status);
  const source = checkoutSource(row, bangkokMinutes);
  const checkoutCompleted = source !== "none";
  const newGuestToday = row.has_today_arrival === 1;
  const occupancyStatus: RoomOccupancyStatus = checkoutCompleted
    ? "Checked Out"
    : housekeepingStatus === "Ready" && row.has_current_occupancy === 0
      ? "Ready for Guest"
      : "Occupied";
  const group: OperationalGroupId = housekeepingStatus === "Ready" && occupancyStatus === "Ready for Guest"
    ? "ready"
    : checkoutCompleted && newGuestToday
      ? "clean-first"
      : checkoutCompleted
        ? "clean-today"
        : occupancyStatus === "Ready for Guest" ? "ready" : "occupied";

  return {
    id: `unit:${row.unit_id}`,
    unitId: row.unit_id,
    unitName: row.unit_name || "Unit not assigned",
    group,
    operationalPriority: GROUP_META[group].title as HousekeepingRoom["operationalPriority"],
    occupancyStatus,
    housekeepingStatus,
    checkoutCompleted,
    checkoutCompletionSource: source,
    newGuestToday,
  };
}

function groupRooms(rooms: HousekeepingRoom[]): HousekeepingGroup[] {
  return GROUP_ORDER.map((id) => ({
    id,
    ...GROUP_META[id],
    rooms: rooms.filter((room) => room.group === id),
  }));
}

export async function getHousekeepingOverview(env: HousekeepingBindings): Promise<HousekeepingOverview> {
  const now = bangkokNow();

  const rows = await env.DB.prepare(`
    WITH latest_housekeeping AS (
      SELECT h.*
      FROM housekeeping h
      INNER JOIN (
        SELECT unit_id, MAX(work_date || ' ' || updated_at || ' ' || housekeeping_id) AS latest_key
        FROM housekeeping
        GROUP BY unit_id
      ) latest
        ON latest.unit_id = h.unit_id
       AND latest.latest_key = h.work_date || ' ' || h.updated_at || ' ' || h.housekeeping_id
    ), today_arrivals AS (
      SELECT DISTINCT unit_id
      FROM bookings
      WHERE arrival_date = ?1
        AND unit_id IS NOT NULL
        AND lower(status) NOT IN ('cancelled', 'canceled')
    ), current_occupancy AS (
      SELECT DISTINCT unit_id
      FROM bookings
      WHERE arrival_date <= ?1
        AND departure_date > ?1
        AND unit_id IS NOT NULL
        AND lower(status) NOT IN ('cancelled', 'canceled')
    ), scheduled_checkouts AS (
      SELECT DISTINCT unit_id
      FROM bookings
      WHERE departure_date = ?1
        AND unit_id IS NOT NULL
        AND lower(status) NOT IN ('cancelled', 'canceled')
    )
    SELECT
      u.unit_id,
      u.unit_name,
      lh.status AS housekeeping_status,
      CASE WHEN ta.unit_id IS NULL THEN 0 ELSE 1 END AS has_today_arrival,
      CASE WHEN co.unit_id IS NULL THEN 0 ELSE 1 END AS has_current_occupancy,
      CASE WHEN sc.unit_id IS NULL THEN 0 ELSE 1 END AS has_scheduled_checkout_today
    FROM units u
    LEFT JOIN latest_housekeeping lh ON lh.unit_id = u.unit_id
    LEFT JOIN today_arrivals ta ON ta.unit_id = u.unit_id
    LEFT JOIN current_occupancy co ON co.unit_id = u.unit_id
    LEFT JOIN scheduled_checkouts sc ON sc.unit_id = u.unit_id
    WHERE u.active = 1
    ORDER BY u.position, u.unit_name
  `).bind(now.date).all<HousekeepingRow>();

  const rooms = (rows.results ?? [])
    .map((row) => toRoom(row, now.minutes))
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.unitName.localeCompare(b.unitName));
  const groups = groupRooms(rooms);

  return {
    date: now.date,
    groups,
    rooms,
    summary: {
      cleanFirst: groups.find((group) => group.id === "clean-first")?.rooms.length ?? 0,
      cleanToday: groups.find((group) => group.id === "clean-today")?.rooms.length ?? 0,
      cleaningInProgress: rooms.filter((room) => room.housekeepingStatus === "Cleaning In Progress").length,
      ready: groups.find((group) => group.id === "ready")?.rooms.length ?? 0,
      occupied: groups.find((group) => group.id === "occupied")?.rooms.length ?? 0,
      total: rooms.length,
    },
    capabilities: {
      checkoutCompletionSource: "missing-reception-flag",
      automaticFallbackAfter: "14:30",
    },
  };
}