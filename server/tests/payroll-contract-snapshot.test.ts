import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPayrollContractSnapshot,
  loadPayrollContractSnapshot,
} from "../src/services/payroll-contract-snapshot.service.ts";

class SnapshotStatement {
  constructor(private readonly row: Record<string, unknown> | null) {}

  bind(): this {
    return this;
  }

  async first<T>(): Promise<T | null> {
    return this.row as T | null;
  }
}

function dbWith(row: Record<string, unknown> | null): D1Database {
  return {
    prepare: () => new SnapshotStatement(row),
  } as unknown as D1Database;
}

const SNAPSHOT_ROW = {
  employee_key: "EMPLOYEE-0001",
  profile_version_key: "PROFILE-OLD",
  compensation_rule_key: "COMPENSATION-OLD",
  contract_type: "INDEFINITE",
  employer_social_security: 531,
  monthly_housing_allowance: 0,
  monthly_accommodation_deduction: 1_000,
  prior_month_food_adjustment: 200,
  paid_leave_opening: 6,
  paid_leave_used: 1,
  paid_leave_closing: 5,
  rule_snapshot_json: JSON.stringify({
    contractType: "INDEFINITE",
    ssoTreatment: "SECTION_33",
    effectiveFrom: "2026-05-01",
    effectiveTo: null,
  }),
};

test("post-0056 finalized payroll uses immutable snapshot values", async () => {
  const snapshot = await loadPayrollContractSnapshot(dbWith(SNAPSHOT_ROW), 41);
  assert.ok(snapshot);
  const finalized = applyPayrollContractSnapshot({
    netSalaryPayable: 9_089,
    employerSocialSecurity: 999,
    contract: { profileVersionKey: "LIVE-DIFFERENT" },
  }, snapshot);
  assert.equal(finalized.employerSocialSecurity, 531);
  assert.equal(finalized.contract.profileVersionKey, "PROFILE-OLD");
  assert.equal(finalized.contract.paidLeave.closing, 5);
  assert.equal(finalized.priorMonthFoodAdjustment, 200);
});

test("pre-0056 finalized payroll remains legacy when no snapshot exists", async () => {
  const snapshot = await loadPayrollContractSnapshot(dbWith(null), 7);
  assert.equal(snapshot, null);
  const legacy = { netSalaryPayable: 12_345 };
  const finalized = applyPayrollContractSnapshot(legacy, snapshot);
  assert.strictEqual(finalized, legacy);
  assert.equal("contract" in finalized, false);
  assert.equal("employerSocialSecurity" in finalized, false);
});
