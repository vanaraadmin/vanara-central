import assert from "node:assert/strict";
import test from "node:test";

import { buildFinancialSnapshot } from "../src/services/dashboard.service.ts";

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
