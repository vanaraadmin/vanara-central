import type { HousekeepingTaskPriority, HousekeepingTaskStatus, HousekeepingTaskType } from "./housekeeping-tasks";

export type HousekeepingV2SectionId = "priority-turnover" | "normal-cleaning" | "water-refill" | "ready" | "procurement";
export type HousekeepingV2StayStatus = "arriving" | "in_house" | "departing" | "vacant" | "ready";
export type HousekeepingV2ReceptionReleaseState = "not_required" | "waiting_for_reception" | "released";

export interface HousekeepingV2Summary {
  awaitingReceptionRelease: number;
  priorityTurnovers: number;
  normalCleaningDue: number;
  waterRefillDue: number;
  tasksClaimed: number;
  tasksInProgress: number;
  blockedRooms: number;
  completedToday: number;
  procurementAttention: number;
}

export interface HousekeepingV2TaskCard {
  unitId: number;
  unitName: string;
  roomType: string;
  bookingId: number | null;
  guestName: string | null;
  stayStatus: HousekeepingV2StayStatus;
  arrivalDate: string | null;
  departureDate: string | null;
  nextCheckInAt: string | null;
  taskId: number | null;
  taskType: HousekeepingTaskType | null;
  taskStatus: HousekeepingTaskStatus | null;
  priority: HousekeepingTaskPriority;
  assignee: string | null;
  isOverdue: boolean;
  isBlocked: boolean;
  blockReason: string | null;
  receptionReleaseState: HousekeepingV2ReceptionReleaseState;
  waterQuantity: number | null;
  linenRequired: boolean;
  alertSummary: string | null;
  maintenanceSummary: string | null;
  capabilities: {
    canOpenRoom: boolean;
    canClaim: boolean;
    canStart: boolean;
    canComplete: boolean;
    canSkip: boolean;
    canCancel: boolean;
    requiresReceptionRelease: boolean;
  };
}

export interface HousekeepingV2Section {
  id: HousekeepingV2SectionId;
  title: string;
  emptyLabel: string;
  cards: HousekeepingV2TaskCard[];
}

export interface HousekeepingV2Overview {
  operationalDate: string;
  generatedAt: string;
  summary: HousekeepingV2Summary;
  sections: HousekeepingV2Section[];
  tasks: HousekeepingV2TaskCard[];
  procurement: {
    attentionCount: number;
    latestRequest: string | null;
  };
  meta: {
    generation: {
      attempted: number;
      createdOrReused: number;
    };
    legacyApiPreserved: true;
  };
}

export interface HousekeepingV2Response {
  success: boolean;
  data?: HousekeepingV2Overview;
  error?: string;
}

export interface HousekeepingV2ChecklistItem {
  id: number;
  key: string;
  label: string;
  required: boolean;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
  note: string | null;
}

export interface HousekeepingV2TaskCapabilities {
  canClaim: boolean;
  canReleaseClaim: boolean;
  canStart: boolean;
  canEditChecklist: boolean;
  canComplete: boolean;
  canSkip: boolean;
  canCancel: boolean;
  canReopen: boolean;
  canReassign: boolean;
  canForceRelease: boolean;
  canCreateMaintenanceIssue: boolean;
  canCreateProcurementRequest: boolean;
}

export interface HousekeepingV2RoomTask {
  id: number;
  taskType: HousekeepingTaskType;
  status: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  bookingId: number | null;
  beds24BookingId: number | null;
  version: number;
  assignee: { id: string; name: string } | null;
  blocker: string | null;
  operationalDate: string;
  dueCycleDate: string | null;
  timestamps: {
    claimedAt: string | null;
    startedAt: string | null;
    checklistCompletedAt: string | null;
    readyAt: string | null;
    completedAt: string | null;
    skippedAt: string | null;
    cancelledAt: string | null;
  };
  checklist: {
    completed: number;
    total: number;
    missing: string[];
    items: HousekeepingV2ChecklistItem[];
  };
  capabilities: HousekeepingV2TaskCapabilities;
}

export interface HousekeepingV2RoomDetail {
  operationalDate: string;
  room: {
    unitId: number;
    unitName: string;
    roomType: string;
    displayName: string;
  };
  occupancy: {
    status: "occupied" | "vacant" | "departing" | "arriving";
    currentGuest: string | null;
    currentBookingId: number | null;
    currentBeds24BookingId: number | null;
    arrivalDate: string | null;
    departureDate: string | null;
    guestArrived: boolean;
    nextBookingId: number | null;
    nextBeds24BookingId: number | null;
    nextGuest: string | null;
    nextCheckInAt: string | null;
  };
  reception: {
    guestLeft: boolean;
    keysReturned: boolean;
    depositReturned: boolean;
    roomReleased: boolean;
    releaseTimestamp: string | null;
    alerts: Array<{
      id: number;
      type: "passport_missing" | "deposit_pending";
      title: string;
      createdAt: string;
    }>;
    passportMissing: boolean;
    depositPending: boolean;
  };
  housekeeping: {
    primaryTaskId: number | null;
    tasks: HousekeepingV2RoomTask[];
    capabilities: HousekeepingV2TaskCapabilities;
  };
  cleaning: {
    lastStandardCleaningAt: string | null;
    nextStandardCleaningDue: string | null;
    lastLinenChangeAt: string | null;
    nextLinenDue: string | null;
    linenOverride: boolean;
    waterRefillStatus: HousekeepingTaskStatus | "NOT_DUE" | null;
  };
  maintenance: {
    openTicketCount: number;
    outOfService: boolean;
    blockingTicket: {
      id: number;
      title: string;
      category: string;
      priority: string;
      status: string;
      updatedAt: string;
    } | null;
  };
  audit: Array<{
    id: number;
    taskId: number;
    actor: string | null;
    transition: string;
    from: string | null;
    to: string | null;
    reason: string | null;
    createdAt: string;
  }>;
}

export interface HousekeepingV2RoomResponse {
  success: boolean;
  data?: HousekeepingV2RoomDetail;
  error?: string;
}
