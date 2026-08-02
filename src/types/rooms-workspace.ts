export type RoomsWorkspaceAvailabilityStatus = "Operating" | "Not Operating";
export type RoomsWorkspaceOccupancyStatus = "Occupied" | "Vacant";
export type RoomsWorkspaceHousekeepingStatus = "Ready" | "Not Ready";
export type RoomsWorkspaceMaintenanceStatus = "Clear" | "Maintenance";
export type RoomsWorkspaceSortGroup = "bungalow" | "villa" | "tent" | "other";

export interface RoomsWorkspaceRoom {
  unitId: number;
  roomName: string;
  roomType: string;
  accommodationType: "Bungalow" | "Villa" | "Tent" | "Other";
  sortGroup: RoomsWorkspaceSortGroup;
  sortNumber: number;
  heroImageKey: string;
  heroImage: string | null;
  occupancy: {
    status: RoomsWorkspaceOccupancyStatus;
    guestName: string | null;
    source: string | null;
  };
  operationalAvailability: {
    status: RoomsWorkspaceAvailabilityStatus;
  };
  housekeeping: {
    status: RoomsWorkspaceHousekeepingStatus;
  };
  maintenance: {
    status: RoomsWorkspaceMaintenanceStatus;
    openIssues: number;
    outOfService: boolean;
  };
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
