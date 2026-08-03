import type { HousekeepingTaskStatus, HousekeepingTaskType } from "../types/housekeeping-tasks";
import type { RoomDetail, RoomHousekeepingTask } from "../types/room-detail";
import type {
  RoomDomainTone,
  RoomHousekeepingCompletionMode,
  RoomsWorkspaceRoom,
} from "../types/rooms-workspace";

export type TurnoverState =
  | "GUEST_IN_HOUSE"
  | "WAITING_FOR_CHECKOUT"
  | "CHECKOUT_COMPLETED"
  | "CLEANING_IN_PROGRESS"
  | "READY_FOR_CHECKIN"
  | "GUEST_CHECKED_IN";

export interface TurnoverTaskSummary {
  id: number;
  version: number;
  status: HousekeepingTaskStatus | string;
  taskType: string;
  assignee: string | null;
}

export interface TurnoverPrimaryAction {
  type: "START_CLEANING" | "FINISH_CLEANING";
  label: string;
  taskId: number;
  version: number;
  completionMode: RoomHousekeepingCompletionMode;
}

export interface TurnoverPresentation {
  state: TurnoverState;
  label: string;
  detail: string;
  tone: RoomDomainTone;
  secondaryInfo: string | null;
  task: TurnoverTaskSummary | null;
  primaryAction: TurnoverPrimaryAction | null;
}

const CLEANING_TASK_TYPES = new Set<HousekeepingTaskType>([
  "TURNOVER",
  "STANDARD_CLEANING",
  "LINEN_CHANGE",
  "ON_DEMAND_CLEANING",
]);

const CLEANING_TASK_LABELS = new Set(["Turnover", "Cleaning", "Full Cleaning", "Cleaning request"]);

function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function sameDate(left: string | null | undefined, right: string): boolean {
  return left === right;
}

function stateCopy(state: TurnoverState): Pick<TurnoverPresentation, "detail" | "label" | "tone"> {
  if (state === "GUEST_IN_HOUSE") return { label: "Guest In House", detail: "Nothing to do.", tone: "success" };
  if (state === "WAITING_FOR_CHECKOUT") return { label: "Waiting for Check-out", detail: "Guest still in room.", tone: "warning" };
  if (state === "CHECKOUT_COMPLETED") return { label: "Check-out Completed", detail: "Ready to start cleaning.", tone: "warning" };
  if (state === "CLEANING_IN_PROGRESS") return { label: "Cleaning In Progress", detail: "Cleaning running.", tone: "info" };
  if (state === "READY_FOR_CHECKIN") return { label: "Ready for Check-in", detail: "Waiting next arrival.", tone: "success" };
  return { label: "Guest Checked-in", detail: "Turnover complete.", tone: "success" };
}

function buildPresentation(
  state: TurnoverState,
  task: TurnoverTaskSummary | null = null,
  action: TurnoverPrimaryAction | null = null,
): TurnoverPresentation {
  const copy = stateCopy(state);
  return {
    ...copy,
    detail: state === "CLEANING_IN_PROGRESS" && task?.assignee ? `Assigned to ${task.assignee}.` : copy.detail,
    secondaryInfo: task ? `Task #${task.id}` : null,
    state,
    task,
    primaryAction: action,
  };
}

function completionModeForTaskType(taskType: string): RoomHousekeepingCompletionMode {
  if (taskType === "LINEN_CHANGE" || taskType === "TURNOVER" || taskType === "Full Cleaning" || taskType === "Turnover") return "FULL";
  return "STANDARD";
}

function actionForTask(
  task: TurnoverTaskSummary,
  status: HousekeepingTaskStatus | string,
  canStart: boolean,
  canComplete: boolean,
): TurnoverPrimaryAction | null {
  if ((status === "AVAILABLE_FOR_CLAIM" || status === "CLAIMED") && canStart) {
    return {
      type: "START_CLEANING",
      label: "Start Cleaning",
      taskId: task.id,
      version: task.version,
      completionMode: "STANDARD",
    };
  }

  if ((status === "IN_PROGRESS" || status === "CHECKLIST_COMPLETE" || status === "READY_FOR_INSPECTION") && canComplete) {
    return {
      type: "FINISH_CLEANING",
      label: "Finish Cleaning",
      taskId: task.id,
      version: task.version,
      completionMode: completionModeForTaskType(task.taskType),
    };
  }

  return null;
}

function presentationForTask(task: TurnoverTaskSummary, canStart: boolean, canComplete: boolean): TurnoverPresentation {
  if (task.status === "WAITING_FOR_RECEPTION") return buildPresentation("WAITING_FOR_CHECKOUT", task);
  if (task.status === "IN_PROGRESS" || task.status === "CHECKLIST_COMPLETE" || task.status === "READY_FOR_INSPECTION") {
    return buildPresentation("CLEANING_IN_PROGRESS", task, actionForTask(task, task.status, canStart, canComplete));
  }
  if (task.status === "READY") return buildPresentation("READY_FOR_CHECKIN", task);
  return buildPresentation("CHECKOUT_COMPLETED", task, actionForTask(task, task.status, canStart, canComplete));
}

function isWorkspaceCleaningTask(room: RoomsWorkspaceRoom): boolean {
  const taskType = room.housekeeping.activeTask?.taskType;
  return taskType ? CLEANING_TASK_LABELS.has(taskType) : false;
}

export function getRoomsWorkspaceTurnover(room: RoomsWorkspaceRoom, date = todayBangkok()): TurnoverPresentation {
  const activeTask = room.housekeeping.activeTask;
  if (activeTask && isWorkspaceCleaningTask(room)) {
    return presentationForTask({
      id: activeTask.id,
      version: activeTask.version,
      taskType: activeTask.taskType,
      status: activeTask.status,
      assignee: activeTask.assignee,
    }, room.housekeeping.primaryAction?.type === "START_HOUSEKEEPING_TASK", room.housekeeping.primaryAction?.type === "COMPLETE_HOUSEKEEPING_TASK");
  }

  if (room.reception.phase === "DEPARTURE_DUE") return buildPresentation("WAITING_FOR_CHECKOUT");
  if (room.reception.phase === "CHECKED_OUT" && room.operational.housekeeping.condition !== "READY") return buildPresentation("CHECKOUT_COMPLETED");
  if (room.currentStay && sameDate(room.currentStay.arrivalDate, date)) return buildPresentation("GUEST_CHECKED_IN");
  if (room.currentStay && room.operational.occupancy.state === "OCCUPIED") return buildPresentation("GUEST_IN_HOUSE");
  return buildPresentation("READY_FOR_CHECKIN");
}

function isRoomDetailCleaningTask(task: RoomHousekeepingTask | null): task is RoomHousekeepingTask {
  return Boolean(task && CLEANING_TASK_TYPES.has(task.taskType));
}

export function getRoomDetailTurnover(room: RoomDetail, date = todayBangkok()): TurnoverPresentation {
  const activeTask = room.housekeeping.activeTask;
  if (isRoomDetailCleaningTask(activeTask)) {
    return presentationForTask({
      id: activeTask.id,
      version: activeTask.version,
      taskType: activeTask.taskType,
      status: activeTask.status,
      assignee: activeTask.assignee?.name ?? null,
    }, activeTask.capabilities.canStart, activeTask.capabilities.canComplete);
  }

  if (sameDate(room.departure, date) && !room.checkoutCompleted) return buildPresentation("WAITING_FOR_CHECKOUT");
  if (room.checkoutCompleted && room.housekeeping.readyState !== "READY") return buildPresentation("CHECKOUT_COMPLETED");
  if (room.currentStay && sameDate(room.currentStay.arrival, date) && room.occupancyStatus === "Occupied") return buildPresentation("GUEST_CHECKED_IN");
  if (room.currentStay && room.occupancyStatus === "Occupied") return buildPresentation("GUEST_IN_HOUSE");
  return buildPresentation("READY_FOR_CHECKIN");
}
