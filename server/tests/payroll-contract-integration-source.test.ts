import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  addPayrollEvent,
  normalizePayrollAttendanceInput,
  normalizePayrollEventInput,
  type PayrollBindings,
} from "../src/services/payroll.service.ts";
import type { CurrentUser } from "../src/services/current-user.service.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

test("contract attendance input validates local date, status and stable idempotency key", () => {
  assert.deepEqual(
    normalizePayrollAttendanceInput({
      workDate: " 2026-11-03 ",
      status: "UNPAID_ABSENCE",
      note: "  no show  ",
      idempotencyKey: " attendance:employee-0001:2026-11-03 ",
    }),
    {
      workDate: "2026-11-03",
      status: "UNPAID_ABSENCE",
      note: "no show",
      idempotencyKey: "attendance:employee-0001:2026-11-03",
    },
  );

  assert.throws(
    () => normalizePayrollAttendanceInput({ workDate: "2026-02-30", status: "WORKED", idempotencyKey: "invalid-date" }),
    /date is invalid/i,
  );
  assert.throws(
    () => normalizePayrollAttendanceInput({ workDate: "2026-11-03", status: "HOLIDAY", idempotencyKey: "invalid-status" }),
    /status is invalid/i,
  );
  assert.throws(
    () => normalizePayrollAttendanceInput({ workDate: "2026-11-03", status: "WORKED", idempotencyKey: "" }),
    /idempotency key is required/i,
  );
  assert.throws(
    () => normalizePayrollAttendanceInput({ workDate: "2026-11-03", status: "WORKED", idempotencyKey: "x".repeat(161) }),
    /idempotency key is too long/i,
  );
});

test("payroll events endpoint remains owner-edit protected for attendance commands", () => {
  const source = readFileSync(resolve(repoRoot, "server/src/index.ts"), "utf8");
  const route = source.match(/app\.post\("\/api\/payroll\/workers\/:employeeId\/events"[\s\S]*?\n\}\);/u)?.[0] ?? "";

  assert.match(route, /payrollOwner\(c, "edit"\)/);
  assert.match(route, /normalizePayrollEventInput\(payload\)/);
  assert.match(route, /addPayrollEvent\(/);
  assert.match(route, /success: true, data: event/);
  assert.doesNotMatch(source, /\/api\/payroll\/workers\/:employeeId\/attendance/);
});

test("attendance command dispatches to the unique attendance audit without payroll event rows", async () => {
  const preparedSql: string[] = [];
  const db = {
    prepare(sql: string) {
      preparedSql.push(sql);
      return {
        bind() {
          return this;
        },
        async first<T>() {
          if (/FROM payroll_employees/u.test(sql)) {
            return {
              employee_key: "EMPLOYEE-0001",
              profile_key: "CONTRACT-0001",
              auth_user_id: "user-nun-existing",
            } as T;
          }
          if (/FROM payroll_contract_runtime_activations/u.test(sql)) {
            return {
              employee_key: "EMPLOYEE-0001",
            } as T;
          }
          if (/FROM payroll_attendance_audit/u.test(sql)) {
            return {
              employee_key: "EMPLOYEE-0001",
              work_date_bangkok: "2026-11-03",
              new_status: "UNPAID_ABSENCE",
            } as T;
          }
          throw new Error(`Unexpected SQL in attendance dispatch test: ${sql}`);
        },
      } as D1PreparedStatement;
    },
  } as D1Database;
  const owner: CurrentUser = {
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

  const result = await addPayrollEvent(
    { DB: db } as PayrollBindings,
    "EMPLOYEE-0001",
    normalizePayrollEventInput({
      command: "SAVE_ATTENDANCE",
      workDate: "2026-11-03",
      status: "UNPAID_ABSENCE",
      note: "no show",
      idempotencyKey: "attendance:employee-0001:2026-11-03",
    }),
    owner,
  );

  assert.deepEqual(result, { date: "2026-11-03", status: "UNPAID_ABSENCE" });
  assert.equal(preparedSql.some((sql) => /payroll_events/u.test(sql)), false);
});

test("account links and contract effective dates do not activate contract payroll", () => {
  const source = readFileSync(resolve(repoRoot, "server/src/services/payroll-contract-runtime.service.ts"), "utf8");
  const activationResolver = source.match(
    /export async function resolveContractRuntimeActivation[\s\S]*?\n\}/u,
  )?.[0] ?? "";
  const calculation = source.match(
    /export async function calculateContractRuntimePayroll[\s\S]*?\n\}/u,
  )?.[0] ?? "";

  assert.match(activationResolver, /FROM payroll_contract_runtime_activations/u);
  assert.doesNotMatch(activationResolver, /effective_from|effective_to|auth_user_id IS NOT NULL/u);
  assert.match(calculation, /resolveContractRuntimeActivation/u);
  assert.doesNotMatch(calculation, /resolveContractRuntimeIdentity/u);
});

test("attendance command rejects mixed or ambiguous payloads while legacy events remain unchanged", () => {
  assert.throws(
    () => normalizePayrollEventInput({ command: "SAVE_ATTENDANCE", workDate: "2026-11-03", status: "WORKED", idempotencyKey: "key-1", payrollMonth: "2026-11" }),
    /unsupported or ambiguous fields/i,
  );
  assert.throws(
    () => normalizePayrollEventInput({ workDate: "2026-11-03", status: "WORKED", idempotencyKey: "key-2", eventType: "BONUS_ADDITION" }),
    /requires the SAVE_ATTENDANCE command/i,
  );
  assert.throws(() => normalizePayrollEventInput({ command: "UNKNOWN" }), /command is invalid/i);
  assert.deepEqual(
    normalizePayrollEventInput({ payrollMonth: "2026-11", eventDate: "2026-11-03", eventType: "BONUS_ADDITION", amount: 500, note: "approved" }),
    { payrollMonth: "2026-11", eventDate: "2026-11-03", eventType: "BONUS_ADDITION", quantity: 0, amount: 500, note: "approved" },
  );
});

test("payroll UI uses server calculations and contract attendance instead of client salary formulas", () => {
  const page = readFileSync(resolve(repoRoot, "src/pages/PayrollPage.tsx"), "utf8");
  const client = readFileSync(resolve(repoRoot, "src/services/payroll.service.ts"), "utf8");
  const types = readFileSync(resolve(repoRoot, "src/types/payroll.ts"), "utf8");

  assert.doesNotMatch(page, /function calculate\(/);
  assert.match(page, /Server-calculated estimate/);
  assert.match(page, /aria-label="Contract attendance"/);
  assert.match(page, /contract\.contractType === "INDEFINITE"/);
  assert.match(page, /contract\.paidLeave\.closing > 0/);
  assert.match(page, /eventOptions\.filter\(\(type\) => type !== "UNPAID_ABSENCE_DAY"\)/);
  assert.match(client, /\/events/);
  assert.match(client, /command: "SAVE_ATTENDANCE"/);
  assert.doesNotMatch(client, /\/attendance/);
  assert.match(client, /savePayrollAttendance/);
  assert.match(types, /tone: "addition" \| "deduction" \| "information" \| "total"/);
});
