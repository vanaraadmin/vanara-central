import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import warningIcon from "../assets/img/warning-circle-light.svg";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { AskIcon, CalendarIcon, CheckIcon, CheckInIcon, HousekeepingIcon, MaintenanceIcon, PlusIcon, RefreshIcon, RoomIcon, UserIcon } from "../components/OperationsIcons";
import {
  completeHousekeepingTask,
  startHousekeepingTask,
} from "../services/housekeeping-v2.service";
import { addRoomNote, createRoomMaintenanceTicket, createRoomOnDemandCleaning, loadRoomDetail, resolveReceptionRoomAlert, updateRoomHousekeeping, updateRoomOperationalAvailability } from "../services/room-detail.service";
import type { MaintenancePriority } from "../types/maintenance";
import type { OperationalAvailabilityStatus, RoomCurrentStay, RoomDetail, RoomHousekeepingTask, RoomReadyState, RoomTimelineEvent } from "../types/room-detail";
import "../styles/RoomDetailPage.css";

const MAINTENANCE_PRIORITIES: MaintenancePriority[] = ["Low", "Normal", "High"];

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
  }).format(new Date(date + "T12:00:00+07:00"));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function checkoutLabel(room: RoomDetail): string {
  switch (room.checkoutCompletionSource) {
    case "reception":
      return "Checkout confirmed by Reception";
    case "automatic-fallback":
      return "Automatic checkout fallback";
    case "none":
      return "Checkout not completed";
  }
}

function statusTone(value: string): string {
  return value.toLowerCase().replaceAll(" ", "-");
}

function cleaningStateLabel(readyState: RoomReadyState): "CLEAN" | "DIRTY" {
  return readyState === "READY" ? "CLEAN" : "DIRTY";
}

function CurrentStay({ stay }: { stay: RoomCurrentStay | null }) {
  if (!stay) {
    return (
      <section className="room-section room-current-stay" aria-label="Guest information">
        <header><UserIcon /><h2>Guest Information</h2></header>
        <div className="room-empty-state">Vacant</div>
      </section>
    );
  }

  return (
    <section className="room-section room-current-stay" aria-label="Guest information">
      <header><UserIcon /><h2>Guest Information</h2></header>
      <article className="stay-card">
        <strong>{stay.guestName}</strong>
        <dl>
          <div><dt>Check-in</dt><dd>{formatDate(stay.arrival)}</dd></div>
          <div><dt>Check-out</dt><dd>{formatDate(stay.departure)}</dd></div>
          <div><dt>Adults</dt><dd>{stay.adults}</dd></div>
          <div><dt>Children</dt><dd>{stay.children}</dd></div>
          <div><dt>Source</dt><dd>{stay.bookingSource}</dd></div>
          <div><dt>Reference</dt><dd>{stay.bookingReference ?? "Not available"}</dd></div>
        </dl>
      </article>
    </section>
  );
}

function ReceptionPanel({ room }: { room: RoomDetail }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (alert: RoomDetail["reception"]["alerts"][number]) => resolveReceptionRoomAlert(alert),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["room-detail", String(room.unitId)] });
    },
  });

  return (
    <section className="room-section" aria-label="Reception summary">
      <header><CheckInIcon /><h2>Reception</h2></header>
      {room.reception.alerts.length > 0 && (
        <div className="room-alert-list" aria-label="Reception alerts">
          {room.reception.alerts.map((alert) => (
            <button disabled={mutation.isPending} key={alert.id} onClick={() => mutation.mutate(alert)} type="button">
              <img alt="" src={warningIcon} />
              <span>{alert.title}</span>
              <strong>{alert.actionLabel}</strong>
            </button>
          ))}
        </div>
      )}
      <div className="room-operation-card">
        {room.reception.guestSummary ? <strong>{room.reception.guestSummary}</strong> : <strong>No active guest</strong>}
        <dl>
          <div><dt>Arrival</dt><dd>{room.reception.arrival ? formatDate(room.reception.arrival) : "Not available"}</dd></div>
          <div><dt>Departure</dt><dd>{room.reception.departure ? formatDate(room.reception.departure) : "Not available"}</dd></div>
          <div><dt>Check-in</dt><dd>{room.reception.checkInStatus}</dd></div>
          <div><dt>Check-out</dt><dd>{room.reception.checkOutStatus}</dd></div>
          <div><dt>Passport</dt><dd>{room.reception.passportStatus}</dd></div>
          <div><dt>Deposit</dt><dd>{room.reception.depositStatus}</dd></div>
        </dl>
      </div>
      <div className="room-reception-notes">
        {room.reception.notes.length === 0 && <div className="room-empty-state">No reception notes</div>}
        {room.reception.notes.map((note) => <p key={note}>{note}</p>)}
      </div>
      {mutation.isError && <p className="room-form-error">Reception alert could not be completed.</p>}
    </section>
  );
}

function RoomHeader({ room }: { room: RoomDetail }) {
  return (
    <>
      <section className="room-hero-card" aria-label="Room status">
        <div>
          <span className={`room-status-badge is-${statusTone(room.roomStatus)}`}>{room.roomStatus}</span>
          <strong>{room.occupancyStatus}</strong>
          <small>{room.arrival ? `Arrival ${formatDate(room.arrival)}` : "No arrival in current stay"} · {room.departure ? `Departure ${formatDate(room.departure)}` : "No departure in current stay"}</small>
        </div>
        <RoomIcon />
      </section>
      <section className="room-badges" aria-label="Room badges">
        <span><RoomIcon />{room.operationalAvailability.label}</span>
        <span><RoomIcon />{room.occupancyStatus}</span>
        <span><HousekeepingIcon />{room.housekeeping.primaryStatus}</span>
        <span><CalendarIcon />{checkoutLabel(room)}</span>
      </section>
    </>
  );
}

function roomTaskCompletePayload(task: RoomHousekeepingTask) {
  if (task.taskType === "LINEN_CHANGE") return { linenChangeCompleted: true };
  if (task.taskType === "WATER_REFILL") return { waterRefillCompleted: true };
  return { standardCleaningCompleted: true };
}

function taskStatusLabel(task: RoomHousekeepingTask): string {
  if (task.status === "AVAILABLE_FOR_CLAIM") return "Available";
  if (task.status === "CLAIMED") return task.assignee ? `Assigned to ${task.assignee.name}` : "Assigned";
  if (task.status === "IN_PROGRESS") return "In progress";
  if (task.status === "WAITING_FOR_RECEPTION") return "Waiting Reception";
  if (task.status === "READY") return "Clean";
  return task.status.replaceAll("_", " ");
}

function RoomTaskActions({ action, task }: { action: ReturnType<typeof useRoomTaskAction>; task: RoomHousekeepingTask }) {
  const completeRegularTask = () => action.mutate(completeHousekeepingTask(task.id, task.version, roomTaskCompletePayload(task)));
  const completeCleaning = (includeLinen: boolean) => action.mutate(completeHousekeepingTask(task.id, task.version, { standardCleaningCompleted: true, linenChangeCompleted: includeLinen }));

  if (task.taskType === "WATER_REFILL") {
    return (
      <div className="room-task-actions" aria-label={`Actions for task ${task.id}`}>
        {task.capabilities.canComplete && (
          <button disabled={action.isPending} onClick={completeRegularTask} type="button">
            <CheckIcon />
            <span>Complete</span>
          </button>
        )}
      </div>
    );
  }

  if (task.capabilities.canStart) {
    return (
      <div className="room-task-actions" aria-label={`Actions for task ${task.id}`}>
        <button disabled={action.isPending} onClick={() => action.mutate(startHousekeepingTask(task.id, task.version))} type="button">Start</button>
      </div>
    );
  }

  if (task.capabilities.canComplete && task.taskType === "ON_DEMAND_CLEANING") {
    return (
      <div className="room-task-actions" aria-label={`Actions for task ${task.id}`}>
        <button disabled={action.isPending} onClick={() => completeCleaning(false)} type="button">Finish Cleaning</button>
        <button disabled={action.isPending} onClick={() => completeCleaning(true)} type="button">Finish Full Cleaning</button>
      </div>
    );
  }

  if (task.capabilities.canComplete && task.taskType === "STANDARD_CLEANING") {
    return (
      <div className="room-task-actions" aria-label={`Actions for task ${task.id}`}>
        <button disabled={action.isPending} onClick={() => completeCleaning(false)} type="button">Finish Cleaning</button>
        <button disabled={action.isPending} onClick={() => completeCleaning(true)} type="button">Finish Full Cleaning</button>
      </div>
    );
  }

  if (task.capabilities.canComplete) {
    return (
      <div className="room-task-actions" aria-label={`Actions for task ${task.id}`}>
        <button disabled={action.isPending} onClick={completeRegularTask} type="button">{task.taskType === "LINEN_CHANGE" || task.taskType === "TURNOVER" ? "Finish Full Cleaning" : "Finish Cleaning"}</button>
      </div>
    );
  }

  return null;
}

function useRoomTaskAction(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (next: Promise<unknown>) => next,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] }),
        queryClient.invalidateQueries({ queryKey: ["housekeeping-v2"] }),
      ]);
    },
  });
}

function OperationalAvailabilityPanel({ room, roomId }: { room: RoomDetail; roomId: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<OperationalAvailabilityStatus>(room.operationalAvailability.status);
  const [reason, setReason] = useState(room.operationalAvailability.reason ?? "");
  const [seasonalStart, setSeasonalStart] = useState(room.operationalAvailability.seasonalStart ?? "");
  const [seasonalEnd, setSeasonalEnd] = useState(room.operationalAvailability.seasonalEnd ?? "");
  const changed = status !== room.operationalAvailability.status
    || reason.trim() !== (room.operationalAvailability.reason ?? "")
    || seasonalStart.trim() !== (room.operationalAvailability.seasonalStart ?? "")
    || seasonalEnd.trim() !== (room.operationalAvailability.seasonalEnd ?? "");
  const mutation = useMutation({
    mutationFn: () => updateRoomOperationalAvailability(roomId, {
      status,
      reason: reason.trim() || null,
      seasonalStart: seasonalStart.trim() || null,
      seasonalEnd: seasonalEnd.trim() || null,
      idempotencyKey: `room-operational-availability:${room.unitId}:${status}:${Date.now()}`,
    }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] });
    },
  });

  return (
    <section className="room-section" aria-label="Operational availability">
      <header><RoomIcon /><h2>Operational Availability</h2></header>
      <div className="room-operation-card">
        <span className={`room-status-badge is-${statusTone(room.operationalAvailability.label)}`}>{room.operationalAvailability.label}</span>
        <dl>
          <div><dt>Reason</dt><dd>{room.operationalAvailability.reason ?? "None"}</dd></div>
          <div><dt>Season</dt><dd>{room.operationalAvailability.seasonalLabel ?? "Not seasonal"}</dd></div>
          <div><dt>Updated</dt><dd>{room.operationalAvailability.updatedAt ? formatDateTime(room.operationalAvailability.updatedAt) : "Baseline default"}</dd></div>
        </dl>
      </div>

      {room.operationalAvailability.canChange && (
        <form className="room-availability-form" onSubmit={(event) => {
          event.preventDefault();
          if (changed) mutation.mutate();
        }}>
          <div className="room-form-grid">
            <label>
              Operational Availability
              <select onChange={(event) => setStatus(event.target.value as OperationalAvailabilityStatus)} value={status}>
                <option value="OPERATING">Operating</option>
                <option value="NOT_OPERATING">Not Operating</option>
              </select>
            </label>
            <label>
              Reason
              <input maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Optional reason" value={reason} />
            </label>
            <label>
              Season Start
              <input maxLength={5} onChange={(event) => setSeasonalStart(event.target.value)} placeholder="06-01" value={seasonalStart} />
            </label>
            <label>
              Season End
              <input maxLength={5} onChange={(event) => setSeasonalEnd(event.target.value)} placeholder="11-20" value={seasonalEnd} />
            </label>
          </div>
          <button disabled={!changed || mutation.isPending} type="submit">Change Availability</button>
        </form>
      )}

      {mutation.isError && <p className="room-form-error">Operational availability could not be changed.</p>}
    </section>
  );
}

function RoomReadyControl({ room, roomId }: { room: RoomDetail; roomId: string }) {
  const queryClient = useQueryClient();
  const [readyState, setReadyState] = useState<RoomReadyState>(room.housekeeping.readyState);
  const [readyReason, setReadyReason] = useState("");
  const changed = readyState !== room.housekeeping.readyState;
  const changeReadyState = useMutation({
    mutationFn: () => updateRoomHousekeeping(roomId, {
      status: readyState,
      reason: readyReason.trim() || null,
      idempotencyKey: `room-ready:${room.unitId}:${readyState}:${Date.now()}`,
    }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] }),
        queryClient.invalidateQueries({ queryKey: ["housekeeping-v2"] }),
      ]);
    },
  });

  return (
    <>
      <form className="room-ready-form" onSubmit={(event) => {
        event.preventDefault();
        if (changed) changeReadyState.mutate();
      }}>
        <div className="room-form-grid">
          <label>
            Cleaning Status
            <select onChange={(event) => setReadyState(event.target.value as RoomReadyState)} value={readyState}>
              <option value="READY">CLEAN</option>
              <option value="NOT_READY">DIRTY</option>
            </select>
          </label>
          <label>
            Reason
            <textarea maxLength={500} onChange={(event) => setReadyReason(event.target.value)} placeholder="Optional reason" rows={2} value={readyReason} />
          </label>
        </div>
        <button disabled={!changed || changeReadyState.isPending} type="submit">Change Cleaning</button>
      </form>
      {changeReadyState.isError && <p className="room-form-error">Cleaning status could not be changed.</p>}
    </>
  );
}

function HousekeepingPanel({ room, roomId }: { room: RoomDetail; roomId: string }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const taskAction = useRoomTaskAction(roomId);
  const createOnDemand = useMutation({
    mutationFn: () => createRoomOnDemandCleaning(roomId, { note: note.trim() || null, priority: "normal" }),
    onSuccess: () => {
      setNote("");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] }),
        queryClient.invalidateQueries({ queryKey: ["housekeeping-v2"] }),
      ]);
    },
  });
  const hasOnDemand = room.housekeeping.tasks.some((task) => task.taskType === "ON_DEMAND_CLEANING");
  const canCreateOnDemand = room.housekeeping.canCreateOnDemandCleaning && Boolean(room.currentStay);

  return (
    <section className="room-section" aria-label="Housekeeping">
      <header><HousekeepingIcon /><h2>Housekeeping</h2></header>
      <div className="room-operation-card">
        <span className={`room-status-badge is-${room.housekeeping.primaryStatusTone}`}>{room.housekeeping.primaryStatus}</span>
        <dl>
          <div><dt>Assigned</dt><dd>{room.housekeeping.assignedTo ?? "Unassigned"}</dd></div>
          <div><dt>Updated</dt><dd>{room.housekeeping.lastUpdated ? formatDateTime(room.housekeeping.lastUpdated) : "Not updated"}</dd></div>
          <div><dt>Cleaning</dt><dd>{cleaningStateLabel(room.housekeeping.readyState)}</dd></div>
          <div><dt>Active task</dt><dd>{room.housekeeping.activeTask?.title ?? "None"}</dd></div>
          <div><dt>Reason</dt><dd>{room.housekeeping.activeTask?.reason ?? "No active work"}</dd></div>
        </dl>
      </div>

      {room.housekeeping.canChangeReadyState && (
        <RoomReadyControl key={`${room.unitId}:${room.housekeeping.readyState}`} room={room} roomId={roomId} />
      )}

      <div className="room-task-list" aria-label="Active housekeeping task">
        {room.housekeeping.tasks.length === 0 && <div className="room-empty-state">No active Housekeeping</div>}
        {room.housekeeping.tasks.map((task) => (
          <article className="room-task-card" key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <span>{taskStatusLabel(task)} - {task.reason}</span>
            </div>
            <span className={`room-status-badge is-${statusTone(task.isCarriedOver ? "Priority" : task.priority)}`}>{task.isCarriedOver ? "Priority" : task.priority}</span>
            <RoomTaskActions action={taskAction} task={task} />
          </article>
        ))}
      </div>

      <form className="room-on-demand-form" onSubmit={(event) => {
        event.preventDefault();
        if (canCreateOnDemand) createOnDemand.mutate();
      }}>
        <label>
          On-Demand Cleaning
          <textarea maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" rows={2} value={note} />
        </label>
        <button disabled={!canCreateOnDemand || createOnDemand.isPending || hasOnDemand} type="submit"><PlusIcon />Create On-Demand Cleaning</button>
      </form>

      {hasOnDemand && <p className="room-form-help">An On-Demand Cleaning task is already active.</p>}
      {taskAction.isError && <p className="room-form-error">This task changed. The room is refreshing.</p>}
      {createOnDemand.isError && <p className="room-form-error">On-Demand Cleaning could not be created.</p>}
    </section>
  );
}

function MaintenancePanel({ room, roomId }: { room: RoomDetail; roomId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MaintenancePriority>("Normal");
  const [outOfService, setOutOfService] = useState(false);
  const hasActiveTicket = room.maintenance.tickets.length > 0;
  const mutation = useMutation({
    mutationFn: () => createRoomMaintenanceTicket(roomId, { targetType: "ROOM", title, description, priority, outOfService }),
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setPriority("Normal");
      setOutOfService(false);
      await queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <section className="room-section" aria-label="Maintenance summary">
      <header><MaintenanceIcon /><h2>Maintenance</h2></header>
      <div className="room-section-summary">
        <strong>{room.maintenance.label}</strong>
        <span>{room.maintenance.outOfService ? "Maintenance blocks this room." : room.maintenance.highestPriority ? `${room.maintenance.highestPriority.toUpperCase()} priority` : "No maintenance blocking this room."}</span>
        {room.maintenance.outOfService && <span>Out Of Service</span>}
      </div>
      <div className="maintenance-ticket-list">
        {room.maintenance.tickets.length === 0 && <div className="room-empty-state">No open issues</div>}
        {room.maintenance.tickets.map((ticket) => (
          <Link className="maintenance-ticket-card" key={ticket.id} to={`/maintenance/${ticket.id}`}>
            <div>
              <strong>{ticket.title}</strong>
              <span>{ticket.status.toUpperCase()}</span>
            </div>
            <span className={`room-status-badge is-${ticket.priority.toLowerCase()}`}>{ticket.priority.toUpperCase()}</span>
            {ticket.outOfService && <small>Blocking</small>}
            {ticket.photos.length > 0 && <small>{ticket.photos.length} photo{ticket.photos.length === 1 ? "" : "s"}</small>}
          </Link>
        ))}
      </div>
      {!hasActiveTicket && (
        <form className="room-ticket-form" onSubmit={submit}>
          <label>
            Report Issue
            <input maxLength={140} onChange={(event) => setTitle(event.target.value)} placeholder="Short issue title" required value={title} />
          </label>
          <label>
            Description
            <textarea maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="What needs attention?" required rows={3} value={description} />
          </label>
          <div className="room-form-grid">
            <label>
              Priority
              <select onChange={(event) => setPriority(event.target.value as MaintenancePriority)} value={priority}>
                {MAINTENANCE_PRIORITIES.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="room-checkbox-field">
              <input checked={outOfService} onChange={(event) => setOutOfService(event.target.checked)} type="checkbox" />
              <span>Blocking room</span>
            </label>
          </div>
          <button disabled={mutation.isPending} type="submit"><PlusIcon />Report Issue</button>
          {mutation.isError && <p className="room-form-error">Issue could not be created.</p>}
        </form>
      )}
    </section>
  );
}

function ProcurementPanel({ room }: { room: RoomDetail }) {
  return (
    <section className="room-section" aria-label="Procurement alerts">
      <header><RefreshIcon /><h2>Procurement</h2></header>
      <div className="room-section-summary">
        <strong>{room.procurement.attentionCount > 0 ? `${room.procurement.attentionCount} supply request${room.procurement.attentionCount === 1 ? "" : "s"} need attention` : "No procurement alerts"}</strong>
        <span>{room.procurement.latestRequest ?? "Supply requests stay owned by Procurement."}</span>
      </div>
    </section>
  );
}

function NotesPanel({ room, roomId }: { room: RoomDetail; roomId: string }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const mutation = useMutation({
    mutationFn: () => addRoomNote(roomId, body),
    onSuccess: async () => {
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <section className="room-section" aria-label="Room notes">
      <header><CheckIcon /><h2>Notes</h2></header>
      <form className="room-note-form" onSubmit={submit}>
        <textarea maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder="Add an operational note" required rows={3} value={body} />
        <button disabled={mutation.isPending} type="submit">Add note</button>
        {mutation.isError && <p className="room-form-error">Note could not be saved.</p>}
      </form>
      <div className="room-note-list">
        {room.notes.length === 0 && <div className="room-empty-state">No notes yet</div>}
        {room.notes.map((note) => (
          <article className="room-note-card" key={note.id}>
            <strong>{note.authorName}</strong>
            <span>{formatDateTime(note.createdAt)}</span>
            <p>{note.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TimelinePanel({ events }: { events: RoomTimelineEvent[] }) {
  return (
    <section className="room-section" aria-label="Operational timeline">
      <header><img alt="" src={warningIcon} /><h2>Timeline</h2></header>
      <div className="room-timeline">
        {events.length === 0 && <div className="room-empty-state">No operational history yet</div>}
        {events.map((event) => (
          <article className={`timeline-event is-${event.type}`} key={event.id}>
            <span>{event.type.replace("-", " ")}</span>
            <div>
              <strong>{event.title}</strong>
              {event.description && <p>{event.description}</p>}
              <small>{formatDateTime(event.occurredAt)}{event.actorName ? ` · ${event.actorName}` : ""}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChatContextPanel({ room }: { room: RoomDetail }) {
  return (
    <section className="room-section" aria-label="Room chat context">
      <header><AskIcon /><h2>Chat Context</h2></header>
      <div className="room-section-summary">
        <strong>Room context prepared</strong>
        <span>{room.chatContext.conversationId ? "Conversation linked" : "No room conversation yet"}</span>
      </div>
    </section>
  );
}

function OperationalActions() {
  return (
    <section className="room-section" aria-label="Future operational actions">
      <header><CheckIcon /><h2>Actions</h2></header>
      <div className="room-actions">
        <button disabled type="button">Checkout Completed</button>
        <button disabled type="button">Report Issue</button>
        <button disabled type="button">View Notes</button>
      </div>
    </section>
  );
}

export default function RoomDetailPage() {
  const { roomId = "" } = useParams();
  const room = useQuery({
    queryKey: ["room-detail", roomId],
    queryFn: ({ signal }) => loadRoomDetail(roomId, signal),
    enabled: roomId.length > 0,
    refetchInterval: 60_000,
  });

  return (
    <WorkspaceShell title={room.data?.roomName ?? "Rooms"} workspace="rooms" bodyClassName="room-detail-page">
      {room.data && (
        <div className="workspace-body-actions">
          <span>{room.data.roomType}</span>
          <button
            aria-label="Refresh room detail"
            className="room-refresh"
            disabled={room.isFetching}
            onClick={() => void room.refetch()}
            type="button"
          >
            <RefreshIcon className={room.isFetching ? "is-spinning" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      )}
      {room.isLoading && <PageLoading />}
      {room.isError && !room.data && <PageError onRetry={() => void room.refetch()} />}
      {room.data && (
        <>
          <RoomHeader room={room.data} />
          <OperationalAvailabilityPanel room={room.data} roomId={roomId} />
          <CurrentStay stay={room.data.currentStay} />
          <ReceptionPanel room={room.data} />
          <HousekeepingPanel room={room.data} roomId={roomId} />
          <MaintenancePanel room={room.data} roomId={roomId} />
          <ProcurementPanel room={room.data} />
          <NotesPanel room={room.data} roomId={roomId} />
          <TimelinePanel events={room.data.timeline.events} />
          <ChatContextPanel room={room.data} />
          <OperationalActions />
        </>
      )}
    </WorkspaceShell>
  );
}
