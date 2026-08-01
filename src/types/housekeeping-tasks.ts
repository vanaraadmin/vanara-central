export type HousekeepingTaskType = "TURNOVER" | "STANDARD_CLEANING" | "LINEN_CHANGE" | "WATER_REFILL" | "ON_DEMAND_CLEANING";

export type HousekeepingTaskStatus =
  | "WAITING_FOR_RECEPTION"
  | "AVAILABLE_FOR_CLAIM"
  | "CLAIMED"
  | "IN_PROGRESS"
  | "CHECKLIST_COMPLETE"
  | "READY_FOR_INSPECTION"
  | "READY"
  | "COMPLETED"
  | "BLOCKED"
  | "SKIPPED"
  | "CANCELLED";

export type HousekeepingTaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type HousekeepingTaskSource = "system" | "reception_release" | "manual" | "physical_sign" | "guest_request" | "maintenance" | "migration";

export interface HousekeepingTaskContract {
  id: number;
  taskType: HousekeepingTaskType;
  unitId: number;
  bookingId: number | null;
  stayId: number | null;
  operationalDate: string;
  dueCycleDate: string | null;
  status: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  blockingReason: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  checklistCompletedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  source: HousekeepingTaskSource;
  onDemandSource: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  capabilities: HousekeepingTaskCapabilities;
}

export interface HousekeepingTaskCapabilities {
  canClaim: boolean;
  canStart: boolean;
  canComplete: boolean;
  canSkip: boolean;
  canCancel: boolean;
  requiresReceptionRelease: boolean;
}

export interface HousekeepingTaskChecklistItemContract {
  id: number;
  taskId: number;
  itemKey: string;
  labelKey: string;
  defaultLabel: string;
  required: boolean;
  completed: boolean;
  completedBy: string | null;
  completedByName: string | null;
  completedAt: string | null;
  note: string | null;
  photoObjectKey: string | null;
  sortOrder: number;
}

export interface HousekeepingRoomCounterContract {
  unitId: number;
  activeBookingId: number | null;
  activeStayId: number | null;
  lastStandardCleaningAt: string | null;
  nextStandardCleaningDueDate: string | null;
  standardCleaningIntervalDays: number;
  lastLinenChangeAt: string | null;
  nextLinenChangeDueDate: string | null;
  linenIntervalDays: number;
  linenRequiredOverride: boolean;
  linenOverrideReason: string | null;
}

export interface HousekeepingVersionContract {
  expectedVersion: number;
  idempotencyKey?: string | null;
}
