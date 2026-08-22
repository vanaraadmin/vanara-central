import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import { buildFinancialSnapshot } from "../src/services/dashboard.service.ts";

class SqliteD1Statement {
  private params: unknown[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, never> }> {
    return { results: this.statement.all(...this.params) as T[], success: true, meta: {} };
  }
}

class SqliteD1 {
  constructor(private readonly sqlite: DatabaseSync) {}

  prepare(sql: string) {
    return new SqliteD1Statement(this.sqlite.prepare(sql));
  }
}

class FakeStatement {
  private params: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly employerSocialSecurity: number | undefined,
  ) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async all<T>() {
    void this.params;
    if (this.sql.includes("FROM payroll_records pr")) {
      assert.match(this.sql, /LEFT JOIN payroll_contract_record_snapshots s/);
      return {
        results: [{
          monthly_gross_salary: 14_000,
          salary_advances_received: 0,
          bonuses_additions: 0,
          authorized_deductions: 0,
          employee_social_security: 700,
          employer_social_security: this.employerSocialSecurity,
          absence_deduction: 0,
          overtime_compensation: 0,
          meal_allowance_advance: 1_500,
          net_salary_payable: 14_800,
        }] as T[],
      };
    }
    return { results: [] as T[] };
  }
}

class FakeDashboardDb {
  constructor(private readonly employerSocialSecurity: number | undefined) {}

  prepare(sql: string) {
    return new FakeStatement(sql, this.employerSocialSecurity);
  }
}

test("dashboard adds employer SSO from finalized contract snapshot as a separate cost", async () => {
  const snapshot = await buildFinancialSnapshot(
    { DB: new FakeDashboardDb(700) as unknown as D1Database },
    "2026-11-30",
    0,
    0,
  );

  assert.equal(snapshot.payrollTotal, 16_200);
  assert.equal(
    snapshot.payrollComponents.some((item) => item.label === "Employer social security / SSO" && item.amount === 700),
    true,
  );
  assert.equal(
    snapshot.payrollComponents.some((item) => item.label === "Social security / SSO" && item.amount === 700),
    true,
  );
});

test("legacy finalized payroll without a contract snapshot keeps its previous cost", async () => {
  const snapshot = await buildFinancialSnapshot(
    { DB: new FakeDashboardDb(undefined) as unknown as D1Database },
    "2026-11-30",
    0,
    0,
  );

  assert.equal(snapshot.payrollTotal, 15_500);
  assert.equal(
    snapshot.payrollComponents.some((item) => item.label === "Employer social security / SSO"),
    false,
  );
});

test("dashboard payroll query executes when record and snapshot share SSO column names", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE ota_financial_records (
      beds24_booking_id INTEGER,
      channel TEXT,
      expected_net_payout REAL,
      check_in TEXT
    );
    CREATE TABLE bookings (
      beds24_booking_id INTEGER,
      status TEXT,
      sub_status TEXT
    );
    CREATE TABLE manual_accounting_entries (
      entry_type TEXT,
      amount REAL,
      description TEXT,
      note TEXT,
      entry_date TEXT
    );
    CREATE TABLE payroll_records (
      payroll_record_id INTEGER PRIMARY KEY,
      payroll_month TEXT,
      status TEXT,
      monthly_gross_salary REAL,
      salary_advances_received REAL,
      bonuses_additions REAL,
      authorized_deductions REAL,
      employee_social_security REAL,
      absence_deduction REAL,
      overtime_compensation REAL,
      meal_allowance_advance REAL,
      net_salary_payable REAL
    );
    CREATE TABLE payroll_contract_record_snapshots (
      payroll_record_id INTEGER PRIMARY KEY,
      employee_social_security REAL,
      employer_social_security REAL
    );
    INSERT INTO payroll_records VALUES (
      1, '2026-11', 'FINALIZED', 14000, 0, 0, 0, 700, 0, 0, 1500, 14800
    );
    INSERT INTO payroll_contract_record_snapshots VALUES (1, 700, 700);
  `);

  const snapshot = await buildFinancialSnapshot(
    { DB: new SqliteD1(sqlite) as unknown as D1Database },
    "2026-11-30",
    0,
    0,
  );

  assert.equal(snapshot.payrollTotal, 16_200);
});
