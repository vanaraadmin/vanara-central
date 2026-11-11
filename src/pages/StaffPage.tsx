import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useMemo } from "react";
import airplaneLandingIcon from "../assets/img/airplane-landing-light.svg";
import bedIcon from "../assets/img/bed-light.svg";
import calendarCheckIcon from "../assets/img/calendar-check-light.svg";
import envelopeIcon from "../assets/img/envelope-light.svg";
import handCoinsIcon from "../assets/img/hand-coins-light.svg";
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
import { useLanguage } from "../providers/language.context";
import { translateStaffLabel } from "../utils/staff-i18n-labels";
import "../styles/StaffPage.css";

const STAFF_WORKSPACE_ORDER: StaffCardId[] = [
  "rooms",
  "availability",
  "reception",
  "housekeeping",
  "laundry",
  "maintenance",
  "procurement",
  "social",
  "accounting",
  "payroll",
];

const OWNER_WORKSPACE_ORDER: StaffCardId[] = [
  "owner-dashboard",
  "rooms",
  "messages",
  "reception",
  "availability",
  "accounting",
  "payroll",
  "housekeeping",
  "laundry",
  "maintenance",
  "procurement",
  "social",
];

const workspaceIcons: Record<StaffCardId, string> = {
  rooms: bedIcon,
  availability: calendarCheckIcon,
  messages: chatIcon,
  reception: airplaneLandingIcon,
  housekeeping: sprayBottleIcon,
  laundry: sprayBottleIcon,
  maintenance: wrenchIcon,
  procurement: shoppingCartIcon,
  social: envelopeIcon,
  "owner-dashboard": handCoinsIcon,
  payroll: handCoinsIcon,
  accounting: handCoinsIcon,
};

const AVAILABILITY_WORKSPACE_CARD: StaffOverviewCard = {
  id: "availability",
  module: "rooms",
  title: "prices",
  description: "pricesDescription",
  href: "/availability-prices",
  cta: "openWorkspace",
  metrics: [],
  summaryLine1: "availabilitySummaryLine",
  summaryLine2: "readOnlySearch",
};

const workspaceTitleKeys: Partial<Record<StaffCardId, string>> = {
  availability: "prices",
  housekeeping: "housekeeping",
  laundry: "laundry",
  maintenance: "maintenance",
  messages: "messages",
  accounting: "accounting",
  payroll: "payroll",
  procurement: "procurement",
  reception: "arrivalsDepartures",
  rooms: "rooms",
  social: "socialAutomation",
};

const workspaceDescriptionKeys: Partial<Record<StaffCardId, string>> = {
  availability: "pricesDescription",
  housekeeping: "housekeepingDescription",
  laundry: "laundryDescription",
  maintenance: "maintenanceDescription",
  messages: "messagesDescription",
  accounting: "accountingDescription",
  procurement: "procurementDescription",
  reception: "movementsDescription",
  rooms: "roomsDescription",
  social: "socialAutomationDescription",
};

const metricLabelKeys: Record<string, string> = {
  "Active Now": "activeNow",
  "Cleaning In Progress": "cleaningInProgress",
  "Maintenance Blocked": "maintenanceBlocked",
  "Normal To Clean": "toClean",
  "Priority Turnover": "priorityTurnover",
  "Season Closed": "seasonClosed",
  "To Clean": "toClean",
  "Water Due": "waterDue",
  "New Requests": "newProcurementRequests",
  "Taken In Charge": "procurementTakenInCharge",
};

const metricTone: Record<StaffOverviewMetric["tone"], VanaraSummaryItem["tone"]> = {
  attention: "warning",
  good: "clean",
  neutral: "neutral",
  urgent: "critical",
};

function staffNickname(displayName: string) {
  const cleaned = displayName.trim();

  if (!cleaned || cleaned.toLowerCase() === "vanara owner") {
    return "";
  }

  return cleaned;
}

function workspaceRank(id: StaffCardId, order: StaffCardId[]) {
  const index = order.indexOf(id);
  return index === -1 ? order.length : index;
}

function sortWorkspaces(workspaces: StaffOverviewCard[], ownerHome: boolean) {
  const order = ownerHome ? OWNER_WORKSPACE_ORDER : STAFF_WORKSPACE_ORDER;
  return [...workspaces].sort(
    (a, b) => workspaceRank(a.id, order) - workspaceRank(b.id, order),
  );
}

function withAvailabilityWorkspace(workspaces: StaffOverviewCard[]) {
  if (workspaces.some((workspace) => workspace.id === "availability")) return workspaces;
  return [...workspaces, AVAILABILITY_WORKSPACE_CARD];
}

function iconStyle(iconUrl: string): CSSProperties {
  return { "--staff-icon-url": `url("${iconUrl}")` } as CSSProperties;
}

function formatOwnerBalance(value: number) {
  const sign = value >= 0 ? "+" : "-";
  const absoluteValue = Math.abs(value);
  const formatted = absoluteValue >= 1000
    ? `${(absoluteValue / 1000).toFixed(1)}K`
    : Math.round(absoluteValue).toLocaleString("en-US");
  return `${sign} THB ${formatted}`;
}

function summaryItems(metrics: StaffOverviewMetric[], translate: (key: string, options?: Record<string, unknown>) => string): VanaraSummaryItem[] {
  return metrics.map((metric) => ({
    label: translateStaffSummaryLabel(metric.label, translate),
    tone: metricTone[metric.tone],
    value: metric.value,
  }));
}

function translateDynamicSummaryLine(value: string | undefined, translate: (key: string, options?: Record<string, unknown>) => string) {
  if (!value) return "-";
  const paired = /^(\d+)\s+(.+?)\s+\/\s+(\d+)\s+(.+)$/.exec(value);
  if (paired?.[1] && paired[2] && paired[3] && paired[4]) {
    return `${paired[1]} ${translateStaffSummaryLabel(paired[2], translate)} / ${paired[3]} ${translateStaffSummaryLabel(paired[4], translate)}`;
  }
  return translateStaffSummaryLabel(value, translate);
}

function translateStaffSummaryLabel(label: string, translate: (key: string, options?: Record<string, unknown>) => string) {
  const mapped = metricLabelKeys[label] ? translate(metricLabelKeys[label]) : label;
  if (mapped !== label) return mapped;
  const staffLabel = translateStaffLabel(label, translate);
  if (staffLabel !== label) return staffLabel;
  const knownLabels: Record<string, string> = {
    "Entry and export access": "entryAndExportAccess",
    "Free-text request": "freeTextRequest",
    "Income vs expenses": "incomeVsExpenses",
    "Owner decision": "ownerDecision",
    "Publishing access": "publishingAccess",
    "Photo queue": "queue",
    "Queue resort photos for daily publishing.": "socialAutomationDescription",
    "Expected net payout": "expectedNetPayout",
  };
  return knownLabels[label] ? translate(knownLabels[label]) : label;
}

function WorkspaceCard({
  index,
  workspace,
}: {
  index: number;
  workspace: StaffOverviewCard;
}) {
  const { translate } = useLanguage();
  const iconUrl = workspaceIcons[workspace.id];
  const title = workspaceTitleKeys[workspace.id] ? translate(workspaceTitleKeys[workspace.id]!) : workspace.title;
  const description = workspaceDescriptionKeys[workspace.id] ? translate(workspaceDescriptionKeys[workspace.id]!) : workspace.description;
  const metrics = summaryItems(workspace.metrics, translate);
  const dashboardBalance = workspace.id === "owner-dashboard" ? workspace.metrics.find((metric) => metric.label === "Balance") : undefined;
  const visibleMetrics = workspace.id === "owner-dashboard" ? metrics.filter((metric) => metric.label !== "Balance") : metrics;
  const directTranslationKeys = ["availabilitySummaryLine", "humanReview", "laundrySummaryLine", "laundrySummaryLine2", "readOnlySearch", "reviewBeforeSend"];
  const fallbackSummaryLine1 = workspace.summaryLine1 && directTranslationKeys.includes(workspace.summaryLine1) ? translate(workspace.summaryLine1) : translateDynamicSummaryLine(workspace.summaryLine1, translate);
  const fallbackSummaryLine2 = workspace.summaryLine2 && directTranslationKeys.includes(workspace.summaryLine2) ? translate(workspace.summaryLine2) : translateDynamicSummaryLine(workspace.summaryLine2, translate);

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
          {dashboardBalance ? (
            <span
              className={`staff-workspace__balance staff-workspace__balance--${dashboardBalance.value >= 0 ? "positive" : "negative"}`}
              aria-label={`Current balance ${formatOwnerBalance(dashboardBalance.value)}`}
            >
              {formatOwnerBalance(dashboardBalance.value)}
            </span>
          ) : null}
        </span>
        <span className="staff-workspace__description">{description}</span>

        {visibleMetrics.length > 0 ? (
          <VanaraSummaryGrid
            ariaLabel={`${title} operational counters`}
            className={`staff-workspace__summary-grid staff-workspace__summary-grid--${workspace.id}`}
            items={visibleMetrics}
            variant="compact"
          />
        ) : (
          <span className="staff-workspace__summary-lines">
            <span
              data-dynamic-field={`${workspace.id}.summaryLine1`}
              aria-label="Dynamic operational summary"
            >
              {fallbackSummaryLine1}
            </span>
            <span
              data-dynamic-field={`${workspace.id}.summaryLine2`}
              aria-label="Dynamic operational detail"
            >
              {fallbackSummaryLine2}
            </span>
          </span>
        )}
        {workspace.id === "procurement" && workspace.procurementAttentionItems?.length ? (
          <span className="staff-workspace__procurement-attention" aria-label={translate("pendingRequests")}>
            {workspace.procurementAttentionItems.map((request) => (
              <span className="staff-workspace__procurement-request" key={request.id}>
                <span className="staff-workspace__procurement-request-meta">
                  {request.requestedByName} · {request.acknowledgedByName
                    ? translate("takenInChargeBy", { name: request.acknowledgedByName })
                    : translate("awaitingOwner")}
                </span>
                <span className="staff-workspace__procurement-request-text">{request.requestText}</span>
              </span>
            ))}
          </span>
        ) : null}
      </span>

      <span className="staff-workspace__arrow" aria-hidden="true">
        <ArrowRightIcon />
      </span>
    </Link>
  );
}

export default function StaffPage() {
  const { language, translate } = useLanguage();
  const staff = useQuery({
    queryKey: ["staff", "overview"],
    queryFn: ({ signal }) => loadStaffOverview(signal),
    refetchInterval: 60_000,
  });

  const isOwnerHome = staff.data?.user.isOwner ?? false;
  const workspaces = staff.data ? sortWorkspaces(withAvailabilityWorkspace(staff.data.cards), isOwnerHome) : [];
  const name = staff.data ? staffNickname(staff.data.user.displayName) : "";
  const bookingEvents = staff.data?.bookingEvents ?? [];
  const canViewBookingValue = staff.data?.bookingPulseCapabilities?.canViewBookingValue ?? false;
  const title = useMemo(() => {
    if (!name) return translate("sawasdee");
    return language === "th" ? `${translate("sawasdee")} ${name}` : `${translate("sawasdee")}, ${name}`;
  }, [language, name, translate]);
  const showWorkspaceSection = Boolean(workspaces.length > 0 || staff.isLoading || staff.isError || (staff.data && workspaces.length === 0));

  return (
    <WorkspaceShell
      title={title}
      pageLabel={isOwnerHome ? translate("ownerPage") : translate("staffPage")}
      stickyNavigationTitle={translate("home")}
      workspace="staffHome"
      bodyClassName="staff-page"
    >
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
            eyebrow={translate("operational")}
            headingId="staff-workspaces-title"
            meta={String(workspaces.length).padStart(2, "0")}
            title={translate("workspaces")}
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
            <section className="staff-empty vc-glass-region" aria-label={translate("noWorkAvailable")}>
              <span className="staff-empty__mark" aria-hidden="true" />
              <h2>{translate("nothingAssigned")}</h2>
              <p>{translate("workAreasAppear")}</p>
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
