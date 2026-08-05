import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import warningIcon from "../assets/img/warning-circle-light.svg";
import { PageError, PageLoading } from "../components/AsyncState";
import AccommodationTypeIcon from "../components/rooms/AccommodationTypeIcon";
import TurnoverCard from "../components/rooms/TurnoverCard";
import WorkspaceShell from "../components/WorkspaceShell";
import { AskIcon, CheckIcon, HousekeepingIcon, MaintenanceIcon, PlusIcon, RefreshIcon, RoomIcon, UserIcon } from "../components/OperationsIcons";
import { getRoomDetailTurnover } from "../config/turnoverPresentation";
import {
  completeHousekeepingTask,
  startHousekeepingTask,
} from "../services/housekeeping-v2.service";
import { addRoomNote, createRoomMaintenanceTicket, createRoomOnDemandCleaning, loadRoomDetail, updateRoomHousekeeping, updateRoomOperationalAvailability } from "../services/room-detail.service";
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(value: string): string {
  return value.toLowerCase().replaceAll(" ", "-");
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
          <div><dt>Arrival</dt><dd>{formatDate(stay.arrival)}</dd></div>
          <div><dt>Departure</dt><dd>{formatDate(stay.departure)}</dd></div>
          <div><dt>Adults</dt><dd>{stay.adults}</dd></div>
          <div><dt>Children</dt><dd>{stay.children}</dd></div>
          <div><dt>Source</dt><dd>{stay.bookingSource}</dd></div>
          <div><dt>Reference</dt><dd>{stay.bookingReference ?? "Not available"}</dd></div>
        </dl>
      </article>
    </section>
  );
}

function RoomHeader({ room }: { room: RoomDetail }) {
  const stay = room.currentStay;

  return (
    <section className="room-hero-card" aria-label="Room status">
      <div className="room-hero-card__icon" aria-hidden="true">
        <AccommodationTypeIcon type={room.accommodationType} />
      </div>
      <div>
        <span>{room.accommodationType}</span>
        <strong>{room.roomName}</strong>
        <small>{stay ? stay.guestName : "No guest in room"}</small>
        <small>{room.arrival ? `Arrival ${formatDate(room.arrival)}` : "No arrival"} · {room.departure ? `Departure ${formatDate(room.departure)}` : "No departure"}</small>
      </div>
      <div className="room-hero-card__status">
        <span className={`room-status-badge is-${statusTone(room.roomStatus)}`}>{room.roomStatus}</span>
        <span>{room.occupancyStatus}</span>
      </div>
    </section>
  );
}

function RoomBadges({ room }: { room: RoomDetail }) {
  return (
    <section className="room-badges" aria-label="Room badges">
      <span><RoomIcon />{room.operationalAvailability.label}</span>
      <span><RoomIcon />{room.occupancyStatus}</span>
      <span><HousekeepingIcon />{room.housekeeping.primaryStatus}</span>
    </section>
  );
}

function roomTaskCompletePayload(task: RoomHousekeepingTask) {
  if (task.taskType === "TURNOVER") return { standardCleaningCompleted: true, linenChangeCompleted: true };
  if (task.taskType === "LINEN_CHANGE") return { linenChangeCompleted: true };
  if (task.taskType === "WATER_REFILL") return { waterRefillCompleted: true };
  return { standardCleaningCompleted: true };
}

function TaskExecutionSteps({ task }: { task: RoomHousekeepingTask }) {
  return (
    <div className="room-task-checklist" aria-label={`Checklist for ${task.title}`}>
      <span>Checklist</span>
      <p>{task.taskType === "WATER_REFILL" ? "Water delivery ready for completion." : "Cleaning ready for completion."}</p>
    </div>
  );
}

function taskStatusLabel(task: RoomHousekeepingTask): string {
  if (task.status === "AVAILABLE_FOR_CLAIM") return "Available";
  if (task.status === "CLAIMED") return task.assignee ? `Assigned to ${task.assignee.name}` : "Assigned";
  if (task.status === "IN_PROGRESS") return "In progress";
  if (task.status === "WAITING_FOR_RECEPTION") return "Waiting for Check-out";
  if (task.status === "READY") return "Clean";
  return task.status.replaceAll("_", " ");
}

function taskDetailLabel(task: RoomHousekeepingTask): string {
  if (task.taskType === "TURNOVER") return "Turnover Cleaning";
  if (task.taskType === "LINEN_CHANGE") return "Full Cleaning";
  if (task.taskType === "STANDARD_CLEANING") return "Cleaning";
  if (task.taskType === "ON_DEMAND_CLEANING") return "Cleaning";
  if (task.taskType === "WATER_REFILL") return "Water Refill";
  return task.title;
}

function taskExecutionStatus(task: RoomHousekeepingTask): string {
  if (task.taskType === "WATER_REFILL") return task.status === "IN_PROGRESS" ? "Water In Progress" : "Water Due";
  if (task.status === "IN_PROGRESS" || task.status === "CHECKLIST_COMPLETE" || task.status === "READY_FOR_INSPECTION") return "Cleaning In Progress";
  if (task.capabilities.canStart || task.status === "AVAILABLE_FOR_CLAIM" || task.status === "CLAIMED") return "Dirty";
  if (task.status === "WAITING_FOR_RECEPTION") return "Waiting for Check-out";
  if (task.status === "READY") return "Clean";
  return "Cleaning In Progress";
}

function executionChecklist(task: RoomHousekeepingTask): string[] {
  if (task.taskType === "WATER_REFILL") return ["Water delivered"];
  if (task.taskType === "TURNOVER") return [];
  if (task.taskType === "LINEN_CHANGE") {
    return ["General room cleaning", "Bed linen changed", "Amenities checked"];
  }
  return ["General room cleaning", "Amenities checked"];
}

function primaryTaskActionLabel(task: RoomHousekeepingTask): string {
  if (task.taskType === "WATER_REFILL") return "Complete Water";
  if (task.capabilities.canStart) return "Start Cleaning";
  if (task.taskType === "TURNOVER") return "Finish Turnover";
  return "Finish Cleaning";
}

function TaskExecutionChecklist({ task }: { task: RoomHousekeepingTask }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  return (
    <section className="task-execution-checklist" aria-label="Checklist">
      <h2>Checklist</h2>
      <div>
        {executionChecklist(task).map((label) => (
          <label key={label}>
            <input
              checked={checked[label] === true}
              onChange={(event) => setChecked((current) => ({ ...current, [label]: event.target.checked }))}
              type="checkbox"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function TaskExecutionPrimaryAction({ action, task }: { action: ReturnType<typeof useRoomTaskAction>; task: RoomHousekeepingTask }) {
  const canAct = task.capabilities.canStart || task.capabilities.canComplete;
  const completeCleaning = (includeLinen: boolean) => action.mutate(completeHousekeepingTask(task.id, task.version, { standardCleaningCompleted: true, linenChangeCompleted: includeLinen }));

  function submit() {
    if (task.capabilities.canStart) {
      action.mutate(startHousekeepingTask(task.id, task.version));
      return;
    }
    if (task.capabilities.canComplete) {
      action.mutate(completeHousekeepingTask(task.id, task.version, roomTaskCompletePayload(task)));
    }
  }

  if (task.capabilities.canComplete && task.taskType === "ON_DEMAND_CLEANING") {
    return (
      <div className="task-execution-primary-action">
        <button disabled={action.isPending} onClick={() => completeCleaning(false)} type="button">Finish Cleaning</button>
        <button disabled={action.isPending} onClick={() => completeCleaning(true)} type="button">Finish Full Cleaning</button>
      </div>
    );
  }

  return (
    <div className="task-execution-primary-action">
      <button disabled={!canAct || action.isPending} onClick={submit} type="button">
        {primaryTaskActionLabel(task)}
      </button>
    </div>
  );
}

function TaskExecutionMaintenance({ room }: { room: RoomDetail }) {
  const openTicket = room.maintenance.tickets[0] ?? null;

  return (
    <section className="task-execution-maintenance" aria-label="Maintenance">
      <div>
        <strong>{openTicket ? "Issue reported" : "No issue"}</strong>
        {openTicket ? <span>{openTicket.title}</span> : <span>Maintenance is clear for this task.</span>}
      </div>
      <Link to={openTicket ? `/maintenance/${openTicket.id}` : `/maintenance/new?roomId=${room.unitId}&source=housekeeping`}>
        {openTicket ? "Open Maintenance" : "Report Issue"}
      </Link>
    </section>
  );
}

function TaskExecutionPage({ room, roomId, task }: { room: RoomDetail; roomId: string; task: RoomHousekeepingTask | null }) {
  const action = useRoomTaskAction(roomId);

  if (!task) {
    return (
      <section className="task-execution-empty" aria-label="Housekeeping task">
        <AccommodationTypeIcon type={room.accommodationType} />
        <div>
          <strong>{room.roomName}</strong>
          <span>No active cleaning task</span>
        </div>
      </section>
    );
  }

  return (
    <div className="task-execution-layout" aria-label="Housekeeping task execution">
      <header className="task-execution-header">
        <div className="task-execution-header__icon" aria-hidden="true">
          <AccommodationTypeIcon type={room.accommodationType} />
        </div>
        <div>
          <span>{room.accommodationType}</span>
          <strong>{room.roomName}</strong>
          <p>{taskDetailLabel(task)}</p>
        </div>
      </header>

      <section className="task-execution-status" aria-label="Task status">
        <span className={`room-status-badge is-${statusTone(taskExecutionStatus(task))}`}>{taskExecutionStatus(task)}</span>
        <dl>
          <div><dt>Assigned</dt><dd>{task.assignee?.name ?? "Unassigned"}</dd></div>
          {task.startedAt && <div><dt>Started</dt><dd>{formatTime(task.startedAt)}</dd></div>}
        </dl>
      </section>

      {task.taskType !== "TURNOVER" && <TaskExecutionChecklist task={task} />}
      <TaskExecutionMaintenance room={room} />
      <TaskExecutionPrimaryAction action={action} task={task} />
      {action.isError && <p className="room-form-error">This task changed. The room is refreshing.</p>}
    </div>
  );
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

  if (task.capabilities.canComplete) {
    return (
      <div className="room-task-actions" aria-label={`Actions for task ${task.id}`}>
        <button disabled={action.isPending} onClick={completeRegularTask} type="button">{task.taskType === "TURNOVER" ? "Finish Turnover" : task.taskType === "LINEN_CHANGE" ? "Finish Full Cleaning" : "Finish Cleaning"}</button>
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

function TurnoverPanel({ room, roomId }: { room: RoomDetail; roomId: string }) {
  const turnover = getRoomDetailTurnover(room);
  void roomId;
  if (!turnover) return null;

  return (
    <TurnoverCard
      roomId={room.unitId}
      turnover={turnover}
    />
  );
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
  const hasActiveTask = room.housekeeping.tasks.length > 0;
  const hasOnDemand = room.housekeeping.tasks.some((task) => task.taskType === "ON_DEMAND_CLEANING");
  const canCreateOnDemand = !hasActiveTask && room.housekeeping.canCreateOnDemandCleaning && Boolean(room.currentStay);

  return (
    <section className="room-section" aria-label="Housekeeping">
      <header><HousekeepingIcon /><h2>Housekeeping</h2></header>
      <div className="room-operation-card">
        <span className={`room-status-badge is-${room.housekeeping.primaryStatusTone}`}>{room.housekeeping.primaryStatus}</span>
        {room.housekeeping.assignedTo && (
          <dl>
            <div><dt>Assigned</dt><dd>{room.housekeeping.assignedTo}</dd></div>
          </dl>
        )}
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
              <span>Task Status</span>
              <b>{taskStatusLabel(task)}</b>
            </div>
            <TaskExecutionSteps task={task} />
            <RoomTaskActions action={taskAction} task={task} />
          </article>
        ))}
      </div>

      {!hasActiveTask && (
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
      )}

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
  const [searchParams] = useSearchParams();
  const requestedTaskId = Number(searchParams.get("taskId"));
  const isTaskExecution = Number.isInteger(requestedTaskId) && requestedTaskId > 0;
  const room = useQuery({
    queryKey: ["room-detail", roomId],
    queryFn: ({ signal }) => loadRoomDetail(roomId, signal),
    enabled: roomId.length > 0,
    refetchInterval: 60_000,
  });
  const executionTask = room.data?.housekeeping.tasks.find((task) => task.id === requestedTaskId)
    ?? room.data?.housekeeping.activeTask
    ?? null;

  return (
    <WorkspaceShell
      title={isTaskExecution ? "Housekeeping" : room.data?.roomName ?? "Rooms"}
      workspace={isTaskExecution ? "housekeeping" : "rooms"}
      bodyClassName={`room-detail-page${isTaskExecution ? " task-execution-page" : ""}`}
    >
      {room.data && !isTaskExecution && (
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
        isTaskExecution ? (
          <TaskExecutionPage room={room.data} roomId={roomId} task={executionTask} />
        ) : (
        <>
          <RoomHeader room={room.data} />
          <RoomBadges room={room.data} />
          <CurrentStay stay={room.data.currentStay} />
          <OperationalAvailabilityPanel room={room.data} roomId={roomId} />
          <TurnoverPanel room={room.data} roomId={roomId} />
          <HousekeepingPanel room={room.data} roomId={roomId} />
          <MaintenancePanel room={room.data} roomId={roomId} />
          <ProcurementPanel room={room.data} />
          <NotesPanel room={room.data} roomId={roomId} />
          <TimelinePanel events={room.data.timeline.events} />
          <ChatContextPanel room={room.data} />
          <OperationalActions />
        </>
        )
      )}
    </WorkspaceShell>
  );
}
