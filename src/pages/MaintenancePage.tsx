import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageError, PageLoading } from "../components/AsyncState";
import { loadMaintenanceTickets } from "../services/maintenance.service";
import type { MaintenancePriority, MaintenanceStatus, MaintenanceTicketSummary } from "../types/maintenance";
import "../styles/MaintenancePage.css";

const statuses: Array<MaintenanceStatus | "All"> = ["All", "Open", "Assigned", "In Progress", "Waiting Parts", "Resolved", "Closed"];

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
        <span>{ticket.status}</span>
        <span>{ticket.assignedUserName ?? "Unassigned"}</span>
        <span>{ticket.roomName ?? ticket.accommodationName ?? "No room"}</span>
      </div>
      <div className="maintenance-ticket__foot">
        <span>{ticket.noteCount} notes</span>
        <span>{ticket.photoCount} photos</span>
      </div>
    </Link>
  );
}

export default function MaintenancePage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MaintenanceStatus | "All">("All");
  const query = useQuery({
    queryKey: ["maintenance", "tickets", search, status],
    queryFn: ({ signal }) => loadMaintenanceTickets({ search, status }, signal),
  });
  const tickets = useMemo(() => query.data ?? [], [query.data]);
  const openCount = useMemo(() => tickets.filter((ticket) => !["Resolved", "Closed"].includes(ticket.status)).length, [tickets]);

  if (query.isLoading) return <PageLoading />;
  if (query.isError) return <PageError onRetry={() => void query.refetch()} />;

  return (
    <main className="maintenance-page">
      <header className="maintenance-hero">
        <div>
          <p>Maintenance</p>
          <h1>Operational Tickets</h1>
          <span>{openCount} active issue{openCount === 1 ? "" : "s"}</span>
        </div>
        <Link to="/maintenance/new">New Ticket</Link>
      </header>

      <section className="maintenance-controls" aria-label="Maintenance filters">
        <label>
          <span>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Room, issue, technician…" />
        </label>
        <div className="maintenance-filter-row">
          {statuses.map((option) => (
            <button key={option} className={option === status ? "is-active" : ""} type="button" onClick={() => setStatus(option)}>{option}</button>
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
    </main>
  );
}
