import { getHousekeepingV2Overview, type HousekeepingV2Bindings, type HousekeepingV2Overview } from "./housekeeping-v2-overview.service.js";
import { listMaintenanceTickets, type MaintenanceBindings } from "./maintenance.service.js";
import { getRoomsWorkspaceOverview, type RoomsWorkspaceBindings } from "./rooms-workspace.service.js";
import { getReceptionOverview, type ReceptionBindings } from "./reception.service.js";
import { hasModulePermission, isOwner, type CurrentUser, type ModuleKey } from "./current-user.service.js";
import { listRecentBookingEvents, type BookingEventsBindings, type BookingPulseItem } from "./booking-events.service.js";
import { getBangkokDate } from "./today.service.js";

export interface StaffOverviewBindings extends HousekeepingV2Bindings, MaintenanceBindings, ReceptionBindings, BookingEventsBindings, RoomsWorkspaceBindings {
  DB: D1Database;
}

export type StaffCardId = "reception" | "rooms" | "housekeeping" | "maintenance" | "procurement" | "social" | "payroll";

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
}

export interface StaffOverview {
  user: {
    id: string;
    displayName: string;
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
  return isOwner(user) && canAccess(user, "social-automation");
}

function canUsePayroll(user: CurrentUser): boolean {
  return isOwner(user) && canAccess(user, "payroll");
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

const TERMINAL_HOUSEKEEPING_STATUSES = new Set(["COMPLETED", "SKIPPED", "CANCELLED"]);

function staffHousekeepingPresentation(overview: HousekeepingV2Overview): { metrics: StaffOverviewMetric[]; summaryLine1: string; summaryLine2: string } {
  const priorityTurnover = overview.tasks.filter((task) => (
    task.currentQueue === "priority-turnover"
    && task.taskType === "TURNOVER"
    && !task.isBlocked
    && !TERMINAL_HOUSEKEEPING_STATUSES.has(task.taskStatus)
  )).length;

  if (priorityTurnover > 0) {
    const normalToClean = Math.max(overview.summary.toClean - priorityTurnover, 0);
    return {
      metrics: [
        { label: "Priority Turnover", value: priorityTurnover, tone: "urgent" },
        { label: "Normal To Clean", value: normalToClean, tone: normalToClean > 0 ? "attention" : "good" },
        { label: "Cleaning In Progress", value: overview.summary.cleaningInProgress, tone: overview.summary.cleaningInProgress > 0 ? "attention" : "neutral" },
        { label: "Water Due", value: overview.summary.waterDue, tone: overview.summary.waterDue > 0 ? "attention" : "good" },
      ],
      summaryLine1: `${priorityTurnover} Priority Turnover / ${normalToClean} Normal To Clean`,
      summaryLine2: `${overview.summary.cleaningInProgress} Cleaning In Progress / ${overview.summary.waterDue} Water Due`,
    };
  }

  const metrics: StaffOverviewMetric[] = [
    { label: "To Clean", value: overview.summary.toClean, tone: overview.summary.toClean > 0 ? "attention" : "good" },
    { label: "Cleaning In Progress", value: overview.summary.cleaningInProgress, tone: overview.summary.cleaningInProgress > 0 ? "attention" : "neutral" },
    { label: "Completed Cleaning Today", value: overview.summary.completedCleaningToday, tone: "good" },
    { label: "Water Due", value: overview.summary.waterDue, tone: overview.summary.waterDue > 0 ? "attention" : "good" },
  ];
  return {
    metrics,
    summaryLine1: `${metrics[0].value} To Clean / ${metrics[1].value} Cleaning In Progress`,
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
      description: "Today guest movement agenda.",
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
      description: "Compact resort room overview.",
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
      description: "Clean rooms in operational priority.",
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
      description: "Open technical issues and assignments.",
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
    cards.push(withSummaryLines({
      id: "procurement",
      module: "procurement",
      title: "Procurement",
      description: "Request supplies through the existing workflow.",
      href: "/procurement",
      cta: "Open Procurement",
      metrics: [],
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
      summaryLine2: "Owner only",
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

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      role: user.role,
    },
    bookingPulseCapabilities,
    bookingEvents: await listRecentBookingEvents(env, 3, new Date(), {
      includeBookingValue: bookingPulseCapabilities.canViewBookingValue,
    }),
    cards,
  };
}
