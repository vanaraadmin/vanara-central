import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, ChevronDownIcon, MaintenanceIcon } from "../components/OperationsIcons";
import VanaraDataGrid from "../components/vanara/VanaraDataGrid";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraGlassSheet from "../components/vanara/VanaraGlassSheet";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import VanaraSummaryGrid, { type VanaraSummaryItem } from "../components/vanara/VanaraSummaryGrid";
import WorkspaceShell from "../components/WorkspaceShell";
import { useOutsidePointerDown } from "../hooks/useOutsidePointerDown";
import { loadMaintenanceTickets } from "../services/maintenance.service";
import type { MaintenancePriority, MaintenanceStatus, MaintenanceTicketSummary } from "../types/maintenance";
import { useLanguage } from "../providers/language.context";
import { translateStaffLabel } from "../utils/staff-i18n-labels";
import "../styles/MaintenancePage.css";

type Translate = ReturnType<typeof useLanguage>["translate"];

function displayStatus(status: MaintenanceStatus | "All", translate: Translate) {
  return translateStaffLabel(status, translate);
}

function displayPriority(priority: MaintenancePriority, translate: Translate) {
  return translateStaffLabel(priority, translate);
}

function locationLabel(ticket: MaintenanceTicketSummary) {
  return ticket.roomName ?? ticket.locationArea ?? ticket.accommodationName ?? null;
}

function assignmentLabel(ticket: MaintenanceTicketSummary, translate: Translate) {
  if (ticket.assignment.type === "INTERNAL") return ticket.assignment.assignedUserName ?? translate("maintenance");
  return translate("unassigned");
}

function priorityTone(priority: MaintenancePriority): string {
  return priority.toLowerCase();
}

function statusTone(status: MaintenanceStatus, outOfService = false): "clean" | "progress" | "warning" | "critical" | "closed" {
  if (outOfService) return "critical";
  if (status === "Completed") return "closed";
  if (status === "In Progress") return "progress";
  if (status === "Waiting Parts") return "warning";
  return "warning";
}

function priorityStateTone(priority: MaintenancePriority, outOfService = false): "clean" | "warning" | "critical" | "neutral" {
  if (outOfService || priority === "High") return "critical";
  if (priority === "Normal") return "warning";
  return "neutral";
}

function creationDate(value: string, language = "en"): string {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function TicketCard({
  expanded,
  onToggle,
  ticket,
  translate,
  language,
}: {
  expanded: boolean;
  language: string;
  onToggle: () => void;
  ticket: MaintenanceTicketSummary;
  translate: Translate;
}) {
  const detailId = `maintenance-ticket-${ticket.id}-details`;
  const tone = statusTone(ticket.status, ticket.outOfService);
  const target = locationLabel(ticket) ?? translate("generalResortArea");

  return (
    <article className={`maintenance-ticket priority-${priorityTone(ticket.priority)} status-${ticket.status.toLowerCase().replaceAll(" ", "-")}${expanded ? " is-expanded" : ""}`}>
      <button
        aria-controls={detailId}
        aria-expanded={expanded}
        className="maintenance-ticket-row"
        onClick={onToggle}
        type="button"
      >
        <span className="maintenance-ticket-row__icon">
          {ticket.outOfService ? <AlertIcon /> : <MaintenanceIcon />}
        </span>
        <span className="maintenance-ticket-row__identity">
          <strong className="maintenance-ticket-row__title">{ticket.title}</strong>
          <span className="maintenance-ticket-row__subtitle">{target}</span>
        </span>
        <span className="maintenance-ticket-row__signals">
          <strong className={`vc-state-${tone}`}>{ticket.outOfService ? translate("blocking") : displayStatus(ticket.status, translate)}</strong>
          <span>{displayPriority(ticket.priority, translate)} - {assignmentLabel(ticket, translate)}</span>
          <time dateTime={ticket.createdAt}>{creationDate(ticket.createdAt, language)}</time>
        </span>
        <span className="maintenance-ticket-row__chevron" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>

      {expanded && (
        <div className="maintenance-ticket-expanded-content" id={detailId}>
          <VanaraGlassSheet ariaLabel={translate("ticketDetails", { title: ticket.title })} className="maintenance-ticket-sheet">
            <header className="vc-sheet-identity maintenance-sheet-identity">
              <div className="vc-sheet-identity__icon maintenance-sheet-identity__icon" aria-hidden="true">
                {ticket.outOfService ? <AlertIcon /> : <MaintenanceIcon />}
              </div>
              <div className="vc-sheet-identity__content maintenance-sheet-identity__content">
                <span className="vc-sheet-identity__eyebrow">{ticket.category}</span>
                <h2 className="vc-sheet-identity__title">{ticket.title}</h2>
                <p className="vc-sheet-identity__subtitle">{target}</p>
                <small className="vc-sheet-identity__meta">{assignmentLabel(ticket, translate)} - {creationDate(ticket.createdAt, language)}</small>
              </div>
            </header>

            <VanaraGlassRegion ariaLabelledBy={`maintenance-ticket-state-${ticket.id}`} className="maintenance-region">
              <VanaraSectionHeader
                eyebrow={translate("maintenance")}
                headingId={`maintenance-ticket-state-${ticket.id}`}
                title={translate("currentState")}
              />
              <div className="vc-operational-state">
                <span className="vc-operational-state__label">{translate("currentState")}</span>
                <strong className={`vc-operational-state__value vc-state-${tone}`}>{ticket.outOfService ? translate("blocking") : displayStatus(ticket.status, translate)}</strong>
                <p className="vc-operational-state__description">{ticket.waitingReason ?? ticket.description}</p>
              </div>
            </VanaraGlassRegion>

            <VanaraGlassRegion ariaLabelledBy={`maintenance-ticket-facts-${ticket.id}`} className="maintenance-region">
              <VanaraSectionHeader
                eyebrow={translate("issue")}
                headingId={`maintenance-ticket-facts-${ticket.id}`}
                title={translate("issue")}
              />
              <VanaraDataGrid
                ariaLabel={translate("issueFacts", { title: ticket.title })}
                items={[
                  { label: translate("category"), value: ticket.category },
                  { label: translate("priority"), tone: priorityStateTone(ticket.priority, ticket.outOfService), value: displayPriority(ticket.priority, translate) },
                  { label: translate("status"), tone, value: displayStatus(ticket.status, translate) },
                  { label: translate("assignedTo"), value: assignmentLabel(ticket, translate) },
                  { label: translate("target"), value: target },
                  { label: translate("photos"), value: ticket.photoCount },
                ]}
              />
            </VanaraGlassRegion>

            <VanaraGlassRegion ariaLabelledBy={`maintenance-ticket-actions-${ticket.id}`} className="maintenance-region">
              <VanaraSectionHeader
                eyebrow={translate("actions")}
                headingId={`maintenance-ticket-actions-${ticket.id}`}
                title={translate("actions")}
              />
              <Link className="vc-primary-action maintenance-open-issue" to={`/maintenance/${ticket.id}`}>{translate("openIssue")}</Link>
            </VanaraGlassRegion>
          </VanaraGlassSheet>
        </div>
      )}
    </article>
  );
}

function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export default function MaintenancePage() {
  const { language, translate } = useLanguage();
  const [params] = useSearchParams();
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const priorityParam = params.get("priority") as MaintenancePriority | null;
  const outOfServiceParam = params.get("outOfService") === "1";
  const query = useQuery({
    queryKey: ["maintenance", "tickets"],
    queryFn: ({ signal }) => loadMaintenanceTickets({ status: "All" }, signal),
  });
  const tickets = useMemo(() => (query.data ?? []).filter((ticket) => {
    if (priorityParam && ticket.priority !== priorityParam) return false;
    if (outOfServiceParam && (!ticket.outOfService || ticket.roomId === null)) return false;
    return true;
  }), [outOfServiceParam, priorityParam, query.data]);
  const activeTickets = useMemo(() => tickets.filter((ticket) => ticket.status !== "Completed"), [tickets]);
  const activeExpandedTicketId = expandedTicketId !== null && activeTickets.some((ticket) => ticket.id === expandedTicketId) ? expandedTicketId : null;
  const completedToday = useMemo(() => tickets.filter((ticket) => ticket.status === "Completed" && ticket.closedAt?.startsWith(todayBangkok())).length, [tickets]);
  const summary = [
    { label: translate("openStatus"), tone: activeTickets.some((ticket) => ticket.status === "Open") ? "warning" : "clean", value: activeTickets.filter((ticket) => ticket.status === "Open").length },
    { label: translate("maintenanceInProgress"), tone: activeTickets.some((ticket) => ticket.status === "In Progress") ? "progress" : "clean", value: activeTickets.filter((ticket) => ticket.status === "In Progress").length },
    { label: translate("waitingParts"), tone: activeTickets.some((ticket) => ticket.status === "Waiting Parts") ? "warning" : "clean", value: activeTickets.filter((ticket) => ticket.status === "Waiting Parts").length },
    { label: translate("completedToday"), tone: "clean", value: completedToday },
  ] satisfies VanaraSummaryItem[];
  const summaryItems = summary;

  const collapse = useCallback(() => {
    setExpandedTicketId(null);
  }, []);

  useOutsidePointerDown(containerRef, collapse, activeExpandedTicketId !== null);

  useEffect(() => {
    if (!activeExpandedTicketId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedTicketId(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeExpandedTicketId]);

  if (query.isLoading) return <WorkspaceShell title={translate("maintenance")} workspace="maintenance"><PageLoading /></WorkspaceShell>;
  if (query.isError) return <WorkspaceShell title={translate("maintenance")} workspace="maintenance"><PageError onRetry={() => void query.refetch()} /></WorkspaceShell>;

  return (
    <WorkspaceShell title={translate("maintenance")} workspace="maintenance" bodyClassName="maintenance-page">
      <div className="workspace-body-actions">
        <span>{translate("activeIssuesCount", { count: activeTickets.length })}</span>
        <Link className="vc-primary-action" to="/maintenance/new">{translate("reportIssue")}</Link>
      </div>

      <VanaraSummaryGrid
        ariaLabel={translate("maintenanceSummary")}
        className="maintenance-summary"
        items={summaryItems}
      />

      <section className="maintenance-section" aria-labelledby="maintenance-active-tickets">
        <VanaraSectionHeader
          eyebrow={translate("maintenance")}
          headingId="maintenance-active-tickets"
          meta={translate("activeCount", { count: activeTickets.length })}
          title={translate("activeMaintenanceTickets")}
        />
        <div ref={containerRef} className="maintenance-ticket-list vc-glass-list">
          {activeTickets.length > 0 ? activeTickets.map((ticket) => (
            <TicketCard
              expanded={activeExpandedTicketId === ticket.id}
              key={ticket.id}
              language={language}
              onToggle={() => setExpandedTicketId((current) => (current === ticket.id ? null : ticket.id))}
              ticket={ticket}
              translate={translate}
            />
          )) : (
            <div className="maintenance-empty">
              <strong>{translate("noActiveTickets")}</strong>
              <p>{translate("createTicketWhenPhysical")}</p>
            </div>
          )}
        </div>
      </section>
    </WorkspaceShell>
  );
}
