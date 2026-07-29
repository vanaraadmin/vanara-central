import { getHousekeepingOverview, type HousekeepingBindings } from "./housekeeping-overview.service.js";
import { getTodayDashboard, type TodayBindings, type TodayReservation } from "./today.service.js";

export interface DashboardBindings extends TodayBindings, HousekeepingBindings {
  DB: D1Database;
}

interface CountRow {
  total: number;
}

interface LatestSyncRow {
  sync_type: string;
  status: string;
  finished_at: string | null;
}

interface MaintenanceRow {
  maintenance_id: number;
  unit_id: number;
  unit_name: string | null;
}

export interface DashboardRoomCard {
  id: string;
  unitName: string;
  status: "Ready" | "Occupied" | "Cleaning" | "Dirty" | "Maintenance" | "Arrival Today" | "Departure Today";
  guestName: string | null;
  checkIn: string | null;
  checkOut: string | null;
}

export interface DashboardData {
  date: string;
  operations: {
    checkIns: DashboardRoomCard[];
    checkOuts: DashboardRoomCard[];
    maintenanceAlerts: DashboardRoomCard[];
  };
  summary: {
    arrivals: number;
    departures: number;
    cleanFirst: number;
    cleanToday: number;
    cleaningInProgress: number;
    readyRooms: number;
    occupiedRooms: number;
    openMaintenance: number;
    pendingProcurement: number;
  };
  system: {
    hasOperationalData: boolean;
    latestSync: {
      type: string;
      status: string;
      finishedAt: string | null;
    } | null;
  };
  recentActivity: [];
}

function count(row: CountRow | null): number {
  return row?.total ?? 0;
}

function unitName(value: string | null): string {
  return value || "Unit not assigned";
}

function reservationCard(
  reservation: TodayReservation,
  status: "Arrival Today" | "Departure Today",
): DashboardRoomCard {
  return {
    id: `${status}:${reservation.id}`,
    unitName: reservation.unit,
    status,
    guestName: reservation.guestName,
    checkIn: reservation.arrival,
    checkOut: reservation.departure,
  };
}

function maintenanceCard(row: MaintenanceRow): DashboardRoomCard {
  return {
    id: `maintenance:${row.maintenance_id}`,
    unitName: unitName(row.unit_name),
    status: "Maintenance",
    guestName: null,
    checkIn: null,
    checkOut: null,
  };
}

export async function getDashboard(env: DashboardBindings): Promise<DashboardData> {
  const today = await getTodayDashboard(env);
  const housekeeping = await getHousekeepingOverview(env);

  const [openMaintenance, pendingProcurement, properties, latestSync, maintenanceRows] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM maintenance " +
      "WHERE lower(COALESCE(status, 'open')) NOT IN " +
      "('resolved', 'verified', 'closed', 'completed')",
    ).first<CountRow>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM shopping_items " +
      "WHERE lower(status) NOT IN ('delivered', 'closed', 'completed', 'rejected')",
    ).first<CountRow>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM properties WHERE active = 1").first<CountRow>(),
    env.DB.prepare(
      "SELECT sync_type, status, finished_at FROM sync_runs " +
      "ORDER BY started_at DESC, sync_run_id DESC LIMIT 1",
    ).first<LatestSyncRow>(),
    env.DB.prepare(`
      SELECT m.maintenance_id, m.unit_id, u.unit_name
      FROM maintenance m
      INNER JOIN units u ON u.unit_id = m.unit_id
      WHERE lower(COALESCE(m.status, 'open')) NOT IN ('resolved', 'verified', 'closed', 'completed')
      ORDER BY
        CASE lower(COALESCE(m.priority, 'normal'))
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        m.opened_at DESC
      LIMIT 8
    `).all<MaintenanceRow>(),
  ]);

  const checkIns = today.arrivals.slice(0, 8).map((item) => reservationCard(item, "Arrival Today"));
  const checkOuts = today.departures.slice(0, 8).map((item) => reservationCard(item, "Departure Today"));
  const maintenanceAlerts = (maintenanceRows.results ?? []).map(maintenanceCard);

  return {
    date: today.date,
    operations: {
      checkIns,
      checkOuts,
      maintenanceAlerts,
    },
    summary: {
      arrivals: today.summary.arrivals,
      departures: today.summary.departures,
      cleanFirst: housekeeping.summary.cleanFirst,
      cleanToday: housekeeping.summary.cleanToday,
      cleaningInProgress: housekeeping.summary.cleaningInProgress,
      readyRooms: housekeeping.summary.ready,
      occupiedRooms: housekeeping.summary.occupied,
      openMaintenance: count(openMaintenance),
      pendingProcurement: count(pendingProcurement),
    },
    system: {
      hasOperationalData: count(properties) > 0,
      latestSync: latestSync
        ? {
            type: latestSync.sync_type,
            status: latestSync.status,
            finishedAt: latestSync.finished_at,
          }
        : null,
    },
    recentActivity: [],
  };
}