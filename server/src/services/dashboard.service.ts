import { getTodayDashboard, type TodayBindings } from "./today.service.js";

export interface DashboardBindings extends TodayBindings {
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

export interface DashboardData {
  date: string;
  summary: {
    arrivals: number;
    departures: number;
    dirtyRooms: number;
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

export async function getDashboard(
  env: DashboardBindings,
): Promise<DashboardData> {
  const [
    today,
    dirtyRooms,
    openMaintenance,
    pendingProcurement,
    properties,
    latestSync,
  ] = await Promise.all([
    getTodayDashboard(env),
    env.DB.prepare(
      "SELECT COUNT(DISTINCT unit_id) AS total FROM housekeeping " +
      "WHERE lower(status) IN ('dirty', 'to clean', 'pending')",
    ).first<CountRow>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM maintenance " +
      "WHERE lower(COALESCE(status, 'open')) NOT IN " +
      "('resolved', 'verified', 'closed', 'completed')",
    ).first<CountRow>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM shopping_items " +
      "WHERE lower(status) NOT IN ('delivered', 'closed', 'completed', 'rejected')",
    ).first<CountRow>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM properties WHERE active = 1",
    ).first<CountRow>(),
    env.DB.prepare(
      "SELECT sync_type, status, finished_at FROM sync_runs " +
      "ORDER BY started_at DESC, sync_run_id DESC LIMIT 1",
    ).first<LatestSyncRow>(),
  ]);

  return {
    date: today.date,
    summary: {
      arrivals: today.summary.arrivals,
      departures: today.summary.departures,
      dirtyRooms: count(dirtyRooms),
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
