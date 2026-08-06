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
import { useLanguage } from "../providers/language.context";
import { translateStaffLabel } from "../utils/staff-i18n-labels";
import "../styles/MaintenancePage.css";

const statuses: MaintenanceStatus[] = ["Open", "In Progress", "Waiting Parts", "Completed"];
const priorities: MaintenancePriority[] = ["Low", "Normal", "High"];
const nextStatuses: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  Open: ["In Progress"],
  "In Progress": ["Waiting Parts", "Completed"],
  "Waiting Parts": ["In Progress", "Completed"],
  Completed: [],
};

type Translate = ReturnType<typeof useLanguage>["translate"];

function formatDate(value: string | null, language = "en", translate?: Translate) {
  if (!value) return translate ? translate("notAvailable") : "Not set";
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function displayStatus(status: MaintenanceStatus, translate: Translate) {
  return translateStaffLabel(status, translate);
}

function displayPriority(priority: MaintenancePriority, translate: Translate) {
  return translateStaffLabel(priority, translate);
}

function eventTypeLabel(eventType: string, translate: Translate): string {
  const labels: Record<string, string> = {
    STATUS_CHANGED: "maintenanceEventStatusChanged",
    ASSIGNED: "maintenanceEventAssigned",
    PRIORITY_CHANGED: "maintenanceEventPriorityChanged",
    BLOCKING_CHANGED: "maintenanceEventBlockingChanged",
  };
  return translate(labels[eventType] ?? "history");
}

function eventValue(eventType: string, value: string | null, translate: Translate): string {
  if (!value) return "-";
  if (eventType === "STATUS_CHANGED") return translateStaffLabel(value, translate);
  if (eventType === "PRIORITY_CHANGED") return translateStaffLabel(value, translate);
  if (eventType === "BLOCKING_CHANGED") return value === "true" || value === "1" || value === "on" ? translate("yes") : translate("no");
  return value;
}

function eventDescription(event: MaintenanceTicketDetail["timeline"][number], translate: Translate): string | null {
  if (event.eventType === "STATUS_CHANGED" && (event.fromValue || event.toValue)) {
    return translate("maintenanceStatusChangedFromTo", {
      from: eventValue(event.eventType, event.fromValue, translate),
      to: eventValue(event.eventType, event.toValue, translate),
    });
  }
  if (event.eventType === "ASSIGNED" && event.toValue) {
    return translate("maintenanceAssignedTo", { name: event.toValue });
  }
  if (event.eventType === "PRIORITY_CHANGED" && event.toValue) {
    return translate("maintenancePriorityChangedTo", { priority: eventValue(event.eventType, event.toValue, translate) });
  }
  if (event.eventType === "BLOCKING_CHANGED" && event.toValue) {
    return event.toValue === "true" || event.toValue === "1" || event.toValue === "on"
      ? translate("maintenanceBlockingOn")
      : translate("maintenanceBlockingOff");
  }
  if (event.fromValue || event.toValue) {
    return `${eventValue(event.eventType, event.fromValue, translate)} -> ${eventValue(event.eventType, event.toValue, translate)}`;
  }
  return null;
}

function locationLabel(ticket: MaintenanceTicketDetail, translate: Translate) {
  return ticket.roomName ?? ticket.locationArea ?? ticket.accommodationName ?? translate("generalResortArea");
}

function assignmentLabel(ticket: MaintenanceTicketDetail, translate: Translate) {
  if (ticket.assignment.type === "INTERNAL") return ticket.assignment.assignedUserName ?? translate("maintenance");
  return translate("unassigned");
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
  const { translate } = useLanguage();
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
      <VanaraSectionHeader eyebrow={translate("state")} headingId="maintenance-status-title" title={translate("status")} />
      <div className="vc-operational-state">
        <span className="vc-operational-state__label">{translate("currentState")}</span>
        <strong className={`vc-operational-state__value vc-state-${statusTone(ticket.status, ticket.outOfService)}`}>{displayStatus(ticket.status, translate)}</strong>
        {ticket.waitingReason ? <p className="vc-operational-state__description">{ticket.waitingReason}</p> : null}
      </div>
      <label className="maintenance-waiting-reason">
        <span>{translate("reason")}</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={translate("waitingParts")} rows={2} />
      </label>
      <div className="maintenance-status-actions">
        {visibleStatuses.map((status) => (
          <button key={status} className={status === ticket.status ? "vc-primary-action is-active" : "vc-secondary-action"} type="button" onClick={() => mutation.mutate(status)} disabled={mutation.isPending || status === ticket.status}>{displayStatus(status, translate)}</button>
        ))}
      </div>
      {mutation.isError && <p className="maintenance-form-error">{translate("statusCouldNotChange")}</p>}
    </VanaraGlassRegion>
  );
}

function AssignmentPanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  const { translate } = useLanguage();
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
      <VanaraSectionHeader eyebrow={translate("assignment")} headingId="maintenance-assignment-title" title={translate("assignedTo")} />
      <p className="maintenance-muted">{assignmentLabel(ticket, translate)}</p>
      {users.length > 0 ? (
        <div className="maintenance-inline-form maintenance-inline-form--stacked">
          <label>
            {translate("maintenance")}
            <select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}>
              <option value="">{translate("unassigned")}</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
            </select>
          </label>
          <button className="vc-primary-action" type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{translate("save")}</button>
        </div>
      ) : (
        <p className="maintenance-muted">{translate("noActiveMaintenanceUser")}</p>
      )}
      {mutation.isError && <p className="maintenance-form-error">{translate("assignmentNotSaved")}</p>}
    </VanaraGlassRegion>
  );
}

function PriorityPanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  const { translate } = useLanguage();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (priority: MaintenancePriority) => updateMaintenanceTicket(ticket.id, { priority }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "ticket", ticket.id] });
    },
  });

  return (
    <VanaraGlassRegion ariaLabelledBy="maintenance-priority-title" className="maintenance-region">
      <VanaraSectionHeader eyebrow={translate("issue")} headingId="maintenance-priority-title" title={translate("priority")} />
      <div className="maintenance-status-actions">
        {priorities.map((priority) => (
          <button key={priority} className={priority === ticket.priority ? "vc-primary-action is-active" : "vc-secondary-action"} type="button" onClick={() => mutation.mutate(priority)} disabled={mutation.isPending || priority === ticket.priority}>{displayPriority(priority, translate)}</button>
        ))}
      </div>
      {mutation.isError && <p className="maintenance-form-error">{translate("priorityNotSaved")}</p>}
    </VanaraGlassRegion>
  );
}

function OutOfServicePanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  const { translate } = useLanguage();
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
      <VanaraSectionHeader eyebrow={translate("roomImpact")} headingId="maintenance-blocking-title" title={translate("blocking")} />
      <p className="maintenance-muted">{ticket.roomId ? ticket.outOfService ? translate("roomOutOfService") : translate("ticketDoesNotBlockRoom") : ticket.outOfService ? translate("blockingMaintenanceOnly") : translate("ticketDoesNotBlockOperations")}</p>
      <button type="button" className={ticket.outOfService ? "vc-primary-action is-active" : "vc-secondary-action"} disabled={mutation.isPending} onClick={() => mutation.mutate(!ticket.outOfService)}>
        {ticket.outOfService ? translate("removeBlocking") : translate("markBlocking")}
      </button>
      {mutation.isError && <p className="maintenance-form-error">{translate("blockingStateNotChanged")}</p>}
    </VanaraGlassRegion>
  );
}

function PhotosPanel({ ticket }: { ticket: MaintenanceTicketDetail }) {
  const { translate } = useLanguage();
  return (
    <VanaraGlassRegion ariaLabelledBy="maintenance-photos-title" className="maintenance-region">
      <VanaraSectionHeader eyebrow={translate("evidence")} headingId="maintenance-photos-title" title={translate("photos")} />
      <MaintenancePhotoGallery photos={ticket.photos} />
    </VanaraGlassRegion>
  );
}

export default function MaintenanceDetailPage() {
  const { language, translate } = useLanguage();
  const ticketId = Number(useParams().issueId);
  const query = useQuery({
    queryKey: ["maintenance", "ticket", ticketId],
    queryFn: ({ signal }) => loadMaintenanceTicket(ticketId, signal),
    enabled: Number.isInteger(ticketId) && ticketId > 0,
  });

  if (query.isLoading) return <WorkspaceShell title={translate("maintenance")} workspace="maintenance"><PageLoading /></WorkspaceShell>;
  if (query.isError || !Number.isInteger(ticketId) || ticketId <= 0) return <WorkspaceShell title={translate("maintenance")} workspace="maintenance"><PageError onRetry={() => void query.refetch()} /></WorkspaceShell>;
  if (!query.data) return <WorkspaceShell title={translate("maintenance")} workspace="maintenance"><PageError onRetry={() => void query.refetch()} /></WorkspaceShell>;
  const ticket = query.data;

  return (
    <WorkspaceShell title={translate("maintenance")} workspace="maintenance" bodyClassName="maintenance-page maintenance-detail-page">
      <div className="workspace-body-actions">
        <span>{displayStatus(ticket.status, translate)}</span>
        <Link className="vc-secondary-action" to="/maintenance">{translate("back")}</Link>
      </div>

      <VanaraGlassSheet ariaLabel={translate("ticketDetails", { title: ticket.title })} className={`maintenance-detail-sheet priority-${ticket.priority.toLowerCase()}`}>
        <header className="vc-sheet-identity maintenance-sheet-identity">
          <div className="vc-sheet-identity__icon maintenance-sheet-identity__icon" aria-hidden="true">
            {ticket.outOfService ? <AlertIcon /> : <MaintenanceIcon />}
          </div>
          <div className="vc-sheet-identity__content maintenance-sheet-identity__content">
            <span className="vc-sheet-identity__eyebrow">{ticket.category}</span>
            <h1 className="vc-sheet-identity__title">{ticket.title}</h1>
            <p className="vc-sheet-identity__subtitle">{locationLabel(ticket, translate)}</p>
            <small className="vc-sheet-identity__meta">{assignmentLabel(ticket, translate)} - {formatDate(ticket.createdAt, language, translate)}</small>
          </div>
        </header>

        <VanaraGlassRegion ariaLabelledBy="maintenance-description-title" className="maintenance-region">
          <VanaraSectionHeader eyebrow={translate("issue")} headingId="maintenance-description-title" title={translate("description")} />
          <p>{ticket.description}</p>
          {ticket.waitingReason && <p className="maintenance-muted">{translate("waitingPartsReason", { reason: ticket.waitingReason })}</p>}
          <VanaraDataGrid
            ariaLabel={translate("issueFacts", { title: ticket.title })}
            items={[
              { label: translate("category"), value: ticket.category },
              { label: translate("priority"), tone: priorityStateTone(ticket.priority, ticket.outOfService), value: displayPriority(ticket.priority, translate) },
              { label: translate("status"), tone: statusTone(ticket.status, ticket.outOfService), value: displayStatus(ticket.status, translate) },
              { label: translate("assignedTo"), value: assignmentLabel(ticket, translate) },
              { label: translate("target"), value: locationLabel(ticket, translate) },
              { label: translate("blocking"), tone: ticket.outOfService ? "critical" : "neutral", value: ticket.outOfService ? translate("yes") : translate("no") },
            ]}
          />
        </VanaraGlassRegion>

        <StatusPanel ticket={ticket} />
        <PriorityPanel ticket={ticket} />
        <AssignmentPanel ticket={ticket} />
        <OutOfServicePanel ticket={ticket} />
        <PhotosPanel ticket={ticket} />

        <VanaraGlassRegion ariaLabelledBy="maintenance-timeline-title" className="maintenance-region">
          <VanaraSectionHeader eyebrow={translate("history")} headingId="maintenance-timeline-title" title={translate("timeline")} />
          <div className="maintenance-timeline-list">
            {ticket.timeline.length ? ticket.timeline.map((event) => (
              <article className="maintenance-event-row" key={event.id}>
                <div>
                  <strong>{eventTypeLabel(event.eventType, translate)}</strong>
                  {eventDescription(event, translate) ? <p>{eventDescription(event, translate)}</p> : null}
                </div>
                <span>{formatDate(event.createdAt, language, translate)}</span>
              </article>
            )) : <p className="maintenance-muted">{translate("noTimelineEvents")}</p>}
          </div>
        </VanaraGlassRegion>
      </VanaraGlassSheet>
    </WorkspaceShell>
  );
}
