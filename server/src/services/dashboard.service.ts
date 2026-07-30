import { getHousekeepingOverview, type HousekeepingBindings } from "./housekeeping-overview.service.js";
import { listUsers, type AuthBindings } from "./current-user.service.js";
import { listMaintenanceTickets, type MaintenanceBindings } from "./maintenance.service.js";
import { getTodayDashboard, type TodayBindings, type TodayReservation } from "./today.service.js";

export interface DashboardBindings extends TodayBindings, HousekeepingBindings, MaintenanceBindings, AuthBindings {
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

export interface DashboardOverviewMetric {
  id: string;
  label: string;
  value: number | string;
  href: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
}

export interface DashboardOverviewAlert {
  id: string;
  label: string;
  value: number;
  href: string;
  tone: "warning" | "danger";
}

export interface DashboardQuickLink {
  id: string;
  label: string;
  href: string;
}

export interface DashboardOverview {
  date: string;
  alerts: DashboardOverviewAlert[];
  housekeeping: {
    roomsToClean: DashboardOverviewMetric;
    cleaning: DashboardOverviewMetric;
    ready: DashboardOverviewMetric;
    cleaningRequested: DashboardOverviewMetric;
    assignedRooms: DashboardOverviewMetric;
    unassignedRooms: DashboardOverviewMetric;
  };
  maintenance: {
    openIssues: DashboardOverviewMetric;
    criticalIssues: DashboardOverviewMetric;
    waiting: DashboardOverviewMetric;
    outOfService: DashboardOverviewMetric;
  };
  today: {
    arrivals: DashboardOverviewMetric;
    departures: DashboardOverviewMetric;
    checkIns: DashboardOverviewMetric;
    checkOuts: DashboardOverviewMetric;
  };
  staff: {
    housekeepingStaff: DashboardOverviewMetric;
    maintenanceStaff: DashboardOverviewMetric;
    activeUsers: DashboardOverviewMetric;
    disabledUsers: DashboardOverviewMetric;
  };
  quickLinks: DashboardQuickLink[];
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

function metric(id: string, label: string, value: number | string, href: string, tone: DashboardOverviewMetric["tone"] = "neutral"): DashboardOverviewMetric {
  return { id, label, value, href, tone };
}

function alert(id: string, label: string, value: number, href: string, tone: DashboardOverviewAlert["tone"]): DashboardOverviewAlert | null {
  return value > 0 ? { id, label, value, href, tone } : null;
}

export async function getDashboardOverview(env: DashboardBindings): Promise<DashboardOverview> {
  const [housekeeping, maintenanceTickets, today, users] = await Promise.all([
    getHousekeepingOverview(env),
    listMaintenanceTickets(env, { status: "All" }),
    getTodayDashboard(env),
    listUsers(env),
  ]);

  const roomsToClean = housekeeping.summary.cleanFirst + housekeeping.summary.cleanToday;
  const cleaning = housekeeping.summary.cleaningInProgress;
  const ready = housekeeping.summary.ready;
  const cleaningRequested = housekeeping.summary.dirty;
  const assignedRooms = housekeeping.summary.assigned;
  const unassignedRooms = housekeeping.rooms.filter((room) => room.housekeepingStatus !== "Ready" && room.assignedUserId === null).length;

  const activeMaintenance = maintenanceTickets.filter((ticket) => ticket.status !== "Closed");
  const openIssues = activeMaintenance.length;
  const criticalIssues = activeMaintenance.filter((ticket) => ticket.priority === "Critical").length;
  const waiting = activeMaintenance.filter((ticket) => ticket.status === "Waiting Parts").length;
  const outOfService = activeMaintenance.filter((ticket) => ticket.outOfService).length;

  const activeUsers = users.filter((user) => user.status === "active");
  const disabledUsers = users.filter((user) => user.status === "disabled");
  const housekeepingStaff = activeUsers.filter((user) => user.role === "Housekeeping").length;
  const maintenanceStaff = activeUsers.filter((user) => user.role === "Maintenance").length;

  const alerts = [
    alert("critical-maintenance", "Critical Maintenance", criticalIssues, "/maintenance?priority=Critical", "danger"),
    alert("out-of-service", "Out Of Service Rooms", outOfService, "/maintenance?outOfService=1", "danger"),
    alert("unassigned-cleaning", "Unassigned Cleaning", unassignedRooms, "/housekeeping?filter=unassigned", "warning"),
    alert("waiting-maintenance", "Waiting Maintenance", waiting, "/maintenance?status=Waiting%20Parts", "warning"),
  ].filter((item): item is DashboardOverviewAlert => item !== null);

  return {
    date: today.date,
    alerts,
    housekeeping: {
      roomsToClean: metric("rooms-to-clean", "Rooms To Clean", roomsToClean, "/housekeeping?filter=to-clean", roomsToClean > 0 ? "warning" : "success"),
      cleaning: metric("cleaning", "Cleaning", cleaning, "/housekeeping?filter=cleaning", "info"),
      ready: metric("ready", "Ready", ready, "/housekeeping?filter=ready", "success"),
      cleaningRequested: metric("cleaning-requested", "Cleaning Requested", cleaningRequested, "/housekeeping?filter=dirty", cleaningRequested > 0 ? "warning" : "neutral"),
      assignedRooms: metric("assigned-rooms", "Assigned Rooms", assignedRooms, "/housekeeping?filter=assigned", "info"),
      unassignedRooms: metric("unassigned-rooms", "Unassigned Rooms", unassignedRooms, "/housekeeping?filter=unassigned", unassignedRooms > 0 ? "warning" : "success"),
    },
    maintenance: {
      openIssues: metric("open-issues", "Open Issues", openIssues, "/maintenance?status=All", openIssues > 0 ? "warning" : "success"),
      criticalIssues: metric("critical-issues", "Critical Issues", criticalIssues, "/maintenance?priority=Critical", criticalIssues > 0 ? "danger" : "success"),
      waiting: metric("waiting", "Waiting", waiting, "/maintenance?status=Waiting%20Parts", waiting > 0 ? "warning" : "neutral"),
      outOfService: metric("out-of-service", "Out Of Service", outOfService, "/maintenance?outOfService=1", outOfService > 0 ? "danger" : "success"),
    },
    today: {
      arrivals: metric("arrivals", "Today's Arrivals", today.summary.arrivals, "/movements?section=arrivals", "info"),
      departures: metric("departures", "Today's Departures", today.summary.departures, "/movements?section=departures", "info"),
      checkIns: metric("check-ins", "Today's Check-ins", today.summary.arrivals, "/movements?section=arrivals", "info"),
      checkOuts: metric("check-outs", "Today's Check-outs", today.summary.departures, "/movements?section=departures", "info"),
    },
    staff: {
      housekeepingStaff: metric("housekeeping-staff", "Housekeeping Staff", housekeepingStaff, "/settings?section=users&role=Housekeeping", "neutral"),
      maintenanceStaff: metric("maintenance-staff", "Maintenance Staff", maintenanceStaff, "/settings?section=users&role=Maintenance", "neutral"),
      activeUsers: metric("active-users", "Active Users", activeUsers.length, "/settings?section=users&status=active", "success"),
      disabledUsers: metric("disabled-users", "Disabled Users", disabledUsers.length, "/settings?section=users&status=disabled", disabledUsers.length > 0 ? "warning" : "neutral"),
    },
    quickLinks: [
      { id: "housekeeping", label: "Housekeeping", href: "/housekeeping" },
      { id: "maintenance", label: "Maintenance", href: "/maintenance" },
      { id: "rooms", label: "Rooms", href: "/rooms" },
      { id: "users", label: "Users", href: "/settings?section=users" },
      { id: "settings", label: "Settings", href: "/settings" },
    ],
  };
}
