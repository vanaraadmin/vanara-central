import { isOwner, type CurrentUser } from "./current-user.service.js";
import {
  housekeepingTaskCanFinishOperationally,
  housekeepingTaskCapabilities,
  type HousekeepingTask,
} from "./housekeeping-task-domain.service.js";

type CapabilityTask = Pick<HousekeepingTask, "taskType" | "status" | "assignedUserId">;

export interface HousekeepingTaskCapabilityOptions {
  maintenanceBlocked?: boolean;
  waitingForReception?: boolean;
}

export interface HousekeepingOperationalTaskCapabilities {
  canClaim: boolean;
  canReleaseClaim: boolean;
  canStartCleaning: boolean;
  canFinishCleaning: boolean;
  canCompleteTask: boolean;
  canSkip: boolean;
  canCancel: boolean;
  canReopen: boolean;
  canReassign: boolean;
  requiresReceptionRelease: boolean;
}

const terminalStatuses = new Set(["COMPLETED", "SKIPPED", "CANCELLED"]);

export function housekeepingOperationalTaskCapabilities(
  task: CapabilityTask,
  user: CurrentUser,
  options: HousekeepingTaskCapabilityOptions = {},
): HousekeepingOperationalTaskCapabilities {
  const base = housekeepingTaskCapabilities(task);
  const owner = isOwner(user);
  const manager = user.role === "Manager";
  const assigned = task.assignedUserId === user.id;
  const unassigned = task.assignedUserId === null;
  const active = !terminalStatuses.has(task.status);
  const waitingForReception = options.waitingForReception ?? (task.taskType === "TURNOVER" && task.status === "WAITING_FOR_RECEPTION");
  const maintenanceBlocked = options.maintenanceBlocked === true;
  const availableForCleaning = !waitingForReception && !maintenanceBlocked;
  const canActorUseAssignedTask = assigned || owner;
  const canActorCompleteTask = canActorUseAssignedTask || (task.taskType === "WATER_REFILL" && unassigned);

  return {
    canClaim: task.taskType !== "WATER_REFILL" && base.canClaim && availableForCleaning,
    canReleaseClaim: task.status === "CLAIMED" && (assigned || owner || manager) && !maintenanceBlocked,
    canStartCleaning: base.canStart && availableForCleaning && (unassigned || assigned || owner),
    canFinishCleaning: task.taskType !== "WATER_REFILL" && housekeepingTaskCanFinishOperationally(task) && availableForCleaning && canActorUseAssignedTask,
    canCompleteTask: housekeepingTaskCanFinishOperationally(task) && availableForCleaning && canActorCompleteTask,
    canSkip: base.canSkip && (assigned || owner || manager),
    canCancel: active && owner,
    canReopen: !active && owner,
    canReassign: active && owner && task.taskType !== "WATER_REFILL",
    requiresReceptionRelease: base.requiresReceptionRelease || waitingForReception,
  };
}
