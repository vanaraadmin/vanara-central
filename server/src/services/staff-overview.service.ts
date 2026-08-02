import { getHousekeepingOverview, type HousekeepingBindings, type HousekeepingOverview } from "./housekeeping-overview.service.js";
import { listMaintenanceTickets, type MaintenanceBindings } from "./maintenance.service.js";
import { getRoomsWorkspaceOverview, type RoomsWorkspaceBindings } from "./rooms-workspace.service.js";
import { getReceptionOverview, type ReceptionBindings } from "./reception.service.js";
import { hasModulePermission, type CurrentUser, type ModuleKey } from "./current-user.service.js";
import { listRecentBookingEvents, type BookingEventsBindings, type BookingPulseItem } from "./booking-events.service.js";

export interface StaffOverviewBindings extends HousekeepingBindings, MaintenanceBindings, ReceptionBindings, BookingEventsBindings, RoomsWorkspaceBindings {
  DB: D1Database;
}

export type StaffCardId = "reception" | "rooms" | "housekeeping" | "availability" | "maintenance" | "procurement";

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
  return (user.role === "Owner" || user.role === "Manager") && canAccess(user, "owner-dashboard");
}

async function housekeeping(env: StaffOverviewBindings, cache: { data?: HousekeepingOverview }): Promise<HousekeepingOverview> {
  cache.data ??= await getHousekeepingOverview(env);
  return cache.data;
}

function formatMetric(metric: StaffOverviewMetric | undefined): string | undefined {
  if (!metric) return undefined;
  return `${metric.value} ${metric.label}`;
}

function withSummaryLines(card: StaffOverviewCard): StaffOverviewCard {
  return {
    ...card,
    summaryLine1: formatMetric(card.metrics[0]),
    summaryLine2: formatMetric(card.metrics[1]),
  };
}

export async function getStaffOverview(env: StaffOverviewBindings, user: CurrentUser): Promise<StaffOverview> {
  const cards: StaffOverviewCard[] = [];
  const housekeepingCache: { data?: HousekeepingOverview } = {};
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
    const overview = await getRoomsWorkspaceOverview(env);
    cards.push(withSummaryLines({
      id: "rooms",
      module: "rooms",
      title: "Rooms",
      description: "Compact resort room overview.",
      href: "/rooms",
      cta: "Open Rooms",
      metrics: [
        { label: "Occupied", value: overview.summary.occupied, tone: "neutral" },
        { label: "Not ready", value: overview.summary.notReady, tone: overview.summary.notReady > 0 ? "attention" : "good" },
        { label: "Maintenance", value: overview.summary.maintenance, tone: overview.summary.maintenance > 0 ? "urgent" : "good" },
      ],
    }));
    cards.push(withSummaryLines({
      id: "availability",
      module: "rooms",
      title: "Availability",
      description: "Open local availability view.",
      href: "/availability",
      cta: "Open Availability",
      metrics: [],
    }));
  }

  if (canAccess(user, "housekeeping")) {
    const overview = await housekeeping(env, housekeepingCache);
    cards.push(withSummaryLines({
      id: "housekeeping",
      module: "housekeeping",
      title: "Housekeeping",
      description: "Clean rooms in operational priority.",
      href: "/housekeeping",
      cta: "Open Housekeeping",
      metrics: [
        { label: "To clean", value: overview.summary.cleanFirst + overview.summary.cleanToday, tone: overview.summary.cleanFirst > 0 ? "urgent" : "attention" },
        { label: "In progress", value: overview.summary.cleaningInProgress, tone: "neutral" },
        { label: "Ready", value: overview.summary.ready, tone: "good" },
      ],
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
