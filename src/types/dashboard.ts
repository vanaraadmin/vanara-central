export interface DashboardSummary {
  arrivals: number;
  departures: number;
  dirtyRooms: number;
  openMaintenance: number;
  pendingProcurement: number;
}

export interface DashboardData {
  date: string;
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
