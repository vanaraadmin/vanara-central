import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useMemo } from "react";
import airplaneLandingIcon from "../assets/img/airplane-landing-light.svg";
import bedIcon from "../assets/img/bed-light.svg";
import calendarCheckIcon from "../assets/img/calendar-check-light.svg";
import shoppingCartIcon from "../assets/img/shopping-cart-light.svg";
import sprayBottleIcon from "../assets/img/spray-bottle-light.svg";
import wrenchIcon from "../assets/img/wrench-light.svg";
import chatIcon from "../assets/img/wechat-logo-light.svg";
import { PageError, PageLoading } from "../components/AsyncState";
import { ArrowRightIcon } from "../components/OperationsIcons";
import RecentBookings from "../components/RecentBookings";
import WorkspaceShell from "../components/WorkspaceShell";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import VanaraSummaryGrid, { type VanaraSummaryItem } from "../components/vanara/VanaraSummaryGrid";
import { loadStaffOverview } from "../services/staff.service";
import type { StaffCardId, StaffOverviewCard, StaffOverviewMetric } from "../types/staff";
import "../styles/StaffPage.css";

const WORKSPACE_ORDER: StaffCardId[] = [
  "rooms",
  "availability",
  "messages",
  "reception",
  "housekeeping",
  "maintenance",
  "procurement",
  "chat",
];

const workspaceIcons: Record<StaffCardId, string> = {
  rooms: bedIcon,
  availability: calendarCheckIcon,
  messages: chatIcon,
  reception: airplaneLandingIcon,
  housekeeping: sprayBottleIcon,
  maintenance: wrenchIcon,
  procurement: shoppingCartIcon,
  chat: chatIcon,
};

const AVAILABILITY_WORKSPACE_CARD: StaffOverviewCard = {
  id: "availability",
  module: "rooms",
  title: "Prices",
  description: "Check availability and verified prices.",
  href: "/availability-prices",
  cta: "Open workspace",
  metrics: [],
  summaryLine1: "Arrival / Departure",
  summaryLine2: "Read-only search",
};

const MESSAGES_WORKSPACE_CARD: StaffOverviewCard = {
  id: "messages",
  module: "messages",
  title: "Messages",
  description: "Review guest replies before sending.",
  href: "/messages",
  cta: "Open workspace",
  metrics: [],
  summaryLine1: "Human review",
  summaryLine2: "Review before send",
};

const metricTone: Record<StaffOverviewMetric["tone"], VanaraSummaryItem["tone"]> = {
  attention: "warning",
  good: "clean",
  neutral: "neutral",
  urgent: "critical",
};

function firstName(displayName: string) {
  const cleaned = displayName.trim();

  if (!cleaned || cleaned.toLowerCase() === "vanara owner") {
    return "";
  }

  return cleaned.split(/\s+/)[0];
}

function sortWorkspaces(workspaces: StaffOverviewCard[]) {
  return [...workspaces].sort(
    (a, b) =>
      WORKSPACE_ORDER.indexOf(a.id) - WORKSPACE_ORDER.indexOf(b.id),
  );
}

function withAvailabilityWorkspace(workspaces: StaffOverviewCard[]) {
  if (workspaces.some((workspace) => workspace.id === "availability")) return workspaces;
  return [...workspaces, AVAILABILITY_WORKSPACE_CARD];
}

function withMessagesWorkspace(workspaces: StaffOverviewCard[]) {
  if (workspaces.some((workspace) => workspace.id === "messages")) return workspaces;
  return [...workspaces, MESSAGES_WORKSPACE_CARD];
}

function iconStyle(iconUrl: string): CSSProperties {
  return { "--staff-icon-url": `url("${iconUrl}")` } as CSSProperties;
}

function summaryItems(metrics: StaffOverviewMetric[]): VanaraSummaryItem[] {
  return metrics.map((metric) => ({
    label: metric.label,
    tone: metricTone[metric.tone],
    value: metric.value,
  }));
}

function WorkspaceCard({
  index,
  workspace,
}: {
  index: number;
  workspace: StaffOverviewCard;
}) {
  const iconUrl = workspaceIcons[workspace.id];
  const title = workspace.id === "reception" ? "Check-In / Out" : workspace.title;
  const metrics = summaryItems(workspace.metrics);

  return (
    <Link
      className="staff-workspace vc-glass-region"
      to={workspace.href}
    >
      <span className="staff-workspace__identity">
        <span className="staff-workspace__index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
      </span>

      <span className="staff-workspace__content">
        <span className="staff-workspace__title-row">
          <span
            className="staff-workspace__icon"
            style={iconStyle(iconUrl)}
            aria-hidden="true"
          >
            <span className="staff-workspace__glyph" />
          </span>
          <span className="staff-workspace__title">{title}</span>
        </span>
        <span className="staff-workspace__description">{workspace.description}</span>

        {metrics.length > 0 ? (
          <VanaraSummaryGrid
            ariaLabel={`${title} operational counters`}
            className="staff-workspace__summary-grid"
            items={metrics}
            variant="compact"
          />
        ) : (
          <span className="staff-workspace__summary-lines">
            <span
              data-dynamic-field={`${workspace.id}.summaryLine1`}
              aria-label="Dynamic operational summary"
            >
              {workspace.summaryLine1 ?? "-"}
            </span>
            <span
              data-dynamic-field={`${workspace.id}.summaryLine2`}
              aria-label="Dynamic operational detail"
            >
              {workspace.summaryLine2 ?? "-"}
            </span>
          </span>
        )}
      </span>

      <span className="staff-workspace__arrow" aria-hidden="true">
        <ArrowRightIcon />
      </span>
    </Link>
  );
}

export default function StaffPage() {
  const staff = useQuery({
    queryKey: ["staff", "overview"],
    queryFn: ({ signal }) => loadStaffOverview(signal),
    refetchInterval: 60_000,
  });

  const workspaces = staff.data ? sortWorkspaces(withMessagesWorkspace(withAvailabilityWorkspace(staff.data.cards))) : [];
  const name = staff.data ? firstName(staff.data.user.displayName) : "";
  const bookingEvents = staff.data?.bookingEvents ?? [];
  const canViewBookingValue = staff.data?.bookingPulseCapabilities?.canViewBookingValue ?? false;
  const title = useMemo(() => (name ? `Sawasdee, ${name}` : "Sawasdee"), [name]);
  const showWorkspaceSection = Boolean(workspaces.length > 0 || staff.isLoading || staff.isError || (staff.data && workspaces.length === 0));

  return (
    <WorkspaceShell title={title} stickyNavigationTitle="Home" workspace="staffHome" bodyClassName="staff-page">
      <RecentBookings
        canViewBookingValue={canViewBookingValue}
        events={bookingEvents}
        error={staff.isError}
        loading={staff.isLoading}
        onRetry={() => void staff.refetch()}
      />

      {showWorkspaceSection ? (
        <VanaraGlassRegion className="staff-workspaces" ariaLabelledBy="staff-workspaces-title">
          <VanaraSectionHeader
            eyebrow="Operational"
            headingId="staff-workspaces-title"
            meta={String(workspaces.length).padStart(2, "0")}
            title="Workspaces"
          />

          {staff.isLoading && (
            <div className="staff-state">
              <PageLoading />
            </div>
          )}

          {staff.isError && !staff.data && (
            <div className="staff-state">
              <PageError onRetry={() => void staff.refetch()} />
            </div>
          )}

          {staff.data && workspaces.length === 0 && (
            <section className="staff-empty vc-glass-region" aria-label="No work available">
              <span className="staff-empty__mark" aria-hidden="true" />
              <h2>Nothing assigned</h2>
              <p>Your work areas will appear here when access is enabled.</p>
            </section>
          )}

          {workspaces.length > 0 && (
            <div className="staff-workspace-list">
              {workspaces.map((workspace, index) => (
                <WorkspaceCard
                  index={index}
                  key={workspace.id}
                  workspace={workspace}
                />
              ))}
            </div>
          )}
        </VanaraGlassRegion>
      ) : null}
    </WorkspaceShell>
  );
}
