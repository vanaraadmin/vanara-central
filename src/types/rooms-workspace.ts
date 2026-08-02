export type RoomOperationalAvailability = "OPERATING" | "NOT_OPERATING";
export type RoomOccupancyState = "VACANT" | "OCCUPIED";
export type RoomHousekeepingCondition = "READY" | "NOT_READY";
export type RoomHousekeepingWorkState = "NONE" | "AVAILABLE" | "IN_PROGRESS" | "BLOCKED";
export type RoomMaintenanceState = "CLEAR" | "ACTIVE" | "BLOCKING";
export type RoomsWorkspaceSortGroup = "bungalow" | "villa" | "tent" | "other";

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

export interface RoomsWorkspaceRoom {
  unitId: number;
  roomName: string;
  roomType: string;
  accommodationType: "Bungalow" | "Villa" | "Tent" | "Other";
  sortGroup: RoomsWorkspaceSortGroup;
  sortNumber: number;
  heroImageKey: string;
  heroImage: string | null;
  operational: RoomOperationalSummary;
}

export interface RoomsWorkspaceOverview {
  rooms: RoomsWorkspaceRoom[];
  summary: {
    total: number;
    occupied: number;
    notOperating: number;
    notReady: number;
    maintenance: number;
  };
}

export interface RoomsWorkspaceResponse {
  success: boolean;
  data?: Omit<RoomsWorkspaceOverview, "rooms"> & {
    rooms: Array<Omit<RoomsWorkspaceRoom, "heroImage">>;
  };
  error?: string;
}
