import type { MaintenanceCategory, MaintenancePriority, MaintenanceTicketDetail } from "./maintenance";
import type { HousekeepingTaskPriority, HousekeepingTaskStatus, HousekeepingTaskType } from "./housekeeping-tasks";

export type RoomHousekeepingStatus = "Dirty" | "Cleaning" | "Ready";
export type RoomReadyState = "READY" | "NOT_READY";
export type OperationalAvailabilityStatus = "OPERATING" | "NOT_OPERATING";
export type CheckoutCompletionSource = "reception" | "automatic-fallback" | "none";
export type RoomTimelineType = "check-in" | "check-out" | "housekeeping" | "maintenance" | "note" | "procurement";
export type RoomOperationalStatus = "No active Housekeeping" | "Cleaning scheduled" | "Cleaning in progress" | "Full Cleaning" | "Priority" | "Waiting Reception" | "Maintenance Block" | "Ready" | "Water refill";

export interface RoomCurrentStay {
  bookingId: number;
  beds24BookingId: number;
  guestName: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  guests: number;
  bookingSource: string;
  bookingReference: string | null;
}

export interface RoomHousekeeping {
  status: RoomOperationalStatus | RoomHousekeepingStatus;
  primaryStatus: RoomOperationalStatus | RoomHousekeepingStatus;
  primaryStatusTone: string;
  readyState: RoomReadyState;
  assignedTo: string | null;
  assignedAt: string | null;
  lastUpdated: string | null;
  checklistAvailable: boolean;
  checklistLabel: string;
  checklistCompleted: number;
  checklistTotal: number;
  notes: string | null;
  activeTask: RoomHousekeepingTask | null;
  tasks: RoomHousekeepingTask[];
  canCreateOnDemandCleaning: boolean;
  canChangeReadyState: boolean;
}

export interface RoomHousekeepingTask {
  id: number;
  taskType: HousekeepingTaskType;
  title: string;
  status: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  isCarriedOver: boolean;
  reason: string;
  version: number;
  assignee: { id: string; name: string } | null;
  operationalDate: string;
  dueCycleDate: string | null;
  updatedAt: string;
  capabilities: {
    canClaim: boolean;
    canReleaseClaim: boolean;
    canStart: boolean;
    canComplete: boolean;
    canSkip: boolean;
    canCancel: boolean;
    canReopen: boolean;
  };
}

export interface RoomNote {
  id: number;
  unitId: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceptionRoomAlert {
  id: number;
  bookingId: number;
  unitId: number;
  type: "passport_missing" | "deposit_pending";
  title: string;
  actionLabel: string;
  createdAt: string;
}

export interface RoomTimelineEvent {
  id: string;
  type: RoomTimelineType;
  title: string;
  description: string | null;
  actorName: string | null;
  occurredAt: string;
  sourceId: string | null;
}

export interface RoomChatContext {
  contextType: "room";
  contextId: string;
  roomName: string;
  accommodationType: string;
  conversationId: string | null;
  readyForContextualChat: boolean;
}

export interface RoomReceptionSummary {
  guestSummary: string | null;
  arrival: string | null;
  departure: string | null;
  checkInStatus: string;
  checkOutStatus: string;
  passportStatus: string;
  depositStatus: string;
  alerts: ReceptionRoomAlert[];
  notes: string[];
}

export interface RoomDetail {
  unitId: number;
  roomName: string;
  roomType: string;
  accommodationType: string;
  roomStatus: string;
  occupancyStatus: string;
  housekeepingStatus: string;
  operationalAvailability: {
    status: OperationalAvailabilityStatus;
    label: "Operating" | "Not Operating";
    reason: string | null;
    seasonalStart: string | null;
    seasonalEnd: string | null;
    seasonalLabel: string | null;
    updatedAt: string | null;
    canChange: boolean;
  };
  operationalPriority: string;
  checkoutCompleted: boolean;
  checkoutCompletionSource: CheckoutCompletionSource;
  newGuestToday: boolean;
  arrival: string | null;
  departure: string | null;
  currentStay: RoomCurrentStay | null;
  housekeeping: RoomHousekeeping;
  maintenance: {
    openIssues: number;
    label: string;
    highestPriority: string | null;
    outOfService: boolean;
    tickets: MaintenanceTicketDetail[];
  };
  procurement: {
    attentionCount: number;
    latestRequest: string | null;
  };
  reception: RoomReceptionSummary;
  notes: RoomNote[];
  timeline: {
    events: RoomTimelineEvent[];
  };
  chatContext: RoomChatContext;
}

export interface CreateRoomMaintenanceTicketPayload {
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  assignmentType?: "INTERNAL" | "EXTERNAL" | null;
  assignedUserId?: string | null;
  externalAssigneeLabel?: string | null;
  externalAssigneeNote?: string | null;
  outOfService?: boolean;
}

export interface CreateRoomOnDemandCleaningPayload {
  note?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  idempotencyKey?: string | null;
}

export interface UpdateRoomReadyStatePayload {
  status: RoomReadyState;
  reason?: string | null;
  idempotencyKey?: string | null;
}

export interface UpdateRoomOperationalAvailabilityPayload {
  status: OperationalAvailabilityStatus;
  reason?: string | null;
  seasonalStart?: string | null;
  seasonalEnd?: string | null;
  idempotencyKey?: string | null;
}

export interface RoomDetailResponse {
  success: boolean;
  data?: RoomDetail;
  error?: string;
}

export interface RoomNoteResponse {
  success: boolean;
  data?: RoomNote;
  error?: string;
}
