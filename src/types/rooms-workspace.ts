export type RoomOperationalAvailability = "OPERATING" | "NOT_OPERATING";
export type RoomOccupancyState = "VACANT" | "OCCUPIED";
export type RoomHousekeepingCondition = "READY" | "NOT_READY";
export type RoomHousekeepingWorkState = "NONE" | "AVAILABLE" | "IN_PROGRESS" | "BLOCKED";
export type RoomMaintenanceState = "CLEAR" | "ACTIVE" | "BLOCKING";
export type RoomsWorkspaceSortGroup = "bungalow" | "villa" | "tent" | "other";
export type ReceptionStepState = "NOT_REQUIRED" | "PENDING" | "COMPLETE" | "BLOCKED";
export type ReceptionStayPhase = "NONE" | "ARRIVAL_DUE" | "IN_HOUSE" | "DEPARTURE_DUE" | "CHECKED_OUT";
export type ReceptionPrimaryActionType = "COLLECT_PASSPORT" | "COMPLETE_CHECK_IN" | "COMPLETE_CHECK_OUT";
export type RoomDomainTone = "success" | "warning" | "danger" | "info" | "neutral";
export type RoomHousekeepingActionType = "CREATE_ON_DEMAND_CLEANING" | "START_HOUSEKEEPING_TASK" | "COMPLETE_HOUSEKEEPING_TASK" | "OPEN_MAINTENANCE";
export type RoomMaintenanceActionType = "REPORT_ISSUE" | "OPEN_TICKET" | "CONTINUE_WORK";
export type RoomHousekeepingCompletionMode = "STANDARD" | "FULL" | "WATER";

export interface RoomOperationalSummary {
  availability: {
    state: RoomOperationalAvailability;
    reason: string | null;
    startDate: string | null;
    endDate: string | null;
    seasonLabel: string | null;
  };
  occupancy: {
    state: RoomOccupancyState;
    guestName: string | null;
    bookingId: number | null;
    source: string | null;
  };
  housekeeping: {
    condition: RoomHousekeepingCondition;
    workState: RoomHousekeepingWorkState;
    activeTaskType: string | null;
    assignedTo: string | null;
  };
  maintenance: {
    state: RoomMaintenanceState;
    activeTicketCount: number;
    blockingTicketCount: number;
    primaryTitle: string | null;
  };
}

export interface RoomCurrentStaySummary {
  guestName: string;
  nationality: string | null;
  source: string | null;
  arrivalDate: string;
  departureDate: string;
  stayNights: number | null;
}

export interface RoomReceptionStepSummary {
  state: ReceptionStepState;
  completedAt: string | null;
}

export interface RoomReceptionAlertSummary {
  id: number;
  type: string;
  label: string;
  tone: "warning" | "danger" | "info";
}

export interface RoomReceptionPrimaryAction {
  type: ReceptionPrimaryActionType;
  label: string;
  target: string;
}

export interface RoomReceptionTodaySummary {
  checkIn: boolean;
  checkOut: boolean;
}

export interface RoomReceptionSummary {
  phase: ReceptionStayPhase;
  today: RoomReceptionTodaySummary;
  passport: RoomReceptionStepSummary;
  deposit: RoomReceptionStepSummary;
  checkIn: RoomReceptionStepSummary;
  checkOut: RoomReceptionStepSummary;
  alerts: RoomReceptionAlertSummary[];
  primaryAction: RoomReceptionPrimaryAction | null;
}

export interface RoomHousekeepingActiveTaskSummary {
  id: number;
  version: number;
  taskType: string;
  status: string;
  priority: string;
  assignee: string | null;
}

export interface RoomHousekeepingPrimaryAction {
  type: RoomHousekeepingActionType;
  label: string;
  taskId: number | null;
  version: number | null;
  completionMode: RoomHousekeepingCompletionMode | null;
  target: string | null;
}

export interface RoomHousekeepingDomainSummary {
  primaryStatus: string;
  tone: RoomDomainTone;
  detail: string;
  secondaryInfo: string | null;
  activeTask: RoomHousekeepingActiveTaskSummary | null;
  primaryAction: RoomHousekeepingPrimaryAction | null;
}

export interface RoomMaintenancePrimaryAction {
  type: RoomMaintenanceActionType;
  label: string;
  target: string | null;
}

export interface RoomMaintenanceDomainSummary {
  primaryStatus: string;
  tone: RoomDomainTone;
  detail: string;
  secondaryInfo: string | null;
  primaryAction: RoomMaintenancePrimaryAction | null;
}

export interface RoomsWorkspaceRoom {
  unitId: number;
  roomName: string;
  roomType: string;
  accommodationType: "Bungalow" | "Villa" | "Tent" | "Other";
  sortGroup: RoomsWorkspaceSortGroup;
  sortNumber: number;
  heroImageKey: string;
  heroImage: string | null;
  alertSummary: string | null;
  currentStay: RoomCurrentStaySummary | null;
  operational: RoomOperationalSummary;
  reception: RoomReceptionSummary;
  housekeeping: RoomHousekeepingDomainSummary;
  maintenance: RoomMaintenanceDomainSummary;
}

export interface RoomsWorkspaceOverview {
  rooms: RoomsWorkspaceRoom[];
  summary: {
    total: number;
    occupied: number;
    vacant: number;
    maintenanceBlocked: number;
    seasonClosed: number;
  };
}

export interface RoomsWorkspaceResponse {
  success: boolean;
  data?: Omit<RoomsWorkspaceOverview, "rooms"> & {
    rooms: Array<Omit<RoomsWorkspaceRoom, "heroImage">>;
  };
  error?: string;
}
