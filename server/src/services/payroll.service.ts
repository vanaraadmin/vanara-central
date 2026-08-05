import type { CurrentUser } from "./current-user.service.js";
import { VANARA_LOGO_PDF_JPEG_BASE64, VANARA_LOGO_PDF_JPEG_HEIGHT, VANARA_LOGO_PDF_JPEG_WIDTH } from "../assets/images/vanara-logo-pdf.js";
import { NOTO_SANS_THAI_REGULAR_BASE64 } from "../assets/fonts/noto-sans-thai-regular.js";

export type PayrollStatus = "DRAFT" | "FINALIZED";
export type PayrollEventType =
  | "UNPAID_ABSENCE_DAY"
  | "UNPAID_ABSENCE_HOUR"
  | "OVERTIME_HOUR"
  | "EXTRA_WORKED_DAY"
  | "SALARY_ADVANCE"
  | "BONUS_ADDITION"
  | "AUTHORIZED_DEDUCTION";

export interface PayrollBindings {
  DB: D1Database;
}

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
  tone: "addition" | "deduction" | "total";
  explanation: string;
  thaiLabel: string;
  thaiExplanation: string;
}

export interface PayrollCalculation {
  settings: PayrollSettings;
  aggregates: PayrollAggregates;
  daysInFollowingMonth: number;
  dailyPay: number;
  hourlyPay: number;
  employeeSocialSecurity: number;
  absenceDeduction: number;
  overtimeCompensation: number;
  mealAllowanceAdvance: number;
  netSalaryPayable: number;
  lineItems: PayrollLineItem[];
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

interface UserRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  profile_photo_url: string | null;
  role: string;
  username: string;
  status: string;
}

interface SettingsRow {
  employee_user_id: string;
  monthly_gross_salary: number;
  monthly_day_divisor: number;
  normal_hours_per_day: number;
  social_security_applicable: number;
  meal_allowance_applicable?: number | null;
  social_security_rate: number;
  social_security_wage_ceiling: number;
  overtime_multiplier: number;
  daily_meal_allowance_advance: number;
  notes: string | null;
}

interface EventRow {
  payroll_event_id: number;
  payroll_record_id?: number | null;
  employee_user_id: string;
  payroll_month: string;
  event_date: string;
  event_type: PayrollEventType;
  quantity: number;
  amount: number;
  note: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

interface RecordRow {
  payroll_record_id: number;
  employee_user_id: string;
  employee_name_snapshot: string;
  payroll_month: string;
  status: PayrollStatus;
  monthly_gross_salary: number;
  monthly_day_divisor: number;
  normal_hours_per_day: number;
  social_security_applicable: number;
  meal_allowance_applicable?: number | null;
  social_security_rate: number;
  social_security_wage_ceiling: number;
  overtime_multiplier: number;
  daily_meal_allowance_advance: number;
  days_in_following_month: number;
  unpaid_absence_days: number;
  unpaid_absence_hours: number;
  overtime_hours: number;
  extra_worked_days: number;
  total_overtime_hours: number;
  salary_advances_received: number;
  bonuses_additions: number;
  authorized_deductions: number;
  notes: string | null;
  daily_pay: number;
  hourly_pay: number;
  employee_social_security: number;
  absence_deduction: number;
  overtime_compensation: number;
  meal_allowance_advance: number;
  net_salary_payable: number;
  line_items_json: string;
  explanations_json: string;
  event_snapshot_json: string;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
  finalized_by_name: string | null;
}

const EVENT_TYPES: PayrollEventType[] = [
  "UNPAID_ABSENCE_DAY",
  "UNPAID_ABSENCE_HOUR",
  "OVERTIME_HOUR",
  "EXTRA_WORKED_DAY",
  "SALARY_ADVANCE",
  "BONUS_ADDITION",
  "AUTHORIZED_DEDUCTION",
];

const DEFAULT_SETTINGS: PayrollSettings = {
  monthlyGrossSalary: 0,
  monthlyDayDivisor: 30,
  normalHoursPerDay: 8,
  socialSecurityApplicable: true,
  mealAllowanceApplicable: true,
  socialSecurityRate: 0.05,
  socialSecurityWageCeiling: 17500,
  overtimeMultiplier: 1.5,
  dailyMealAllowanceAdvance: 50,
  notes: null,
};

const EVENT_LABELS: Record<PayrollEventType, string> = {
  UNPAID_ABSENCE_DAY: "Unpaid absence day",
  UNPAID_ABSENCE_HOUR: "Unpaid absence hour",
  OVERTIME_HOUR: "Overtime hour",
  EXTRA_WORKED_DAY: "Extra worked day",
  SALARY_ADVANCE: "Salary advance",
  BONUS_ADDITION: "Bonus / addition",
  AUTHORIZED_DEDUCTION: "Authorized deduction",
};

const EVENT_THAI_LABELS: Record<PayrollEventType, string> = {
  UNPAID_ABSENCE_DAY: "วันขาดงานไม่รับค่าจ้าง",
  UNPAID_ABSENCE_HOUR: "ชั่วโมงขาดงานไม่รับค่าจ้าง",
  OVERTIME_HOUR: "ชั่วโมงล่วงเวลา",
  EXTRA_WORKED_DAY: "วันทำงานพิเศษ",
  SALARY_ADVANCE: "เงินเบิกล่วงหน้า",
  BONUS_ADDITION: "โบนัส / รายการเพิ่ม",
  AUTHORIZED_DEDUCTION: "รายการหักที่ได้รับอนุมัติ",
};

const COMPANY_PROFILE = {
  brandName: "Vanara Retreat",
  legalNameThai: "บริษัท วานารา รีสอร์ท เกาะช้าง จำกัด",
  registrationNumber: "0235564000381",
  registeredAddressThai: "37/5 หมู่ที่ 1 ตำบลเกาะช้างใต้ อำเภอเกาะช้าง จังหวัดตราด",
  certificateDate: "14 October 2025",
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: number): string {
  return `${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
}

function signedMoney(value: number): string {
  if (value < 0) return `- ${money(value)}`;
  if (value > 0) return `+ ${money(value)}`;
  return `+ ${money(0)}`;
}

function eventValue(event: PayrollEvent, calculation: PayrollCalculation): string {
  if (event.amount > 0) return money(event.amount);
  if (event.eventType === "UNPAID_ABSENCE_DAY") return `${event.quantity.toFixed(2)} days - ${money(event.quantity * calculation.dailyPay)}`;
  if (event.eventType === "UNPAID_ABSENCE_HOUR") return `${event.quantity.toFixed(2)} hours - ${money(event.quantity * calculation.hourlyPay)}`;
  if (event.eventType === "OVERTIME_HOUR") return `${event.quantity.toFixed(2)} hours - ${money(event.quantity * calculation.hourlyPay * calculation.settings.overtimeMultiplier)}`;
  if (event.eventType === "EXTRA_WORKED_DAY") {
    const hours = event.quantity * calculation.settings.normalHoursPerDay;
    return `${event.quantity.toFixed(2)} days / ${hours.toFixed(2)} hours - ${money(hours * calculation.hourlyPay * calculation.settings.overtimeMultiplier)}`;
  }
  return `${event.quantity.toFixed(2)}`;
}

function formatEventDate(value: string, locale = "en-GB"): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
}

const THAI_MONTH_NAMES = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function thaiMonthName(value: string): string {
  const month = Number(value.slice(5, 7));
  return THAI_MONTH_NAMES[month - 1] ?? "";
}

function cleanText(value: unknown, max = 1000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function bangkokDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getUTCFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = parts.find((part) => part.type === "day")?.value ?? String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeEventDate(value: unknown, payrollMonth: string): string {
  const fallback = bangkokDate();
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (!/^\d{4}-(0[1-9]|1[0-2])-[0-3][0-9]$/.test(text)) throw new Error("Payroll event date must use YYYY-MM-DD.");
  const eventMonth = text.slice(0, 7);
  if (eventMonth !== payrollMonth) throw new Error("Select a date inside this payroll month.");
  return text;
}

function nonNegative(value: unknown, label: string): number {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be zero or more.`);
  return number;
}

function positive(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than zero.`);
  return number;
}

export function normalizePayrollMonth(value: unknown, fallback = bangkokMonth()): string {
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) throw new Error("Payroll month must use YYYY-MM.");
  return text;
}

function bangkokMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getUTCFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function daysInFollowingMonth(payrollMonth: string): number {
  const [yearRaw, monthRaw] = payrollMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return 30;
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function normalizePayrollSettingsInput(payload: unknown): PayrollSettings {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return {
    monthlyGrossSalary: nonNegative(source.monthlyGrossSalary, "Monthly gross salary"),
    monthlyDayDivisor: positive(source.monthlyDayDivisor ?? DEFAULT_SETTINGS.monthlyDayDivisor, "Monthly day divisor"),
    normalHoursPerDay: positive(source.normalHoursPerDay ?? DEFAULT_SETTINGS.normalHoursPerDay, "Normal hours per day"),
    socialSecurityApplicable: source.socialSecurityApplicable === undefined ? true : Boolean(source.socialSecurityApplicable),
    mealAllowanceApplicable: source.mealAllowanceApplicable === undefined ? true : Boolean(source.mealAllowanceApplicable),
    socialSecurityRate: nonNegative(source.socialSecurityRate ?? DEFAULT_SETTINGS.socialSecurityRate, "Social Security rate"),
    socialSecurityWageCeiling: nonNegative(source.socialSecurityWageCeiling ?? DEFAULT_SETTINGS.socialSecurityWageCeiling, "Social Security wage ceiling"),
    overtimeMultiplier: nonNegative(source.overtimeMultiplier ?? DEFAULT_SETTINGS.overtimeMultiplier, "Overtime multiplier"),
    dailyMealAllowanceAdvance: nonNegative(source.dailyMealAllowanceAdvance ?? DEFAULT_SETTINGS.dailyMealAllowanceAdvance, "Daily meal allowance advance"),
    notes: cleanText(source.notes),
  };
}

export function normalizePayrollEventInput(payload: unknown): { payrollMonth: string; eventDate: string; eventType: PayrollEventType; quantity: number; amount: number; note: string | null } {
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const eventType = typeof source.eventType === "string" && EVENT_TYPES.includes(source.eventType as PayrollEventType)
    ? source.eventType as PayrollEventType
    : null;
  if (!eventType) throw new Error("Payroll event type is invalid.");
  const payrollMonth = normalizePayrollMonth(source.payrollMonth);
  const eventDate = normalizeEventDate(source.eventDate, payrollMonth);
  const quantityEvents = new Set<PayrollEventType>(["UNPAID_ABSENCE_DAY", "UNPAID_ABSENCE_HOUR", "OVERTIME_HOUR", "EXTRA_WORKED_DAY"]);
  const amountEvents = new Set<PayrollEventType>(["SALARY_ADVANCE", "BONUS_ADDITION", "AUTHORIZED_DEDUCTION"]);
  const quantity = quantityEvents.has(eventType) ? positive(source.quantity, "Event quantity") : 0;
  const amount = amountEvents.has(eventType) ? positive(source.amount, "Event amount") : 0;
  return { payrollMonth, eventDate, eventType, quantity, amount, note: cleanText(source.note, 600) };
}

function settingsFromRow(row: SettingsRow | null | undefined): PayrollSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    monthlyGrossSalary: Number(row.monthly_gross_salary),
    monthlyDayDivisor: Number(row.monthly_day_divisor),
    normalHoursPerDay: Number(row.normal_hours_per_day),
    socialSecurityApplicable: row.social_security_applicable === 1,
    mealAllowanceApplicable: row.meal_allowance_applicable === undefined || row.meal_allowance_applicable === null ? true : row.meal_allowance_applicable === 1,
    socialSecurityRate: Number(row.social_security_rate),
    socialSecurityWageCeiling: Number(row.social_security_wage_ceiling),
    overtimeMultiplier: Number(row.overtime_multiplier),
    dailyMealAllowanceAdvance: Number(row.daily_meal_allowance_advance),
    notes: row.notes,
  };
}

function eventFromRow(row: EventRow): PayrollEvent {
  return {
    id: row.payroll_event_id,
    employeeUserId: row.employee_user_id,
    payrollMonth: row.payroll_month,
    eventDate: row.event_date,
    eventType: row.event_type,
    quantity: Number(row.quantity),
    amount: Number(row.amount),
    note: row.note,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

export function aggregatePayrollEvents(events: PayrollEvent[], settings: PayrollSettings): PayrollAggregates {
  const aggregates: PayrollAggregates = {
    unpaidAbsenceDays: 0,
    unpaidAbsenceHours: 0,
    overtimeHours: 0,
    extraWorkedDays: 0,
    totalOvertimeHours: 0,
    salaryAdvancesReceived: 0,
    bonusesAdditions: 0,
    authorizedDeductions: 0,
  };
  for (const event of events) {
    if (event.eventType === "UNPAID_ABSENCE_DAY") aggregates.unpaidAbsenceDays += event.quantity;
    if (event.eventType === "UNPAID_ABSENCE_HOUR") aggregates.unpaidAbsenceHours += event.quantity;
    if (event.eventType === "OVERTIME_HOUR") aggregates.overtimeHours += event.quantity;
    if (event.eventType === "EXTRA_WORKED_DAY") aggregates.extraWorkedDays += event.quantity;
    if (event.eventType === "SALARY_ADVANCE") aggregates.salaryAdvancesReceived += event.amount;
    if (event.eventType === "BONUS_ADDITION") aggregates.bonusesAdditions += event.amount;
    if (event.eventType === "AUTHORIZED_DEDUCTION") aggregates.authorizedDeductions += event.amount;
  }
  aggregates.totalOvertimeHours = aggregates.overtimeHours + aggregates.extraWorkedDays * settings.normalHoursPerDay;
  return aggregates;
}

export function calculatePayroll(settings: PayrollSettings, events: PayrollEvent[] = [], payrollMonth = bangkokMonth()): PayrollCalculation {
  const safeSettings = normalizePayrollSettingsInput(settings);
  const aggregates = aggregatePayrollEvents(events, safeSettings);
  const followingMonthDays = daysInFollowingMonth(payrollMonth);
  const dailyPay = roundMoney(safeSettings.monthlyGrossSalary / safeSettings.monthlyDayDivisor);
  const hourlyPay = roundMoney(safeSettings.monthlyGrossSalary / safeSettings.monthlyDayDivisor / safeSettings.normalHoursPerDay);
  const employeeSocialSecurity = roundMoney(safeSettings.socialSecurityApplicable ? Math.min(safeSettings.monthlyGrossSalary, safeSettings.socialSecurityWageCeiling) * safeSettings.socialSecurityRate : 0);
  const absenceDeduction = roundMoney(aggregates.unpaidAbsenceDays * dailyPay + aggregates.unpaidAbsenceHours * hourlyPay);
  const overtimeCompensation = roundMoney(aggregates.totalOvertimeHours * hourlyPay * safeSettings.overtimeMultiplier);
  const mealAllowanceAdvance = safeSettings.mealAllowanceApplicable ? roundMoney(followingMonthDays * safeSettings.dailyMealAllowanceAdvance) : 0;
  const netSalaryPayable = roundMoney(
    safeSettings.monthlyGrossSalary
    - employeeSocialSecurity
    - absenceDeduction
    + overtimeCompensation
    - aggregates.salaryAdvancesReceived
    + mealAllowanceAdvance
    + aggregates.bonusesAdditions
    - aggregates.authorizedDeductions,
  );
  const lineItems: PayrollLineItem[] = [
    {
      label: "Monthly gross salary",
      amount: roundMoney(safeSettings.monthlyGrossSalary),
      tone: "addition",
      explanation: `Monthly salary: ${money(safeSettings.monthlyGrossSalary)}`,
      thaiLabel: "เงินเดือนรวมรายเดือน",
      thaiExplanation: "เงินเดือนรายเดือนตามการตั้งค่าพนักงาน",
    },
    {
      label: "Employee Social Security",
      amount: -employeeSocialSecurity,
      tone: "deduction",
      explanation: safeSettings.socialSecurityApplicable ? `${(safeSettings.socialSecurityRate * 100).toFixed(2)}% of ${money(Math.min(safeSettings.monthlyGrossSalary, safeSettings.socialSecurityWageCeiling))}` : "Not applied",
      thaiLabel: "ประกันสังคมพนักงาน",
      thaiExplanation: safeSettings.socialSecurityApplicable ? "คำนวณตามอัตราและเพดานประกันสังคม" : "ไม่ใช้",
    },
    {
      label: "Unpaid absences",
      amount: -absenceDeduction,
      tone: "deduction",
      explanation: `${aggregates.unpaidAbsenceDays.toFixed(2)} days x ${money(dailyPay)} + ${aggregates.unpaidAbsenceHours.toFixed(2)} hours x ${money(hourlyPay)}`,
      thaiLabel: "หักขาดงานไม่รับค่าจ้าง",
      thaiExplanation: "คำนวณจากวันและชั่วโมงขาดงานไม่รับค่าจ้าง",
    },
    {
      label: "Overtime compensation",
      amount: overtimeCompensation,
      tone: "addition",
      explanation: `${aggregates.totalOvertimeHours.toFixed(2)} hours x ${money(hourlyPay)} x ${safeSettings.overtimeMultiplier.toFixed(2)}. Extra worked days convert to ${aggregates.extraWorkedDays.toFixed(2)} days x ${safeSettings.normalHoursPerDay.toFixed(2)} hours.`,
      thaiLabel: "ค่าล่วงเวลา",
      thaiExplanation: "รวมชั่วโมงล่วงเวลาและวันทำงานพิเศษ",
    },
    {
      label: "Salary advances already received",
      amount: -roundMoney(aggregates.salaryAdvancesReceived),
      tone: "deduction",
      explanation: "Advances already paid during the month",
      thaiLabel: "หักเงินล่วงหน้า",
      thaiExplanation: "เงินล่วงหน้าที่ได้รับแล้วในเดือนนี้",
    },
    {
      label: "Following-month meal allowance advance",
      amount: mealAllowanceAdvance,
      tone: "addition",
      explanation: safeSettings.mealAllowanceApplicable ? `${followingMonthDays} days x ${money(safeSettings.dailyMealAllowanceAdvance)}` : "Not applied for this payroll month",
      thaiLabel: "ค่าอาหารล่วงหน้าเดือนถัดไป",
      thaiExplanation: safeSettings.mealAllowanceApplicable ? "ค่าอาหารล่วงหน้าตามจำนวนวันเดือนถัดไป" : "ไม่ได้ใช้สำหรับเดือนเงินเดือนนี้",
    },
    {
      label: "Bonuses / other additions",
      amount: roundMoney(aggregates.bonusesAdditions),
      tone: "addition",
      explanation: "Authorized additions recorded for this payroll month",
      thaiLabel: "โบนัสและรายการเพิ่มอื่น",
      thaiExplanation: "รายการเพิ่มที่ได้รับอนุมัติสำหรับเดือนนี้",
    },
    {
      label: "Other authorized deductions",
      amount: -roundMoney(aggregates.authorizedDeductions),
      tone: "deduction",
      explanation: "Authorized deductions recorded for this payroll month",
      thaiLabel: "รายการหักอื่นที่ได้รับอนุมัติ",
      thaiExplanation: "รายการหักที่ได้รับอนุมัติสำหรับเดือนนี้",
    },
    {
      label: "Net salary payable",
      amount: netSalaryPayable,
      tone: "total",
      explanation: "Final amount payable",
      thaiLabel: "เงินเดือนสุทธิที่ต้องจ่าย",
      thaiExplanation: "จำนวนเงินสุดท้ายที่ต้องจ่าย",
    },
  ];

  return {
    settings: safeSettings,
    aggregates,
    daysInFollowingMonth: followingMonthDays,
    dailyPay,
    hourlyPay,
    employeeSocialSecurity,
    absenceDeduction,
    overtimeCompensation,
    mealAllowanceAdvance,
    netSalaryPayable,
    lineItems,
  };
}

async function getActiveWorkers(env: PayrollBindings): Promise<UserRow[]> {
  const rows = await env.DB.prepare(`
    SELECT user_id, first_name, last_name, full_name, profile_photo_url, role, username, status
    FROM users
    WHERE status = 'active' AND role IN ('Reception', 'Housekeeping', 'Maintenance', 'Operations')
    ORDER BY full_name
  `).all<UserRow>();
  return rows.results ?? [];
}

async function getWorker(env: PayrollBindings, employeeUserId: string): Promise<UserRow | null> {
  return env.DB.prepare(`
    SELECT user_id, first_name, last_name, full_name, profile_photo_url, role, username, status
    FROM users
    WHERE user_id = ? AND status = 'active' AND role IN ('Reception', 'Housekeeping', 'Maintenance', 'Operations')
  `).bind(employeeUserId).first<UserRow>();
}

function legalPayrollName(row: UserRow): string {
  const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return name || row.full_name;
}

async function getSettings(env: PayrollBindings, employeeUserId: string): Promise<PayrollSettings> {
  const row = await env.DB.prepare("SELECT * FROM payroll_worker_settings WHERE employee_user_id = ?")
    .bind(employeeUserId)
    .first<SettingsRow>();
  return settingsFromRow(row);
}

async function listEvents(env: PayrollBindings, employeeUserId: string, payrollMonth: string): Promise<PayrollEvent[]> {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM payroll_events
    WHERE employee_user_id = ? AND payroll_month = ?
    ORDER BY created_at DESC, payroll_event_id DESC
  `).bind(employeeUserId, payrollMonth).all<EventRow>();
  return (rows.results ?? []).map(eventFromRow);
}

function recordFromRow(row: RecordRow | null): PayrollRecord | null {
  if (!row) return null;
  return {
    id: row.payroll_record_id,
    employeeUserId: row.employee_user_id,
    employeeNameSnapshot: row.employee_name_snapshot,
    payrollMonth: row.payroll_month,
    status: row.status,
    notes: row.notes,
    calculation: {
      settings: {
        monthlyGrossSalary: row.monthly_gross_salary,
        monthlyDayDivisor: row.monthly_day_divisor,
        normalHoursPerDay: row.normal_hours_per_day,
        socialSecurityApplicable: row.social_security_applicable === 1,
        mealAllowanceApplicable: row.meal_allowance_applicable === undefined || row.meal_allowance_applicable === null ? true : row.meal_allowance_applicable === 1,
        socialSecurityRate: row.social_security_rate,
        socialSecurityWageCeiling: row.social_security_wage_ceiling,
        overtimeMultiplier: row.overtime_multiplier,
        dailyMealAllowanceAdvance: row.daily_meal_allowance_advance,
        notes: row.notes,
      },
      aggregates: {
        unpaidAbsenceDays: row.unpaid_absence_days,
        unpaidAbsenceHours: row.unpaid_absence_hours,
        overtimeHours: row.overtime_hours,
        extraWorkedDays: row.extra_worked_days,
        totalOvertimeHours: row.total_overtime_hours,
        salaryAdvancesReceived: row.salary_advances_received,
        bonusesAdditions: row.bonuses_additions,
        authorizedDeductions: row.authorized_deductions,
      },
      daysInFollowingMonth: row.days_in_following_month,
      dailyPay: row.daily_pay,
      hourlyPay: row.hourly_pay,
      employeeSocialSecurity: row.employee_social_security,
      absenceDeduction: row.absence_deduction,
      overtimeCompensation: row.overtime_compensation,
      mealAllowanceAdvance: row.meal_allowance_advance,
      netSalaryPayable: row.net_salary_payable,
      lineItems: JSON.parse(row.line_items_json) as PayrollLineItem[],
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finalizedAt: row.finalized_at,
    finalizedBy: row.finalized_by,
    finalizedByName: row.finalized_by_name,
  };
}

async function getRecord(env: PayrollBindings, employeeUserId: string, payrollMonth: string): Promise<PayrollRecord | null> {
  const row = await env.DB.prepare("SELECT * FROM payroll_records WHERE employee_user_id = ? AND payroll_month = ?")
    .bind(employeeUserId, payrollMonth)
    .first<RecordRow>();
  return recordFromRow(row);
}

async function buildWorker(env: PayrollBindings, row: UserRow, payrollMonth: string): Promise<PayrollWorker> {
  const [settings, events, record] = await Promise.all([
    getSettings(env, row.user_id),
    listEvents(env, row.user_id, payrollMonth),
    getRecord(env, row.user_id, payrollMonth),
  ]);
  const calculation = record?.status === "FINALIZED" ? record.calculation : calculatePayroll(settings, events, payrollMonth);
  return {
    id: row.user_id,
    fullName: legalPayrollName(row),
    displayName: legalPayrollName(row),
    profilePhotoUrl: row.profile_photo_url,
    role: row.role,
    username: row.username,
    status: row.status,
    settings,
    record,
    events,
    calculation,
  };
}

export async function getPayrollOverview(env: PayrollBindings, payrollMonth = bangkokMonth()): Promise<PayrollOverview> {
  const month = normalizePayrollMonth(payrollMonth);
  const workers = await getActiveWorkers(env);
  return { payrollMonth: month, workers: await Promise.all(workers.map((worker) => buildWorker(env, worker, month))) };
}

export async function getPayrollWorker(env: PayrollBindings, employeeUserId: string, payrollMonth = bangkokMonth()): Promise<PayrollWorker | null> {
  const worker = await getWorker(env, employeeUserId);
  if (!worker) return null;
  return buildWorker(env, worker, normalizePayrollMonth(payrollMonth));
}

export async function savePayrollSettings(env: PayrollBindings, employeeUserId: string, input: PayrollSettings, user: CurrentUser, now = new Date().toISOString()): Promise<PayrollSettings> {
  if (!await getWorker(env, employeeUserId)) throw new Error("Payroll worker not found.");
  const settings = normalizePayrollSettingsInput(input);
  await env.DB.prepare(`
    INSERT INTO payroll_worker_settings (
      employee_user_id, monthly_gross_salary, monthly_day_divisor, normal_hours_per_day,
      social_security_applicable, social_security_rate, social_security_wage_ceiling,
      overtime_multiplier, daily_meal_allowance_advance, meal_allowance_applicable, notes, created_at, updated_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_user_id) DO UPDATE SET
      monthly_gross_salary = excluded.monthly_gross_salary,
      monthly_day_divisor = excluded.monthly_day_divisor,
      normal_hours_per_day = excluded.normal_hours_per_day,
      social_security_applicable = excluded.social_security_applicable,
      social_security_rate = excluded.social_security_rate,
      social_security_wage_ceiling = excluded.social_security_wage_ceiling,
      overtime_multiplier = excluded.overtime_multiplier,
      daily_meal_allowance_advance = excluded.daily_meal_allowance_advance,
      meal_allowance_applicable = excluded.meal_allowance_applicable,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).bind(
    employeeUserId,
    settings.monthlyGrossSalary,
    settings.monthlyDayDivisor,
    settings.normalHoursPerDay,
    settings.socialSecurityApplicable ? 1 : 0,
    settings.socialSecurityRate,
    settings.socialSecurityWageCeiling,
    settings.overtimeMultiplier,
    settings.dailyMealAllowanceAdvance,
    settings.mealAllowanceApplicable ? 1 : 0,
    settings.notes,
    now,
    now,
    user.id,
  ).run();
  return settings;
}

export async function addPayrollEvent(env: PayrollBindings, employeeUserId: string, input: ReturnType<typeof normalizePayrollEventInput>, user: CurrentUser, now = new Date().toISOString()): Promise<PayrollEvent> {
  if (!await getWorker(env, employeeUserId)) throw new Error("Payroll worker not found.");
  const existing = await getRecord(env, employeeUserId, input.payrollMonth);
  if (existing?.status === "FINALIZED") throw new Error("Finalized payroll is locked.");
  await env.DB.prepare(`
    INSERT INTO payroll_events (
      employee_user_id, payroll_month, event_date, event_type, quantity, amount, note, created_by, created_by_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(employeeUserId, input.payrollMonth, input.eventDate, input.eventType, input.quantity, input.amount, input.note, user.id, user.displayName, now).run();
  const row = await env.DB.prepare(`
    SELECT *
    FROM payroll_events
    WHERE employee_user_id = ? AND payroll_month = ? AND created_at = ?
    ORDER BY payroll_event_id DESC
    LIMIT 1
  `).bind(employeeUserId, input.payrollMonth, now).first<EventRow>();
  if (!row) throw new Error("Payroll event could not be saved.");
  return eventFromRow(row);
}

async function upsertPayrollRecord(env: PayrollBindings, worker: PayrollWorker, payrollMonth: string, user: CurrentUser, status: PayrollStatus, now: string, notes: string | null): Promise<PayrollRecord> {
  const existing = worker.record;
  if (existing?.status === "FINALIZED") throw new Error("Finalized payroll is locked.");
  const calculation = calculatePayroll(worker.settings, worker.events, payrollMonth);
  const lineItemsJson = JSON.stringify(calculation.lineItems);
  const explanationsJson = JSON.stringify(calculation.lineItems.map((item) => ({ label: item.label, explanation: item.explanation, thaiLabel: item.thaiLabel, thaiExplanation: item.thaiExplanation })));
  const eventSnapshotJson = JSON.stringify(worker.events);

  if (existing) {
    await env.DB.prepare(`
      UPDATE payroll_records
      SET status = ?,
          monthly_gross_salary = ?, monthly_day_divisor = ?, normal_hours_per_day = ?,
          social_security_applicable = ?, social_security_rate = ?, social_security_wage_ceiling = ?,
          overtime_multiplier = ?, daily_meal_allowance_advance = ?, meal_allowance_applicable = ?, days_in_following_month = ?,
          unpaid_absence_days = ?, unpaid_absence_hours = ?, overtime_hours = ?, extra_worked_days = ?,
          total_overtime_hours = ?, salary_advances_received = ?, bonuses_additions = ?, authorized_deductions = ?,
          notes = ?, daily_pay = ?, hourly_pay = ?, employee_social_security = ?, absence_deduction = ?,
          overtime_compensation = ?, meal_allowance_advance = ?, net_salary_payable = ?,
          line_items_json = ?, explanations_json = ?, event_snapshot_json = ?,
          updated_at = ?, updated_by = ?, finalized_at = ?, finalized_by = ?, finalized_by_name = ?
      WHERE payroll_record_id = ? AND status = 'DRAFT'
    `).bind(
      status,
      calculation.settings.monthlyGrossSalary,
      calculation.settings.monthlyDayDivisor,
      calculation.settings.normalHoursPerDay,
      calculation.settings.socialSecurityApplicable ? 1 : 0,
      calculation.settings.socialSecurityRate,
      calculation.settings.socialSecurityWageCeiling,
      calculation.settings.overtimeMultiplier,
      calculation.settings.dailyMealAllowanceAdvance,
      calculation.settings.mealAllowanceApplicable ? 1 : 0,
      calculation.daysInFollowingMonth,
      calculation.aggregates.unpaidAbsenceDays,
      calculation.aggregates.unpaidAbsenceHours,
      calculation.aggregates.overtimeHours,
      calculation.aggregates.extraWorkedDays,
      calculation.aggregates.totalOvertimeHours,
      calculation.aggregates.salaryAdvancesReceived,
      calculation.aggregates.bonusesAdditions,
      calculation.aggregates.authorizedDeductions,
      notes,
      calculation.dailyPay,
      calculation.hourlyPay,
      calculation.employeeSocialSecurity,
      calculation.absenceDeduction,
      calculation.overtimeCompensation,
      calculation.mealAllowanceAdvance,
      calculation.netSalaryPayable,
      lineItemsJson,
      explanationsJson,
      eventSnapshotJson,
      now,
      user.id,
      status === "FINALIZED" ? now : null,
      status === "FINALIZED" ? user.id : null,
      status === "FINALIZED" ? user.displayName : null,
      existing.id,
    ).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO payroll_records (
        employee_user_id, employee_name_snapshot, payroll_month, status,
        monthly_gross_salary, monthly_day_divisor, normal_hours_per_day,
        social_security_applicable, social_security_rate, social_security_wage_ceiling,
        overtime_multiplier, daily_meal_allowance_advance, meal_allowance_applicable, days_in_following_month,
        unpaid_absence_days, unpaid_absence_hours, overtime_hours, extra_worked_days,
        total_overtime_hours, salary_advances_received, bonuses_additions, authorized_deductions,
        notes, daily_pay, hourly_pay, employee_social_security, absence_deduction,
        overtime_compensation, meal_allowance_advance, net_salary_payable,
        line_items_json, explanations_json, event_snapshot_json,
        created_at, updated_at, created_by, updated_by, finalized_at, finalized_by, finalized_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      worker.id,
      worker.fullName,
      payrollMonth,
      status,
      calculation.settings.monthlyGrossSalary,
      calculation.settings.monthlyDayDivisor,
      calculation.settings.normalHoursPerDay,
      calculation.settings.socialSecurityApplicable ? 1 : 0,
      calculation.settings.socialSecurityRate,
      calculation.settings.socialSecurityWageCeiling,
      calculation.settings.overtimeMultiplier,
      calculation.settings.dailyMealAllowanceAdvance,
      calculation.settings.mealAllowanceApplicable ? 1 : 0,
      calculation.daysInFollowingMonth,
      calculation.aggregates.unpaidAbsenceDays,
      calculation.aggregates.unpaidAbsenceHours,
      calculation.aggregates.overtimeHours,
      calculation.aggregates.extraWorkedDays,
      calculation.aggregates.totalOvertimeHours,
      calculation.aggregates.salaryAdvancesReceived,
      calculation.aggregates.bonusesAdditions,
      calculation.aggregates.authorizedDeductions,
      notes,
      calculation.dailyPay,
      calculation.hourlyPay,
      calculation.employeeSocialSecurity,
      calculation.absenceDeduction,
      calculation.overtimeCompensation,
      calculation.mealAllowanceAdvance,
      calculation.netSalaryPayable,
      lineItemsJson,
      explanationsJson,
      eventSnapshotJson,
      now,
      now,
      user.id,
      user.id,
      status === "FINALIZED" ? now : null,
      status === "FINALIZED" ? user.id : null,
      status === "FINALIZED" ? user.displayName : null,
    ).run();
  }
  const record = await getRecord(env, worker.id, payrollMonth);
  if (!record) throw new Error("Payroll record could not be saved.");
  await env.DB.prepare(`
    UPDATE payroll_events
    SET payroll_record_id = ?
    WHERE employee_user_id = ? AND payroll_month = ? AND payroll_record_id IS NULL
  `).bind(record.id, worker.id, payrollMonth).run();
  return record;
}

export async function savePayrollDraft(env: PayrollBindings, employeeUserId: string, payrollMonth: string, user: CurrentUser, notes: string | null, now = new Date().toISOString()): Promise<PayrollRecord> {
  const month = normalizePayrollMonth(payrollMonth);
  const worker = await getPayrollWorker(env, employeeUserId, month);
  if (!worker) throw new Error("Payroll worker not found.");
  return upsertPayrollRecord(env, worker, month, user, "DRAFT", now, notes);
}

export async function finalizePayroll(env: PayrollBindings, employeeUserId: string, payrollMonth: string, user: CurrentUser, notes: string | null, now = new Date().toISOString()): Promise<PayrollRecord> {
  const month = normalizePayrollMonth(payrollMonth);
  const worker = await getPayrollWorker(env, employeeUserId, month);
  if (!worker) throw new Error("Payroll worker not found.");
  return upsertPayrollRecord(env, worker, month, user, "FINALIZED", now, notes);
}

function pdfHex(value: string, includeBom = true): string {
  const bytes: number[] = includeBom ? [0xfe, 0xff] : [];
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    bytes.push((unit >> 8) & 0xff, unit & 0xff);
  }
  return `<${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}>`;
}

function pdfAscii(value: string): string {
  return `(${value.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, "?")})`;
}

function textLine(x: number, y: number, size: number, text: string, color = "0 0 0", font = "F1"): string {
  const encoded = /[^\x20-\x7e]/.test(text) ? pdfHex(text, font !== "F2") : pdfAscii(text);
  return `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td ${encoded} Tj ET`;
}

function pdfObject(id: number, body: string): string {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readInt16(bytes: Uint8Array, offset: number): number {
  const value = readUint16(bytes, offset);
  return value & 0x8000 ? value - 0x10000 : value;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! * 0x1000000) + ((bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!);
}

interface TrueTypeMetrics {
  bytes: Uint8Array;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  bbox: [number, number, number, number];
  cidToGidHex: string;
  widthsPdf: string;
}

let thaiFontMetricsCache: TrueTypeMetrics | null = null;

function readTableDirectory(bytes: Uint8Array): Map<string, { offset: number; length: number }> {
  const numTables = readUint16(bytes, 4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < numTables; index += 1) {
    const tableOffset = 12 + index * 16;
    const tag = String.fromCharCode(bytes[tableOffset]!, bytes[tableOffset + 1]!, bytes[tableOffset + 2]!, bytes[tableOffset + 3]!);
    tables.set(tag, { offset: readUint32(bytes, tableOffset + 8), length: readUint32(bytes, tableOffset + 12) });
  }
  return tables;
}

function createFormat4GlyphLookup(bytes: Uint8Array, format4Offset: number): (codePoint: number) => number {
  const segCount = readUint16(bytes, format4Offset + 6) / 2;
  const endCodeOffset = format4Offset + 14;
  const startCodeOffset = endCodeOffset + segCount * 2 + 2;
  const idDeltaOffset = startCodeOffset + segCount * 2;
  const idRangeOffsetOffset = idDeltaOffset + segCount * 2;
  return (codePoint: number) => {
    for (let index = 0; index < segCount; index += 1) {
      const endCode = readUint16(bytes, endCodeOffset + index * 2);
      const startCode = readUint16(bytes, startCodeOffset + index * 2);
      if (codePoint < startCode || codePoint > endCode) continue;
      const idDelta = readInt16(bytes, idDeltaOffset + index * 2);
      const rangeOffsetPosition = idRangeOffsetOffset + index * 2;
      const idRangeOffset = readUint16(bytes, rangeOffsetPosition);
      if (idRangeOffset === 0) return (codePoint + idDelta) & 0xffff;
      const glyphOffset = rangeOffsetPosition + idRangeOffset + (codePoint - startCode) * 2;
      const glyphIndex = readUint16(bytes, glyphOffset);
      return glyphIndex === 0 ? 0 : (glyphIndex + idDelta) & 0xffff;
    }
    return 0;
  };
}

function createGlyphLookup(bytes: Uint8Array, tables: Map<string, { offset: number; length: number }>): (codePoint: number) => number {
  const cmap = tables.get("cmap");
  if (!cmap) return () => 0;
  const tableCount = readUint16(bytes, cmap.offset + 2);
  const candidates: Array<(codePoint: number) => number> = [];
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = cmap.offset + 4 + index * 8;
    const subtableOffset = cmap.offset + readUint32(bytes, recordOffset + 4);
    if (readUint16(bytes, subtableOffset) === 4) candidates.push(createFormat4GlyphLookup(bytes, subtableOffset));
  }
  return candidates.find((lookup) => lookup(0x41) > 0 && lookup(0x2f) > 0 && lookup(0x0e01) > 0)
    ?? candidates.find((lookup) => lookup(0x0e01) > 0)
    ?? candidates[0]
    ?? (() => 0);
}

function thaiFontMetrics(): TrueTypeMetrics {
  if (thaiFontMetricsCache) return thaiFontMetricsCache;
  const bytes = base64ToBytes(NOTO_SANS_THAI_REGULAR_BASE64);
  const tables = readTableDirectory(bytes);
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const maxp = tables.get("maxp");
  const hmtx = tables.get("hmtx");
  if (!head || !hhea || !maxp || !hmtx) throw new Error("Thai PDF font is missing required TrueType tables.");
  const unitsPerEm = readUint16(bytes, head.offset + 18);
  const bbox: [number, number, number, number] = [
    readInt16(bytes, head.offset + 36),
    readInt16(bytes, head.offset + 38),
    readInt16(bytes, head.offset + 40),
    readInt16(bytes, head.offset + 42),
  ];
  const ascent = readInt16(bytes, hhea.offset + 4);
  const descent = readInt16(bytes, hhea.offset + 6);
  const numberOfHMetrics = readUint16(bytes, hhea.offset + 34);
  const numGlyphs = readUint16(bytes, maxp.offset + 4);
  const advances: number[] = [];
  for (let glyphId = 0; glyphId < numGlyphs; glyphId += 1) {
    const metricIndex = Math.min(glyphId, numberOfHMetrics - 1);
    advances[glyphId] = readUint16(bytes, hmtx.offset + metricIndex * 4);
  }
  const glyphIdFor = createGlyphLookup(bytes, tables);
  const maxCid = 0x0e7f;
  const map = new Uint8Array((maxCid + 1) * 2);
  const widthEntries: string[] = [];
  for (const range of [[32, 126], [0x0e00, 0x0e7f]] as const) {
    const widths: number[] = [];
    for (let code = range[0]; code <= range[1]; code += 1) {
      const glyphId = glyphIdFor(code);
      map[code * 2] = (glyphId >> 8) & 0xff;
      map[code * 2 + 1] = glyphId & 0xff;
      widths.push(Math.max(0, Math.round(((advances[glyphId] ?? advances[0] ?? unitsPerEm / 2) / unitsPerEm) * 1000)));
    }
    widthEntries.push(`${range[0]} [${widths.join(" ")}]`);
  }
  thaiFontMetricsCache = {
    bytes,
    unitsPerEm,
    ascent,
    descent,
    bbox,
    cidToGidHex: bytesToHex(map),
    widthsPdf: `[${widthEntries.join(" ")}]`,
  };
  return thaiFontMetricsCache;
}

function toUnicodeCMap(): string {
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /VanaraThaiUnicode def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
2 beginbfrange
<0020> <007E> <0020>
<0E00> <0E7F> <0E00>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
}

function wrapText(value: string, maxChars: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [value];
}

function buildPdf(pages: string[][]): Uint8Array {
  const thaiFont = thaiFontMetrics();
  const thaiFontHex = bytesToHex(thaiFont.bytes);
  const logoBytes = base64ToBytes(VANARA_LOGO_PDF_JPEG_BASE64);
  const logoHex = bytesToHex(logoBytes);
  const toUnicode = toUnicodeCMap();
  const objects: Array<{ id: number; body: string }> = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { id: 3, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    { id: 4, body: "<< /Type /Font /Subtype /Type0 /BaseFont /NotoSansThai-Regular /Encoding /Identity-H /DescendantFonts [5 0 R] /ToUnicode 6 0 R >>" },
    { id: 5, body: `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSansThai-Regular /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /DW 500 /W ${thaiFont.widthsPdf} /CIDToGIDMap 8 0 R >>` },
    { id: 6, body: `<< /Length ${new TextEncoder().encode(toUnicode).length} >>\nstream\n${toUnicode}\nendstream` },
    { id: 7, body: `<< /Type /FontDescriptor /FontName /NotoSansThai-Regular /Flags 32 /FontBBox [${thaiFont.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${thaiFont.ascent} /Descent ${thaiFont.descent} /CapHeight ${thaiFont.ascent} /StemV 80 /FontFile2 9 0 R >>` },
    { id: 8, body: `<< /Length ${thaiFont.cidToGidHex.length + 1} /Filter /ASCIIHexDecode >>\nstream\n${thaiFont.cidToGidHex}>\nendstream` },
    { id: 9, body: `<< /Length ${thaiFontHex.length + 1} /Length1 ${thaiFont.bytes.length} /Filter /ASCIIHexDecode >>\nstream\n${thaiFontHex}>\nendstream` },
    { id: 10, body: `<< /Type /XObject /Subtype /Image /Width ${VANARA_LOGO_PDF_JPEG_WIDTH} /Height ${VANARA_LOGO_PDF_JPEG_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${logoHex.length + 1} >>\nstream\n${logoHex}>\nendstream` },
  ];
  const pageIds: number[] = [];
  pages.forEach((lines, index) => {
    const contentId = 20 + index * 2;
    const pageId = contentId + 1;
    const stream = lines.join("\n");
    objects.push({ id: contentId, body: `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream` });
    objects.push({ id: pageId, body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 10 0 R >> >> /Contents ${contentId} 0 R >>` });
    pageIds.push(pageId);
  });
  objects.push({ id: 2, body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>` });
  objects.sort((left, right) => left.id - right.id);
  let pdf = "%PDF-1.7\n";
  const maxId = Math.max(...objects.map((object) => object.id));
  const offsets = new Array<number>(maxId + 1).fill(0);
  for (const object of objects) {
    offsets[object.id] = new TextEncoder().encode(pdf).length;
    pdf += pdfObject(object.id, object.body);
  }
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= maxId; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export async function generatePayrollStatementPdf(env: PayrollBindings, employeeUserId: string, payrollMonth: string): Promise<Uint8Array> {
  const worker = await getPayrollWorker(env, employeeUserId, payrollMonth);
  if (!worker) throw new Error("Payroll worker not found.");
  const calculation = worker.record?.status === "FINALIZED" ? worker.record.calculation : worker.calculation;
  const generated = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "short", year: "numeric" });
  const statementMonth = worker.record?.payrollMonth ?? payrollMonth;
  const titleLines = wrapText(worker.fullName, 42);
  const pageOne: string[] = [
    "q 0.08 0.22 0.16 rg 0 760 595 82 re f Q",
    "q 58 0 0 58 44 776 cm /Logo Do Q",
    textLine(116, 800, 26, "Vanara", "1 1 1"),
    textLine(116, 780, 12, COMPANY_PROFILE.legalNameThai, "1 1 1", "F2"),
    textLine(350, 800, 18, "Payroll Statement", "1 1 1"),
    textLine(350, 780, 10, `Registration no. ${COMPANY_PROFILE.registrationNumber}`, "1 1 1"),
    textLine(44, 738, 10, `Payroll month: ${statementMonth}`),
    textLine(44, 722, 10, `Employee: ${titleLines[0]}`),
    textLine(44, 706, 10, `Generated: ${generated}`),
    textLine(320, 728, 12, "Net Salary Payable", "0.08 0.22 0.16"),
    textLine(320, 704, 24, money(calculation.netSalaryPayable), "0.08 0.22 0.16"),
    textLine(44, 674, 14, "English Summary", "0.08 0.22 0.16"),
  ];
  if (titleLines[1]) pageOne.push(textLine(91, 710, 10, titleLines.slice(1).join(" ")));
  let y = 650;
  for (const item of calculation.lineItems) {
    pageOne.push(textLine(54, y, item.tone === "total" ? 12 : 10, item.label, item.tone === "total" ? "0.08 0.22 0.16" : "0 0 0"));
    pageOne.push(textLine(405, y, item.tone === "total" ? 12 : 10, item.tone === "total" ? `= ${money(item.amount)}` : signedMoney(item.amount), item.amount < 0 ? "0.55 0.08 0.07" : "0.08 0.22 0.16"));
    const explanationLines = wrapText(item.explanation, 78);
    pageOne.push(textLine(66, y - 13, 8, explanationLines[0] ?? "", "0.34 0.34 0.34"));
    if (explanationLines[1]) pageOne.push(textLine(66, y - 24, 8, explanationLines[1], "0.34 0.34 0.34"));
    y -= item.tone === "total" ? 28 : explanationLines[1] ? 42 : 35;
  }
  y = Math.max(y - 4, 104);
  pageOne.push(textLine(44, y, 14, "Thai Summary", "0.08 0.22 0.16"));
  y -= 20;
  for (const item of calculation.lineItems) {
    pageOne.push(textLine(54, y, item.tone === "total" ? 11 : 9, item.thaiLabel, item.tone === "total" ? "0.08 0.22 0.16" : "0 0 0", "F2"));
    pageOne.push(textLine(405, y, item.tone === "total" ? 11 : 9, item.tone === "total" ? `= ${money(item.amount)}` : signedMoney(item.amount), item.amount < 0 ? "0.55 0.08 0.07" : "0.08 0.22 0.16"));
    pageOne.push(textLine(66, y - 11, 7, item.thaiExplanation, "0.34 0.34 0.34", "F2"));
    y -= item.tone === "total" ? 23 : 27;
    if (y < 58) break;
  }
  pageOne.push(textLine(44, 34, 8, `${COMPANY_PROFILE.brandName} - Confidential internal payroll statement`, "0.32 0.32 0.32"));

  const pageTwo: string[] = [
    "q 0.08 0.22 0.16 rg 0 792 595 50 re f Q",
    textLine(44, 812, 16, "Payroll adjustments", "1 1 1"),
    textLine(230, 812, 14, "รายละเอียดการปรับเงินเดือน", "1 1 1", "F2"),
    textLine(44, 762, 10, `Payroll month: ${statementMonth}`),
    textLine(44, 746, 10, `Employee: ${worker.fullName}`),
    textLine(44, 720, 11, "Monthly payroll details", "0.08 0.22 0.16"),
  ];
  y = 700;
  const events = [...worker.events].sort((left, right) => left.eventDate.localeCompare(right.eventDate) || left.createdAt.localeCompare(right.createdAt));
  if (events.length === 0) {
    pageTwo.push(textLine(54, y, 10, "No monthly events recorded."));
    y -= 28;
  } else {
    for (const event of events.slice(0, 12)) {
      const note = event.note ? ` - ${event.note}` : "";
      const detail = `${formatEventDate(event.eventDate)} - ${EVENT_LABELS[event.eventType]} - ${eventValue(event, calculation)}${note}`;
      for (const line of wrapText(detail, 86).slice(0, 2)) {
        pageTwo.push(textLine(54, y, 9, line));
        y -= 13;
      }
      y -= 6;
      if (y < 410) break;
    }
  }
  y = Math.min(y, 410);
  pageTwo.push(textLine(44, y, 11, "รายละเอียดเงินเดือนประจำเดือน", "0.08 0.22 0.16", "F2"));
  y -= 20;
  if (events.length === 0) {
    pageTwo.push(textLine(54, y, 10, "ไม่มีรายการประจำเดือน", "0 0 0", "F2"));
  } else {
    for (const event of events.slice(0, 12)) {
      pageTwo.push(textLine(54, y, 9, String(Number(event.eventDate.slice(8, 10)))));
      pageTwo.push(textLine(76, y, 9, thaiMonthName(event.eventDate), "0 0 0", "F2"));
      pageTwo.push(textLine(144, y, 9, EVENT_THAI_LABELS[event.eventType], "0 0 0", "F2"));
      pageTwo.push(textLine(330, y, 9, eventValue(event, calculation)));
      if (event.note) {
        y -= 13;
        pageTwo.push(textLine(144, y, 8, event.note, "0.32 0.32 0.32"));
      }
      y -= 20;
      if (y < 88) break;
    }
  }
  pageTwo.push(textLine(44, 58, 8, `Company registration: ${COMPANY_PROFILE.registrationNumber}. Certificate date: ${COMPANY_PROFILE.certificateDate}.`, "0.32 0.32 0.32"));
  pageTwo.push(textLine(44, 44, 8, "37/5", "0.32 0.32 0.32"));
  pageTwo.push(textLine(68, 44, 8, "หมู่ที่", "0.32 0.32 0.32", "F2"));
  pageTwo.push(textLine(102, 44, 8, "1", "0.32 0.32 0.32"));
  pageTwo.push(textLine(112, 44, 8, "ตำบลเกาะช้างใต้ อำเภอเกาะช้าง จังหวัดตราด", "0.32 0.32 0.32", "F2"));
  return buildPdf([pageOne, pageTwo]);
}
