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
import "../styles/MaintenancePage.css";

function displayStatus(status: MaintenanceStatus | "All") {
  return status.toUpperCase();
}

function displayPriority(priority: MaintenancePriority) {
  return priority.toUpperCase();
}

function locationLabel(ticket: MaintenanceTicketSummary) {
  return ticket.roomName ?? ticket.locationArea ?? ticket.accommodationName ?? "General Resort Area";
}

function assignmentLabel(ticket: MaintenanceTicketSummary) {
  if (ticket.assignment.type === "INTERNAL") return ticket.assignment.assignedUserName ?? "Maintenance";
  return "Unassigned";
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

function creationDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function summaryTone(label: string, value: number): VanaraSummaryItem["tone"] {
  if (value === 0) return "clean";
  if (label === "Open" || label === "Waiting Parts") return "warning";
  if (label === "In Progress") return "progress";
  return "clean";
}

function TicketCard({
  expanded,
  onToggle,
  ticket,
}: {
  expanded: boolean;
  onToggle: () => void;
  ticket: MaintenanceTicketSummary;
}) {
  const detailId = `maintenance-ticket-${ticket.id}-details`;
  const tone = statusTone(ticket.status, ticket.outOfService);
  const target = locationLabel(ticket);

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
          <strong className={`vc-state-${tone}`}>{ticket.outOfService ? "Blocking" : displayStatus(ticket.status)}</strong>
          <span>{displayPriority(ticket.priority)} - {assignmentLabel(ticket)}</span>
          <time dateTime={ticket.createdAt}>{creationDate(ticket.createdAt)}</time>
        </span>
        <span className="maintenance-ticket-row__chevron" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>

      {expanded && (
        <div className="maintenance-ticket-expanded-content" id={detailId}>
          <VanaraGlassSheet ariaLabel={`${ticket.title} details`} className="maintenance-ticket-sheet">
            <header className="maintenance-sheet-identity">
              <div className="maintenance-sheet-identity__icon" aria-hidden="true">
                {ticket.outOfService ? <AlertIcon /> : <MaintenanceIcon />}
              </div>
              <div className="maintenance-sheet-identity__content">
                <span>{ticket.category}</span>
                <h2>{ticket.title}</h2>
                <p>{target}</p>
                <small>{assignmentLabel(ticket)} - {creationDate(ticket.createdAt)}</small>
              </div>
            </header>

            <VanaraGlassRegion ariaLabelledBy={`maintenance-ticket-state-${ticket.id}`} className="maintenance-region">
              <VanaraSectionHeader
                eyebrow="Maintenance"
                headingId={`maintenance-ticket-state-${ticket.id}`}
                title="Current State"
              />
              <div className="vc-operational-state">
                <span className="vc-operational-state__label">Current state</span>
                <strong className={`vc-operational-state__value vc-state-${tone}`}>{ticket.outOfService ? "Blocking" : displayStatus(ticket.status)}</strong>
                <p className="vc-operational-state__description">{ticket.waitingReason ?? ticket.description}</p>
              </div>
            </VanaraGlassRegion>

            <VanaraGlassRegion ariaLabelledBy={`maintenance-ticket-facts-${ticket.id}`} className="maintenance-region">
              <VanaraSectionHeader
                eyebrow="Issue"
                headingId={`maintenance-ticket-facts-${ticket.id}`}
                title="Issue"
              />
              <VanaraDataGrid
                ariaLabel={`${ticket.title} issue facts`}
                items={[
                  { label: "Category", value: ticket.category },
                  { label: "Priority", tone: priorityStateTone(ticket.priority, ticket.outOfService), value: displayPriority(ticket.priority) },
                  { label: "Status", tone, value: displayStatus(ticket.status) },
                  { label: "Assigned To", value: assignmentLabel(ticket) },
                  { label: "Target", value: target },
                  { label: "Photos", value: ticket.photoCount },
                ]}
              />
            </VanaraGlassRegion>

            <VanaraGlassRegion ariaLabelledBy={`maintenance-ticket-actions-${ticket.id}`} className="maintenance-region">
              <VanaraSectionHeader
                eyebrow="Actions"
                headingId={`maintenance-ticket-actions-${ticket.id}`}
                title="Actions"
              />
              <Link className="vc-primary-action maintenance-open-issue" to={`/maintenance/${ticket.id}`}>Open issue</Link>
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
    { label: "Open", value: activeTickets.filter((ticket) => ticket.status === "Open").length },
    { label: "In Progress", value: activeTickets.filter((ticket) => ticket.status === "In Progress").length },
    { label: "Waiting Parts", value: activeTickets.filter((ticket) => ticket.status === "Waiting Parts").length },
    { label: "Completed Today", value: completedToday },
  ] satisfies Array<{ label: string; value: number }>;
  const summaryItems = summary.map((item) => ({ ...item, tone: summaryTone(item.label, item.value) }));

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

  if (query.isLoading) return <WorkspaceShell title="Maintenance" workspace="maintenance"><PageLoading /></WorkspaceShell>;
  if (query.isError) return <WorkspaceShell title="Maintenance" workspace="maintenance"><PageError onRetry={() => void query.refetch()} /></WorkspaceShell>;

  return (
    <WorkspaceShell title="Maintenance" workspace="maintenance" bodyClassName="maintenance-page">
      <div className="workspace-body-actions">
        <span>{activeTickets.length} active issue{activeTickets.length === 1 ? "" : "s"}</span>
        <Link className="vc-primary-action" to="/maintenance/new">Report Issue</Link>
      </div>

      <VanaraSummaryGrid
        ariaLabel="Maintenance summary"
        className="maintenance-summary"
        items={summaryItems}
      />

      <section className="maintenance-section" aria-labelledby="maintenance-active-tickets">
        <VanaraSectionHeader
          eyebrow="Maintenance"
          headingId="maintenance-active-tickets"
          meta={`${activeTickets.length} active`}
          title="Active Tickets"
        />
        <div ref={containerRef} className="maintenance-ticket-list vc-glass-list">
          {activeTickets.length > 0 ? activeTickets.map((ticket) => (
            <TicketCard
              expanded={activeExpandedTicketId === ticket.id}
              key={ticket.id}
              onToggle={() => setExpandedTicketId((current) => (current === ticket.id ? null : ticket.id))}
              ticket={ticket}
            />
          )) : (
            <div className="maintenance-empty">
              <strong>No active tickets</strong>
              <p>Create a ticket when something physical needs attention.</p>
            </div>
          )}
        </div>
      </section>
    </WorkspaceShell>
  );
}
