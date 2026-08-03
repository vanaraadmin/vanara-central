import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { MaintenancePhotoGallery } from "../components/MaintenancePhotoGallery";
import { AlertIcon, MaintenanceIcon } from "../components/OperationsIcons";
import VanaraDataGrid from "../components/vanara/VanaraDataGrid";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraGlassSheet from "../components/vanara/VanaraGlassSheet";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import WorkspaceShell from "../components/WorkspaceShell";
import { assignMaintenanceTicket, loadMaintenanceAssignableUsers, loadMaintenanceTicket, transitionMaintenanceTicket, updateMaintenanceOutOfService, updateMaintenanceTicket } from "../services/maintenance.service";
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

function displayStatus(status: MaintenanceStatus) {
  return status.toUpperCase();
}

function displayPriority(priority: MaintenancePriority) {
  return priority.toUpperCase();
}

function locationLabel(ticket: MaintenanceTicketDetail) {
  return ticket.roomName ?? ticket.locationArea ?? ticket.accommodationName ?? "General Resort Area";
}

function assignmentLabel(ticket: MaintenanceTicketDetail) {
  if (ticket.assignment.type === "INTERNAL") return ticket.assignment.assignedUserName ?? "Maintenance";
  return "Unassigned";
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
    <VanaraGlassRegion ariaLabelledBy="maintenance-status-title" className="maintenance-region">
      <VanaraSectionHeader eyebrow="State" headingId="maintenance-status-title" title="Status" />
      <div className="vc-operational-state">
        <span className="vc-operational-state__label">Current state</span>
        <strong className={`vc-operational-state__value vc-state-${statusTone(ticket.status, ticket.outOfService)}`}>{displayStatus(ticket.status)}</strong>
        {ticket.waitingReason ? <p className="vc-operational-state__description">{ticket.waitingReason}</p> : null}
      </div>
      <label className="maintenance-waiting-reason">
        <span>Waiting reason</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for Waiting Parts" rows={2} />
      </label>
      <div className="maintenance-status-actions">
        {visibleStatuses.map((status) => (
          <button key={status} className={status === ticket.status ? "vc-primary-action is-active" : "vc-secondary-action"} type="button" onClick={() => mutation.mutate(status)} disabled={mutation.isPending || status === ticket.status}>{displayStatus(status)}</button>
        ))}
      </div>
      {mutation.isError && <p className="maintenance-form-error">Status could not be changed.</p>}
    </VanaraGlassRegion>
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
    <VanaraGlassRegion ariaLabelledBy="maintenance-assignment-title" className="maintenance-region">
      <VanaraSectionHeader eyebrow="Assignment" headingId="maintenance-assignment-title" title="Assigned To" />
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
          <button className="vc-primary-action" type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save</button>
        </div>
      ) : (
        <p className="maintenance-muted">No active Maintenance user available.</p>
      )}
      {mutation.isError && <p className="maintenance-form-error">Assignment not saved.</p>}
    </VanaraGlassRegion>
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
    <VanaraGlassRegion ariaLabelledBy="maintenance-priority-title" className="maintenance-region">
      <VanaraSectionHeader eyebrow="Issue" headingId="maintenance-priority-title" title="Priority" />
      <div className="maintenance-status-actions">
        {priorities.map((priority) => (
          <button key={priority} className={priority === ticket.priority ? "vc-primary-action is-active" : "vc-secondary-action"} type="button" onClick={() => mutation.mutate(priority)} disabled={mutation.isPending || priority === ticket.priority}>{displayPriority(priority)}</button>
        ))}
      </div>
      {mutation.isError && <p className="maintenance-form-error">Priority not saved.</p>}
    </VanaraGlassRegion>
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
  return (
    <VanaraGlassRegion ariaLabelledBy="maintenance-blocking-title" className="maintenance-region">
      <VanaraSectionHeader eyebrow="Room Impact" headingId="maintenance-blocking-title" title="Blocking" />
      <p className="maintenance-muted">{ticket.roomId ? ticket.outOfService ? "Room is Out of Service." : "Ticket does not block the room." : ticket.outOfService ? "Blocking is Maintenance-only for this area." : "Ticket does not block room operations."}</p>
      <button type="button" className={ticket.outOfService ? "vc-primary-action is-active" : "vc-secondary-action"} disabled={mutation.isPending} onClick={() => mutation.mutate(!ticket.outOfService)}>
        {ticket.outOfService ? "Remove Blocking" : "Mark Blocking"}
      </button>
      {mutation.isError && <p className="maintenance-form-error">Blocking state not changed.</p>}
    </VanaraGlassRegion>
  );
}

function PhotosPanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  return (
    <VanaraGlassRegion ariaLabelledBy="maintenance-photos-title" className="maintenance-region">
      <VanaraSectionHeader eyebrow="Evidence" headingId="maintenance-photos-title" title="Photos" />
      <MaintenancePhotoGallery photos={ticket.photos} />
    </VanaraGlassRegion>
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
      <div className="workspace-body-actions">
        <span>{displayStatus(ticket.status)}</span>
        <Link className="vc-secondary-action" to="/maintenance">Back</Link>
      </div>

      <VanaraGlassSheet ariaLabel={`${ticket.title} maintenance ticket`} className={`maintenance-detail-sheet priority-${ticket.priority.toLowerCase()}`}>
        <header className="maintenance-sheet-identity">
          <div className="maintenance-sheet-identity__icon" aria-hidden="true">
            {ticket.outOfService ? <AlertIcon /> : <MaintenanceIcon />}
          </div>
          <div className="maintenance-sheet-identity__content">
            <span>{ticket.category}</span>
            <h1>{ticket.title}</h1>
            <p>{locationLabel(ticket)}</p>
            <small>{assignmentLabel(ticket)} - {formatDate(ticket.createdAt)}</small>
          </div>
        </header>

        <VanaraGlassRegion ariaLabelledBy="maintenance-description-title" className="maintenance-region">
          <VanaraSectionHeader eyebrow="Issue" headingId="maintenance-description-title" title="Description" />
          <p>{ticket.description}</p>
          {ticket.waitingReason && <p className="maintenance-muted">Waiting Parts: {ticket.waitingReason}</p>}
          <VanaraDataGrid
            ariaLabel="Maintenance issue facts"
            items={[
              { label: "Category", value: ticket.category },
              { label: "Priority", tone: priorityStateTone(ticket.priority, ticket.outOfService), value: displayPriority(ticket.priority) },
              { label: "Status", tone: statusTone(ticket.status, ticket.outOfService), value: displayStatus(ticket.status) },
              { label: "Assigned To", value: assignmentLabel(ticket) },
              { label: "Target", value: locationLabel(ticket) },
              { label: "Blocking", tone: ticket.outOfService ? "critical" : "neutral", value: ticket.outOfService ? "Yes" : "No" },
            ]}
          />
        </VanaraGlassRegion>

        <StatusPanel ticket={ticket} />
        <PriorityPanel ticket={ticket} />
        <AssignmentPanel ticket={ticket} />
        <OutOfServicePanel ticket={ticket} />
        <PhotosPanel ticket={ticket} />

        <VanaraGlassRegion ariaLabelledBy="maintenance-timeline-title" className="maintenance-region">
          <VanaraSectionHeader eyebrow="History" headingId="maintenance-timeline-title" title="Timeline" />
          <div className="maintenance-timeline-list">
            {ticket.timeline.length ? ticket.timeline.map((event) => (
              <article className="maintenance-event-row" key={event.id}>
                <div>
                  <strong>{event.eventType.replaceAll("_", " ")}</strong>
                  {(event.fromValue || event.toValue) && <p>{event.fromValue ?? "-"} {"->"} {event.toValue ?? "-"}</p>}
                </div>
                <span>{formatDate(event.createdAt)}</span>
              </article>
            )) : <p className="maintenance-muted">No timeline events yet.</p>}
          </div>
        </VanaraGlassRegion>
      </VanaraGlassSheet>
    </WorkspaceShell>
  );
}
