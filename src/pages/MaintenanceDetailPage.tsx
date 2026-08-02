import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { addMaintenanceNote, addMaintenancePhoto, assignMaintenanceTicket, loadMaintenanceAssignableUsers, loadMaintenanceTicket, transitionMaintenanceTicket, updateMaintenanceOutOfService, updateMaintenanceTicket } from "../services/maintenance.service";
import type { MaintenancePriority, MaintenanceStatus, MaintenanceTicketDetail } from "../types/maintenance";
import "../styles/MaintenancePage.css";

const statuses: MaintenanceStatus[] = ["Open", "In Progress", "Waiting Parts", "Completed"];
const priorities: MaintenancePriority[] = ["Low", "Normal", "High"];
const nextStatuses: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  Open: ["In Progress"],
  "In Progress": ["Waiting Parts", "Completed"],
  "Waiting Parts": ["In Progress", "Completed"],
  Completed: [],
};

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function locationLabel(ticket: MaintenanceTicketDetail) {
  return ticket.roomName ?? ticket.locationArea ?? ticket.accommodationName ?? "General Resort Area";
}

function assignmentLabel(ticket: MaintenanceTicketDetail) {
  if (ticket.assignment.type === "INTERNAL") return ticket.assignment.assignedUserName ?? "Maintenance";
  return "Unassigned";
}

function StatusPanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  const [reason, setReason] = useState(ticket.waitingReason ?? "");
  const queryClient = useQueryClient();
  const visibleStatuses = statuses.filter((status) => status === ticket.status || nextStatuses[ticket.status].includes(status));
  const mutation = useMutation({
    mutationFn: (status: MaintenanceStatus) => transitionMaintenanceTicket(ticket.id, status, status === "Waiting Parts" ? reason : null),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "ticket", ticket.id] }),
        queryClient.invalidateQueries({ queryKey: ["maintenance", "tickets"] }),
      ]);
    },
  });

  return (
    <section className="maintenance-panel">
      <h2>Status</h2>
      <label className="maintenance-waiting-reason">
        Waiting reason
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for Waiting Parts" rows={2} />
      </label>
      <div className="maintenance-status-actions">
        {visibleStatuses.map((status) => (
          <button key={status} className={status === ticket.status ? "is-active" : ""} type="button" onClick={() => mutation.mutate(status)} disabled={mutation.isPending || status === ticket.status}>{status}</button>
        ))}
      </div>
      {mutation.isError && <p className="maintenance-form-error">Status could not be changed.</p>}
    </section>
  );
}

function AssignmentPanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  const [assignedUserId, setAssignedUserId] = useState(ticket.assignment.assignedUserId ?? "");
  const queryClient = useQueryClient();
  const assignable = useQuery({ queryKey: ["maintenance", "assignable-users"], queryFn: ({ signal }) => loadMaintenanceAssignableUsers(signal) });
  const mutation = useMutation({
    mutationFn: () => assignMaintenanceTicket(ticket.id, assignedUserId ? { assignmentType: "INTERNAL", assignedUserId } : { assignmentType: null }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "ticket", ticket.id] }),
        queryClient.invalidateQueries({ queryKey: ["maintenance", "tickets"] }),
      ]);
    },
  });
  const users = assignable.data?.users ?? [];

  return (
    <section className="maintenance-panel">
      <h2>Assignment</h2>
      <p className="maintenance-muted">{assignmentLabel(ticket)}</p>
      {users.length > 0 ? (
        <div className="maintenance-inline-form maintenance-inline-form--stacked">
          <label>
            Maintenance staff
            <select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}>
              <option value="">Unassigned</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save Assignment</button>
        </div>
      ) : (
        <p className="maintenance-muted">No active Maintenance user available.</p>
      )}
      {mutation.isError && <p className="maintenance-form-error">Assignment not saved.</p>}
    </section>
  );
}

function PriorityPanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (priority: MaintenancePriority) => updateMaintenanceTicket(ticket.id, { priority }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "ticket", ticket.id] });
    },
  });

  return (
    <section className="maintenance-panel">
      <h2>Priority</h2>
      <div className="maintenance-status-actions">
        {priorities.map((priority) => (
          <button key={priority} className={priority === ticket.priority ? "is-active" : ""} type="button" onClick={() => mutation.mutate(priority)} disabled={mutation.isPending || priority === ticket.priority}>{priority}</button>
        ))}
      </div>
      {mutation.isError && <p className="maintenance-form-error">Priority not saved.</p>}
    </section>
  );
}

function OutOfServicePanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (outOfService: boolean) => updateMaintenanceOutOfService(ticket.id, outOfService),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "ticket", ticket.id] }),
        queryClient.invalidateQueries({ queryKey: ["room-detail"] }),
      ]);
    },
  });
  if (!ticket.roomId) return null;
  return (
    <section className="maintenance-panel">
      <h2>Blocking</h2>
      <p className="maintenance-muted">{ticket.outOfService ? "Room is Out of Service." : "Ticket does not block the room."}</p>
      <button type="button" className={ticket.outOfService ? "is-active" : ""} disabled={mutation.isPending} onClick={() => mutation.mutate(!ticket.outOfService)}>
        {ticket.outOfService ? "Remove Blocking" : "Mark Blocking"}
      </button>
      {mutation.isError && <p className="maintenance-form-error">Blocking state not changed.</p>}
    </section>
  );
}

function NotesPanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => addMaintenanceNote(ticket.id, body),
    onSuccess: async () => {
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "ticket", ticket.id] });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <section className="maintenance-panel">
      <h2>Notes</h2>
      <form className="maintenance-note-form" onSubmit={submit}>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} placeholder="Add an operational note" />
        <button type="submit" disabled={!body.trim() || mutation.isPending}>Add Note</button>
      </form>
      <div className="maintenance-timeline-list">
        {ticket.notes.length ? ticket.notes.map((note) => (
          <article key={note.id}>
            <strong>{note.authorName}</strong>
            <span>{formatDate(note.createdAt)}</span>
            <p>{note.body}</p>
          </article>
        )) : <p className="maintenance-muted">No notes yet.</p>}
      </div>
    </section>
  );
}

function PhotosPanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  const [reference, setReference] = useState("");
  const [caption, setCaption] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => addMaintenancePhoto(ticket.id, { localReference: reference, caption }),
    onSuccess: async () => {
      setReference("");
      setCaption("");
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "ticket", ticket.id] });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reference.trim() || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <section className="maintenance-panel">
      <h2>Photos</h2>
      <form className="maintenance-note-form" onSubmit={submit}>
        <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Photo reference" />
        <input value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Caption optional" />
        <button type="submit" disabled={!reference.trim() || mutation.isPending}>Attach Photo</button>
      </form>
      <div className="maintenance-photo-grid">
        {ticket.photos.length ? ticket.photos.map((photo) => (
          <article key={photo.id}>
            <strong>{photo.caption ?? "Maintenance photo"}</strong>
            <p>{photo.localReference ?? photo.url}</p>
          </article>
        )) : <p className="maintenance-muted">No photos attached.</p>}
      </div>
    </section>
  );
}

export default function MaintenanceDetailPage() {
  const ticketId = Number(useParams().issueId);
  const query = useQuery({
    queryKey: ["maintenance", "ticket", ticketId],
    queryFn: ({ signal }) => loadMaintenanceTicket(ticketId, signal),
    enabled: Number.isInteger(ticketId) && ticketId > 0,
  });

  if (query.isLoading) return <WorkspaceShell title="Maintenance" workspace="maintenance"><PageLoading /></WorkspaceShell>;
  if (query.isError || !Number.isInteger(ticketId) || ticketId <= 0) return <WorkspaceShell title="Maintenance" workspace="maintenance"><PageError onRetry={() => void query.refetch()} /></WorkspaceShell>;
  if (!query.data) return <WorkspaceShell title="Maintenance" workspace="maintenance"><PageError onRetry={() => void query.refetch()} /></WorkspaceShell>;
  const ticket = query.data;

  return (
    <WorkspaceShell title="Maintenance" workspace="maintenance" bodyClassName="maintenance-page maintenance-detail-page">
      <section className={`maintenance-detail-hero priority-${ticket.priority.toLowerCase()}`}>
        <Link to="/maintenance">Back</Link>
        <p>{ticket.status}</p>
        <h1>{ticket.title}</h1>
        <div>
          <span>{ticket.priority}</span>
          <span>{locationLabel(ticket)}</span>
          <span>{assignmentLabel(ticket)}</span>
          {ticket.outOfService && <span>Blocking</span>}
        </div>
      </section>

      <section className="maintenance-panel">
        <h2>Description</h2>
        <p>{ticket.description}</p>
        <dl className="maintenance-facts">
          <div><dt>Reported by</dt><dd>{ticket.reportedByName}</dd></div>
          <div><dt>Created</dt><dd>{formatDate(ticket.createdAt)}</dd></div>
          <div><dt>Updated</dt><dd>{formatDate(ticket.updatedAt)}</dd></div>
          <div><dt>Completed</dt><dd>{formatDate(ticket.closedAt)}</dd></div>
        </dl>
        {ticket.waitingReason && <p className="maintenance-muted">Waiting Parts: {ticket.waitingReason}</p>}
      </section>

      <StatusPanel ticket={ticket} />
      <PriorityPanel ticket={ticket} />
      <AssignmentPanel ticket={ticket} />
      <OutOfServicePanel ticket={ticket} />
      <PhotosPanel ticket={ticket} />
      <NotesPanel ticket={ticket} />

      <section className="maintenance-panel">
        <h2>Timeline</h2>
        <div className="maintenance-timeline-list">
          {ticket.timeline.length ? ticket.timeline.map((event) => (
            <article key={event.id}>
              <strong>{event.eventType.replaceAll("_", " ")}</strong>
              <span>{formatDate(event.createdAt)}</span>
              {(event.fromValue || event.toValue) && <p>{event.fromValue ?? "-"} {"->"} {event.toValue ?? "-"}</p>}
            </article>
          )) : <p className="maintenance-muted">No timeline events yet.</p>}
        </div>
      </section>
    </WorkspaceShell>
  );
}
