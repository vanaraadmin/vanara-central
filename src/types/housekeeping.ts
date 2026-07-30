export type HousekeepingWorkflowStatus = "Dirty" | "Cleaning" | "Ready";
export type HousekeepingChecklistItemId = "bathroom" | "floor" | "towels" | "bed" | "amenities" | "final-check";
export type RoomOccupancyStatus = "Occupied" | "Checked Out" | "Ready for Guest";
export type OperationalGroupId = "clean-first" | "clean-today" | "ready" | "occupied";
export type CheckoutCompletionSource = "reception" | "automatic-fallback" | "none";
export type HousekeepingPriority = "High" | "Normal" | "None";

export interface HousekeepingChecklistItem {
  id: HousekeepingChecklistItemId;
  label: string;
  completed: boolean;
}

export interface HousekeepingChecklist {
  version: 1;
  items: HousekeepingChecklistItem[];
  completed: number;
  total: number;
  missing: string[];
}

export interface HousekeepingRoom {
  id: string;
  unitId: number;
  unitName: string;
  group: OperationalGroupId;
  operationalPriority: "Clean First" | "Clean Today" | "Ready" | "Occupied";
  priority: HousekeepingPriority;
  occupancyStatus: RoomOccupancyStatus;
  housekeepingStatus: HousekeepingWorkflowStatus;
  checkoutCompleted: boolean;
  checkoutCompletionSource: CheckoutCompletionSource;
  newGuestToday: boolean;
  assignedTo: string | null;
  assignedUserId: string | null;
  assignedAt: string | null;
  lastUpdated: string | null;
  minutesSinceUpdate: number | null;
  checklist: HousekeepingChecklist;
  blocked: boolean;
}

export interface HousekeepingGroup {
  id: OperationalGroupId;
  title: string;
  icon: string;
  rooms: HousekeepingRoom[];
}

export interface HousekeepingOverview {
  date: string;
  groups: HousekeepingGroup[];
  rooms: HousekeepingRoom[];
  summary: {
    cleanFirst: number;
    cleanToday: number;
    cleaningInProgress: number;
    dirty: number;
    ready: number;
    occupied: number;
    assigned: number;
    total: number;
  };
  capabilities: {
    checkoutCompletionSource: "missing-reception-flag";
    automaticFallbackAfter: "14:30";
    inspectionPrepared: true;
  };
}

export interface HousekeepingResponse {
  success: boolean;
  data?: HousekeepingOverview;
  error?: string;
}

export interface HousekeepingAssignableUser {
  id: string;
  displayName: string;
}

export interface HousekeepingAssignableUsersResponse {
  success: boolean;
  data?: HousekeepingAssignableUser[];
  error?: string;
}
