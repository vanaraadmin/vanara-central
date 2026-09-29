import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPaidLeaveSelectionAllowed,
  calculateContractPayrollPolicy,
  previousPayrollMonth,
  roundPayrollMoney,
  type ContractPayrollPolicyInput,
} from "../src/services/payroll-contract-policy.service.ts";

function input(overrides: Partial<ContractPayrollPolicyInput> = {}): ContractPayrollPolicyInput {
  return {
    payrollMonth: "2026-11",
    descriptor: {
      employeeKey: "EMPLOYEE-0004",
      profileKey: "CONTRACT-0004",
      profileVersionId: 4,
      profileVersionKey: "CONTRACT-0004-2026",
      compensationRuleKey: "COMP-0004-HIGH",
      contractType: "SEASONAL",
      effectiveFrom: "2026-10-01",
      effectiveTo: "2027-04-30",
      calendarTimezone: "Asia/Bangkok",
      normalHoursPerDay: 8,
      monthlyDayDivisor: 30,
      ordinaryOvertimeMultiplier: 1.5,
      restDayOvertimeMultiplier: 3,
      salaryPaymentDay: 2,
      paidLeaveDays: 0,
      paidLeaveEligibleAfterMonths: 0,
      ssoTreatment: "SECTION_33",
      ssoVersionKey: "SSO-2026",
      employeeSsoRate: 0.05,
      employerSsoRate: 0.05,
      ssoWageCeiling: 17_500,
      monthlyBaseSalary: 11_000,
      monthlyFoodAllowance: 1_500,
      monthlyHousingAllowance: 1_000,
      monthlyAccommodationDeduction: 0,
      originMonthFoodAllowance: 0,
      finalFoodAuthorizedCap: 0,
    },
    events: [],
    attendance: [],
    originMonthAttendance: [],
    correctionDeltas: [],
    bonusRules: [],
    paidLeave: { eligible: false, opening: 0, used: 0, closing: 0 },
    ...overrides,
  };
}

test("monthly salary is fixed across 28, 29, 30 and 31 day months", () => {
  const months = ["2027-02", "2028-02", "2026-04", "2026-01"];
  for (const payrollMonth of months) {
    const result = calculateContractPayrollPolicy(input({ payrollMonth }));
    assert.equal(result.descriptor.monthlyBaseSalary, 11_000);
    assert.equal(result.dailyPay, 366.67);
    assert.equal(result.hourlyPay, 45.83);
  }
});

test("zero, one and four unique unpaid absences use divisor 30", () => {
  const zero = calculateContractPayrollPolicy(input());
  const one = calculateContractPayrollPolicy(input({
    attendance: [{ date: "2026-11-03", status: "UNPAID_ABSENCE" }],
  }));
  const four = calculateContractPayrollPolicy(input({
    attendance: [3, 4, 5, 6].map((day) => ({ date: `2026-11-0${day}`, status: "UNPAID_ABSENCE" as const })),
  }));
  assert.equal(zero.absenceDeduction, 0);
  assert.equal(one.absenceDeduction, 366.67);
  assert.equal(four.absenceDeduction, 1_466.68);
});

test("duplicate attendance dates are deduplicated and corrected status wins", () => {
  const result = calculateContractPayrollPolicy(input({
    attendance: [
      { date: "2026-11-03", status: "UNPAID_ABSENCE" },
      { date: "2026-11-03", status: "WORKED" },
      { date: "2026-11-04", status: "UNPAID_ABSENCE" },
    ],
  }));
  assert.equal(result.unpaidAbsenceDays, 1);
  assert.equal(result.absenceDeduction, 366.67);
});

test("weekly rest, paid leave and protected paid leave never reduce salary or food", () => {
  const result = calculateContractPayrollPolicy(input({
    attendance: [
      { date: "2026-11-02", status: "WEEKLY_REST" },
      { date: "2026-11-03", status: "PAID_LEAVE" },
      { date: "2026-11-04", status: "PROTECTED_PAID_LEAVE" },
    ],
    originMonthAttendance: [
      { date: "2026-10-05", status: "WEEKLY_REST" },
      { date: "2026-10-06", status: "PAID_LEAVE" },
      { date: "2026-10-07", status: "PROTECTED_PAID_LEAVE" },
    ],
  }));
  assert.equal(result.absenceDeduction, 0);
  assert.equal(result.priorMonthFoodAdjustment, 0);
});

test("prior-month food adjustment is THB 50 per unique unpaid day and capped", () => {
  const result = calculateContractPayrollPolicy(input({
    descriptor: {
      ...input().descriptor,
      originMonthFoodAllowance: 150,
    },
    originMonthAttendance: [
      { date: "2026-10-01", status: "UNPAID_ABSENCE" },
      { date: "2026-10-01", status: "UNPAID_ABSENCE" },
      { date: "2026-10-02", status: "UNPAID_ABSENCE" },
      { date: "2026-10-03", status: "UNPAID_ABSENCE" },
      { date: "2026-10-04", status: "UNPAID_ABSENCE" },
    ],
  }));
  assert.equal(result.priorMonthFoodAdjustment, 150);
  assert.match(
    result.lineItems.find((item) => item.label.startsWith("Prior-month"))?.explanation ?? "",
    /4 unique unpaid absences/,
  );
});

test("a no-food origin month produces no reconciliation at the season boundary", () => {
  const result = calculateContractPayrollPolicy(input({
    descriptor: { ...input().descriptor, originMonthFoodAllowance: 0 },
    originMonthAttendance: [{ date: "2026-10-10", status: "UNPAID_ABSENCE" }],
  }));
  assert.equal(result.priorMonthFoodAdjustment, 0);
});

test("a month without current food does not take an automatic food deduction", () => {
  const result = calculateContractPayrollPolicy(input({
    payrollMonth: "2027-05",
    descriptor: {
      ...input().descriptor,
      contractType: "INDEFINITE",
      effectiveTo: null,
      monthlyFoodAllowance: 0,
      originMonthFoodAllowance: 1_500,
    },
    originMonthAttendance: [{ date: "2027-04-10", status: "UNPAID_ABSENCE" }],
  }));
  assert.equal(result.priorMonthFoodAdjustment, 0);
});

test("final-month food reconciliation requires and respects documented authorization", () => {
  const result = calculateContractPayrollPolicy(input({
    payrollMonth: "2027-04",
    descriptor: {
      ...input().descriptor,
      effectiveTo: "2027-04-30",
      finalFoodAuthorizedCap: 100,
    },
    attendance: [1, 2, 3].map((day) => ({ date: `2027-04-0${day}`, status: "UNPAID_ABSENCE" as const })),
  }));
  assert.equal(result.finalMonthFoodAdjustment, 100);
});

test("SSO uses fixed monthly base, effective ceiling and separate employer share", () => {
  const underCap = calculateContractPayrollPolicy(input({
    descriptor: { ...input().descriptor, monthlyBaseSalary: 14_000 },
  }));
  const overCap = calculateContractPayrollPolicy(input({
    descriptor: { ...input().descriptor, monthlyBaseSalary: 30_000 },
  }));
  assert.equal(underCap.employeeSocialSecurity, 700);
  assert.equal(underCap.employerSocialSecurity, 700);
  assert.equal(overCap.employeeSocialSecurity, 875);
  assert.equal(overCap.employerSocialSecurity, 875);
  const employerLine = underCap.lineItems.find((item) => item.label === "Employer Social Security");
  assert.equal(employerLine?.affectsNet, false);
});

test("fifth seasonal profile applies SSO to base salary only and has no paid leave", () => {
  const descriptor = {
    ...input().descriptor,
    employeeKey: "EMPLOYEE-0005",
    monthlyBaseSalary: 13_500,
    monthlyFoodAllowance: 1_500,
    monthlyHousingAllowance: 0,
    paidLeaveDays: 0,
  };
  const result = calculateContractPayrollPolicy(input({ descriptor }));

  assert.equal(result.employeeSocialSecurity, 675);
  assert.equal(result.employerSocialSecurity, 675);
  assert.equal(result.descriptor.monthlyBaseSalary, 13_500);
  assert.equal(result.descriptor.monthlyFoodAllowance, 1_500);
  assert.equal(result.descriptor.monthlyHousingAllowance, 0);
  assert.equal(result.netSalaryPayable, 14_325);
  assert.throws(() => assertPaidLeaveSelectionAllowed("SEASONAL", result.paidLeave, null, "PAID_LEAVE"), /only for indefinite contracts/);
});

test("opening food and housing advances are separated from the following-month salary balance", () => {
  const result = calculateContractPayrollPolicy(input({
    payrollMonth: "2026-10",
    descriptor: {
      ...input().descriptor,
      monthlyBaseSalary: 12_500,
      monthlyFoodAllowance: 1_500,
      monthlyHousingAllowance: 2_500,
      ssoTreatment: "EXEMPT_DECLARED",
      employeeSsoRate: 0,
      employerSsoRate: 0,
      ssoWageCeiling: 0,
    },
  }));

  assert.equal(result.openingFoodAdvance, 1_500);
  assert.equal(result.openingHousingAdvance, 2_500);
  assert.equal(result.openingAllowanceAdvanceTotal, 4_000);
  assert.equal(result.netSalaryPayable, 16_500);
  assert.equal(result.salaryBalancePayable, 12_500);
  assert.equal(result.salaryPaymentDate, "2026-11-02");
});

test("Ae external coverage keeps employee and employer SSO at zero", () => {
  const result = calculateContractPayrollPolicy(input({
    descriptor: {
      ...input().descriptor,
      employeeKey: "EMPLOYEE-0003",
      ssoTreatment: "EXEMPT_DECLARED",
      ssoVersionKey: null,
      employeeSsoRate: 0,
      employerSsoRate: 0,
      ssoWageCeiling: 0,
      monthlyBaseSalary: 12_500,
    },
  }));
  assert.equal(result.employeeSocialSecurity, 0);
  assert.equal(result.employerSocialSecurity, 0);
});

test("contract bonus uses competence month metadata and is included once in the supplied rule set", () => {
  const result = calculateContractPayrollPolicy(input({
    bonusRules: [{
      id: 7,
      key: "AE-WELCOME-BACK",
      competenceMonth: "2026-10",
      paymentDate: "2026-11-02",
      amount: 2_500,
      label: "Welcome-back bonus",
      thaiLabel: "โบนัสกลับมาทำงาน",
    }],
  }));
  assert.equal(result.contractBonusTotal, 2_500);
  assert.deepEqual(result.bonusRuleIds, [7]);
  assert.match(result.lineItems.find((item) => item.label.includes("bonuses"))?.explanation ?? "", /2026-11-02/);
});

test("four extra days round line-by-line to THB 1,666.68 without drift", () => {
  const result = calculateContractPayrollPolicy(input({
    descriptor: { ...input().descriptor, monthlyBaseSalary: 12_500 },
    events: [1, 2, 3, 4].map((id) => ({
      id,
      eventType: "EXTRA_WORKED_DAY" as const,
      quantity: 1,
      amount: 0,
    })),
  }));
  assert.equal(result.dailyPay, 416.67);
  assert.equal(result.overtimeCompensation, 1_666.68);
});

test("correction deltas are carried forward without mutating the finalized month", () => {
  const result = calculateContractPayrollPolicy(input({
    correctionDeltas: [
      { id: 1, originMonth: "2026-10", originDate: "2026-10-04", salaryDelta: -366.67, foodDelta: -50 },
      { id: 2, originMonth: "2026-10", originDate: "2026-10-05", salaryDelta: 366.67, foodDelta: 50 },
    ],
  }));
  assert.equal(result.attendanceCorrectionDelta, 0);
  assert.deepEqual(result.correctionDeltaIds, [1, 2]);
});

test("correction deltas load only after their origin month", () => {
  const result = calculateContractPayrollPolicy(input({
    payrollMonth: "2026-11",
    correctionDeltas: [
      { id: 1, originMonth: "2026-10", originDate: "2026-10-04", salaryDelta: 100, foodDelta: 50 },
      { id: 2, originMonth: "2026-11", originDate: "2026-11-04", salaryDelta: 200, foodDelta: 50 },
      { id: 3, originMonth: "2026-12", originDate: "2026-12-04", salaryDelta: 300, foodDelta: 50 },
    ],
  }));
  assert.equal(result.attendanceCorrectionDelta, 150);
  assert.deepEqual(result.correctionDeltaIds, [1]);
});

test("six paid leave days are allowed and the seventh is blocked", () => {
  assert.doesNotThrow(() => assertPaidLeaveSelectionAllowed(
    "INDEFINITE",
    { eligible: true, opening: 6, used: 5, closing: 1 },
    null,
    "PAID_LEAVE",
  ));
  assert.throws(() => assertPaidLeaveSelectionAllowed(
    "INDEFINITE",
    { eligible: true, opening: 6, used: 6, closing: 0 },
    null,
    "PAID_LEAVE",
  ), /balance is exhausted/);
  assert.doesNotThrow(() => assertPaidLeaveSelectionAllowed(
    "INDEFINITE",
    { eligible: true, opening: 6, used: 6, closing: 0 },
    "PAID_LEAVE",
    "PAID_LEAVE",
  ));
});

test("seasonal contracts never allow annual paid leave", () => {
  assert.throws(() => assertPaidLeaveSelectionAllowed(
    "SEASONAL",
    { eligible: false, opening: 0, used: 0, closing: 0 },
    null,
    "PAID_LEAVE",
  ), /only for indefinite contracts/);
});

test("Bangkok payroll month helpers are deterministic", () => {
  assert.equal(previousPayrollMonth("2027-01"), "2026-12");
  assert.equal(previousPayrollMonth("2026-11"), "2026-10");
  assert.equal(roundPayrollMoney(416.666666), 416.67);
});
