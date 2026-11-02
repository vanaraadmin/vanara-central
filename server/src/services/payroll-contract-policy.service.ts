export type PayrollContractType = "INDEFINITE" | "SEASONAL";
export type PayrollSsoTreatment = "SECTION_33" | "EXEMPT_DECLARED";
export type PayrollAttendanceStatus =
  | "WORKED"
  | "UNPAID_ABSENCE"
  | "PAID_LEAVE"
  | "PROTECTED_PAID_LEAVE"
  | "WEEKLY_REST";

export interface ContractPayrollEvent {
  id: number;
  eventType:
    | "UNPAID_ABSENCE_DAY"
    | "UNPAID_ABSENCE_HOUR"
    | "OVERTIME_HOUR"
    | "EXTRA_WORKED_DAY"
    | "SALARY_ADVANCE"
    | "BONUS_ADDITION"
    | "AUTHORIZED_DEDUCTION";
  quantity: number;
  amount: number;
  rateMultiplier?: number | null;
}

export interface ContractAttendanceDay {
  date: string;
  status: PayrollAttendanceStatus;
}

export interface ContractBonusRule {
  id: number;
  key: string;
  competenceMonth: string;
  paymentDate: string;
  amount: number;
  label: string;
  thaiLabel: string;
}

export interface ContractCorrectionDelta {
  id: number;
  originMonth: string;
  originDate: string;
  salaryDelta: number;
  foodDelta: number;
}

export interface ContractPolicyDescriptor {
  employeeKey: string;
  profileKey: string;
  profileVersionId: number;
  profileVersionKey: string;
  compensationRuleKey: string;
  contractType: PayrollContractType;
  effectiveFrom: string;
  effectiveTo: string | null;
  calendarTimezone: "Asia/Bangkok";
  normalHoursPerDay: number;
  monthlyDayDivisor: 30;
  ordinaryOvertimeMultiplier: number;
  restDayOvertimeMultiplier: number;
  salaryPaymentDay: number;
  paidLeaveDays: number;
  paidLeaveEligibleAfterMonths: number;
  ssoTreatment: PayrollSsoTreatment;
  ssoVersionKey: string | null;
  employeeSsoRate: number;
  employerSsoRate: number;
  ssoWageCeiling: number;
  monthlyBaseSalary: number;
  monthlyFoodAllowance: number;
  monthlyHousingAllowance: number;
  monthlyAccommodationDeduction: number;
  allowanceAdvanceMonth: string;
  allowanceAdvanceFood: number;
  allowanceAdvanceHousing: number;
  originMonthFoodAllowance: number;
  finalFoodAuthorizedCap: number;
}

export interface ContractPaidLeaveSummary {
  eligible: boolean;
  opening: number;
  used: number;
  closing: number;
}

export interface ContractPayrollLineItem {
  label: string;
  amount: number;
  tone: "addition" | "deduction" | "information" | "total";
  affectsNet: boolean;
  explanation: string;
  thaiLabel: string;
  thaiExplanation: string;
}

export interface ContractPayrollPolicyInput {
  payrollMonth: string;
  descriptor: ContractPolicyDescriptor;
  events: ContractPayrollEvent[];
  attendance: ContractAttendanceDay[];
  originMonthAttendance: ContractAttendanceDay[];
  correctionDeltas: ContractCorrectionDelta[];
  bonusRules: ContractBonusRule[];
  paidLeave: ContractPaidLeaveSummary;
}

export interface ContractPayrollPolicyResult {
  descriptor: ContractPolicyDescriptor;
  attendance: ContractAttendanceDay[];
  paidLeave: ContractPaidLeaveSummary;
  dailyPay: number;
  hourlyPay: number;
  employeeSocialSecurity: number;
  employerSocialSecurity: number;
  absenceDeduction: number;
  overtimeCompensation: number;
  mealAllowanceAdvance: number;
  housingAllowance: number;
  openingFoodAdvance: number;
  openingHousingAdvance: number;
  openingAllowanceAdvanceTotal: number;
  salaryBalancePayable: number;
  salaryPaymentDate: string;
  accommodationDeduction: number;
  priorMonthFoodAdjustment: number;
  finalMonthFoodAdjustment: number;
  attendanceCorrectionDelta: number;
  contractBonusTotal: number;
  netSalaryPayable: number;
  unpaidAbsenceDays: number;
  unpaidAbsenceHours: number;
  overtimeHours: number;
  extraWorkedDays: number;
  totalOvertimeHours: number;
  salaryAdvancesReceived: number;
  bonusesAdditions: number;
  authorizedDeductions: number;
  bonusRuleIds: number[];
  correctionDeltaIds: number[];
  lineItems: ContractPayrollLineItem[];
}

interface EmployeeProfileRow {
  employee_key: string;
  profile_key: string;
}

interface ProfileVersionRow {
  profile_version_id: number;
  version_key: string;
  contract_type: PayrollContractType;
  effective_from_bangkok: string;
  effective_to_bangkok: string | null;
  calendar_timezone: "Asia/Bangkok";
  normal_hours_per_day: number;
  monthly_day_divisor: number;
  ordinary_overtime_multiplier: number;
  rest_day_overtime_multiplier: number;
  paid_leave_days: number;
  paid_leave_eligible_after_months: number;
  sso_treatment: PayrollSsoTreatment;
  salary_payment_day: number;
}

interface CompensationRow {
  rule_key: string;
  monthly_base_salary: number;
  monthly_food_allowance: number;
  monthly_housing_allowance: number;
  monthly_accommodation_deduction: number;
}

interface SsoRow {
  version_key: string;
  employee_rate: number;
  employer_rate: number;
  wage_ceiling: number;
}

interface AttendanceRow {
  work_date_bangkok: string;
  attendance_status: PayrollAttendanceStatus;
}

interface BonusRow {
  bonus_rule_id: number;
  bonus_key: string;
  competence_month: string;
  payment_date_bangkok: string;
  amount: number;
  label_en: string;
  label_th: string;
}

interface CorrectionRow {
  correction_delta_id: number;
  origin_month: string;
  origin_work_date_bangkok: string;
  salary_delta: number;
  food_delta: number;
}

const CONTRACT_EMPLOYEE_KEYS = new Set([
  "EMPLOYEE-0001",
  "EMPLOYEE-0002",
  "EMPLOYEE-0003",
  "EMPLOYEE-0004",
  "EMPLOYEE-0007",
]);

const FOOD_RATE_PER_UNPAID_DAY = 50;

export class PayrollContractConfigurationError extends Error {
  readonly code = "PAYROLL_CONTRACT_CONFIGURATION_MISSING";

  constructor(employeeKey: string, detail: string) {
    super(`Contract payroll configuration is incomplete for ${employeeKey}: ${detail}`);
    this.name = "PayrollContractConfigurationError";
  }
}

export class PayrollContractAccountLinkRequiredError extends Error {
  readonly code = "PAYROLL_ACCOUNT_LINK_REQUIRED";

  constructor(employeeKey: string) {
    super(`Account link required for ${employeeKey}.`);
    this.name = "PayrollContractAccountLinkRequiredError";
  }
}

export function isContractEmployeeKey(value: string): boolean {
  return CONTRACT_EMPLOYEE_KEYS.has(value);
}

export function roundPayrollMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function assertPaidLeaveSelectionAllowed(
  contractType: PayrollContractType,
  paidLeave: ContractPaidLeaveSummary,
  previousStatus: PayrollAttendanceStatus | null,
  nextStatus: PayrollAttendanceStatus,
): void {
  if (nextStatus !== "PAID_LEAVE") return;
  if (contractType !== "INDEFINITE") {
    throw new Error("Paid annual leave is available only for indefinite contracts.");
  }
  if (!paidLeave.eligible) {
    throw new Error("Paid annual leave is not yet available for this contract.");
  }
  if (previousStatus !== "PAID_LEAVE" && paidLeave.closing <= 0) {
    throw new Error("Paid annual leave balance is exhausted.");
  }
}

function money(value: number): string {
  return `${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
}

function monthBounds(month: string): { start: string; end: string } {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthNumber = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error("Payroll month must use YYYY-MM.");
  }
  const endDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(endDay).padStart(2, "0")}` };
}

export function previousPayrollMonth(month: string): string {
  const [yearRaw, monthRaw] = month.split("-");
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextPayrollMonth(month: string): string {
  const [yearRaw, monthRaw] = month.split("-");
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function payrollMonthLabel(month: string): string {
  const [yearRaw, monthRaw] = month.split("-");
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function thaiPayrollMonthLabel(month: string): string {
  const [yearRaw, monthRaw] = month.split("-");
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, 1));
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function addMonths(dateText: string, months: number): string {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function salaryPaymentDate(payrollMonth: string, salaryPaymentDay: number): string {
  const [yearRaw, monthRaw] = payrollMonth.split("-");
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw), salaryPaymentDay));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function uniqueAttendance(days: ContractAttendanceDay[]): ContractAttendanceDay[] {
  const byDate = new Map<string, ContractAttendanceDay>();
  for (const day of days) byDate.set(day.date, day);
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function line(
  label: string,
  amount: number,
  tone: ContractPayrollLineItem["tone"],
  explanation: string,
  thaiLabel: string,
  thaiExplanation: string,
  affectsNet = true,
): ContractPayrollLineItem {
  return {
    label,
    amount: roundPayrollMoney(amount),
    tone,
    affectsNet,
    explanation,
    thaiLabel,
    thaiExplanation,
  };
}

export function calculateContractPayrollPolicy(input: ContractPayrollPolicyInput): ContractPayrollPolicyResult {
  const descriptor = input.descriptor;
  if (descriptor.calendarTimezone !== "Asia/Bangkok" || descriptor.monthlyDayDivisor !== 30) {
    throw new PayrollContractConfigurationError(descriptor.employeeKey, "timezone or divisor is invalid");
  }

  const attendance = uniqueAttendance(input.attendance);
  const originAttendance = uniqueAttendance(input.originMonthAttendance);
  const unpaidAbsenceDays = attendance.filter((day) => day.status === "UNPAID_ABSENCE").length;
  const originUnpaidAbsenceDays = originAttendance.filter((day) => day.status === "UNPAID_ABSENCE").length;
  const dailyPay = roundPayrollMoney(descriptor.monthlyBaseSalary / 30);
  const hourlyPay = roundPayrollMoney(descriptor.monthlyBaseSalary / 30 / descriptor.normalHoursPerDay);
  const employeeSocialSecurity = descriptor.ssoTreatment === "SECTION_33"
    ? Math.round(Math.min(descriptor.monthlyBaseSalary, descriptor.ssoWageCeiling) * descriptor.employeeSsoRate)
    : 0;
  const employerSocialSecurity = descriptor.ssoTreatment === "SECTION_33"
    ? Math.round(Math.min(descriptor.monthlyBaseSalary, descriptor.ssoWageCeiling) * descriptor.employerSsoRate)
    : 0;

  let unpaidAbsenceHours = 0;
  let overtimeHours = 0;
  let extraWorkedDays = 0;
  let salaryAdvancesReceived = 0;
  let manualBonuses = 0;
  let authorizedDeductions = 0;
  let overtimeCompensation = 0;

  for (const event of input.events) {
    if (event.eventType === "UNPAID_ABSENCE_HOUR") unpaidAbsenceHours += event.quantity;
    if (event.eventType === "OVERTIME_HOUR") {
      overtimeHours += event.quantity;
      const multiplier = event.rateMultiplier ?? descriptor.ordinaryOvertimeMultiplier;
      overtimeCompensation += roundPayrollMoney(event.quantity * hourlyPay * multiplier);
    }
    if (event.eventType === "EXTRA_WORKED_DAY") {
      extraWorkedDays += event.quantity;
      overtimeCompensation += roundPayrollMoney(event.quantity * dailyPay);
    }
    if (event.eventType === "SALARY_ADVANCE") salaryAdvancesReceived += event.amount;
    if (event.eventType === "BONUS_ADDITION") manualBonuses += event.amount;
    if (event.eventType === "AUTHORIZED_DEDUCTION") authorizedDeductions += event.amount;
  }

  const absenceDeduction = roundPayrollMoney(
    unpaidAbsenceDays * dailyPay + unpaidAbsenceHours * hourlyPay,
  );
  overtimeCompensation = roundPayrollMoney(overtimeCompensation);

  const automaticPriorFoodAdjustment = descriptor.monthlyFoodAllowance > 0
    ? Math.min(
        originUnpaidAbsenceDays * FOOD_RATE_PER_UNPAID_DAY,
        descriptor.originMonthFoodAllowance,
      )
    : 0;
  const finalMonthFoodAdjustment = descriptor.effectiveTo?.slice(0, 7) === input.payrollMonth
    ? Math.min(
        unpaidAbsenceDays * FOOD_RATE_PER_UNPAID_DAY,
        descriptor.monthlyFoodAllowance,
        descriptor.finalFoodAuthorizedCap,
      )
    : 0;
  const priorMonthFoodAdjustment = roundPayrollMoney(automaticPriorFoodAdjustment);
  const authorizedFinalFoodAdjustment = roundPayrollMoney(finalMonthFoodAdjustment);
  const eligibleCorrectionDeltas = input.correctionDeltas.filter((delta) => delta.originMonth < input.payrollMonth);
  const correctionSalaryDelta = roundPayrollMoney(
    eligibleCorrectionDeltas.reduce((sum, delta) => sum + delta.salaryDelta, 0),
  );
  const correctionFoodDelta = roundPayrollMoney(
    eligibleCorrectionDeltas.reduce((sum, delta) => sum + delta.foodDelta, 0),
  );
  const attendanceCorrectionDelta = roundPayrollMoney(correctionSalaryDelta + correctionFoodDelta);
  const contractBonusTotal = roundPayrollMoney(
    input.bonusRules.reduce((sum, bonus) => sum + bonus.amount, 0),
  );
  const bonusesAdditions = roundPayrollMoney(manualBonuses + contractBonusTotal);
  const totalOvertimeHours = roundPayrollMoney(
    overtimeHours + extraWorkedDays * descriptor.normalHoursPerDay,
  );
  const allowanceAdvanceMonthLabel = payrollMonthLabel(descriptor.allowanceAdvanceMonth);
  const thaiAllowanceAdvanceMonthLabel = thaiPayrollMonthLabel(descriptor.allowanceAdvanceMonth);

  const lineItems: ContractPayrollLineItem[] = [
    line(
      "Monthly base salary",
      descriptor.monthlyBaseSalary,
      "addition",
      `Fixed contractual monthly base for ${input.payrollMonth}; calendar length does not change it.`,
      "เงินเดือนพื้นฐานรายเดือน",
      "เงินเดือนพื้นฐานคงที่ตามสัญญา ไม่เปลี่ยนตามจำนวนวันในเดือน",
    ),
    line(
      "Employee Social Security",
      -employeeSocialSecurity,
      "deduction",
      descriptor.ssoTreatment === "SECTION_33"
        ? `${(descriptor.employeeSsoRate * 100).toFixed(2)}% of the statutory contribution base, subject to the effective ceiling.`
        : "THB 0 under the signed external-coverage declaration; statutory saving clause applies.",
      "ประกันสังคมส่วนพนักงาน",
      descriptor.ssoTreatment === "SECTION_33"
        ? "คำนวณตามอัตราและเพดานที่มีผลบังคับใช้"
        : "0 บาท ตามหนังสือรับรองความคุ้มครองจากที่อื่น โดยยังคงเป็นไปตามกฎหมาย",
    ),
    line(
      "Employer Social Security",
      employerSocialSecurity,
      "information",
      "Employer cost shown separately and never deducted from employee pay.",
      "ประกันสังคมส่วนนายจ้าง",
      "เป็นค่าใช้จ่ายของนายจ้าง แสดงแยกและไม่หักจากเงินพนักงาน",
      false,
    ),
    line(
      "Unpaid scheduled workdays / hours",
      -absenceDeduction,
      "deduction",
      `${unpaidAbsenceDays} unique days x ${money(dailyPay)} + ${unpaidAbsenceHours.toFixed(2)} hours x ${money(hourlyPay)}.`,
      "หักวันหรือชั่วโมงขาดงานไม่รับค่าจ้าง",
      `${unpaidAbsenceDays} วันไม่ซ้ำ และ ${unpaidAbsenceHours.toFixed(2)} ชั่วโมง`,
    ),
    line(
      "Overtime and extra shifts",
      overtimeCompensation,
      "addition",
      `${overtimeHours.toFixed(2)} overtime hours and ${extraWorkedDays.toFixed(2)} extra full shifts, using contract/statutory multipliers.`,
      "ค่าล่วงเวลาและกะพิเศษ",
      "คำนวณจากชั่วโมงล่วงเวลาและกะเต็มเพิ่มเติมตามอัตราในสัญญาและกฎหมาย",
    ),
    line(
      `${allowanceAdvanceMonthLabel} food allowance advance`,
      descriptor.allowanceAdvanceFood,
      "addition",
      `Advance for ${allowanceAdvanceMonthLabel}, paid together with the salary for ${input.payrollMonth}.`,
      `ค่าอาหารล่วงหน้าเดือน${thaiAllowanceAdvanceMonthLabel}`,
      `จ่ายล่วงหน้าสำหรับเดือน${thaiAllowanceAdvanceMonthLabel} พร้อมเงินเดือนของเดือน${input.payrollMonth}`,
    ),
    line(
      `${allowanceAdvanceMonthLabel} housing allowance advance`,
      descriptor.allowanceAdvanceHousing,
      "addition",
      `Advance for ${allowanceAdvanceMonthLabel}, paid together with the salary for ${input.payrollMonth}.`,
      `ค่าเช่าที่พักล่วงหน้าเดือน${thaiAllowanceAdvanceMonthLabel}`,
      `จ่ายล่วงหน้าสำหรับเดือน${thaiAllowanceAdvanceMonthLabel} พร้อมเงินเดือนของเดือน${input.payrollMonth}`,
    ),
    line(
      "Prior-month unpaid-absence food adjustment",
      -priorMonthFoodAdjustment,
      "deduction",
      `${originUnpaidAbsenceDays} unique unpaid absences x ${money(FOOD_RATE_PER_UNPAID_DAY)}, capped by food advanced for the origin month.`,
      "ปรับค่าอาหารจากการขาดงานไม่รับค่าจ้างเดือนก่อน",
      "50 บาทต่อวันขาดงานที่ไม่ซ้ำ และไม่เกินค่าอาหารที่จ่ายล่วงหน้าในเดือนต้นทาง",
    ),
    line(
      "Final-month food adjustment",
      -authorizedFinalFoodAdjustment,
      "deduction",
      authorizedFinalFoodAdjustment > 0
        ? "Applied only under the documented final-settlement authorization."
        : "No documented final-settlement adjustment applied.",
      "ปรับค่าอาหารเดือนสุดท้าย",
      authorizedFinalFoodAdjustment > 0
        ? "ใช้เฉพาะเมื่อมีการอนุมัติการชำระงวดสุดท้ายเป็นลายลักษณ์อักษร"
        : "ไม่มีการปรับโดยไม่มีเอกสารอนุมัติ",
    ),
    line(
      "Attendance correction carried forward",
      attendanceCorrectionDelta,
      attendanceCorrectionDelta < 0 ? "deduction" : "addition",
      "Idempotent delta from an attendance correction made after an earlier payroll was finalized.",
      "ยอดแก้ไขการลงเวลาที่ยกมา",
      "ยอดต่างจากการแก้ไขหลังปิดเงินเดือนเดิม ไม่แก้ไขย้อนหลังและไม่หักซ้ำ",
    ),
    line(
      "Salary advances already received",
      -roundPayrollMoney(salaryAdvancesReceived),
      "deduction",
      "Advances already paid during the month.",
      "หักเงินเบิกล่วงหน้า",
      "เงินล่วงหน้าที่ได้รับแล้วในเดือนนี้",
    ),
    line(
      "Contract and authorized bonuses",
      bonusesAdditions,
      "addition",
      input.bonusRules.length > 0
        ? input.bonusRules.map((bonus) => `${bonus.label}: ${money(bonus.amount)} payable ${bonus.paymentDate}`).join("; ")
        : "Authorized additions recorded for this payroll month.",
      "โบนัสตามสัญญาและรายการเพิ่มที่อนุมัติ",
      input.bonusRules.length > 0
        ? input.bonusRules.map((bonus) => `${bonus.thaiLabel}: ${money(bonus.amount)}`).join("; ")
        : "รายการเพิ่มที่ได้รับอนุมัติสำหรับเดือนนี้",
    ),
    line(
      "Accommodation and utilities contribution",
      -descriptor.monthlyAccommodationDeduction,
      "deduction",
      `Fixed contractual contribution for ${input.payrollMonth}.`,
      "เงินสมทบค่าที่พักและสาธารณูปโภค",
      "ยอดคงที่ตามสัญญาสำหรับเดือนนี้",
    ),
    line(
      "Other authorized deductions",
      -roundPayrollMoney(authorizedDeductions),
      "deduction",
      "Authorized deductions recorded for this payroll month.",
      "รายการหักอื่นที่ได้รับอนุมัติ",
      "รายการหักที่ได้รับอนุมัติสำหรับเดือนนี้",
    ),
  ];
  const netSalaryPayable = roundPayrollMoney(
    lineItems.filter((item) => item.affectsNet).reduce((sum, item) => sum + item.amount, 0),
  );
  const openingFoodAdvance = roundPayrollMoney(descriptor.allowanceAdvanceFood);
  const openingHousingAdvance = roundPayrollMoney(descriptor.allowanceAdvanceHousing);
  const openingAllowanceAdvanceTotal = roundPayrollMoney(openingFoodAdvance + openingHousingAdvance);
  const salaryBalancePayable = roundPayrollMoney(netSalaryPayable - openingAllowanceAdvanceTotal);
  lineItems.push(line(
    "Net salary payable",
    netSalaryPayable,
    "total",
    "Sum of the rounded payslip lines above.",
    "เงินเดือนสุทธิที่ต้องจ่าย",
    "ผลรวมของแต่ละรายการในสลิปหลังปัดทศนิยมแล้ว",
    false,
  ));

  return {
    descriptor,
    attendance,
    paidLeave: input.paidLeave,
    dailyPay,
    hourlyPay,
    employeeSocialSecurity,
    employerSocialSecurity,
    absenceDeduction,
    overtimeCompensation,
    mealAllowanceAdvance: openingFoodAdvance,
    housingAllowance: openingHousingAdvance,
    openingFoodAdvance,
    openingHousingAdvance,
    openingAllowanceAdvanceTotal,
    salaryBalancePayable,
    salaryPaymentDate: salaryPaymentDate(input.payrollMonth, descriptor.salaryPaymentDay),
    accommodationDeduction: roundPayrollMoney(descriptor.monthlyAccommodationDeduction),
    priorMonthFoodAdjustment,
    finalMonthFoodAdjustment: authorizedFinalFoodAdjustment,
    attendanceCorrectionDelta,
    contractBonusTotal,
    netSalaryPayable,
    unpaidAbsenceDays,
    unpaidAbsenceHours,
    overtimeHours: roundPayrollMoney(overtimeHours),
    extraWorkedDays: roundPayrollMoney(extraWorkedDays),
    totalOvertimeHours,
    salaryAdvancesReceived: roundPayrollMoney(salaryAdvancesReceived),
    bonusesAdditions,
    authorizedDeductions: roundPayrollMoney(authorizedDeductions),
    bonusRuleIds: input.bonusRules.map((bonus) => bonus.id),
    correctionDeltaIds: eligibleCorrectionDeltas.map((delta) => delta.id),
    lineItems,
  };
}

async function requireSingle<T>(
  promise: Promise<D1Result<T>>,
  employeeKey: string,
  detail: string,
): Promise<T> {
  const rows = (await promise).results ?? [];
  if (rows.length !== 1) throw new PayrollContractConfigurationError(employeeKey, detail);
  return rows[0];
}

async function loadCompensation(
  db: D1Database,
  employeeKey: string,
  profileVersionId: number,
  month: string,
): Promise<CompensationRow | null> {
  const bounds = monthBounds(month);
  const monthNumber = month.slice(5, 7);
  const rows = await db.prepare(`
    SELECT rule_key, monthly_base_salary, monthly_food_allowance,
      monthly_housing_allowance, monthly_accommodation_deduction
    FROM payroll_contract_compensation_rules
    WHERE profile_version_id = ?
      AND effective_from_bangkok <= ?
      AND (effective_to_bangkok IS NULL OR effective_to_bangkok >= ?)
      AND (
        month_mask IS NULL
        OR instr(',' || month_mask || ',', ',' || ? || ',') > 0
      )
    ORDER BY effective_from_bangkok DESC, compensation_rule_id DESC
  `).bind(profileVersionId, bounds.end, bounds.start, monthNumber).all<CompensationRow>();
  const results = rows.results ?? [];
  if (results.length > 1) {
    throw new PayrollContractConfigurationError(employeeKey, `multiple compensation rules match ${month}`);
  }
  return results[0] ?? null;
}

function attendanceFromRows(rows: AttendanceRow[]): ContractAttendanceDay[] {
  return rows.map((row) => ({ date: row.work_date_bangkok, status: row.attendance_status }));
}

export async function loadContractPayrollPolicy(
  db: D1Database,
  authUserId: string,
  payrollMonth: string,
): Promise<ContractPayrollPolicyInput | null> {
  const employee = await db.prepare(`
    SELECT employee_key, profile_key
    FROM payroll_employees
    WHERE auth_user_id = ? AND employee_status = 'ACTIVE'
  `).bind(authUserId).first<EmployeeProfileRow>();
  if (!employee) return null;

  const bounds = monthBounds(payrollMonth);
  const version = await requireSingle(
    db.prepare(`
      SELECT profile_version_id, version_key, contract_type,
        effective_from_bangkok, effective_to_bangkok, calendar_timezone,
        normal_hours_per_day, monthly_day_divisor,
        ordinary_overtime_multiplier, rest_day_overtime_multiplier,
        paid_leave_days, paid_leave_eligible_after_months, sso_treatment,
        salary_payment_day
      FROM payroll_contract_profile_versions
      WHERE profile_key = ?
        AND effective_from_bangkok <= ?
        AND (effective_to_bangkok IS NULL OR effective_to_bangkok >= ?)
      ORDER BY effective_from_bangkok DESC, profile_version_id DESC
    `).bind(employee.profile_key, bounds.end, bounds.start).all<ProfileVersionRow>(),
    employee.employee_key,
    `one effective profile version is required for ${payrollMonth}`,
  );
  if (version.calendar_timezone !== "Asia/Bangkok" || Number(version.monthly_day_divisor) !== 30) {
    throw new PayrollContractConfigurationError(employee.employee_key, "Asia/Bangkok and divisor 30 are required");
  }

  const compensation = await loadCompensation(
    db,
    employee.employee_key,
    Number(version.profile_version_id),
    payrollMonth,
  );
  if (!compensation) {
    throw new PayrollContractConfigurationError(employee.employee_key, `compensation rule missing for ${payrollMonth}`);
  }

  const originMonth = previousPayrollMonth(payrollMonth);
  const allowanceAdvanceMonth = nextPayrollMonth(payrollMonth);
  const originCompensation = await loadCompensation(
    db,
    employee.employee_key,
    Number(version.profile_version_id),
    originMonth,
  );
  const allowanceAdvanceCompensation = await loadCompensation(
    db,
    employee.employee_key,
    Number(version.profile_version_id),
    allowanceAdvanceMonth,
  );
  let sso: SsoRow | null = null;
  if (version.sso_treatment === "SECTION_33") {
    sso = await requireSingle(
      db.prepare(`
        SELECT version_key, employee_rate, employer_rate, wage_ceiling
        FROM payroll_statutory_sso_parameters
        WHERE effective_from_bangkok <= ?
          AND (effective_to_bangkok IS NULL OR effective_to_bangkok >= ?)
        ORDER BY effective_from_bangkok DESC, sso_parameter_id DESC
      `).bind(bounds.end, bounds.start).all<SsoRow>(),
      employee.employee_key,
      `one effective SSO parameter set is required for ${payrollMonth}`,
    );
  }

  const [attendanceRows, originAttendanceRows, bonusRows, correctionRows, finalAuthorization] = await Promise.all([
    db.prepare(`
      SELECT work_date_bangkok, attendance_status
      FROM payroll_attendance_days
      WHERE employee_key = ? AND substr(work_date_bangkok, 1, 7) = ?
      ORDER BY work_date_bangkok
    `).bind(employee.employee_key, payrollMonth).all<AttendanceRow>(),
    db.prepare(`
      SELECT work_date_bangkok, attendance_status
      FROM payroll_attendance_days
      WHERE employee_key = ? AND substr(work_date_bangkok, 1, 7) = ?
      ORDER BY work_date_bangkok
    `).bind(employee.employee_key, originMonth).all<AttendanceRow>(),
    db.prepare(`
      SELECT b.bonus_rule_id, b.bonus_key, b.competence_month,
        b.payment_date_bangkok, b.amount, b.label_en, b.label_th
      FROM payroll_contract_bonus_rules b
      LEFT JOIN payroll_bonus_consumptions c
        ON c.bonus_rule_id = b.bonus_rule_id AND c.employee_key = ?
      WHERE b.profile_version_id = ?
        AND b.competence_month = ?
        AND c.bonus_consumption_id IS NULL
      ORDER BY b.payment_date_bangkok, b.bonus_rule_id
    `).bind(employee.employee_key, version.profile_version_id, payrollMonth).all<BonusRow>(),
    db.prepare(`
      SELECT d.correction_delta_id, d.origin_month,
        d.origin_work_date_bangkok, d.salary_delta, d.food_delta
      FROM payroll_attendance_correction_deltas d
      LEFT JOIN payroll_attendance_correction_applications a
        ON a.correction_delta_id = d.correction_delta_id
      WHERE d.employee_key = ?
        AND a.correction_application_id IS NULL
        AND d.origin_month < ?
      ORDER BY d.created_at, d.correction_delta_id
    `).bind(employee.employee_key, payrollMonth).all<CorrectionRow>(),
    db.prepare(`
      SELECT authorized_cap
      FROM payroll_final_food_adjustment_authorizations
      WHERE employee_key = ? AND origin_month = ?
    `).bind(employee.employee_key, payrollMonth).first<{ authorized_cap: number }>(),
  ]);

  const eligibilityDate = addMonths(
    version.effective_from_bangkok,
    Number(version.paid_leave_eligible_after_months),
  );
  const paidLeaveEligible = version.contract_type === "INDEFINITE" && bounds.end >= eligibilityDate;
  const leaveYear = Number(payrollMonth.slice(0, 4));
  const usedPaidLeave = paidLeaveEligible
    ? Number((await db.prepare(`
        SELECT COUNT(*) AS used
        FROM payroll_attendance_days
        WHERE employee_key = ?
          AND attendance_status = 'PAID_LEAVE'
          AND substr(work_date_bangkok, 1, 4) = ?
      `).bind(employee.employee_key, String(leaveYear)).first<{ used: number }>())?.used ?? 0)
    : 0;
  const openingPaidLeave = paidLeaveEligible ? Number(version.paid_leave_days) : 0;

  const descriptor: ContractPolicyDescriptor = {
    employeeKey: employee.employee_key,
    profileKey: employee.profile_key,
    profileVersionId: Number(version.profile_version_id),
    profileVersionKey: version.version_key,
    compensationRuleKey: compensation.rule_key,
    contractType: version.contract_type,
    effectiveFrom: version.effective_from_bangkok,
    effectiveTo: version.effective_to_bangkok,
    calendarTimezone: version.calendar_timezone,
    normalHoursPerDay: Number(version.normal_hours_per_day),
    monthlyDayDivisor: 30,
    ordinaryOvertimeMultiplier: Number(version.ordinary_overtime_multiplier),
    restDayOvertimeMultiplier: Number(version.rest_day_overtime_multiplier),
    salaryPaymentDay: Number(version.salary_payment_day),
    paidLeaveDays: Number(version.paid_leave_days),
    paidLeaveEligibleAfterMonths: Number(version.paid_leave_eligible_after_months),
    ssoTreatment: version.sso_treatment,
    ssoVersionKey: sso?.version_key ?? null,
    employeeSsoRate: Number(sso?.employee_rate ?? 0),
    employerSsoRate: Number(sso?.employer_rate ?? 0),
    ssoWageCeiling: Number(sso?.wage_ceiling ?? 0),
    monthlyBaseSalary: Number(compensation.monthly_base_salary),
    monthlyFoodAllowance: Number(compensation.monthly_food_allowance),
    monthlyHousingAllowance: Number(compensation.monthly_housing_allowance),
    monthlyAccommodationDeduction: Number(compensation.monthly_accommodation_deduction),
    allowanceAdvanceMonth,
    allowanceAdvanceFood: Number(allowanceAdvanceCompensation?.monthly_food_allowance ?? 0),
    allowanceAdvanceHousing: Number(allowanceAdvanceCompensation?.monthly_housing_allowance ?? 0),
    originMonthFoodAllowance: Number(originCompensation?.monthly_food_allowance ?? 0),
    finalFoodAuthorizedCap: Number(finalAuthorization?.authorized_cap ?? 0),
  };

  return {
    payrollMonth,
    descriptor,
    events: [],
    attendance: attendanceFromRows(attendanceRows.results ?? []),
    originMonthAttendance: attendanceFromRows(originAttendanceRows.results ?? []),
    correctionDeltas: (correctionRows.results ?? []).map((row) => ({
      id: Number(row.correction_delta_id),
      originMonth: row.origin_month,
      originDate: row.origin_work_date_bangkok,
      salaryDelta: Number(row.salary_delta),
      foodDelta: Number(row.food_delta),
    })),
    bonusRules: (bonusRows.results ?? []).map((row) => ({
      id: Number(row.bonus_rule_id),
      key: row.bonus_key,
      competenceMonth: row.competence_month,
      paymentDate: row.payment_date_bangkok,
      amount: Number(row.amount),
      label: row.label_en,
      thaiLabel: row.label_th,
    })),
    paidLeave: {
      eligible: paidLeaveEligible,
      opening: openingPaidLeave,
      used: usedPaidLeave,
      closing: Math.max(0, openingPaidLeave - usedPaidLeave),
    },
  };
}

export interface SavePayrollAttendanceInput {
  workDate: string;
  status: PayrollAttendanceStatus;
  note: string | null;
  idempotencyKey: string;
}

export async function saveContractAttendance(
  db: D1Database,
  authUserId: string,
  input: SavePayrollAttendanceInput,
  actorUserId: string,
  now: string,
): Promise<ContractAttendanceDay> {
  if (!/^\d{4}-(0[1-9]|1[0-2])-[0-3]\d$/.test(input.workDate)) {
    throw new Error("Attendance date must use YYYY-MM-DD.");
  }
  if (!input.idempotencyKey.trim()) throw new Error("Attendance idempotency key is required.");
  const month = input.workDate.slice(0, 7);
  const policy = await loadContractPayrollPolicy(db, authUserId, month);
  if (!policy) throw new Error("Contract payroll profile is not linked.");
  const employeeKey = policy.descriptor.employeeKey;
  const existing = await db.prepare(`
    SELECT attendance_status
    FROM payroll_attendance_days
    WHERE employee_key = ? AND work_date_bangkok = ?
  `).bind(employeeKey, input.workDate).first<{ attendance_status: PayrollAttendanceStatus }>();
  if (existing?.attendance_status === input.status) {
    return { date: input.workDate, status: input.status };
  }
  assertPaidLeaveSelectionAllowed(
    policy.descriptor.contractType,
    policy.paidLeave,
    existing?.attendance_status ?? null,
    input.status,
  );

  const finalized = await db.prepare(`
    SELECT r.payroll_record_id, s.monthly_base_salary, s.monthly_food_allowance
    FROM payroll_records r
    INNER JOIN payroll_contract_record_snapshots s
      ON s.payroll_record_id = r.payroll_record_id
    WHERE s.employee_key = ? AND r.payroll_month = ? AND r.status = 'FINALIZED'
  `).bind(employeeKey, month).first<{
    payroll_record_id: number;
    monthly_base_salary: number;
    monthly_food_allowance: number;
  }>();

  const previousStatus = existing?.attendance_status ?? null;
  const previousUnpaid = previousStatus === "UNPAID_ABSENCE" ? 1 : 0;
  const nextUnpaid = input.status === "UNPAID_ABSENCE" ? 1 : 0;
  const finalizedDailyPay = finalized
    ? roundPayrollMoney(Number(finalized.monthly_base_salary) / 30)
    : 0;
  const salaryDelta = finalized
    ? roundPayrollMoney((previousUnpaid - nextUnpaid) * finalizedDailyPay)
    : 0;
  const foodDelta = finalized && Number(finalized.monthly_food_allowance) > 0
    ? roundPayrollMoney((previousUnpaid - nextUnpaid) * FOOD_RATE_PER_UNPAID_DAY)
    : 0;
  const auditIdempotencyKey = input.idempotencyKey.trim().slice(0, 200);

  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO payroll_attendance_days (
        employee_key, work_date_bangkok, attendance_status, note,
        created_at, created_by, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_key, work_date_bangkok) DO UPDATE SET
        attendance_status = excluded.attendance_status,
        note = excluded.note,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).bind(
      employeeKey,
      input.workDate,
      input.status,
      input.note,
      now,
      actorUserId,
      now,
      actorUserId,
    ),
    db.prepare(`
      INSERT OR IGNORE INTO payroll_attendance_audit (
        employee_key, work_date_bangkok, previous_status, new_status,
        note, changed_at, changed_by, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      employeeKey,
      input.workDate,
      previousStatus,
      input.status,
      input.note,
      now,
      actorUserId,
      auditIdempotencyKey,
    ),
  ];
  if (finalized && (salaryDelta !== 0 || foodDelta !== 0)) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO payroll_attendance_correction_deltas (
        attendance_audit_id, employee_key, origin_month,
        origin_work_date_bangkok, salary_delta, food_delta,
        calculation_json, created_at
      )
      SELECT attendance_audit_id, ?, ?, ?, ?, ?, ?, ?
      FROM payroll_attendance_audit
      WHERE idempotency_key = ?
    `).bind(
      employeeKey,
      month,
      input.workDate,
      salaryDelta,
      foodDelta,
      JSON.stringify({ previousStatus, nextStatus: input.status, dailyPay: finalizedDailyPay, foodRate: FOOD_RATE_PER_UNPAID_DAY }),
      now,
      auditIdempotencyKey,
    ));
  }
  if (previousStatus === "PAID_LEAVE" || input.status === "PAID_LEAVE") {
    const deltaDays = (input.status === "PAID_LEAVE" ? -1 : 0) + (previousStatus === "PAID_LEAVE" ? 1 : 0);
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO payroll_paid_leave_ledger (
        employee_key, leave_year, entry_type, delta_days,
        work_date_bangkok, attendance_audit_id, note,
        idempotency_key, created_at, created_by
      )
      SELECT ?, ?, 'ATTENDANCE_CORRECTION', ?, ?, attendance_audit_id, ?, ?, ?, ?
      FROM payroll_attendance_audit
      WHERE idempotency_key = ?
    `).bind(
      employeeKey,
      Number(input.workDate.slice(0, 4)),
      deltaDays,
      input.workDate,
      input.note,
      `${auditIdempotencyKey}:leave`,
      now,
      actorUserId,
      auditIdempotencyKey,
    ));
  }
  await db.batch(statements);
  return { date: input.workDate, status: input.status };
}
