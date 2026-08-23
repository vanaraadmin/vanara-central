import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import worker from "../src/index.ts";
import {
  addPayrollEvent,
  calculatePayroll,
  finalizePayroll,
  generatePayrollStatementPdf,
  getPayrollOverview,
  getPayrollWorker,
  normalizePayrollEventInput,
  normalizePayrollSettingsInput,
  savePayrollSettings,
  type PayrollBindings,
  type PayrollEvent,
  type PayrollRecord,
  type PayrollSettings,
} from "../src/services/payroll.service.ts";
import type { CurrentUser, ModuleKey } from "../src/services/current-user.service.ts";

const DEFAULT_SETTINGS: PayrollSettings = {
  monthlyGrossSalary: 15000,
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

const OWNER: CurrentUser = {
  id: "owner-1",
  firstName: "Stefano",
  lastName: "Owner",
  displayName: "Stefano Owner",
  fullName: "Stefano Owner",
  profilePhotoUrl: null,
  role: "Owner",
  preferredLanguage: "en",
  username: "stefano",
  email: null,
  status: "active",
  views: ["owner", "staff"],
  permissions: [{ module: "payroll", canAccess: true, canEdit: true }],
  actionPermissions: [],
  lastLoginAt: null,
};

type UserRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  profile_photo_url: string | null;
  role: string;
  preferred_language: string;
  username: string;
  email: string | null;
  password_hash: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakePayrollDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

class FakePayrollDB {
  users = new Map<string, UserRow>();
  employeeLinks = new Map<string, { employeeKey: string; profileKey: string }>();
  activations = new Map<string, string>();
  failSettingsFor = new Set<string>();
  settings = new Map<string, PayrollSettings>();
  events: Array<PayrollEvent & { payroll_record_id?: number | null }> = [];
  records = new Map<string, PayrollRecord>();
  nextEventId = 1;
  nextRecordId = 1;
  authRole: "Owner" | "Operations" = "Owner";
  permissions: Array<{ module_key: ModuleKey; can_access: number; can_edit: number }> = [{ module_key: "payroll", can_access: 1, can_edit: 1 }];

  constructor() {
    this.users.set("owner-hidden", {
      user_id: "owner-hidden",
      first_name: "Hidden",
      last_name: "Owner",
      full_name: "Hidden Owner",
      profile_photo_url: null,
      role: "Owner",
      preferred_language: "en",
      username: "guest",
      email: null,
      password_hash: "hash",
      status: "active",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
      last_login_at: null,
    });
    this.users.set("staff-1", {
      user_id: "staff-1",
      first_name: "Nuntana",
      last_name: "Srisawat Long Legal Operational Name",
      full_name: "Nuntana Srisawat Long Legal Operational Name",
      profile_photo_url: null,
      role: "Operations",
      preferred_language: "en",
      username: "nun",
      email: null,
      password_hash: "hash",
      status: "active",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
      last_login_at: null,
    });
  }

  prepare(sql: string) { return new FakeStmt(this, sql); }

  key(employeeId: string, month: string) { return `${employeeId}:${month}`; }

  async all<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT view_key FROM user_views")) {
      return { results: this.authRole === "Owner" ? [{ view_key: "owner" }, { view_key: "staff" }] as T[] : [{ view_key: "staff" }] as T[] };
    }
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) return { results: this.permissions as T[] };
    if (sql.includes("SELECT action_key, allowed FROM user_action_permissions")) return { results: [] as T[] };
    if (sql.includes("FROM users") && sql.includes("WHERE u.status = 'active'")) {
      const rows = [...this.users.values()]
        .filter((user) => !sql.includes("role IN") || ["Reception", "Housekeeping", "Maintenance", "Operations"].includes(user.role))
        .map((user) => ({ ...user, employee_key: this.employeeLinks.get(user.user_id)?.employeeKey ?? null }));
      return { results: rows as T[] };
    }
    if (sql.includes("FROM payroll_events")) {
      const employeeId = String(params[0]);
      const month = String(params[1]);
      return {
        results: this.events
          .filter((event) => event.employeeUserId === employeeId && event.payrollMonth === month)
          .map((event) => this.eventRow(event)) as T[],
      };
    }
    return { results: [] as T[] };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("FROM payroll_employees")) {
      const employeeIdentifier = String(params[0]);
      const authIdentifier = String(params[1]);
      const linked = [...this.employeeLinks.entries()].find(([authUserId, link]) => link.employeeKey === employeeIdentifier || authUserId === authIdentifier);
      if (!linked) return null;
      return { employee_key: linked[1].employeeKey, profile_key: linked[1].profileKey, auth_user_id: linked[0] } as T;
    }
    if (sql.includes("FROM payroll_contract_runtime_activations")) {
      const activeFrom = this.activations.get(String(params[0]));
      return (activeFrom && activeFrom <= String(params[1]) ? { employee_key: String(params[0]) } : null) as T | null;
    }
    if (sql.includes("SELECT s.session_id")) {
      return {
        session_id: "session-1",
        expires_at: "2099-01-01T00:00:00.000Z",
        user_id: this.authRole === "Owner" ? OWNER.id : "staff-current",
        first_name: this.authRole === "Owner" ? OWNER.firstName : "Nok",
        last_name: this.authRole === "Owner" ? OWNER.lastName : "Staff",
        full_name: this.authRole === "Owner" ? OWNER.fullName : "Nok Staff",
        profile_photo_url: null,
        role: this.authRole,
        preferred_language: "en",
        username: this.authRole === "Owner" ? OWNER.username : "nok",
        email: null,
        password_hash: "hash",
        status: "active",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
        last_login_at: null,
      } as T;
    }
    if (sql.includes("FROM users") && (sql.includes("WHERE user_id = ?") || sql.includes("WHERE u.user_id = ?"))) {
      const user = this.users.get(String(params[0]));
      return (user && (!sql.includes("role IN") || ["Reception", "Housekeeping", "Maintenance", "Operations"].includes(user.role))
        ? { ...user, employee_key: this.employeeLinks.get(user.user_id)?.employeeKey ?? null }
        : null) as T | null;
    }
    if (sql.includes("FROM payroll_worker_settings")) {
      if (this.failSettingsFor.has(String(params[0]))) throw new Error("Injected worker settings failure.");
      return (this.settings.get(String(params[0])) ? this.settingsRow(String(params[0])) : null) as T | null;
    }
    if (sql.includes("FROM payroll_records")) {
      const record = this.records.get(this.key(String(params[0]), String(params[1])));
      return (record ? this.recordRow(record) : null) as T | null;
    }
    if (sql.includes("FROM payroll_events")) {
      const employeeId = String(params[0]);
      const month = String(params[1]);
      const createdAt = String(params[2]);
      const event = [...this.events].reverse().find((item) => item.employeeUserId === employeeId && item.payrollMonth === month && item.createdAt === createdAt);
      return (event ? this.eventRow(event) : null) as T | null;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO payroll_worker_settings")) {
      this.settings.set(String(params[0]), {
        monthlyGrossSalary: Number(params[1]),
        monthlyDayDivisor: Number(params[2]),
        normalHoursPerDay: Number(params[3]),
        socialSecurityApplicable: Number(params[4]) === 1,
        socialSecurityRate: Number(params[5]),
        socialSecurityWageCeiling: Number(params[6]),
        overtimeMultiplier: Number(params[7]),
        dailyMealAllowanceAdvance: Number(params[8]),
        mealAllowanceApplicable: Number(params[9]) === 1,
        notes: params[10] === null ? null : String(params[10]),
      });
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO payroll_events")) {
      this.events.push({
        id: this.nextEventId++,
        employeeUserId: String(params[0]),
        payrollMonth: String(params[1]),
        eventDate: String(params[2]),
        eventType: params[3] as PayrollEvent["eventType"],
        quantity: Number(params[4]),
        amount: Number(params[5]),
        note: params[6] === null ? null : String(params[6]),
        createdBy: String(params[7]),
        createdByName: String(params[8]),
        createdAt: String(params[9]),
      });
      return { meta: { changes: 1, last_row_id: this.nextEventId - 1 } };
    }
    if (sql.includes("INSERT INTO payroll_records")) {
      const record = this.recordFromParams(params, this.nextRecordId++);
      this.records.set(this.key(record.employeeUserId, record.payrollMonth), record);
      return { meta: { changes: 1, last_row_id: record.id } };
    }
    if (sql.includes("UPDATE payroll_records")) {
      const id = Number(params[35]);
      const existing = [...this.records.values()].find((record) => record.id === id && record.status === "DRAFT");
      if (existing) this.records.set(this.key(existing.employeeUserId, existing.payrollMonth), this.recordFromParams(params, id, existing.employeeUserId, existing.employeeNameSnapshot, existing.payrollMonth, existing.createdAt));
      return { meta: { changes: existing ? 1 : 0, last_row_id: id } };
    }
    if (sql.includes("UPDATE payroll_events")) {
      for (const event of this.events) {
        if (event.employeeUserId === String(params[1]) && event.payrollMonth === String(params[2]) && !event.payroll_record_id) event.payroll_record_id = Number(params[0]);
      }
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }

  eventRow(event: PayrollEvent & { payroll_record_id?: number | null }) {
    return {
      payroll_event_id: event.id,
      payroll_record_id: event.payroll_record_id ?? null,
      employee_user_id: event.employeeUserId,
      payroll_month: event.payrollMonth,
      event_date: event.eventDate,
      event_type: event.eventType,
      quantity: event.quantity,
      amount: event.amount,
      note: event.note,
      created_by: event.createdBy,
      created_by_name: event.createdByName,
      created_at: event.createdAt,
    };
  }

  settingsRow(employeeId: string) {
    const settings = this.settings.get(employeeId) ?? DEFAULT_SETTINGS;
    return {
      employee_user_id: employeeId,
      monthly_gross_salary: settings.monthlyGrossSalary,
      monthly_day_divisor: settings.monthlyDayDivisor,
      normal_hours_per_day: settings.normalHoursPerDay,
      social_security_applicable: settings.socialSecurityApplicable ? 1 : 0,
      meal_allowance_applicable: settings.mealAllowanceApplicable ? 1 : 0,
      social_security_rate: settings.socialSecurityRate,
      social_security_wage_ceiling: settings.socialSecurityWageCeiling,
      overtime_multiplier: settings.overtimeMultiplier,
      daily_meal_allowance_advance: settings.dailyMealAllowanceAdvance,
      notes: settings.notes,
    };
  }

  recordFromParams(params: unknown[], id: number, employeeId = String(params[0]), employeeName = String(params[1]), month = String(params[2]), createdAt = String(params[33])): PayrollRecord {
    const update = employeeId !== String(params[0]);
    const offset = update ? -3 : 0;
    const notesIndex = update ? 19 : 22;
    return {
      id,
      employeeUserId: employeeId,
      employeeNameSnapshot: employeeName,
      payrollMonth: month,
      status: params[update ? 0 : 3] as PayrollRecord["status"],
      notes: params[notesIndex] === null ? null : String(params[notesIndex]),
      calculation: calculatePayroll({
        monthlyGrossSalary: Number(params[4 + offset]),
        monthlyDayDivisor: Number(params[5 + offset]),
        normalHoursPerDay: Number(params[6 + offset]),
        socialSecurityApplicable: Number(params[7 + offset]) === 1,
        socialSecurityRate: Number(params[8 + offset]),
        socialSecurityWageCeiling: Number(params[9 + offset]),
        overtimeMultiplier: Number(params[10 + offset]),
        dailyMealAllowanceAdvance: Number(params[11 + offset]),
        mealAllowanceApplicable: Number(params[12 + offset]) === 1,
        notes: params[notesIndex] === null ? null : String(params[notesIndex]),
      }, this.events.filter((event) => event.employeeUserId === employeeId && event.payrollMonth === month), month),
      createdAt,
      updatedAt: String(params[update ? 30 : 34]),
      finalizedAt: params[update ? 32 : 37] === null ? null : String(params[update ? 32 : 37]),
      finalizedBy: params[update ? 33 : 38] === null ? null : String(params[update ? 33 : 38]),
      finalizedByName: params[update ? 34 : 39] === null ? null : String(params[update ? 34 : 39]),
    };
  }

  recordRow(record: PayrollRecord) {
    const calculation = record.calculation;
    return {
      payroll_record_id: record.id,
      employee_user_id: record.employeeUserId,
      employee_name_snapshot: record.employeeNameSnapshot,
      payroll_month: record.payrollMonth,
      status: record.status,
      monthly_gross_salary: calculation.settings.monthlyGrossSalary,
      monthly_day_divisor: calculation.settings.monthlyDayDivisor,
      normal_hours_per_day: calculation.settings.normalHoursPerDay,
      social_security_applicable: calculation.settings.socialSecurityApplicable ? 1 : 0,
      meal_allowance_applicable: calculation.settings.mealAllowanceApplicable ? 1 : 0,
      social_security_rate: calculation.settings.socialSecurityRate,
      social_security_wage_ceiling: calculation.settings.socialSecurityWageCeiling,
      overtime_multiplier: calculation.settings.overtimeMultiplier,
      daily_meal_allowance_advance: calculation.settings.dailyMealAllowanceAdvance,
      days_in_following_month: calculation.daysInFollowingMonth,
      unpaid_absence_days: calculation.aggregates.unpaidAbsenceDays,
      unpaid_absence_hours: calculation.aggregates.unpaidAbsenceHours,
      overtime_hours: calculation.aggregates.overtimeHours,
      extra_worked_days: calculation.aggregates.extraWorkedDays,
      total_overtime_hours: calculation.aggregates.totalOvertimeHours,
      salary_advances_received: calculation.aggregates.salaryAdvancesReceived,
      bonuses_additions: calculation.aggregates.bonusesAdditions,
      authorized_deductions: calculation.aggregates.authorizedDeductions,
      notes: record.notes,
      daily_pay: calculation.dailyPay,
      hourly_pay: calculation.hourlyPay,
      employee_social_security: calculation.employeeSocialSecurity,
      absence_deduction: calculation.absenceDeduction,
      overtime_compensation: calculation.overtimeCompensation,
      meal_allowance_advance: calculation.mealAllowanceAdvance,
      net_salary_payable: calculation.netSalaryPayable,
      line_items_json: JSON.stringify(calculation.lineItems),
      explanations_json: JSON.stringify(calculation.lineItems),
      event_snapshot_json: JSON.stringify(this.events),
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      finalized_at: record.finalizedAt,
      finalized_by: record.finalizedBy,
      finalized_by_name: record.finalizedByName,
    };
  }
}

function addLinkedWorker(db: FakePayrollDB, userId: string, employeeKey: string, fullName: string, profilePhotoUrl: string | null = null) {
  const [firstName, ...lastNameParts] = fullName.split(" ");
  db.users.set(userId, {
    user_id: userId,
    first_name: firstName,
    last_name: lastNameParts.join(" "),
    full_name: fullName,
    profile_photo_url: profilePhotoUrl,
    role: "Operations",
    preferred_language: "en",
    username: userId,
    email: null,
    password_hash: "fixture-hash",
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    last_login_at: null,
  });
  db.employeeLinks.set(userId, { employeeKey, profileKey: `PROFILE-${employeeKey}` });
}

function seedFourLinkedWorkers(db: FakePayrollDB) {
  db.employeeLinks.set("staff-1", { employeeKey: "EMPLOYEE-0001", profileKey: "PROFILE-EMPLOYEE-0001" });
  addLinkedWorker(db, "staff-2", "EMPLOYEE-0002", "Worker Two", "/profiles/worker-two.jpg");
  addLinkedWorker(db, "staff-3", "EMPLOYEE-0003", "Worker Three");
  addLinkedWorker(db, "staff-4", "EMPLOYEE-0004", "Worker Four");
}

function env(db: FakePayrollDB): PayrollBindings {
  return { DB: db as unknown as D1Database };
}

test("payroll formulas match the corrected workbook defaults", () => {
  const calculation = calculatePayroll(DEFAULT_SETTINGS, [], "2026-05");
  assert.equal(calculation.employeeSocialSecurity, 750);
  assert.equal(calculation.mealAllowanceAdvance, 1500);
  assert.equal(calculation.netSalaryPayable, 15750);
});

test("payroll meal allowance can be disabled for low season", () => {
  const calculation = calculatePayroll({ ...DEFAULT_SETTINGS, mealAllowanceApplicable: false }, [], "2026-05");
  assert.equal(calculation.mealAllowanceAdvance, 0);
  assert.equal(calculation.netSalaryPayable, 14250);
  assert.match(calculation.lineItems.find((item) => item.label === "Following-month meal allowance advance")?.explanation ?? "", /Not applied for this payroll month/);
});

test("payroll social security cap and toggle match workbook behavior", () => {
  assert.equal(calculatePayroll({ ...DEFAULT_SETTINGS, monthlyGrossSalary: 30000 }, [], "2026-05").employeeSocialSecurity, 875);
  assert.equal(calculatePayroll({ ...DEFAULT_SETTINGS, socialSecurityApplicable: false }, [], "2026-05").employeeSocialSecurity, 0);
});

test("payroll events calculate absence, overtime, extra days, bonus and salary advance", () => {
  const events: PayrollEvent[] = [
    { id: 1, employeeUserId: "staff-1", payrollMonth: "2026-05", eventDate: "2026-05-03", eventType: "UNPAID_ABSENCE_DAY", quantity: 1, amount: 0, note: null, createdBy: OWNER.id, createdByName: OWNER.fullName, createdAt: "2026-05-05T00:00:00.000Z" },
    { id: 2, employeeUserId: "staff-1", payrollMonth: "2026-05", eventDate: "2026-05-04", eventType: "UNPAID_ABSENCE_HOUR", quantity: 2, amount: 0, note: null, createdBy: OWNER.id, createdByName: OWNER.fullName, createdAt: "2026-05-05T00:00:00.000Z" },
    { id: 3, employeeUserId: "staff-1", payrollMonth: "2026-05", eventDate: "2026-05-07", eventType: "OVERTIME_HOUR", quantity: 3, amount: 0, note: null, createdBy: OWNER.id, createdByName: OWNER.fullName, createdAt: "2026-05-07T00:00:00.000Z" },
    { id: 4, employeeUserId: "staff-1", payrollMonth: "2026-05", eventDate: "2026-05-08", eventType: "EXTRA_WORKED_DAY", quantity: 1, amount: 0, note: null, createdBy: OWNER.id, createdByName: OWNER.fullName, createdAt: "2026-05-08T00:00:00.000Z" },
    { id: 5, employeeUserId: "staff-1", payrollMonth: "2026-05", eventDate: "2026-05-09", eventType: "BONUS_ADDITION", quantity: 0, amount: 1000, note: "Busy week", createdBy: OWNER.id, createdByName: OWNER.fullName, createdAt: "2026-05-09T00:00:00.000Z" },
    { id: 6, employeeUserId: "staff-1", payrollMonth: "2026-05", eventDate: "2026-05-10", eventType: "SALARY_ADVANCE", quantity: 0, amount: 2000, note: "Advance paid", createdBy: OWNER.id, createdByName: OWNER.fullName, createdAt: "2026-05-10T00:00:00.000Z" },
  ];
  const calculation = calculatePayroll(DEFAULT_SETTINGS, events, "2026-05");
  assert.equal(calculation.aggregates.totalOvertimeHours, 11);
  assert.equal(calculation.absenceDeduction, 625);
  assert.equal(calculation.overtimeCompensation, 1031.25);
  assert.equal(calculation.aggregates.bonusesAdditions, 1000);
  assert.equal(calculation.aggregates.salaryAdvancesReceived, 2000);
  assert.equal(calculation.netSalaryPayable, 15156.25);
});

test("payroll rejects negative and non-numeric event input", () => {
  assert.throws(() => normalizePayrollEventInput({ payrollMonth: "2026-05", eventDate: "2026-05-10", eventType: "BONUS_ADDITION", amount: -1 }), /Event amount/);
  assert.throws(() => normalizePayrollEventInput({ payrollMonth: "2026-05", eventDate: "2026-05-10", eventType: "SALARY_ADVANCE", amount: "abc" }), /Event amount/);
  assert.throws(() => normalizePayrollSettingsInput({ monthlyGrossSalary: -1 }), /Monthly gross salary/);
});

test("payroll accepts past event dates inside the payroll month and rejects outside month", () => {
  const accepted = normalizePayrollEventInput({ payrollMonth: "2026-05", eventDate: "2026-05-02", eventType: "SALARY_ADVANCE", amount: 2000 });
  assert.equal(accepted.eventDate, "2026-05-02");
  assert.throws(() => normalizePayrollEventInput({ payrollMonth: "2026-05", eventDate: "2026-04-30", eventType: "SALARY_ADVANCE", amount: 2000 }), /Select a date inside this payroll month/);
});

test("payroll worker list uses legal first and last names rather than username", async () => {
  const db = new FakePayrollDB();
  await savePayrollSettings(env(db), "staff-1", DEFAULT_SETTINGS, OWNER);
  const overview = await getPayrollOverview(env(db), "2026-05");
  assert.deepEqual(overview.workers.map((worker) => worker.id), ["staff-1"]);
  assert.equal(overview.workers[0]?.fullName, "Nuntana Srisawat Long Legal Operational Name");
  assert.notEqual(overview.workers[0]?.fullName, "nun");
  assert.equal(await getPayrollWorker(env(db), "owner-hidden", "2026-05"), null);
});

test("four linked employees keep the legacy cards and manual flow until explicit activation", async () => {
  const db = new FakePayrollDB();
  seedFourLinkedWorkers(db);
  db.settings.set("staff-1", DEFAULT_SETTINGS);
  db.settings.set("staff-2", { ...DEFAULT_SETTINGS, monthlyGrossSalary: 14000 });
  for (const employeeUserId of ["staff-1", "staff-2"]) {
    for (const day of [5, 12]) {
      db.events.push({
        id: db.nextEventId++,
        employeeUserId,
        payrollMonth: "2026-08",
        eventDate: `2026-08-${String(day).padStart(2, "0")}`,
        eventType: "SALARY_ADVANCE",
        quantity: 0,
        amount: 500,
        note: "Existing August event",
        createdBy: OWNER.id,
        createdByName: OWNER.fullName,
        createdAt: `2026-08-${String(day).padStart(2, "0")}T02:00:00.000Z`,
      });
    }
  }

  const august = await getPayrollOverview(env(db), "2026-08");
  assert.equal(august.workers.length, 4);
  assert.deepEqual(august.workers.map((worker) => worker.mode), ["LEGACY", "LEGACY", "LEGACY", "LEGACY"]);
  assert.deepEqual(august.workers.map((worker) => worker.events.length), [2, 2, 0, 0]);
  assert.equal(august.workers[1]?.profilePhotoUrl, "/profiles/worker-two.jpg");
  assert.ok(august.workers.every((worker) => worker.settings && worker.calculation));

  await savePayrollSettings(env(db), "staff-3", { ...DEFAULT_SETTINGS, monthlyGrossSalary: 11000 }, OWNER);
  await savePayrollSettings(env(db), "staff-4", { ...DEFAULT_SETTINGS, monthlyGrossSalary: 10620 }, OWNER);
  assert.equal(db.settings.get("staff-3")?.monthlyGrossSalary, 11000);
  assert.equal(db.settings.get("staff-4")?.monthlyGrossSalary, 10620);

  const october = await getPayrollOverview(env(db), "2026-10");
  assert.ok(october.workers.every((worker) => worker.mode === "LEGACY"));
});

test("one worker load error does not empty the Payroll list", async () => {
  const db = new FakePayrollDB();
  seedFourLinkedWorkers(db);
  db.failSettingsFor.add("staff-3");
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const overview = await getPayrollOverview(env(db), "2026-08");
    assert.equal(overview.workers.length, 4);
    assert.equal(overview.workers.filter((worker) => worker.mode === "ERROR").length, 1);
    assert.equal(overview.workers.find((worker) => worker.id === "staff-3")?.loadError, "Payroll details are unavailable for this worker.");
    assert.equal(overview.workers.filter((worker) => worker.calculation !== null).length, 3);
  } finally {
    console.error = originalError;
  }
});

test("payroll can be generated before month end using current month events", async () => {
  const db = new FakePayrollDB();
  await savePayrollSettings(env(db), "staff-1", DEFAULT_SETTINGS, OWNER);
  await addPayrollEvent(env(db), "staff-1", normalizePayrollEventInput({ payrollMonth: "2026-05", eventDate: "2026-05-20", eventType: "SALARY_ADVANCE", amount: 2000 }), OWNER, "2026-05-22T03:00:00.000Z");
  const record = await finalizePayroll(env(db), "staff-1", "2026-05", OWNER, null, "2026-05-22T04:00:00.000Z");
  assert.equal(record.status, "FINALIZED");
  assert.equal(record.calculation.aggregates.salaryAdvancesReceived, 2000);
});

test("payroll finalized snapshot is locked while worker settings stay live", async () => {
  const db = new FakePayrollDB();
  await savePayrollSettings(env(db), "staff-1", DEFAULT_SETTINGS, OWNER);
  const finalized = await finalizePayroll(env(db), "staff-1", "2026-05", OWNER, null, "2026-05-22T04:00:00.000Z");
  assert.equal(finalized.calculation.settings.monthlyGrossSalary, 15000);
  assert.equal(finalized.calculation.settings.mealAllowanceApplicable, true);
  await savePayrollSettings(env(db), "staff-1", { ...DEFAULT_SETTINGS, monthlyGrossSalary: 15500 }, OWNER);
  const historical = await getPayrollWorker(env(db), "staff-1", "2026-05");
  assert.equal(historical?.calculation.settings.monthlyGrossSalary, 15000);
  assert.equal(historical?.calculation.settings.mealAllowanceApplicable, true);
  const future = await getPayrollWorker(env(db), "staff-1", "2026-06");
  assert.equal(future?.calculation.settings.monthlyGrossSalary, 15500);
});

test("payroll endpoints are owner-only", async () => {
  const ownerDb = new FakePayrollDB();
  const ok = await worker.fetch(new Request("https://vanara.test/api/payroll/overview?month=2026-05", { headers: { cookie: "vanara_session=x" } }), env(ownerDb) as never, {} as never);
  assert.equal(ok.status, 200);
  const staffDb = new FakePayrollDB();
  staffDb.authRole = "Operations";
  const denied = await worker.fetch(new Request("https://vanara.test/api/payroll/overview?month=2026-05", { headers: { cookie: "vanara_session=x" } }), env(staffDb) as never, {} as never);
  assert.equal(denied.status, 403);
});

test("payroll statement PDF includes core statement and dated event details", async () => {
  const db = new FakePayrollDB();
  await savePayrollSettings(env(db), "staff-1", DEFAULT_SETTINGS, OWNER);
  await addPayrollEvent(env(db), "staff-1", normalizePayrollEventInput({ payrollMonth: "2026-05", eventDate: "2026-05-22", eventType: "SALARY_ADVANCE", amount: 2000, note: "Advance paid" }), OWNER, "2026-05-24T03:00:00.000Z");
  const pdf = await generatePayrollStatementPdf(env(db), "staff-1", "2026-05");
  const text = new TextDecoder().decode(pdf);
  assert.match(text, /^%PDF-1\.7/);
  assert.match(text, /Payroll Statement/);
  assert.match(text, /\/Logo Do/);
  assert.match(text, /\/Subtype \/Image/);
  assert.match(text, /Net Salary Payable/);
  assert.match(text, /Payroll adjustments/);
  assert.doesNotMatch(text, /Event log/i);
  assert.match(text, /22 May - Salary advance - 2,000\.00 THB/);
  assert.match(text, /0235564000381/);
});

test("payroll statement PDF explains disabled meal allowance", async () => {
  const db = new FakePayrollDB();
  await savePayrollSettings(env(db), "staff-1", { ...DEFAULT_SETTINGS, mealAllowanceApplicable: false }, OWNER);
  const pdf = await generatePayrollStatementPdf(env(db), "staff-1", "2026-05");
  const text = new TextDecoder().decode(pdf);
  assert.match(text, /Following-month meal allowance advance/);
  assert.match(text, /Not applied for this payroll month/);
});

test("payroll source guardrails protect route, UI, owner permission, event dates and no AI exposure", () => {
  const migration = readFileSync(new URL("../migrations/0037_payroll_module.sql", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/services/payroll.service.ts", import.meta.url), "utf8");
  const logo = readFileSync(new URL("../src/assets/images/vanara-logo-pdf.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../src/pages/PayrollPage.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../src/styles/PayrollPage.css", import.meta.url), "utf8");
  const router = readFileSync(new URL("../../src/router/AppRouter.tsx", import.meta.url), "utf8");
  const thaiFont = readFileSync(new URL("../src/assets/fonts/noto-sans-thai-regular.ts", import.meta.url), "utf8");

  assert.match(migration, /'payroll'/);
  assert.match(migration, /first_name TEXT/);
  assert.match(migration, /last_name TEXT/);
  assert.match(migration, /event_date TEXT NOT NULL/);
  assert.match(readFileSync(new URL("../migrations/0038_payroll_meal_allowance_toggle.sql", import.meta.url), "utf8"), /meal_allowance_applicable INTEGER NOT NULL DEFAULT 1/);
  assert.match(index, /function payrollOwner/);
  assert.match(index, /requireOwner\(user\)/);
  assert.match(index, /requireModulePermission\(user, "payroll", action\)/);
  assert.match(router, /path="payroll"/);
  assert.match(page, /Net Salary Payable/);
  assert.match(page, /Generate PDF/);
  assert.match(page, /Base salary/);
  assert.match(page, /Meal allowance/);
  assert.match(page, /mealAllowanceApplicable/);
  assert.match(page, /commitEmptyAsZero/);
  assert.doesNotMatch(page, /Monthly day divisor|Normal hours \/ day|SS rate|SS wage ceiling|Overtime multiplier|Meal \/ day advance/);
  assert.match(page, /Event date/);
  assert.match(page, /min=\{eventDateBounds\.min\}/);
  assert.match(page, /max=\{eventDateBounds\.max\}/);
  assert.match(page, /worker\.profilePhotoUrl \? <img alt="" src=\{worker\.profilePhotoUrl\} \/> : initials/);
  assert.match(page, /if \(!user\.data\.isOwner\) return <Navigate replace to="\/staff" \/>/);
  assert.doesNotMatch(page, /StaffPayrollContractWorkspace/);
  assert.match(page, /aria-label="Employment contract document"/);
  assert.match(page, /const contract = selected\?\.calculation\?\.contract \?\? null/);
  assert.match(page, /<input disabled value=\{money\(settingsDraft\.monthlyGrossSalary\)\}/);
  assert.match(page, /worker\.fullName/);
  assert.match(css, /max-width: 100%/);
  assert.match(css, /max-inline-size: 100%/);
  assert.match(css, /min-inline-size: 0/);
  assert.match(css, /input\[type="month"\]/);
  assert.match(css, /input\[type="date"\]/);
  assert.match(css, /\.payroll-month,[\s\S]*\.payroll-field\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.payroll-month input,[\s\S]*\.payroll-field textarea\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.payroll-month input\[type="month"\],[\s\S]*\.payroll-field input\[type="date"\]\s*\{[\s\S]*-webkit-appearance:\s*none/);
  assert.match(css, /\.payroll-month input\[type="month"\],[\s\S]*\.payroll-field input\[type="date"\]\s*\{[\s\S]*place-self:\s*stretch/);
  assert.match(css, /\.payroll-event-form\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(min\(100%, 180px\), 1fr\)\)/);
  assert.match(css, /\.payroll-event-form\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.payroll-event-form > \*/);
  assert.doesNotMatch(css, /input\[type="month"\][\s\S]{0,160}(?:min-width:\s*(?:2[4-9]|[3-9]\d)rem|width:\s*(?:2[4-9]|[3-9]\d)rem)/);
  assert.doesNotMatch(css, /input\[type="date"\][\s\S]{0,160}(?:min-width:\s*(?:2[4-9]|[3-9]\d)rem|width:\s*(?:2[4-9]|[3-9]\d)rem)/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(service, /Payroll adjustments/);
  assert.match(service, /ไม่ได้ใช้สำหรับเดือนเงินเดือนนี้/);
  assert.doesNotMatch(service, /event log/i);
  assert.match(service, /\/Logo Do/);
  assert.match(service, /VANARA_LOGO_PDF_JPEG_BASE64/);
  assert.match(logo, /src\/assets\/img\/logo\.png/);
  assert.match(service, /Salary advance/);
  assert.match(service, /Bonuses \/ other additions/);
  assert.match(service, /lineItems/);
  assert.match(service, /FontFile2 9 0 R/);
  assert.match(service, /CIDToGIDMap 8 0 R/);
  assert.match(thaiFont, /Noto Sans Thai Regular/);
  assert.match(thaiFont, /SIL Open Font License 1\.1/);
  assert.doesNotMatch(`${page}\n${service}`, /OPENAI|Waraporn|messages\.service|\/api\/messages/i);
});
