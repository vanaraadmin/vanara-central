import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { loadMaintenanceTickets } from "../services/maintenance.service";
import type { MaintenancePriority, MaintenanceStatus, MaintenanceTicketSummary } from "../types/maintenance";
import "../styles/MaintenancePage.css";

function statusLabel(status: MaintenanceStatus | "All") {
  return status;
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

function TicketCard({ ticket }: { ticket: MaintenanceTicketSummary }) {
  return (
    <Link className={`maintenance-ticket priority-${priorityTone(ticket.priority)} status-${ticket.status.toLowerCase().replaceAll(" ", "-")}`} to={`/maintenance/${ticket.id}`}>
      <div className="maintenance-ticket__top">
        <strong>{ticket.title}</strong>
        {ticket.outOfService && <span>Blocking</span>}
      </div>
      <div className="maintenance-ticket__meta">
        <span>{locationLabel(ticket)}</span>
        <span>{ticket.priority}</span>
        <span>{statusLabel(ticket.status)}</span>
        <span>{assignmentLabel(ticket)}</span>
      </div>
    </Link>
  );
}

function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export default function MaintenancePage() {
  const [params] = useSearchParams();
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
  const completedToday = useMemo(() => tickets.filter((ticket) => ticket.status === "Completed" && ticket.closedAt?.startsWith(todayBangkok())).length, [tickets]);
  const summary = [
    { label: "Open", value: activeTickets.filter((ticket) => ticket.status === "Open").length },
    { label: "In Progress", value: activeTickets.filter((ticket) => ticket.status === "In Progress").length },
    { label: "Waiting Parts", value: activeTickets.filter((ticket) => ticket.status === "Waiting Parts").length },
    { label: "Completed Today", value: completedToday },
  ];

  if (query.isLoading) return <WorkspaceShell title="Maintenance" workspace="maintenance"><PageLoading /></WorkspaceShell>;
  if (query.isError) return <WorkspaceShell title="Maintenance" workspace="maintenance"><PageError onRetry={() => void query.refetch()} /></WorkspaceShell>;

  return (
    <WorkspaceShell title="Maintenance" workspace="maintenance" bodyClassName="maintenance-page">
      <div className="workspace-body-actions">
        <span>{activeTickets.length} active issue{activeTickets.length === 1 ? "" : "s"}</span>
        <Link to="/maintenance/new">New Ticket</Link>
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
        {activeTickets.length > 0 ? activeTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />) : (
          <div className="maintenance-empty">
            <h2>No active tickets</h2>
            <p>Create a ticket when something physical needs attention.</p>
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}
