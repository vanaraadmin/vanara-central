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

export interface DashboardOverviewMetric {
  id: string;
  label: string;
  value: number | string;
  href: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
}

export interface DashboardOverviewAlert {
  id: string;
  label: string;
  value: number;
  href: string;
  tone: "warning" | "danger";
}

export interface DashboardQuickLink {
  id: string;
  label: string;
  href: string;
}

export interface DashboardBusinessMetric {
  id: string;
  label: string;
  value: number | string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
}

export interface DashboardBreakdownItem {
  label: string;
  value: number;
  amount?: number;
}

export interface DashboardFinancialSegment {
  id: string;
  label: string;
  amount: number;
  percentage: number;
  kind: "income" | "expense" | "forecast" | "reduction";
}

export interface DashboardFinancialSnapshot {
  totalIncome: number;
  totalExpenses: number;
  netPosition: number;
  checkedInNetRevenue: number;
  futureBookedNetForecast: number;
  manualIncomeTotal: number;
  manualExpenseTotal: number;
  payrollTotal: number;
  topLevel: DashboardFinancialSegment[];
  incomeComposition: DashboardFinancialSegment[];
  expenseComposition: DashboardFinancialSegment[];
  otaChannels: DashboardFinancialSegment[];
  manualIncome: DashboardFinancialSegment[];
  manualExpenses: DashboardFinancialSegment[];
  payrollComponents: DashboardFinancialSegment[];
}

export interface DashboardOverview {
  date: string;
  alerts: DashboardOverviewAlert[];
  business: {
    expectedNetIncomeToDate: DashboardBusinessMetric;
    expectedFutureNetIncome: DashboardBusinessMetric;
    occupancy: DashboardBusinessMetric;
    guestOrigins: DashboardBreakdownItem[];
    channels: DashboardBreakdownItem[];
    financialSnapshot: DashboardFinancialSnapshot;
  };
  housekeeping: Record<string, DashboardOverviewMetric>;
  maintenance: Record<string, DashboardOverviewMetric>;
  today: Record<string, DashboardOverviewMetric>;
  staff: Record<string, DashboardOverviewMetric>;
  quickLinks: DashboardQuickLink[];
}

export interface DashboardOverviewResponse {
  success: boolean;
  data?: DashboardOverview;
  error?: string;
}
