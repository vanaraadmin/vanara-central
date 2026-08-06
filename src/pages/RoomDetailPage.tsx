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
import { useLanguage } from "../providers/language.context";
import { translateStaffLabel } from "../utils/staff-i18n-labels";
import "../styles/RoomDetailPage.css";

const MAINTENANCE_PRIORITIES: MaintenancePriority[] = ["Low", "Normal", "High"];

type Translate = ReturnType<typeof useLanguage>["translate"];

function formatDate(date: string, language = "en") {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
  }).format(new Date(date + "T12:00:00+07:00"));
}

function formatDateTime(value: string, language = "en") {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string, language = "en") {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(value: string): string {
  return value.toLowerCase().replaceAll(" ", "-");
}

function CurrentStay({ language, stay, translate }: { language: string; stay: RoomCurrentStay | null; translate: Translate }) {
  if (!stay) {
    return (
      <section className="room-section room-current-stay" aria-label={translate("guestInformation")}>
        <header><UserIcon /><h2>{translate("guestInformation")}</h2></header>
        <div className="room-empty-state">{translate("noGuestInRoom")}</div>
      </section>
    );
  }

  return (
    <section className="room-section room-current-stay" aria-label={translate("guestInformation")}>
      <header><UserIcon /><h2>{translate("guestInformation")}</h2></header>
      <article className="stay-card">
        <strong>{stay.guestName}</strong>
        <dl>
          <div><dt>{translate("checkIn")}</dt><dd>{formatDate(stay.arrival, language)}</dd></div>
          <div><dt>{translate("checkOut")}</dt><dd>{formatDate(stay.departure, language)}</dd></div>
          <div><dt>{translate("adults")}</dt><dd>{stay.adults}</dd></div>
          <div><dt>{translate("children")}</dt><dd>{stay.children}</dd></div>
          <div><dt>{translate("source")}</dt><dd>{stay.bookingSource}</dd></div>
          <div><dt>{translate("reference")}</dt><dd>{stay.bookingReference ?? translate("notAvailable")}</dd></div>
        </dl>
      </article>
    </section>
  );
}

function RoomHeader({ language, room, translate }: { language: string; room: RoomDetail; translate: Translate }) {
  const stay = room.currentStay;

  return (
    <section className="room-hero-card" aria-label={translate("status")}>
      <div className="room-hero-card__icon" aria-hidden="true">
        <AccommodationTypeIcon type={room.accommodationType} />
      </div>
      <div>
        <span>{room.accommodationType}</span>
        <strong>{room.roomName}</strong>
        <small>{stay ? stay.guestName : translate("vacant")}</small>
        <small>{room.arrival ? `${translate("checkIn")} ${formatDate(room.arrival, language)}` : translate("noArrival")} · {room.departure ? `${translate("checkOut")} ${formatDate(room.departure, language)}` : translate("noDeparture")}</small>
      </div>
      <div className="room-hero-card__status">
        <span className={`room-status-badge is-${statusTone(room.roomStatus)}`}>{translateStaffLabel(room.roomStatus, translate)}</span>
        <span>{translateStaffLabel(room.occupancyStatus, translate)}</span>
      </div>
    </section>
  );
}

function RoomBadges({ room, translate }: { room: RoomDetail; translate: Translate }) {
  return (
    <section className="room-badges" aria-label={translate("details")}>
      <span><RoomIcon />{translateStaffLabel(room.operationalAvailability.label, translate)}</span>
      <span><RoomIcon />{translateStaffLabel(room.occupancyStatus, translate)}</span>
      <span><HousekeepingIcon />{translateStaffLabel(room.housekeeping.primaryStatus, translate)}</span>
    </section>
  );
}

function roomTaskCompletePayload(task: RoomHousekeepingTask) {
  if (task.taskType === "TURNOVER") return { standardCleaningCompleted: true, linenChangeCompleted: true };
  if (task.taskType === "LINEN_CHANGE") return { linenChangeCompleted: true };
  if (task.taskType === "WATER_REFILL") return { waterRefillCompleted: true };
  return { standardCleaningCompleted: true };
}

function TaskExecutionSteps({ task, translate }: { task: RoomHousekeepingTask; translate: Translate }) {
  return (
    <div className="room-task-checklist" aria-label={translate("arrivalChecklist")}>
      <span>{translate("arrivalChecklist")}</span>
      <p>{task.taskType === "WATER_REFILL" ? translate("waterDeliveryReady") : translate("cleaningReadyForCompletion")}</p>
    </div>
  );
}

function taskStatusLabel(task: RoomHousekeepingTask, translate: Translate): string {
  if (task.status === "AVAILABLE_FOR_CLAIM") return translate("availableOperational");
  if (task.status === "CLAIMED") return task.assignee ? translate("assignedToName", { name: task.assignee.name }) : translate("assigned");
  if (task.status === "IN_PROGRESS") return translate("inProgress");
  if (task.status === "WAITING_FOR_RECEPTION") return translate("waitingForCheckout");
  if (task.status === "READY") return translate("clean");
  return task.status.replaceAll("_", " ");
}

function taskDetailLabel(task: RoomHousekeepingTask, translate: Translate): string {
  if (task.taskType === "TURNOVER") return translate("turnover");
  if (task.taskType === "LINEN_CHANGE") return translate("fullCleaning");
  if (task.taskType === "STANDARD_CLEANING") return translate("cleaning");
  if (task.taskType === "ON_DEMAND_CLEANING") return translate("onDemandCleaning");
  if (task.taskType === "WATER_REFILL") return translate("waterRefill");
  return task.title;
}

function taskExecutionStatus(task: RoomHousekeepingTask, translate: Translate): string {
  if (task.taskType === "WATER_REFILL") return task.status === "IN_PROGRESS" ? translate("waterInProgress") : translate("waterDue");
  if (task.status === "IN_PROGRESS" || task.status === "CHECKLIST_COMPLETE" || task.status === "READY_FOR_INSPECTION") return translate("cleaningInProgress");
  if (task.capabilities.canStart || task.status === "AVAILABLE_FOR_CLAIM" || task.status === "CLAIMED") return translate("roomDirty");
  if (task.status === "WAITING_FOR_RECEPTION") return translate("waitingForCheckout");
  if (task.status === "READY") return translate("clean");
  return translate("cleaningInProgress");
}

function executionChecklist(task: RoomHousekeepingTask): string[] {
  if (task.taskType === "WATER_REFILL") return ["waterDelivered"];
  if (task.taskType === "TURNOVER") return [];
  if (task.taskType === "LINEN_CHANGE") {
    return ["generalRoomCleaningPlain", "bedLinenChanged", "amenitiesChecked"];
  }
  return ["generalRoomCleaningPlain", "amenitiesChecked"];
}

function primaryTaskActionLabel(task: RoomHousekeepingTask, translate: Translate): string {
  if (task.taskType === "WATER_REFILL") return translate("completeWater");
  if (task.capabilities.canStart) return translate("startCleaning");
  return translate("finishCleaning");
}

function TaskExecutionChecklist({ task, translate }: { task: RoomHousekeepingTask; translate: Translate }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  return (
    <section className="task-execution-checklist" aria-label={translate("arrivalChecklist")}>
      <h2>{translate("arrivalChecklist")}</h2>
      <div>
        {executionChecklist(task).map((key) => (
          <label key={key}>
            <input
              checked={checked[key] === true}
              onChange={(event) => setChecked((current) => ({ ...current, [key]: event.target.checked }))}
              type="checkbox"
            />
            <span>{translate(key)}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function TaskExecutionPrimaryAction({ action, task, translate }: { action: ReturnType<typeof useRoomTaskAction>; task: RoomHousekeepingTask; translate: Translate }) {
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
        <button disabled={action.isPending} onClick={() => completeCleaning(false)} type="button">{translate("finishCleaning")}</button>
        <button disabled={action.isPending} onClick={() => completeCleaning(true)} type="button">{translate("finishFullCleaning")}</button>
      </div>
    );
  }

  return (
    <div className="task-execution-primary-action">
      <button disabled={!canAct || action.isPending} onClick={submit} type="button">
        {primaryTaskActionLabel(task, translate)}
      </button>
    </div>
  );
}

function TaskExecutionMaintenance({ room, translate }: { room: RoomDetail; translate: Translate }) {
  const openTicket = room.maintenance.tickets[0] ?? null;

  return (
    <section className="task-execution-maintenance" aria-label={translate("maintenance")}>
      <div>
        <strong>{openTicket ? translate("issueReported") : translate("noIssue")}</strong>
        {openTicket ? <span>{openTicket.title}</span> : <span>{translate("maintenanceClearForTask")}</span>}
      </div>
      <Link to={openTicket ? `/maintenance/${openTicket.id}` : `/maintenance/new?roomId=${room.unitId}&source=housekeeping`}>
        {openTicket ? translate("openMaintenance") : translate("reportIssue")}
      </Link>
    </section>
  );
}

function TaskExecutionPage({ room, roomId, task }: { room: RoomDetail; roomId: string; task: RoomHousekeepingTask | null }) {
  const action = useRoomTaskAction(roomId);
  const { language, translate } = useLanguage();

  if (!task) {
    return (
      <section className="task-execution-empty" aria-label={translate("housekeepingTask")}>
        <AccommodationTypeIcon type={room.accommodationType} />
        <div>
          <strong>{room.roomName}</strong>
          <span>{translate("noActiveCleaningTask")}</span>
        </div>
      </section>
    );
  }

  return (
    <div className="task-execution-layout" aria-label={translate("housekeepingTaskExecution")}>
      <header className="task-execution-header">
        <div className="task-execution-header__icon" aria-hidden="true">
          <AccommodationTypeIcon type={room.accommodationType} />
        </div>
        <div>
          <span>{room.accommodationType}</span>
          <strong>{room.roomName}</strong>
          <p>{taskDetailLabel(task, translate)}</p>
        </div>
      </header>

      <section className="task-execution-status" aria-label={translate("taskStatus")}>
        <span className={`room-status-badge is-${statusTone(taskExecutionStatus(task, translate))}`}>{taskExecutionStatus(task, translate)}</span>
        <dl>
          <div><dt>{translate("assigned")}</dt><dd>{task.assignee?.name ?? translate("unassigned")}</dd></div>
          {task.startedAt && <div><dt>{translate("started")}</dt><dd>{formatTime(task.startedAt, language)}</dd></div>}
        </dl>
      </section>

      {task.taskType !== "TURNOVER" && <TaskExecutionChecklist task={task} translate={translate} />}
      <TaskExecutionMaintenance room={room} translate={translate} />
      <TaskExecutionPrimaryAction action={action} task={task} translate={translate} />
      {action.isError && <p className="room-form-error">{translate("taskChangedRefreshing")}</p>}
    </div>
  );
}

function RoomTaskActions({ action, task, translate }: { action: ReturnType<typeof useRoomTaskAction>; task: RoomHousekeepingTask; translate: Translate }) {
  const completeRegularTask = () => action.mutate(completeHousekeepingTask(task.id, task.version, roomTaskCompletePayload(task)));
  const completeCleaning = (includeLinen: boolean) => action.mutate(completeHousekeepingTask(task.id, task.version, { standardCleaningCompleted: true, linenChangeCompleted: includeLinen }));

  if (task.taskType === "WATER_REFILL") {
    return (
      <div className="room-task-actions" aria-label={translate("actions")}>
        {task.capabilities.canComplete && (
          <button disabled={action.isPending} onClick={completeRegularTask} type="button">
            <CheckIcon />
            <span>{translate("complete")}</span>
          </button>
        )}
      </div>
    );
  }

  if (task.capabilities.canStart) {
    return (
      <div className="room-task-actions" aria-label={translate("actions")}>
        <button disabled={action.isPending} onClick={() => action.mutate(startHousekeepingTask(task.id, task.version))} type="button">{translate("start")}</button>
      </div>
    );
  }

  if (task.capabilities.canComplete && task.taskType === "ON_DEMAND_CLEANING") {
    return (
      <div className="room-task-actions" aria-label={translate("actions")}>
        <button disabled={action.isPending} onClick={() => completeCleaning(false)} type="button">{translate("finishCleaning")}</button>
        <button disabled={action.isPending} onClick={() => completeCleaning(true)} type="button">{translate("finishFullCleaning")}</button>
      </div>
    );
  }

  if (task.capabilities.canComplete) {
    return (
      <div className="room-task-actions" aria-label={translate("actions")}>
        <button disabled={action.isPending} onClick={completeRegularTask} type="button">{task.taskType === "LINEN_CHANGE" ? translate("finishFullCleaning") : translate("finishCleaning")}</button>
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

function OperationalAvailabilityPanel({ language, room, roomId, translate }: { language: string; room: RoomDetail; roomId: string; translate: Translate }) {
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
    <section className="room-section" aria-label={translate("operationalAvailabilityAria")}>
      <header><RoomIcon /><h2>{translate("operationalAvailability")}</h2></header>
      <div className="room-operation-card">
        <span className={`room-status-badge is-${statusTone(room.operationalAvailability.label)}`}>{translateStaffLabel(room.operationalAvailability.label, translate)}</span>
        <dl>
          <div><dt>{translate("reason")}</dt><dd>{room.operationalAvailability.reason ?? translate("none")}</dd></div>
          <div><dt>{translate("season")}</dt><dd>{room.operationalAvailability.seasonalLabel ?? translate("notSeasonal")}</dd></div>
          <div><dt>{translate("updatedAt")}</dt><dd>{room.operationalAvailability.updatedAt ? formatDateTime(room.operationalAvailability.updatedAt, language) : translate("baselineDefault")}</dd></div>
        </dl>
      </div>

      {room.operationalAvailability.canChange && (
        <form className="room-availability-form" onSubmit={(event) => {
          event.preventDefault();
          if (changed) mutation.mutate();
        }}>
          <div className="room-form-grid">
            <label>
              {translate("operationalAvailability")}
              <select onChange={(event) => setStatus(event.target.value as OperationalAvailabilityStatus)} value={status}>
                <option value="OPERATING">{translate("operating")}</option>
                <option value="NOT_OPERATING">{translate("notOperating")}</option>
              </select>
            </label>
            <label>
              {translate("reason")}
              <input maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={translate("optionalReason")} value={reason} />
            </label>
            <label>
              {translate("seasonStart")}
              <input maxLength={5} onChange={(event) => setSeasonalStart(event.target.value)} placeholder="06-01" value={seasonalStart} />
            </label>
            <label>
              {translate("seasonEnd")}
              <input maxLength={5} onChange={(event) => setSeasonalEnd(event.target.value)} placeholder="11-20" value={seasonalEnd} />
            </label>
          </div>
          <button disabled={!changed || mutation.isPending} type="submit">{translate("changeAvailability")}</button>
        </form>
      )}

      {mutation.isError && <p className="room-form-error">{translate("operationalAvailabilityCouldNotChange")}</p>}
    </section>
  );
}

function RoomReadyControl({ room, roomId, translate }: { room: RoomDetail; roomId: string; translate: Translate }) {
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
            {translate("cleaningStatus")}
            <select onChange={(event) => setReadyState(event.target.value as RoomReadyState)} value={readyState}>
              <option value="READY">{translate("clean")}</option>
              <option value="NOT_READY">{translate("roomDirty")}</option>
            </select>
          </label>
          <label>
            {translate("reason")}
            <textarea maxLength={500} onChange={(event) => setReadyReason(event.target.value)} placeholder={translate("optionalReason")} rows={2} value={readyReason} />
          </label>
        </div>
        <button disabled={!changed || changeReadyState.isPending} type="submit">{translate("changeCleaning")}</button>
      </form>
      {changeReadyState.isError && <p className="room-form-error">{translate("cleaningStatusCouldNotChange")}</p>}
    </>
  );
}

function HousekeepingPanel({ room, roomId, translate }: { room: RoomDetail; roomId: string; translate: Translate }) {
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
    <section className="room-section" aria-label={translate("housekeeping")}>
      <header><HousekeepingIcon /><h2>{translate("housekeeping")}</h2></header>
      <div className="room-operation-card">
        <span className={`room-status-badge is-${room.housekeeping.primaryStatusTone}`}>{translateStaffLabel(room.housekeeping.primaryStatus, translate)}</span>
        {room.housekeeping.assignedTo && (
          <dl>
            <div><dt>{translate("assigned")}</dt><dd>{room.housekeeping.assignedTo}</dd></div>
          </dl>
        )}
      </div>

      {room.housekeeping.canChangeReadyState && (
        <RoomReadyControl key={`${room.unitId}:${room.housekeeping.readyState}`} room={room} roomId={roomId} translate={translate} />
      )}

      <div className="room-task-list" aria-label={translate("housekeepingTask")}>
        {room.housekeeping.tasks.length === 0 && <div className="room-empty-state">{translate("noActiveHousekeeping")}</div>}
        {room.housekeeping.tasks.map((task) => (
          <article className="room-task-card" key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <span>{translate("taskStatus")}</span>
              <b>{taskStatusLabel(task, translate)}</b>
            </div>
            <TaskExecutionSteps task={task} translate={translate} />
            <RoomTaskActions action={taskAction} task={task} translate={translate} />
          </article>
        ))}
      </div>

      {!hasActiveTask && (
        <form className="room-on-demand-form" onSubmit={(event) => {
          event.preventDefault();
          if (canCreateOnDemand) createOnDemand.mutate();
        }}>
          <label>
            {translate("onDemandCleaning")}
            <textarea maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder={translate("optionalNote")} rows={2} value={note} />
          </label>
          <button disabled={!canCreateOnDemand || createOnDemand.isPending || hasOnDemand} type="submit"><PlusIcon />{translate("createOnDemandCleaning")}</button>
        </form>
      )}

      {hasOnDemand && <p className="room-form-help">{translate("onDemandCleaningAlreadyActive")}</p>}
      {taskAction.isError && <p className="room-form-error">{translate("taskChangedRefreshing")}</p>}
      {createOnDemand.isError && <p className="room-form-error">{translate("onDemandCleaningCouldNotCreate")}</p>}
    </section>
  );
}

function MaintenancePanel({ room, roomId, translate }: { room: RoomDetail; roomId: string; translate: Translate }) {
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
    <section className="room-section" aria-label={translate("maintenanceSummary")}>
      <header><MaintenanceIcon /><h2>{translate("maintenance")}</h2></header>
      <div className="room-section-summary">
        <strong>{translateStaffLabel(room.maintenance.label, translate)}</strong>
        <span>{room.maintenance.outOfService ? translate("maintenanceBlocksRoom") : room.maintenance.highestPriority ? translateStaffLabel(room.maintenance.highestPriority, translate) : translate("noMaintenanceBlockingRoom")}</span>
        {room.maintenance.outOfService && <span>{translate("outOfService")}</span>}
      </div>
      <div className="maintenance-ticket-list">
        {room.maintenance.tickets.length === 0 && <div className="room-empty-state">{translate("noOpenIssues")}</div>}
        {room.maintenance.tickets.map((ticket) => (
          <Link className="maintenance-ticket-card" key={ticket.id} to={`/maintenance/${ticket.id}`}>
            <div>
              <strong>{ticket.title}</strong>
              <span>{translateStaffLabel(ticket.status, translate)}</span>
            </div>
            <span className={`room-status-badge is-${ticket.priority.toLowerCase()}`}>{translateStaffLabel(ticket.priority, translate)}</span>
            {ticket.outOfService && <small>{translate("blockingRoom")}</small>}
            {ticket.photos.length > 0 && <small>{ticket.photos.length} {translate("photos")}</small>}
          </Link>
        ))}
      </div>
      {!hasActiveTicket && (
        <form className="room-ticket-form" onSubmit={submit}>
          <label>
            {translate("reportIssue")}
            <input maxLength={140} onChange={(event) => setTitle(event.target.value)} placeholder={translate("shortIssueTitle")} required value={title} />
          </label>
          <label>
            {translate("description")}
            <textarea maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder={translate("whatNeedsAttention")} required rows={3} value={description} />
          </label>
          <div className="room-form-grid">
            <label>
              {translate("priority")}
              <select onChange={(event) => setPriority(event.target.value as MaintenancePriority)} value={priority}>
                {MAINTENANCE_PRIORITIES.map((item) => <option key={item} value={item}>{translateStaffLabel(item, translate)}</option>)}
              </select>
            </label>
            <label className="room-checkbox-field">
              <input checked={outOfService} onChange={(event) => setOutOfService(event.target.checked)} type="checkbox" />
              <span>{translate("blockingRoom")}</span>
            </label>
          </div>
          <button disabled={mutation.isPending} type="submit"><PlusIcon />{translate("reportIssue")}</button>
          {mutation.isError && <p className="room-form-error">{translate("issueCouldNotBeCreated")}</p>}
        </form>
      )}
    </section>
  );
}

function ProcurementPanel({ room, translate }: { room: RoomDetail; translate: Translate }) {
  return (
    <section className="room-section" aria-label={translate("procurementAlerts")}>
      <header><RefreshIcon /><h2>{translate("procurement")}</h2></header>
      <div className="room-section-summary">
        <strong>{room.procurement.attentionCount > 0 ? translate("supplyRequestsNeedAttention", { count: room.procurement.attentionCount }) : translate("noProcurementAlerts")}</strong>
        <span>{room.procurement.latestRequest ?? translate("procurementOwnsSupplyRequests")}</span>
      </div>
    </section>
  );
}

function NotesPanel({ language, room, roomId, translate }: { language: string; room: RoomDetail; roomId: string; translate: Translate }) {
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
    <section className="room-section" aria-label={translate("roomNotes")}>
      <header><CheckIcon /><h2>{translate("notes")}</h2></header>
      <form className="room-note-form" onSubmit={submit}>
        <textarea maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder={translate("addOperationalNote")} required rows={3} value={body} />
        <button disabled={mutation.isPending} type="submit">{translate("addNote")}</button>
        {mutation.isError && <p className="room-form-error">{translate("noteCouldNotBeSaved")}</p>}
      </form>
      <div className="room-note-list">
        {room.notes.length === 0 && <div className="room-empty-state">{translate("noNotesYet")}</div>}
        {room.notes.map((note) => (
          <article className="room-note-card" key={note.id}>
            <strong>{note.authorName}</strong>
            <span>{formatDateTime(note.createdAt, language)}</span>
            <p>{note.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function timelineEventTypeLabel(type: string, translate: Translate): string {
  const normalized = type.replaceAll("-", "_").replaceAll(" ", "_").toLowerCase();
  if (normalized === "status_changed" || normalized === "status") return translate("maintenanceEventStatusChanged");
  if (normalized === "assigned" || normalized === "assignment") return translate("maintenanceEventAssigned");
  if (normalized === "priority_changed" || normalized === "priority") return translate("maintenanceEventPriorityChanged");
  if (normalized === "blocking_changed" || normalized === "out_of_service_changed" || normalized === "blocking") return translate("maintenanceEventBlockingChanged");
  return translateStaffLabel(type.replaceAll("_", " "), translate);
}

function TimelinePanel({ events, language, translate }: { events: RoomTimelineEvent[]; language: string; translate: Translate }) {
  return (
    <section className="room-section" aria-label={translate("operationalTimeline")}>
      <header><img alt="" src={warningIcon} /><h2>{translate("timeline")}</h2></header>
      <div className="room-timeline">
        {events.length === 0 && <div className="room-empty-state">{translate("noOperationalHistory")}</div>}
        {events.map((event) => (
          <article className={`timeline-event is-${event.type}`} key={event.id}>
            <span>{timelineEventTypeLabel(event.type, translate)}</span>
            <div>
              <strong>{event.title}</strong>
              {event.description && <p>{event.description}</p>}
              <small>{formatDateTime(event.occurredAt, language)}{event.actorName ? ` · ${event.actorName}` : ""}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChatContextPanel({ room, translate }: { room: RoomDetail; translate: Translate }) {
  return (
    <section className="room-section" aria-label={translate("roomChatContext")}>
      <header><AskIcon /><h2>{translate("chatContext")}</h2></header>
      <div className="room-section-summary">
        <strong>{translate("roomContextPrepared")}</strong>
        <span>{room.chatContext.conversationId ? translate("conversationLinked") : translate("noRoomConversation")}</span>
      </div>
    </section>
  );
}

function OperationalActions({ translate }: { translate: Translate }) {
  return (
    <section className="room-section" aria-label={translate("futureOperationalActions")}>
      <header><CheckIcon /><h2>{translate("actions")}</h2></header>
      <div className="room-actions">
        <button disabled type="button">{translate("checkoutCompleted")}</button>
        <button disabled type="button">{translate("reportIssue")}</button>
        <button disabled type="button">{translate("viewNotes")}</button>
      </div>
    </section>
  );
}

export default function RoomDetailPage() {
  const { roomId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { language, translate } = useLanguage();
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
      title={isTaskExecution ? translate("housekeeping") : room.data?.roomName ?? translate("rooms")}
      workspace={isTaskExecution ? "housekeeping" : "rooms"}
      bodyClassName={`room-detail-page${isTaskExecution ? " task-execution-page" : ""}`}
    >
      {room.data && !isTaskExecution && (
        <div className="workspace-body-actions">
          <span>{room.data.roomType}</span>
          <button
            aria-label={translate("refreshRoomDetail")}
            className="room-refresh"
            disabled={room.isFetching}
            onClick={() => void room.refetch()}
            type="button"
          >
            <RefreshIcon className={room.isFetching ? "is-spinning" : ""} />
            <span>{translate("refresh")}</span>
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
          <RoomHeader language={language} room={room.data} translate={translate} />
          <RoomBadges room={room.data} translate={translate} />
          <CurrentStay language={language} stay={room.data.currentStay} translate={translate} />
          <OperationalAvailabilityPanel language={language} room={room.data} roomId={roomId} translate={translate} />
          <TurnoverPanel room={room.data} roomId={roomId} />
          <HousekeepingPanel room={room.data} roomId={roomId} translate={translate} />
          <MaintenancePanel room={room.data} roomId={roomId} translate={translate} />
          <ProcurementPanel room={room.data} translate={translate} />
          <NotesPanel language={language} room={room.data} roomId={roomId} translate={translate} />
          <TimelinePanel events={room.data.timeline.events} language={language} translate={translate} />
          <ChatContextPanel room={room.data} translate={translate} />
          <OperationalActions translate={translate} />
        </>
        )
      )}
    </WorkspaceShell>
  );
}
