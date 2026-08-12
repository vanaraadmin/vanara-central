import { getHousekeepingOverview, type HousekeepingBindings } from "./housekeeping-overview.service.js";
import { listUsers, type AuthBindings } from "./current-user.service.js";
import { listMaintenanceTickets, type MaintenanceBindings } from "./maintenance.service.js";
import { getTodayDashboard, type TodayBindings, type TodayReservation } from "./today.service.js";
import { rebuildOtaFinancialRecords, type OtaFinancialBindings } from "./ota-financial-normalization.service.js";
import { manualAccountingCategory } from "./accounting.service.js";

export interface DashboardBindings extends TodayBindings, HousekeepingBindings, MaintenanceBindings, AuthBindings, OtaFinancialBindings {
  DB: D1Database;
}

interface CountRow {
  total: number;
}

interface LatestSyncRow {
  sync_type: string;
  status: string;
  finished_at: string | null;
}

interface MaintenanceRow {
  maintenance_id: number;
  unit_id: number;
  unit_name: string | null;
}

interface OtaFinancialRow {
  channel: string | null;
  expected_net_payout: number | null;
  check_in: string;
}

interface ManualAccountingRow {
  entry_type: "income" | "expense";
  amount: number;
  description: string;
  note: string | null;
}

interface PayrollFinancialRow {
  monthly_gross_salary: number;
  salary_advances_received: number;
  bonuses_additions: number;
  authorized_deductions: number;
  employee_social_security: number;
  absence_deduction: number;
  overtime_compensation: number;
  meal_allowance_advance: number;
  net_salary_payable: number;
}

export interface DashboardDateRange {
  fromDate?: string | null;
  toDate?: string | null;
}

export interface DashboardRoomCard {
  id: string;
  unitName: string;
  status: "Ready" | "Occupied" | "Cleaning" | "Dirty" | "Maintenance" | "Arrival Today" | "Departure Today";
  guestName: string | null;
  checkIn: string | null;
  checkOut: string | null;
}

export interface DashboardData {
  date: string;
  operations: {
    checkIns: DashboardRoomCard[];
    checkOuts: DashboardRoomCard[];
    maintenanceAlerts: DashboardRoomCard[];
  };
  summary: {
    arrivals: number;
    departures: number;
    cleanFirst: number;
    cleanToday: number;
    cleaningInProgress: number;
    readyRooms: number;
    occupiedRooms: number;
    openMaintenance: number;
    pendingProcurement: number;
  };
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
  dateRange: {
    mode: "full" | "custom";
    fromDate: string | null;
    toDate: string | null;
    label: string;
  };
  alerts: DashboardOverviewAlert[];
  business: {
    expectedNetIncomeToDate: DashboardBusinessMetric;
    expectedFutureNetIncome: DashboardBusinessMetric;
    occupancy: DashboardBusinessMetric;
    guestOrigins: DashboardBreakdownItem[];
    channels: DashboardBreakdownItem[];
    financialSnapshot: DashboardFinancialSnapshot;
  };
  housekeeping: {
    roomsToClean: DashboardOverviewMetric;
    cleaning: DashboardOverviewMetric;
    ready: DashboardOverviewMetric;
    cleaningRequested: DashboardOverviewMetric;
    assignedRooms: DashboardOverviewMetric;
    unassignedRooms: DashboardOverviewMetric;
  };
  maintenance: {
    openIssues: DashboardOverviewMetric;
    criticalIssues: DashboardOverviewMetric;
    waiting: DashboardOverviewMetric;
    outOfService: DashboardOverviewMetric;
  };
  today: {
    arrivals: DashboardOverviewMetric;
    departures: DashboardOverviewMetric;
    checkIns: DashboardOverviewMetric;
    checkOuts: DashboardOverviewMetric;
  };
  staff: {
    housekeepingStaff: DashboardOverviewMetric;
    maintenanceStaff: DashboardOverviewMetric;
    activeUsers: DashboardOverviewMetric;
    disabledUsers: DashboardOverviewMetric;
  };
  quickLinks: DashboardQuickLink[];
}

function count(row: CountRow | null): number {
  return row?.total ?? 0;
}

function unitName(value: string | null): string {
  return value || "Unit not assigned";
}

function reservationCard(
  reservation: TodayReservation,
  status: "Arrival Today" | "Departure Today",
): DashboardRoomCard {
  return {
    id: `${status}:${reservation.id}`,
    unitName: reservation.unit,
    status,
    guestName: reservation.guestName,
    checkIn: reservation.arrival,
    checkOut: reservation.departure,
  };
}

function maintenanceCard(row: MaintenanceRow): DashboardRoomCard {
  return {
    id: `maintenance:${row.maintenance_id}`,
    unitName: unitName(row.unit_name),
    status: "Maintenance",
    guestName: null,
    checkIn: null,
    checkOut: null,
  };
}

export async function getDashboard(env: DashboardBindings): Promise<DashboardData> {
  const today = await getTodayDashboard(env);
  const housekeeping = await getHousekeepingOverview(env);

  const [openMaintenance, pendingProcurement, properties, latestSync, maintenanceRows] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM maintenance " +
      "WHERE lower(COALESCE(status, 'open')) NOT IN " +
      "('resolved', 'verified', 'closed', 'completed')",
    ).first<CountRow>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM shopping_items " +
      "WHERE lower(status) NOT IN ('delivered', 'closed', 'completed', 'rejected')",
    ).first<CountRow>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM properties WHERE active = 1").first<CountRow>(),
    env.DB.prepare(
      "SELECT sync_type, status, finished_at FROM sync_runs " +
      "ORDER BY started_at DESC, sync_run_id DESC LIMIT 1",
    ).first<LatestSyncRow>(),
    env.DB.prepare(`
      SELECT m.maintenance_id, m.unit_id, u.unit_name
      FROM maintenance m
      INNER JOIN units u ON u.unit_id = m.unit_id
      WHERE lower(COALESCE(m.status, 'open')) NOT IN ('resolved', 'verified', 'closed', 'completed')
      ORDER BY
        CASE lower(COALESCE(m.priority, 'normal'))
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        m.opened_at DESC
      LIMIT 8
    `).all<MaintenanceRow>(),
  ]);

  const checkIns = today.arrivals.slice(0, 8).map((item) => reservationCard(item, "Arrival Today"));
  const checkOuts = today.departures.slice(0, 8).map((item) => reservationCard(item, "Departure Today"));
  const maintenanceAlerts = (maintenanceRows.results ?? []).map(maintenanceCard);

  return {
    date: today.date,
    operations: {
      checkIns,
      checkOuts,
      maintenanceAlerts,
    },
    summary: {
      arrivals: today.summary.arrivals,
      departures: today.summary.departures,
      cleanFirst: housekeeping.summary.cleanFirst,
      cleanToday: housekeeping.summary.cleanToday,
      cleaningInProgress: housekeeping.summary.cleaningInProgress,
      readyRooms: housekeeping.summary.ready,
      occupiedRooms: housekeeping.summary.occupied,
      openMaintenance: count(openMaintenance),
      pendingProcurement: count(pendingProcurement),
    },
    system: {
      hasOperationalData: count(properties) > 0,
      latestSync: latestSync
        ? {
            type: latestSync.sync_type,
            status: latestSync.status,
            finishedAt: latestSync.finished_at,
          }
        : null,
    },
    recentActivity: [],
  };
}

function metric(id: string, label: string, value: number | string, href: string, tone: DashboardOverviewMetric["tone"] = "neutral"): DashboardOverviewMetric {
  return { id, label, value, href, tone };
}

function businessMetric(id: string, label: string, value: number | string, detail: string, tone: DashboardBusinessMetric["tone"] = "neutral"): DashboardBusinessMetric {
  return { id, label, value, detail, tone };
}

function alert(id: string, label: string, value: number, href: string, tone: DashboardOverviewAlert["tone"]): DashboardOverviewAlert | null {
  return value > 0 ? { id, label, value, href, tone } : null;
}

function amount(value: number | null | undefined): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(value: string | null | undefined): string | null {
  const date = typeof value === "string" ? value.trim() : "";
  return DATE_RE.test(date) ? date : null;
}

function normalizeDateRange(input?: DashboardDateRange | null): Required<DashboardDateRange> | null {
  const fromDate = cleanDate(input?.fromDate ?? null);
  const toDate = cleanDate(input?.toDate ?? null);
  if (!fromDate && !toDate) return null;
  if (fromDate && toDate && fromDate > toDate) return { fromDate: toDate, toDate: fromDate };
  return { fromDate, toDate };
}

function dateRangeLabel(range: Required<DashboardDateRange> | null): string {
  if (!range) return "Full view";
  if (range.fromDate && range.toDate) return `${range.fromDate} to ${range.toDate}`;
  if (range.fromDate) return `From ${range.fromDate}`;
  return `Until ${range.toDate}`;
}

function dateRangeCondition(column: string, range: Required<DashboardDateRange> | null): { sql: string; params: string[] } {
  if (!range) return { sql: "", params: [] };
  const clauses: string[] = [];
  const params: string[] = [];
  if (range.fromDate) {
    clauses.push(`${column} >= ?`);
    params.push(range.fromDate);
  }
  if (range.toDate) {
    clauses.push(`${column} <= ?`);
    params.push(range.toDate);
  }
  return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", params };
}

function payrollRangeCondition(range: Required<DashboardDateRange> | null, bangkokMonth: string): { sql: string; params: string[] } {
  if (!range) return { sql: "AND payroll_month <= ?", params: [bangkokMonth] };
  const clauses: string[] = [];
  const params: string[] = [];
  if (range.fromDate) {
    clauses.push("payroll_month >= ?");
    params.push(range.fromDate.slice(0, 7));
  }
  if (range.toDate) {
    clauses.push("payroll_month <= ?");
    params.push(range.toDate.slice(0, 7));
  }
  return { sql: clauses.length ? `AND ${clauses.join(" AND ")}` : "", params };
}

function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10;
}

function ownerChannelLabel(value: string | null): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "Other";
  if (normalized.includes("booking")) return "Booking.com";
  if (normalized.includes("agoda")) return "Agoda";
  if (normalized.includes("airbnb")) return "Airbnb";
  if (normalized.includes("expedia")) return "Expedia";
  if (normalized.includes("trip") || normalized.includes("ctrip")) return "Trip.com";
  if (normalized.includes("google")) return "Google Ads";
  if (normalized.includes("direct") || normalized.includes("front desk") || normalized.includes("walk")) return "Direct / Front Desk";
  return value?.trim() || "Other";
}

function ownerManualIncomeLabel(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === "INCASSI PER STANZE") return "Room income";
  if (normalized === "INCASSI RISTORANTE / BAR") return "Restaurant / Bar income";
  if (normalized === "INCASSI AFFITTO MOTORINO") return "Motorbike rental income";
  return value.trim() || "Other manual income";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function addBucket(buckets: Map<string, number>, label: string, value: number): void {
  if (value === 0) return;
  buckets.set(label, (buckets.get(label) ?? 0) + value);
}

function segmentsFromBuckets(
  buckets: Map<string, number>,
  total: number,
  kind: DashboardFinancialSegment["kind"],
): DashboardFinancialSegment[] {
  return [...buckets.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))
    .map(([label, bucketAmount]) => ({
      id: slug(label),
      label,
      amount: Math.round(bucketAmount * 100) / 100,
      percentage: percent(bucketAmount, total),
      kind: bucketAmount < 0 ? "reduction" : kind,
    }));
}

function payrollCost(row: PayrollFinancialRow): number {
  return amount(row.net_salary_payable) + amount(row.salary_advances_received) + amount(row.employee_social_security);
}

function addPayrollComponents(buckets: Map<string, number>, row: PayrollFinancialRow): void {
  const baseAfterSso = Math.max(0, amount(row.monthly_gross_salary) - amount(row.employee_social_security));
  addBucket(buckets, "Base wages", baseAfterSso);
  addBucket(buckets, "Social security / SSO", amount(row.employee_social_security));
  addBucket(buckets, "Meal allowance", amount(row.meal_allowance_advance));
  addBucket(buckets, "Bonuses / additions", amount(row.bonuses_additions));
  addBucket(buckets, "Overtime", amount(row.overtime_compensation));
  addBucket(buckets, "Unpaid absence reduction", -amount(row.absence_deduction));
  addBucket(buckets, "Authorized deductions", -amount(row.authorized_deductions));
}

export async function buildFinancialSnapshot(
  env: DashboardBindings,
  bangkokToday: string,
  checkedInNetRevenue: number,
  futureBookedNetForecast: number,
  dateRangeInput?: DashboardDateRange | null,
): Promise<DashboardFinancialSnapshot> {
  const bangkokMonth = bangkokToday.slice(0, 7);
  const dateRange = normalizeDateRange(dateRangeInput);
  const otaRange = dateRangeCondition("f.check_in", dateRange);
  const manualRange = dateRange
    ? dateRangeCondition("entry_date", dateRange)
    : { sql: " AND entry_date <= ?", params: [bangkokToday] };
  const payrollRange = payrollRangeCondition(dateRange, bangkokMonth);
  const [otaRows, manualRows, payrollRows] = await Promise.all([
    env.DB.prepare(`
      SELECT f.channel, f.expected_net_payout, f.check_in
      FROM ota_financial_records f
      INNER JOIN bookings b
        ON b.beds24_booking_id = f.beds24_booking_id
      WHERE lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'deleted')
        AND lower(trim(COALESCE(b.sub_status, ''))) <> 'provider_deleted'
        ${otaRange.sql}
    `).bind(...otaRange.params).all<OtaFinancialRow>(),
    env.DB.prepare(`
      SELECT entry_type, amount, description, note
      FROM manual_accounting_entries
      WHERE 1 = 1
        ${manualRange.sql}
    `).bind(...manualRange.params).all<ManualAccountingRow>(),
    env.DB.prepare(`
      SELECT monthly_gross_salary, salary_advances_received, bonuses_additions,
        authorized_deductions, employee_social_security, absence_deduction,
        overtime_compensation, meal_allowance_advance, net_salary_payable
      FROM payroll_records
      WHERE status = 'FINALIZED'
        ${payrollRange.sql}
    `).bind(...payrollRange.params).all<PayrollFinancialRow>(),
  ]);

  const otaChannels = new Map<string, number>();
  for (const row of otaRows.results ?? []) {
    if (row.check_in > bangkokToday) continue;
    addBucket(otaChannels, ownerChannelLabel(row.channel), amount(row.expected_net_payout));
  }

  const manualIncomeBuckets = new Map<string, number>([
    ["Room income", 0],
    ["Restaurant / Bar income", 0],
    ["Motorbike rental income", 0],
  ]);
  const manualExpenseBuckets = new Map<string, number>();
  for (const row of manualRows.results ?? []) {
    const label = manualAccountingCategory(row.note, row.entry_type === "income" ? "Other Manual Income" : "Other Expenses");
    if (row.entry_type === "income") {
      addBucket(manualIncomeBuckets, ownerManualIncomeLabel(label), amount(row.amount));
    } else {
      addBucket(manualExpenseBuckets, label, amount(row.amount));
    }
  }

  const payrollBuckets = new Map<string, number>();
  let payrollTotal = 0;
  for (const row of payrollRows.results ?? []) {
    payrollTotal += payrollCost(row);
    addPayrollComponents(payrollBuckets, row);
  }

  const manualIncomeTotal = [...manualIncomeBuckets.values()].reduce((sum, value) => sum + value, 0);
  const manualExpenseTotal = [...manualExpenseBuckets.values()].reduce((sum, value) => sum + value, 0);
  const totalIncome = checkedInNetRevenue + manualIncomeTotal;
  const totalExpenses = manualExpenseTotal + payrollTotal;
  const netPosition = totalIncome - totalExpenses;
  const incomeBuckets = new Map<string, number>([
    ["Booking / OTA income", checkedInNetRevenue],
    ["Manual income", manualIncomeTotal],
  ]);
  const expenseBuckets = new Map<string, number>([
    ["Manual expenses", manualExpenseTotal],
    ["Payroll / Wages", payrollTotal],
  ]);

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netPosition: Math.round(netPosition * 100) / 100,
    checkedInNetRevenue,
    futureBookedNetForecast,
    manualIncomeTotal: Math.round(manualIncomeTotal * 100) / 100,
    manualExpenseTotal: Math.round(manualExpenseTotal * 100) / 100,
    payrollTotal: Math.round(payrollTotal * 100) / 100,
    topLevel: segmentsFromBuckets(new Map([["Income", totalIncome], ["Expenses", totalExpenses]]), totalIncome + totalExpenses, "income")
      .map((segment) => segment.label === "Expenses" ? { ...segment, kind: "expense" } : segment),
    incomeComposition: segmentsFromBuckets(incomeBuckets, totalIncome, "income"),
    expenseComposition: segmentsFromBuckets(expenseBuckets, totalExpenses, "expense"),
    otaChannels: segmentsFromBuckets(otaChannels, checkedInNetRevenue, "income"),
    manualIncome: segmentsFromBuckets(manualIncomeBuckets, manualIncomeTotal, "income"),
    manualExpenses: segmentsFromBuckets(manualExpenseBuckets, manualExpenseTotal, "expense"),
    payrollComponents: segmentsFromBuckets(payrollBuckets, payrollTotal, "expense"),
  };
}

export async function getDashboardOverview(env: DashboardBindings, options: { dateRange?: DashboardDateRange | null } = {}): Promise<DashboardOverview> {
  await rebuildOtaFinancialRecords(env);
  const [housekeeping, maintenanceTickets, today, users] = await Promise.all([
    getHousekeepingOverview(env),
    listMaintenanceTickets(env, { status: "All" }),
    getTodayDashboard(env),
    listUsers(env),
  ]);
  const bangkokToday = today.date;
  const dateRange = normalizeDateRange(options.dateRange);
  const checkedInRange = dateRangeCondition("f.check_in", dateRange);
  const guestOriginRange = dateRangeCondition("arrival_date", dateRange);
  const channelRange = dateRangeCondition("f.check_in", dateRange);
  const occupancyRangeStart = dateRange?.fromDate ?? bangkokToday;
  const occupancyRangeEnd = dateRange?.toDate ?? occupancyRangeStart;
  const [incomeToDate, futureIncome, occupiedRooms, totalOperatingRooms, guestOrigins, channels] = await Promise.all([
    env.DB.prepare(`
      SELECT COALESCE(SUM(f.expected_net_payout), 0) AS total
      FROM ota_financial_records f
      INNER JOIN bookings b
        ON b.beds24_booking_id = f.beds24_booking_id
      WHERE f.check_in <= ?
        AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'deleted')
        AND lower(trim(COALESCE(b.sub_status, ''))) <> 'provider_deleted'
        ${checkedInRange.sql}
    `).bind(bangkokToday, ...checkedInRange.params).first<CountRow>(),
    env.DB.prepare(`
      SELECT COALESCE(SUM(f.expected_net_payout), 0) AS total
      FROM ota_financial_records f
      INNER JOIN bookings b
        ON b.beds24_booking_id = f.beds24_booking_id
      WHERE f.check_in > ?
        AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'deleted')
        AND lower(trim(COALESCE(b.sub_status, ''))) <> 'provider_deleted'
        ${checkedInRange.sql}
    `).bind(bangkokToday, ...checkedInRange.params).first<CountRow>(),
    env.DB.prepare(`
      WITH RECURSIVE dashboard_dates(stay_date) AS (
        SELECT ?
        UNION ALL
        SELECT date(stay_date, '+1 day')
        FROM dashboard_dates
        WHERE stay_date < ?
      ),
      occupied_by_day AS (
        SELECT dashboard_dates.stay_date, COUNT(DISTINCT bookings.unit_id) AS occupied
        FROM dashboard_dates
        LEFT JOIN bookings
          ON bookings.arrival_date <= dashboard_dates.stay_date
          AND bookings.departure_date > dashboard_dates.stay_date
          AND lower(COALESCE(bookings.status, '')) NOT IN ('cancelled', 'canceled')
        GROUP BY dashboard_dates.stay_date
      )
      SELECT COALESCE(AVG(occupied), 0) AS total
      FROM occupied_by_day
    `).bind(occupancyRangeStart, occupancyRangeEnd).first<CountRow>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM units
      WHERE active = 1
    `).first<CountRow>(),
    env.DB.prepare(`
      SELECT COALESCE(NULLIF(country_code, ''), NULLIF(country, ''), 'Unknown') AS label, COUNT(*) AS value
      FROM bookings
      WHERE lower(COALESCE(status, '')) NOT IN ('cancelled', 'canceled')
        ${guestOriginRange.sql}
      GROUP BY label
      ORDER BY value DESC, label
      LIMIT 6
    `).bind(...guestOriginRange.params).all<{ label: string; value: number }>(),
    env.DB.prepare(`
      SELECT f.channel AS label, COUNT(*) AS value, COALESCE(SUM(f.expected_net_payout), 0) AS amount
      FROM ota_financial_records f
      INNER JOIN bookings b
        ON b.beds24_booking_id = f.beds24_booking_id
      WHERE f.check_in <= ?
        AND lower(COALESCE(b.status, '')) NOT IN ('cancelled', 'canceled', 'deleted')
        AND lower(trim(COALESCE(b.sub_status, ''))) <> 'provider_deleted'
        ${channelRange.sql}
      GROUP BY f.channel
      ORDER BY amount DESC, value DESC
      LIMIT 6
    `).bind(bangkokToday, ...channelRange.params).all<{ label: string; value: number; amount: number }>(),
  ]);

  const roomsToClean = housekeeping.summary.cleanFirst + housekeeping.summary.cleanToday;
  const cleaning = housekeeping.summary.cleaningInProgress;
  const ready = housekeeping.summary.ready;
  const cleaningRequested = housekeeping.summary.dirty;
  const assignedRooms = housekeeping.summary.assigned;
  const unassignedRooms = housekeeping.rooms.filter((room) => room.housekeepingStatus !== "Ready" && room.assignedUserId === null).length;

  const activeMaintenance = maintenanceTickets.filter((ticket) => ticket.status !== "Completed");
  const openIssues = activeMaintenance.length;
  const highIssues = activeMaintenance.filter((ticket) => ticket.priority === "High").length;
  const waiting = activeMaintenance.filter((ticket) => ticket.status === "Waiting Parts").length;
  const outOfService = activeMaintenance.filter((ticket) => ticket.outOfService && ticket.roomId !== null).length;

  const activeUsers = users.filter((user) => user.status === "active");
  const disabledUsers = users.filter((user) => user.status === "disabled");
  const housekeepingStaff = activeUsers.filter((user) => user.role === "Housekeeping").length;
  const maintenanceStaff = activeUsers.filter((user) => user.role === "Maintenance").length;
  const checkedInNetRevenue = count(incomeToDate);
  const futureBookedNetForecast = count(futureIncome);
  const [financialSnapshot] = await Promise.all([
    buildFinancialSnapshot(env, bangkokToday, checkedInNetRevenue, futureBookedNetForecast, dateRange),
  ]);
  const occupancyPercent = count(totalOperatingRooms) > 0 ? Math.round((count(occupiedRooms) / count(totalOperatingRooms)) * 100) : 0;
  const occupancyDetail = dateRange
    ? `${count(occupiedRooms)} of ${count(totalOperatingRooms)} operating rooms occupied on average for the selected period.`
    : `${count(occupiedRooms)} of ${count(totalOperatingRooms)} operating rooms occupied today.`;

  const alerts = [
    alert("high-maintenance", "High Maintenance", highIssues, "/maintenance?priority=High", "danger"),
    alert("out-of-service", "Out Of Service Rooms", outOfService, "/maintenance?outOfService=1", "danger"),
    alert("unassigned-cleaning", "Unassigned Cleaning", unassignedRooms, "/housekeeping?filter=unassigned", "warning"),
    alert("waiting-maintenance", "Waiting Maintenance", waiting, "/maintenance?status=Waiting%20Parts", "warning"),
  ].filter((item): item is DashboardOverviewAlert => item !== null);

  return {
    date: today.date,
    dateRange: {
      mode: dateRange ? "custom" : "full",
      fromDate: dateRange?.fromDate ?? null,
      toDate: dateRange?.toDate ?? null,
      label: dateRangeLabel(dateRange),
    },
    alerts,
    business: {
      expectedNetIncomeToDate: businessMetric("checked-in-net-revenue", "Checked-In Net Revenue", count(incomeToDate), "Expected net payout for checked-in stays, not bank-received cash.", "success"),
      expectedFutureNetIncome: businessMetric("future-booked-net-forecast", "Future Booked Net Forecast", count(futureIncome), "Expected net payout for future bookings; still cancellable or modifiable.", "info"),
      occupancy: businessMetric("occupancy", "Occupancy", `${occupancyPercent}%`, occupancyDetail, occupancyPercent >= 80 ? "success" : occupancyPercent >= 45 ? "info" : "warning"),
      guestOrigins: (guestOrigins.results ?? []).map((item) => ({ label: item.label, value: item.value })),
      channels: (channels.results ?? []).map((item) => ({ label: item.label, value: item.value, amount: item.amount })),
      financialSnapshot,
    },
    housekeeping: {
      roomsToClean: metric("rooms-to-clean", "Rooms To Clean", roomsToClean, "/housekeeping?filter=to-clean", roomsToClean > 0 ? "warning" : "success"),
      cleaning: metric("cleaning", "Cleaning", cleaning, "/housekeeping?filter=cleaning", "info"),
      ready: metric("ready", "Ready", ready, "/housekeeping?filter=ready", "success"),
      cleaningRequested: metric("cleaning-requested", "Cleaning Requested", cleaningRequested, "/housekeeping?filter=dirty", cleaningRequested > 0 ? "warning" : "neutral"),
      assignedRooms: metric("assigned-rooms", "Assigned Rooms", assignedRooms, "/housekeeping?filter=assigned", "info"),
      unassignedRooms: metric("unassigned-rooms", "Unassigned Rooms", unassignedRooms, "/housekeeping?filter=unassigned", unassignedRooms > 0 ? "warning" : "success"),
    },
    maintenance: {
      openIssues: metric("open-issues", "Open Issues", openIssues, "/maintenance?status=All", openIssues > 0 ? "warning" : "success"),
      criticalIssues: metric("high-issues", "High Issues", highIssues, "/maintenance?priority=High", highIssues > 0 ? "danger" : "success"),
      waiting: metric("waiting", "Waiting", waiting, "/maintenance?status=Waiting%20Parts", waiting > 0 ? "warning" : "neutral"),
      outOfService: metric("out-of-service", "Out Of Service", outOfService, "/maintenance?outOfService=1", outOfService > 0 ? "danger" : "success"),
    },
    today: {
      arrivals: metric("arrivals", "Today's Arrivals", today.summary.arrivals, "/movements?section=arrivals", "info"),
      departures: metric("departures", "Today's Departures", today.summary.departures, "/movements?section=departures", "info"),
      checkIns: metric("check-ins", "Today's Check-ins", today.summary.arrivals, "/movements?section=arrivals", "info"),
      checkOuts: metric("check-outs", "Today's Check-outs", today.summary.departures, "/movements?section=departures", "info"),
    },
    staff: {
      housekeepingStaff: metric("housekeeping-staff", "Housekeeping Staff", housekeepingStaff, "/settings?section=users&role=Housekeeping", "neutral"),
      maintenanceStaff: metric("maintenance-staff", "Maintenance Staff", maintenanceStaff, "/settings?section=users&role=Maintenance", "neutral"),
      activeUsers: metric("active-users", "Active Users", activeUsers.length, "/settings?section=users&status=active", "success"),
      disabledUsers: metric("disabled-users", "Disabled Users", disabledUsers.length, "/settings?section=users&status=disabled", disabledUsers.length > 0 ? "warning" : "neutral"),
    },
    quickLinks: [
      { id: "accounting", label: "Accounting", href: "/accounting" },
      { id: "housekeeping", label: "Housekeeping", href: "/housekeeping" },
      { id: "maintenance", label: "Maintenance", href: "/maintenance" },
      { id: "rooms", label: "Rooms", href: "/rooms" },
      { id: "users", label: "Users", href: "/settings?section=users" },
      { id: "settings", label: "Settings", href: "/settings" },
    ],
  };
}
