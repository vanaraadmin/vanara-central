import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { loadMaintenanceTickets } from "../services/maintenance.service";
import type { MaintenancePriority, MaintenanceStatus, MaintenanceTicketSummary } from "../types/maintenance";
import "../styles/MaintenancePage.css";

const statuses: Array<MaintenanceStatus | "All"> = ["All", "Open", "Assigned", "In Progress", "Waiting Parts", "Resolved", "Closed"];

function statusLabel(status: MaintenanceStatus | "All") {
  return status === "Waiting Parts" ? "Waiting" : status;
}

function locationLabel(ticket: MaintenanceTicketSummary) {
  return ticket.roomName ?? ticket.locationArea ?? ticket.accommodationName ?? "General Resort Area";
}

function assignmentLabel(ticket: MaintenanceTicketSummary) {
  if (ticket.assignment.type === "INTERNAL") return ticket.assignment.assignedUserName ?? "Internal maintenance";
  if (ticket.assignment.type === "EXTERNAL") return `External: ${ticket.assignment.externalAssigneeLabel}`;
  return "Unassigned";
}

function priorityTone(priority: MaintenancePriority): string {
  return priority.toLowerCase().replace(" ", "-");
}

function TicketCard({ ticket }: { ticket: MaintenanceTicketSummary }) {
  return (
    <Link className={`maintenance-ticket priority-${priorityTone(ticket.priority)} status-${ticket.status.toLowerCase().replaceAll(" ", "-")}`} to={`/maintenance/${ticket.id}`}>
      <div className="maintenance-ticket__top">
        <span>{ticket.category}</span>
        <strong>{ticket.priority}</strong>
      </div>
      <h2>{ticket.title}</h2>
      <p>{ticket.description}</p>
      <div className="maintenance-ticket__meta">
        <span>{statusLabel(ticket.status)}</span>
        <span>{assignmentLabel(ticket)}</span>
        <span>{locationLabel(ticket)}</span>
        {ticket.outOfService && <span>Out of Service</span>}
      </div>
      <div className="maintenance-ticket__foot">
        <span>{ticket.noteCount} notes</span>
        <span>{ticket.photoCount} photos</span>
      </div>
    </Link>
  );
}

export default function MaintenancePage() {
  const [params] = useSearchParams();
  const priorityParam = params.get("priority") as MaintenancePriority | null;
  const outOfServiceParam = params.get("outOfService") === "1";
  const statusParam = params.get("status") as MaintenanceStatus | "All" | null;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MaintenanceStatus | "All">(statusParam && statuses.includes(statusParam) ? statusParam : "All");
  const query = useQuery({
    queryKey: ["maintenance", "tickets", search, status],
    queryFn: ({ signal }) => loadMaintenanceTickets({ search, status }, signal),
  });
  const tickets = useMemo(() => (query.data ?? []).filter((ticket) => {
    if (priorityParam && ticket.priority !== priorityParam) return false;
    if (outOfServiceParam && !ticket.outOfService) return false;
    return true;
  }), [outOfServiceParam, priorityParam, query.data]);
  const openCount = useMemo(() => tickets.filter((ticket) => !["Resolved", "Closed"].includes(ticket.status)).length, [tickets]);

  if (query.isLoading) return <WorkspaceShell title="Maintenance" workspace="maintenance"><PageLoading /></WorkspaceShell>;
  if (query.isError) return <WorkspaceShell title="Maintenance" workspace="maintenance"><PageError onRetry={() => void query.refetch()} /></WorkspaceShell>;

  return (
    <WorkspaceShell title="Maintenance" workspace="maintenance" bodyClassName="maintenance-page">
      <div className="workspace-body-actions">
        <span>{openCount} active issue{openCount === 1 ? "" : "s"}</span>
        <Link to="/maintenance/new">New Ticket</Link>
      </div>

      <section className="maintenance-controls" aria-label="Maintenance filters">
        <label>
          <span>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Room, issue, technician…" />
        </label>
        <div className="maintenance-filter-row">
          {statuses.map((option) => (
            <button key={option} className={option === status ? "is-active" : ""} type="button" onClick={() => setStatus(option)}>{statusLabel(option)}</button>
          ))}
        </div>
      </section>

      <section className="maintenance-list" aria-label="Maintenance tickets">
        {tickets.length > 0 ? tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />) : (
          <div className="maintenance-empty">
            <span aria-hidden="true">🔧</span>
            <h2>No tickets found</h2>
            <p>Create a ticket when something needs attention.</p>
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}
