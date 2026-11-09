import { getHousekeepingV2Overview, type HousekeepingV2Bindings, type HousekeepingV2Overview } from "./housekeeping-v2-overview.service.js";
import { listMaintenanceTickets, type MaintenanceBindings } from "./maintenance.service.js";
import { getRoomsWorkspaceOverview, type RoomsWorkspaceBindings } from "./rooms-workspace.service.js";
import { getReceptionOverview, type ReceptionBindings } from "./reception.service.js";
import { hasModulePermission, isOwner, type CurrentUser, type ModuleKey } from "./current-user.service.js";
import { listRecentBookingEvents, type BookingEventsBindings, type BookingPulseItem } from "./booking-events.service.js";
import { getBangkokDate } from "./today.service.js";
import { buildFinancialSnapshot, type DashboardBindings } from "./dashboard.service.js";

export interface StaffOverviewBindings extends HousekeepingV2Bindings, MaintenanceBindings, ReceptionBindings, BookingEventsBindings, RoomsWorkspaceBindings, DashboardBindings {
  DB: D1Database;
}

export type StaffCardId = "reception" | "rooms" | "housekeeping" | "maintenance" | "procurement" | "messages" | "social" | "payroll" | "accounting" | "owner-dashboard";

export interface StaffOverviewMetric {
  label: string;
  value: number;
  tone: "neutral" | "good" | "attention" | "urgent";
}

export interface StaffOverviewCard {
  id: StaffCardId;
  module: ModuleKey;
  title: string;
  description: string;
  href: string;
  cta: string;
  metrics: StaffOverviewMetric[];
  summaryLine1?: string;
  summaryLine2?: string;
  procurementAttentionItems?: Array<{
    id: number;
    requestedByName: string;
    requestText: string;
    acknowledgedByName: string | null;
  }>;
}

export interface StaffOverview {
  user: {
    id: string;
    displayName: string;
    isOwner: boolean;
    role: string;
  };
  bookingPulseCapabilities: {
    canViewBookingValue: boolean;
  };
  bookingEvents: BookingPulseItem[];
  cards: StaffOverviewCard[];
}

function canAccess(user: CurrentUser, module: ModuleKey): boolean {
  return hasModulePermission(user, module, "access");
}

function canViewBookingValue(user: CurrentUser): boolean {
  return user.role === "Owner" && user.views.includes("owner") && canAccess(user, "owner-dashboard");
}

function canUseSocialAutomation(user: CurrentUser): boolean {
  return canAccess(user, "social-automation");
}

function canUsePayroll(user: CurrentUser): boolean {
  return isOwner(user) && canAccess(user, "payroll");
}

function canUseAccounting(user: CurrentUser): boolean {
  return canAccess(user, "accounting");
}

function canUseOwnerDashboard(user: CurrentUser): boolean {
  return isOwner(user) && canAccess(user, "owner-dashboard");
}

function canUseGuestMessages(user: CurrentUser): boolean {
  return isOwner(user) && canAccess(user, "messages");
}

function formatMetric(metric: StaffOverviewMetric | undefined): string | undefined {
  if (!metric) return undefined;
  return `${metric.value} ${metric.label}`;
}

function withSummaryLines(card: StaffOverviewCard): StaffOverviewCard {
  return {
    ...card,
    summaryLine1: card.summaryLine1 ?? formatMetric(card.metrics[0]),
    summaryLine2: card.summaryLine2 ?? formatMetric(card.metrics[1]),
  };
}

interface CountRow {
  total: number;
}

function count(row: CountRow | null): number {
  return row?.total ?? 0;
}

async function ownerDashboardBalanceMetric(env: StaffOverviewBindings, bangkokToday: string): Promise<StaffOverviewMetric> {
  const [incomeToDate, futureIncome] = await Promise.all([
    env.DB.prepare(`
      SELECT COALESCE(SUM(f.expected_net_payout), 0) AS total
      FROM ota_financial_records f
      INNER JOIN bookings b ON b.beds24_booking_id = f.beds24_booking_id
      WHERE f.check_in <= ?
        AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'deleted')
        AND lower(trim(COALESCE(b.sub_status, ''))) <> 'provider_deleted'
    `).bind(bangkokToday).first<CountRow>(),
    env.DB.prepare(`
      SELECT COALESCE(SUM(f.expected_net_payout), 0) AS total
      FROM ota_financial_records f
      INNER JOIN bookings b ON b.beds24_booking_id = f.beds24_booking_id
      WHERE f.check_in > ?
        AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'deleted')
        AND lower(trim(COALESCE(b.sub_status, ''))) <> 'provider_deleted'
    `).bind(bangkokToday).first<CountRow>(),
  ]);
  const snapshot = await buildFinancialSnapshot(env, bangkokToday, count(incomeToDate), count(futureIncome));
  return {
    label: "Balance",
    value: snapshot.netPosition,
    tone: snapshot.netPosition >= 0 ? "good" : "attention",
  };
}

async function procurementOwnerAttention(env: StaffOverviewBindings): Promise<{ newRequests: number; takenInCharge: number; items: StaffOverviewCard["procurementAttentionItems"] }> {
  const row = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN status = 'PENDING' AND acknowledged_at IS NULL THEN 1 ELSE 0 END) AS new_requests,
      SUM(CASE WHEN status = 'PENDING' AND acknowledged_at IS NOT NULL THEN 1 ELSE 0 END) AS taken_in_charge
    FROM procurement_requests
  `).first<{ new_requests: number | null; taken_in_charge: number | null }>();
  const items = await env.DB.prepare(`
    SELECT
      request_id,
      requested_by_name,
      COALESCE(request_text_original, custom_item_text, note, '') AS request_text,
      acknowledged_by_name
    FROM procurement_requests
    WHERE status = 'PENDING'
    ORDER BY CASE WHEN acknowledged_at IS NULL THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1
  `).all<{ request_id: number; requested_by_name: string; request_text: string; acknowledged_by_name: string | null }>();
  return {
    newRequests: Number(row?.new_requests ?? 0),
    takenInCharge: Number(row?.taken_in_charge ?? 0),
    items: (items.results ?? []).map((item) => ({
      id: item.request_id,
      requestedByName: item.requested_by_name,
      requestText: item.request_text,
      acknowledgedByName: item.acknowledged_by_name,
    })),
  };
}

const TERMINAL_HOUSEKEEPING_STATUSES = new Set(["COMPLETED", "SKIPPED", "CANCELLED"]);

function staffHousekeepingPresentation(overview: HousekeepingV2Overview): { metrics: StaffOverviewMetric[]; summaryLine1: string; summaryLine2: string } {
  const priorityTurnover = overview.tasks.filter((task) => (
    task.currentQueue === "priority-turnover"
    && task.workKind === "PRIORITY_TURNOVER"
    && !TERMINAL_HOUSEKEEPING_STATUSES.has(task.taskStatus)
  )).length;

  if (priorityTurnover > 0) {
    const normalToClean = Math.max(overview.summary.toClean - priorityTurnover, 0);
    return {
      metrics: [
        { label: "Priority Turnover", value: priorityTurnover, tone: "urgent" },
        { label: "Normal To Clean", value: normalToClean, tone: normalToClean > 0 ? "attention" : "good" },
        { label: "Active Now", value: overview.summary.cleaningInProgress, tone: overview.summary.cleaningInProgress > 0 ? "attention" : "neutral" },
        { label: "Water Due", value: overview.summary.waterDue, tone: overview.summary.waterDue > 0 ? "attention" : "good" },
      ],
      summaryLine1: `${priorityTurnover} Priority Turnover / ${normalToClean} Normal To Clean`,
      summaryLine2: `${overview.summary.cleaningInProgress} Active Now / ${overview.summary.waterDue} Water Due`,
    };
  }

  const metrics: StaffOverviewMetric[] = [
    { label: "To Clean", value: overview.summary.toClean, tone: overview.summary.toClean > 0 ? "attention" : "good" },
    { label: "Active Now", value: overview.summary.cleaningInProgress, tone: overview.summary.cleaningInProgress > 0 ? "attention" : "neutral" },
    { label: "Completed Cleaning Today", value: overview.summary.completedCleaningToday, tone: "good" },
    { label: "Water Due", value: overview.summary.waterDue, tone: overview.summary.waterDue > 0 ? "attention" : "good" },
  ];
  return {
    metrics,
    summaryLine1: `${metrics[0].value} To Clean / ${metrics[1].value} Active Now`,
    summaryLine2: `${metrics[2].value} Completed Cleaning Today / ${metrics[3].value} Water Due`,
  };
}

export async function getStaffOverview(env: StaffOverviewBindings, user: CurrentUser, date = getBangkokDate()): Promise<StaffOverview> {
  const cards: StaffOverviewCard[] = [];
  const bookingPulseCapabilities = {
    canViewBookingValue: canViewBookingValue(user),
  };

  if (canAccess(user, "movements")) {
    const reception = await getReceptionOverview(env);
    cards.push(withSummaryLines({
      id: "reception",
      module: "movements",
      title: "Check-In / Out",
      description: "movementsDescription",
      href: "/reception",
      cta: "Open Reception",
      metrics: [
        { label: "Arrivals", value: reception.summary.arrivals, tone: reception.summary.arrivals > 0 ? "attention" : "good" },
        { label: "Departures", value: reception.summary.departures, tone: reception.summary.departures > 0 ? "attention" : "good" },
        { label: "In house", value: reception.summary.inHouse, tone: "neutral" },
      ],
    }));
  }

  if (canAccess(user, "rooms")) {
    const overview = await getRoomsWorkspaceOverview(env, date, user);
    cards.push(withSummaryLines({
      id: "rooms",
      module: "rooms",
      title: "Rooms",
      description: "roomsDescription",
      href: "/rooms",
      cta: "Open Rooms",
      metrics: [
        { label: "Occupied", value: overview.summary.occupied, tone: "neutral" },
        { label: "Vacant", value: overview.summary.vacant, tone: "good" },
        { label: "Maintenance Blocked", value: overview.summary.maintenanceBlocked, tone: overview.summary.maintenanceBlocked > 0 ? "urgent" : "neutral" },
        { label: "Season Closed", value: overview.summary.seasonClosed, tone: overview.summary.seasonClosed > 0 ? "attention" : "neutral" },
      ],
      summaryLine1: `${overview.summary.occupied} Occupied / ${overview.summary.vacant} Vacant`,
      summaryLine2: `${overview.summary.maintenanceBlocked} Maintenance Blocked / ${overview.summary.seasonClosed} Season Closed`,
    }));
  }

  if (canAccess(user, "housekeeping")) {
    const overview = await getHousekeepingV2Overview(env, user, date);
    const housekeeping = staffHousekeepingPresentation(overview);
    cards.push(withSummaryLines({
      id: "housekeeping",
      module: "housekeeping",
      title: "Housekeeping",
      description: "housekeepingDescription",
      href: "/housekeeping",
      cta: "Open Housekeeping",
      metrics: housekeeping.metrics,
      summaryLine1: housekeeping.summaryLine1,
      summaryLine2: housekeeping.summaryLine2,
    }));
  }

  if (canAccess(user, "maintenance")) {
    const tickets = await listMaintenanceTickets(env, { status: "All" });
    const activeTickets = tickets.filter((ticket) => ticket.status !== "Completed");
    const blockingTickets = activeTickets.filter((ticket) => ticket.outOfService && ticket.roomId !== null).length;
    cards.push(withSummaryLines({
      id: "maintenance",
      module: "maintenance",
      title: "Maintenance",
      description: "maintenanceDescription",
      href: "/maintenance",
      cta: "Open Maintenance",
      metrics: [
        { label: "Open", value: activeTickets.length, tone: activeTickets.some((ticket) => ticket.priority === "High") ? "urgent" : "attention" },
        { label: "Blocking", value: blockingTickets, tone: blockingTickets > 0 ? "urgent" : "neutral" },
        { label: "Waiting", value: activeTickets.filter((ticket) => ticket.status === "Waiting Parts").length, tone: "attention" },
      ],
    }));
  }

  if (canAccess(user, "procurement")) {
    const ownerAttention = isOwner(user) ? await procurementOwnerAttention(env) : null;
    cards.push(withSummaryLines({
      id: "procurement",
      module: "procurement",
      title: "Procurement",
      description: "procurementDescription",
      href: "/procurement",
      cta: "Open Procurement",
      metrics: ownerAttention ? [
        { label: "New Requests", value: ownerAttention.newRequests, tone: ownerAttention.newRequests > 0 ? "urgent" : "good" },
        { label: "Taken In Charge", value: ownerAttention.takenInCharge, tone: ownerAttention.takenInCharge > 0 ? "attention" : "neutral" },
      ] : [],
      summaryLine1: ownerAttention ? `${ownerAttention.newRequests} New Requests` : "Free-text request",
      summaryLine2: ownerAttention ? `${ownerAttention.takenInCharge} Taken In Charge` : "Owner decision",
      procurementAttentionItems: ownerAttention?.items,
    }));
  }

  if (canUseGuestMessages(user)) {
    cards.push(withSummaryLines({
      id: "messages",
      module: "messages",
      title: "Guest Messages",
      description: "Review guest replies before sending.",
      href: "/messages",
      cta: "Open Messages",
      metrics: [],
      summaryLine1: "Human review",
      summaryLine2: "Review before send",
    }));
  }

  if (canUseSocialAutomation(user)) {
    cards.push(withSummaryLines({
      id: "social",
      module: "social-automation",
      title: "Social Automation",
      description: "Queue resort photos for daily publishing.",
      href: "/social-automation",
      cta: "Open Social",
      metrics: [],
      summaryLine1: "Photo queue",
      summaryLine2: "Publishing access",
    }));
  }

  if (canUsePayroll(user)) {
    cards.push(withSummaryLines({
      id: "payroll",
      module: "payroll",
      title: "Payroll",
      description: "Monthly staff salary calculations.",
      href: "/payroll",
      cta: "Open Payroll",
      metrics: [],
      summaryLine1: "Worker payroll",
      summaryLine2: "Owner only",
    }));
  }

  if (canUseOwnerDashboard(user)) {
    const balanceMetric = await ownerDashboardBalanceMetric(env, date);
    cards.push(withSummaryLines({
      id: "owner-dashboard",
      module: "owner-dashboard",
      title: "Financial Dashboard",
      description: "Income, expenses, and owner financial snapshot.",
      href: "/dashboard",
      cta: "Open Dashboard",
      metrics: [balanceMetric],
      summaryLine1: "Income vs expenses",
      summaryLine2: "Owner only",
    }));
  }

  if (canUseAccounting(user)) {
    cards.push(withSummaryLines({
      id: "accounting",
      module: "accounting",
      title: "Accounting",
      description: "Income, expenses, and accountant export.",
      href: "/accounting",
      cta: "Open Accounting",
      metrics: [],
      summaryLine1: "Expected net payout",
      summaryLine2: "Entry and export access",
    }));
  }

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      isOwner: isOwner(user),
      role: user.role,
    },
    bookingPulseCapabilities,
    bookingEvents: (await Promise.all(["NEW", "UPDATED", "CANCELLED"].map((eventType) => listRecentBookingEvents(env, 5, new Date(), {
      includeBookingValue: bookingPulseCapabilities.canViewBookingValue,
      eventType: eventType as "NEW" | "UPDATED" | "CANCELLED",
    })))).flat().sort((a, b) => b.eventTimestamp.localeCompare(a.eventTimestamp)),
    cards,
  };
}
