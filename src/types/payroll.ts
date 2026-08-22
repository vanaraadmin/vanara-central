export type PayrollStatus = "DRAFT" | "FINALIZED";
export type PayrollEventType =
  | "UNPAID_ABSENCE_DAY"
  | "UNPAID_ABSENCE_HOUR"
  | "OVERTIME_HOUR"
  | "EXTRA_WORKED_DAY"
  | "SALARY_ADVANCE"
  | "BONUS_ADDITION"
  | "AUTHORIZED_DEDUCTION";
export type PayrollAttendanceStatus =
  | "WORKED"
  | "UNPAID_ABSENCE"
  | "PAID_LEAVE"
  | "PROTECTED_PAID_LEAVE"
  | "WEEKLY_REST";

export interface PayrollSettings {
  monthlyGrossSalary: number;
  monthlyDayDivisor: number;
  normalHoursPerDay: number;
  socialSecurityApplicable: boolean;
  mealAllowanceApplicable: boolean;
  socialSecurityRate: number;
  socialSecurityWageCeiling: number;
  overtimeMultiplier: number;
  dailyMealAllowanceAdvance: number;
  notes: string | null;
}

export interface PayrollEvent {
  id: number;
  employeeUserId: string;
  payrollMonth: string;
  eventDate: string;
  eventType: PayrollEventType;
  quantity: number;
  amount: number;
  rateMultiplier?: number | null;
  note: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface PayrollAggregates {
  unpaidAbsenceDays: number;
  unpaidAbsenceHours: number;
  overtimeHours: number;
  extraWorkedDays: number;
  totalOvertimeHours: number;
  salaryAdvancesReceived: number;
  bonusesAdditions: number;
  authorizedDeductions: number;
}

export interface PayrollLineItem {
  label: string;
  amount: number;
  tone: "addition" | "deduction" | "information" | "total";
  affectsNet?: boolean;
  explanation: string;
  thaiLabel: string;
  thaiExplanation: string;
}

export interface PayrollContractSummary {
  employeeKey: string;
  profileVersionKey: string;
  compensationRuleKey: string;
  contractType: "INDEFINITE" | "SEASONAL";
  ssoTreatment: "SECTION_33" | "EXEMPT_DECLARED";
  effectiveFrom: string;
  effectiveTo: string | null;
  paidLeave: {
    eligible: boolean;
    opening: number;
    used: number;
    closing: number;
  };
}

export interface PayrollCalculation {
  settings: PayrollSettings;
  aggregates: PayrollAggregates;
  daysInFollowingMonth: number;
  dailyPay: number;
  hourlyPay: number;
  employeeSocialSecurity: number;
  employerSocialSecurity?: number;
  housingAllowance?: number;
  accommodationDeduction?: number;
  priorMonthFoodAdjustment?: number;
  finalMonthFoodAdjustment?: number;
  attendanceCorrectionDelta?: number;
  contractBonusTotal?: number;
  contract?: PayrollContractSummary | null;
  absenceDeduction: number;
  overtimeCompensation: number;
  mealAllowanceAdvance: number;
  netSalaryPayable: number;
  lineItems: PayrollLineItem[];
}

export interface PayrollRecord {
  id: number;
  employeeUserId: string;
  employeeNameSnapshot: string;
  payrollMonth: string;
  status: PayrollStatus;
  notes: string | null;
  calculation: PayrollCalculation;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
  finalizedByName: string | null;
}

export interface PayrollWorker {
  id: string;
  fullName: string;
  displayName: string;
  profilePhotoUrl: string | null;
  role: string;
  username: string;
  status: string;
  settings: PayrollSettings;
  record: PayrollRecord | null;
  events: PayrollEvent[];
  calculation: PayrollCalculation;
}

export interface PayrollOverview {
  payrollMonth: string;
  workers: PayrollWorker[];
}

export interface PayrollAttendanceInput {
  workDate: string;
  status: PayrollAttendanceStatus;
  note: string | null;
  idempotencyKey: string;
}

export interface PayrollAttendanceResult {
  date: string;
  status: PayrollAttendanceStatus;
}

export interface PayrollOverviewResponse {
  success: boolean;
  data?: PayrollOverview;
  error?: string;
}

export interface PayrollWorkerResponse {
  success: boolean;
  data?: PayrollWorker;
  error?: string;
}

export interface PayrollSettingsResponse {
  success: boolean;
  data?: PayrollSettings;
  error?: string;
}

export interface PayrollEventResponse {
  success: boolean;
  data?: PayrollEvent;
  error?: string;
}

export interface PayrollRecordResponse {
  success: boolean;
  data?: PayrollRecord;
  error?: string;
}

export interface PayrollAttendanceResponse {
  success: boolean;
  data?: PayrollAttendanceResult;
  error?: string;
}

export interface PayrollContractDocument {
  documentId: string;
  employeeKey: string;
  versionNumber: number;
  effectiveFromBangkok: string;
  effectiveToBangkok: string | null;
  status: "ACTIVE";
  fileName: string;
  byteSize: number;
  createdAt: string;
}

export interface PayrollContractDocumentsResponse {
  success: boolean;
  data?: PayrollContractDocument[];
  error?: string;
}
