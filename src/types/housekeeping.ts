export type HousekeepingWorkflowStatus = "To Clean" | "Cleaning In Progress" | "Ready";
export type RoomOccupancyStatus = "Occupied" | "Checked Out" | "Ready for Guest";
export type OperationalGroupId = "clean-first" | "clean-today" | "ready" | "occupied";
export type CheckoutCompletionSource = "reception" | "automatic-fallback" | "none";

export interface HousekeepingRoom {
  id: string;
  unitId: number;
  unitName: string;
  group: OperationalGroupId;
  operationalPriority: "Clean First" | "Clean Today" | "Ready" | "Occupied";
  occupancyStatus: RoomOccupancyStatus;
  housekeepingStatus: HousekeepingWorkflowStatus;
  checkoutCompleted: boolean;
  checkoutCompletionSource: CheckoutCompletionSource;
  newGuestToday: boolean;
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
    ready: number;
    occupied: number;
    total: number;
  };
  capabilities: {
    checkoutCompletionSource: "missing-reception-flag";
    automaticFallbackAfter: "14:30";
  };
}

export interface HousekeepingResponse {
  success: boolean;
  data?: HousekeepingOverview;
  error?: string;
}