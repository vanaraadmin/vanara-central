import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageError, PageLoading } from "../components/AsyncState";
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

function creationDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
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
}: {
  expanded: boolean;
  onToggle: () => void;
  ticket: MaintenanceTicketSummary;
}) {
  const detailId = `maintenance-ticket-${ticket.id}-details`;

  return (
    <article className={`maintenance-ticket priority-${priorityTone(ticket.priority)} status-${ticket.status.toLowerCase().replaceAll(" ", "-")}${expanded ? " is-expanded" : ""}`}>
      <button
        aria-controls={detailId}
        aria-expanded={expanded}
        className="maintenance-ticket__trigger"
        onClick={onToggle}
        type="button"
      >
        <span className="maintenance-ticket__title">{ticket.title}</span>
        <span>{locationLabel(ticket)}</span>
        <span>{displayPriority(ticket.priority)}</span>
        <span>{displayStatus(ticket.status)}</span>
        <span>{assignmentLabel(ticket)}</span>
        {ticket.outOfService && <strong>BLOCKING</strong>}
        <time dateTime={ticket.createdAt}>{creationDate(ticket.createdAt)}</time>
      </button>

      {expanded && (
        <div className="maintenance-ticket__details" id={detailId}>
          <p>{ticket.description}</p>
          <Link to={`/maintenance/${ticket.id}`}>Open issue</Link>
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
    if (outOfServiceParam && !ticket.outOfService) return false;
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
  ];

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
        <Link to="/maintenance/new">Report Issue</Link>
      </div>

      <section className="maintenance-summary" aria-label="Maintenance summary">
        {summary.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section className="maintenance-list" aria-label="Active maintenance tickets">
        <div ref={containerRef} className="maintenance-ticket-stack">
          {activeTickets.length > 0 ? activeTickets.map((ticket) => (
            <TicketCard
              expanded={activeExpandedTicketId === ticket.id}
              key={ticket.id}
              onToggle={() => setExpandedTicketId((current) => (current === ticket.id ? null : ticket.id))}
              ticket={ticket}
            />
          )) : (
            <div className="maintenance-empty">
              <h2>No active tickets</h2>
              <p>Create a ticket when something physical needs attention.</p>
            </div>
          )}
        </div>
      </section>
    </WorkspaceShell>
  );
}
