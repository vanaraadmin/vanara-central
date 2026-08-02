import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, CheckIcon, HousekeepingIcon, MaintenanceIcon, RefreshIcon, RoomIcon } from "../components/OperationsIcons";
import WorkspaceShell from "../components/WorkspaceShell";
import {
  cancelHousekeepingTask,
  claimHousekeepingTask,
  completeHousekeepingTask,
  forceHousekeepingRoomRelease,
  loadHousekeepingV2Room,
  releaseHousekeepingClaim,
  reopenHousekeepingTask,
  skipHousekeepingTask,
  startHousekeepingTask,
  updateHousekeepingTaskChecklist,
} from "../services/housekeeping-v2.service";
import type { HousekeepingV2RoomDetail, HousekeepingV2RoomTask } from "../types/housekeeping-v2";
import "../styles/HousekeepingRoomPage.css";

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function primaryLabel(task: HousekeepingV2RoomTask | undefined): string {
  if (!task) return "No active task";
  if (task.status === "WAITING_FOR_RECEPTION") return "Waiting for Reception";
  if (task.status === "AVAILABLE_FOR_CLAIM") return "Available to claim";
  if (task.status === "CLAIMED") return `Claimed${task.assignee ? ` by ${task.assignee.name}` : ""}`;
  if (task.status === "IN_PROGRESS") return "Cleaning in progress";
  if (task.status === "READY") return "Ready to complete";
  if (task.status === "COMPLETED") return "Completed";
  return task.status.replaceAll("_", " ");
}

function useRoomAction(unitId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (next: Promise<HousekeepingV2RoomDetail>) => next,
    onSuccess: (room) => {
      queryClient.setQueryData(["housekeeping-v2-room", unitId], room);
      void queryClient.invalidateQueries({ queryKey: ["housekeeping-v2"] });
    },
  });
}

function DetailPair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="housekeeping-room-pair">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ReceptionPanel({ room }: { room: HousekeepingV2RoomDetail }) {
  return (
    <section className="housekeeping-room-panel">
      <header><AlertIcon /><h2>Reception state</h2></header>
      <dl className="housekeeping-room-grid">
        <DetailPair label="Guest left" value={room.reception.guestLeft ? "Yes" : "No"} />
        <DetailPair label="Keys returned" value={room.reception.keysReturned ? "Yes" : "No"} />
        <DetailPair label="Deposit returned" value={room.reception.depositReturned ? "Yes" : "No"} />
        <DetailPair label="Room released" value={room.reception.roomReleased ? "Released" : "Waiting"} />
        <DetailPair label="Released at" value={formatDateTime(room.reception.releaseTimestamp)} />
      </dl>
      <div className="housekeeping-room-alerts">
        {room.reception.alerts.length > 0 ? room.reception.alerts.map((alert) => (
          <span key={alert.id}>{alert.title}</span>
        )) : <span>No unresolved Reception alerts</span>}
      </div>
    </section>
  );
}

function Checklist({ task, action }: { task: HousekeepingV2RoomTask; action: ReturnType<typeof useRoomAction> }) {
  return (
    <div className="housekeeping-task-checklist" aria-label="Turnover checklist">
      <header>
        <strong>Checklist</strong>
        <span>{task.checklist.completed}/{task.checklist.total}</span>
      </header>
      {task.checklist.items.map((item) => (
        <button
          aria-pressed={item.completed}
          className={item.completed ? "is-complete" : ""}
          disabled={!task.capabilities.canEditChecklist || action.isPending}
          key={item.key}
          onClick={() => action.mutate(updateHousekeepingTaskChecklist(task.id, task.version, item.key, !item.completed))}
          type="button"
        >
          <span>{item.completed ? "✓" : "□"}</span>
          {item.label}
        </button>
      ))}
      {!task.capabilities.canEditChecklist && task.status === "IN_PROGRESS" && <p>Only the assigned operator or Owner can update this checklist.</p>}
    </div>
  );
}

function TaskActions({ room, task, action }: { room: HousekeepingV2RoomDetail; task: HousekeepingV2RoomTask; action: ReturnType<typeof useRoomAction> }) {
  const askReason = (label: string) => window.prompt(label)?.trim() ?? "";
  const forceRelease = () => {
    const reason = askReason("Reason for Owner Force Room Released");
    if (reason && task.bookingId) action.mutate(forceHousekeepingRoomRelease(task.id, task.version, task.bookingId, reason));
  };
  return (
    <div className="housekeeping-task-actions" aria-label="Task actions">
      {task.capabilities.canForceRelease && (
        <button className="is-warning" disabled={action.isPending} onClick={forceRelease} type="button">
          Force Room Released
        </button>
      )}
      {task.capabilities.canClaim && <button disabled={action.isPending} onClick={() => action.mutate(claimHousekeepingTask(task.id, task.version))} type="button">Claim</button>}
      {task.capabilities.canReleaseClaim && <button disabled={action.isPending} onClick={() => action.mutate(releaseHousekeepingClaim(task.id, task.version))} type="button">Release claim</button>}
      {task.capabilities.canStart && <button disabled={action.isPending} onClick={() => action.mutate(startHousekeepingTask(task.id, task.version))} type="button">Start</button>}
      {task.capabilities.canComplete && <button disabled={action.isPending} onClick={() => action.mutate(completeHousekeepingTask(task.id, task.version))} type="button">Complete turnover</button>}
      {task.capabilities.canSkip && (
        <button disabled={action.isPending} onClick={() => {
          const reason = askReason("Reason for skipping this task");
          if (reason) action.mutate(skipHousekeepingTask(task.id, task.version, reason));
        }} type="button">Skip</button>
      )}
      {task.capabilities.canCancel && (
        <button disabled={action.isPending} onClick={() => {
          const reason = askReason("Reason for cancelling this task");
          if (reason) action.mutate(cancelHousekeepingTask(task.id, task.version, reason));
        }} type="button">Cancel</button>
      )}
      {task.capabilities.canReopen && (
        <button disabled={action.isPending} onClick={() => {
          const reason = askReason("Reason for reopening this task");
          if (reason) action.mutate(reopenHousekeepingTask(task.id, task.version, reason));
        }} type="button">Reopen</button>
      )}
      {task.status === "WAITING_FOR_RECEPTION" && !task.capabilities.canForceRelease && <p>Waiting for Reception to release {room.room.unitName}.</p>}
      {task.checklist.missing.length > 0 && task.status === "IN_PROGRESS" && <p>Complete checklist: {task.checklist.missing.join(", ")}.</p>}
      {action.isError && <p className="housekeeping-room-error">Action could not be completed. Refresh and try again.</p>}
    </div>
  );
}

function TaskPanel({ room, task, action }: { room: HousekeepingV2RoomDetail; task: HousekeepingV2RoomTask; action: ReturnType<typeof useRoomAction> }) {
  return (
    <section className="housekeeping-room-panel housekeeping-task-panel">
      <header>
        <HousekeepingIcon />
        <div>
          <h2>{task.taskType.replaceAll("_", " ")}</h2>
          <p>Version {task.version} · {primaryLabel(task)}</p>
        </div>
      </header>
      <dl className="housekeeping-room-grid">
        <DetailPair label="Priority" value={task.priority} />
        <DetailPair label="Assignee" value={task.assignee?.name ?? "Unassigned"} />
        <DetailPair label="Started" value={formatDateTime(task.timestamps.startedAt)} />
        <DetailPair label="Completed" value={formatDateTime(task.timestamps.completedAt)} />
      </dl>
      {task.taskType === "TURNOVER" && <Checklist task={task} action={action} />}
      <TaskActions action={action} room={room} task={task} />
    </section>
  );
}

function OperationsPanel({ room }: { room: HousekeepingV2RoomDetail }) {
  return (
    <section className="housekeeping-room-panel">
      <header><RoomIcon /><h2>Room context</h2></header>
      <dl className="housekeeping-room-grid">
        <DetailPair label="Guest" value={room.occupancy.currentGuest ?? "No current guest"} />
        <DetailPair label="Arrival" value={formatDate(room.occupancy.arrivalDate)} />
        <DetailPair label="Departure" value={formatDate(room.occupancy.departureDate)} />
        <DetailPair label="Next check-in" value={room.occupancy.nextCheckInAt ? formatDateTime(room.occupancy.nextCheckInAt) : "None scheduled"} />
        <DetailPair label="Last cleaning" value={formatDateTime(room.cleaning.lastStandardCleaningAt)} />
        <DetailPair label="Next cleaning" value={formatDate(room.cleaning.nextStandardCleaningDue)} />
        <DetailPair label="Last linen" value={formatDateTime(room.cleaning.lastLinenChangeAt)} />
        <DetailPair label="Next linen" value={formatDate(room.cleaning.nextLinenDue)} />
        <DetailPair label="Water refill" value={room.cleaning.waterRefillStatus ?? "Not due"} />
      </dl>
    </section>
  );
}

function MaintenancePanel({ room }: { room: HousekeepingV2RoomDetail }) {
  return (
    <section className="housekeeping-room-panel">
      <header><MaintenanceIcon /><h2>Maintenance</h2></header>
      {room.maintenance.blockingTicket ? (
        <p className="housekeeping-room-warning">{room.maintenance.blockingTicket.title} · {room.maintenance.blockingTicket.priority} · {room.maintenance.blockingTicket.status}</p>
      ) : (
        <p>{room.maintenance.openTicketCount > 0 ? `${room.maintenance.openTicketCount} open tickets` : "No open maintenance block"}</p>
      )}
    </section>
  );
}

function AuditPanel({ room }: { room: HousekeepingV2RoomDetail }) {
  return (
    <section className="housekeeping-room-panel">
      <header><RefreshIcon /><h2>Recent activity</h2></header>
      {room.audit.length > 0 ? (
        <ol className="housekeeping-room-audit">
          {room.audit.map((event) => (
            <li key={event.id}>
              <strong>{event.transition}</strong>
              <span>{event.actor ?? "System"} · {formatDateTime(event.createdAt)}</span>
              {event.reason && <p>{event.reason}</p>}
            </li>
          ))}
        </ol>
      ) : <p>No task activity yet.</p>}
    </section>
  );
}

export default function HousekeepingRoomPage() {
  const { unitId } = useParams();
  const room = useQuery({
    queryKey: ["housekeeping-v2-room", unitId],
    queryFn: ({ signal }) => loadHousekeepingV2Room(unitId ?? "", undefined, signal),
    enabled: Boolean(unitId),
  });
  const action = useRoomAction(unitId);
  const primary = room.data?.housekeeping.tasks.find((task) => task.id === room.data?.housekeeping.primaryTaskId);

  return (
    <WorkspaceShell title={room.data?.room.unitName ?? "Room"} workspace="housekeeping" bodyClassName="housekeeping-room-page">
      <div className="workspace-body-actions">
        <Link className="housekeeping-room-back" to="/housekeeping-v2">Back to Housekeeping</Link>
        <button aria-label="Refresh room" className="housekeeping-room-refresh" disabled={room.isFetching} onClick={() => void room.refetch()} type="button">
          <RefreshIcon className={room.isFetching ? "is-spinning" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {room.isLoading && <PageLoading />}
      {room.isError && !room.data && <PageError onRetry={() => void room.refetch()} />}

      {room.data && (
        <>
          <section className="housekeeping-room-hero">
            <p>{room.data.room.roomType}</p>
            <h2>{room.data.room.unitName}</h2>
            <span>{primaryLabel(primary)}</span>
          </section>

          <OperationsPanel room={room.data} />
          <ReceptionPanel room={room.data} />
          {primary ? <TaskPanel action={action} room={room.data} task={primary} /> : (
            <section className="housekeeping-room-panel"><header><CheckIcon /><h2>No active housekeeping task</h2></header><p>This room has no current-day action.</p></section>
          )}
          <MaintenancePanel room={room.data} />
          <AuditPanel room={room.data} />
        </>
      )}
    </WorkspaceShell>
  );
}
