export type DashboardRoomStatus =
  | "Ready"
  | "Occupied"
  | "Cleaning"
  | "Dirty"
  | "Maintenance"
  | "Arrival Today"
  | "Departure Today";

export interface DashboardRoomCard {
  id: string;
  unitName: string;
  status: DashboardRoomStatus;
  guestName: string | null;
  checkIn: string | null;
  checkOut: string | null;
}

export interface DashboardSummary {
  arrivals: number;
  departures: number;
  cleanFirst: number;
  cleanToday: number;
  cleaningInProgress: number;
  readyRooms: number;
  occupiedRooms: number;
  openMaintenance: number;
  pendingProcurement: number;
}

export interface DashboardData {
  date: string;
  operations: {
    checkIns: DashboardRoomCard[];
    checkOuts: DashboardRoomCard[];
    maintenanceAlerts: DashboardRoomCard[];
  };
  summary: DashboardSummary;
  system: {
    hasOperationalData: boolean;
    latestSync: {
      type: string;
      status: string;
      finishedAt: string | null;
    } | null;
  };
  recentActivity: [];
}

export interface DashboardResponse {
  success: boolean;
  data?: DashboardData;
  error?: string;
}