import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  resolveContractRuntimeActivation,
  resolveContractRuntimeIdentity,
} from "../src/services/payroll-contract-runtime.service.ts";

interface IdentityFixture {
  employee_key: string;
  profile_key: string;
  auth_user_id: string | null;
}

interface ActivationFixture {
  employee_key: string;
  active_from_bangkok: string;
}

function identityDb(fixtures: IdentityFixture[], activations: ActivationFixture[] = []): D1Database {
  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        async first<T>() {
          if (/FROM payroll_employees/u.test(sql)) {
            const identifier = String(params[0] ?? "");
            return (fixtures.find((fixture) => (
              fixture.employee_key === identifier || fixture.auth_user_id === identifier
            )) ?? null) as T | null;
          }
          if (/FROM payroll_contract_runtime_activations/u.test(sql)) {
            const employeeKey = String(params[0] ?? "");
            const monthEnd = String(params[1] ?? "");
            return (activations.find((activation) => (
              activation.employee_key === employeeKey && activation.active_from_bangkok <= monthEnd
            )) ?? null) as T | null;
          }
          throw new Error(`Unexpected SQL in runtime test: ${sql}`);
        },
      } as D1PreparedStatement;
    },
  } as D1Database;
}

test("an unlinked contract profile fails closed with Account link required", async () => {
  const db = identityDb([{
    employee_key: "EMPLOYEE-0003",
    profile_key: "CONTRACT-0003",
    auth_user_id: null,
  }]);
  await assert.rejects(
    () => resolveContractRuntimeIdentity(db, "EMPLOYEE-0003"),
    /Account link required for EMPLOYEE-0003/,
  );
});

test("a linked profile resolves by opaque employee key or real auth user id", async () => {
  const db = identityDb([{
    employee_key: "EMPLOYEE-0001",
    profile_key: "CONTRACT-0001",
    auth_user_id: "user-nun-existing",
  }]);
  const byEmployee = await resolveContractRuntimeIdentity(db, "EMPLOYEE-0001");
  const byAuth = await resolveContractRuntimeIdentity(db, "user-nun-existing");
  assert.deepEqual(byEmployee, {
    employeeKey: "EMPLOYEE-0001",
    profileKey: "CONTRACT-0001",
    authUserId: "user-nun-existing",
  });
  assert.deepEqual(byAuth, byEmployee);
});

test("an account link alone does not activate contract payroll", async () => {
  const db = identityDb([{
    employee_key: "EMPLOYEE-0001",
    profile_key: "CONTRACT-0001",
    auth_user_id: "user-nun-existing",
  }]);

  assert.equal(await resolveContractRuntimeActivation(db, "user-nun-existing", "2026-10"), null);
});

test("explicit activation applies only from its Bangkok date", async () => {
  const fixture = {
    employee_key: "EMPLOYEE-0001",
    profile_key: "CONTRACT-0001",
    auth_user_id: "user-nun-existing",
  };
  const db = identityDb([fixture], [{
    employee_key: fixture.employee_key,
    active_from_bangkok: "2026-10-01",
  }]);

  assert.equal(await resolveContractRuntimeActivation(db, fixture.auth_user_id, "2026-09"), null);
  assert.deepEqual(await resolveContractRuntimeActivation(db, fixture.auth_user_id, "2026-10"), {
    employeeKey: fixture.employee_key,
    profileKey: fixture.profile_key,
    authUserId: fixture.auth_user_id,
  });
});

test("a future explicit activation does not activate an earlier payroll month", async () => {
  const db = identityDb([{
    employee_key: "EMPLOYEE-0003",
    profile_key: "CONTRACT-0003",
    auth_user_id: "user-ae",
  }], [{ employee_key: "EMPLOYEE-0003", active_from_bangkok: "2026-11-01" }]);

  assert.equal(await resolveContractRuntimeActivation(db, "user-ae", "2026-10"), null);
});

test("a non-contract user remains eligible for the separate legacy path", async () => {
  const db = identityDb([]);
  assert.equal(await resolveContractRuntimeIdentity(db, "legacy-staff"), null);
});

test("migration 0060 is idempotent, immutable and has no activation seed", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (user_id TEXT PRIMARY KEY);
    CREATE TABLE payroll_employees (employee_key TEXT PRIMARY KEY);
    INSERT INTO users VALUES ('owner-1');
    INSERT INTO payroll_employees VALUES ('EMPLOYEE-0001');
  `);
  const migration = readFileSync(new URL("../migrations/0060_payroll_contract_runtime_activation.sql", import.meta.url), "utf8");
  db.exec(migration);
  db.exec(migration);

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM payroll_contract_runtime_activations").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'payroll_contract_runtime_activation_no_%'").get().count, 2);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.exec("INSERT INTO payroll_contract_runtime_activations VALUES ('EMPLOYEE-0001', '2026-10-01', 'owner-approved-gate', '2026-09-30T00:00:00.000Z', 'owner-1')");
  assert.throws(() => db.exec("UPDATE payroll_contract_runtime_activations SET active_from_bangkok = '2026-11-01'"), /immutable/);
  assert.throws(() => db.exec("DELETE FROM payroll_contract_runtime_activations"), /immutable/);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("migration 0061 adds one opaque inactive-runtime profile idempotently", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (user_id TEXT PRIMARY KEY);
    CREATE TABLE payroll_contract_profiles (
      profile_key TEXT PRIMARY KEY,
      profile_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE payroll_contract_profile_versions (
      profile_version_id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_key TEXT NOT NULL,
      version_key TEXT NOT NULL UNIQUE,
      contract_type TEXT NOT NULL,
      effective_from_bangkok TEXT NOT NULL,
      effective_to_bangkok TEXT,
      calendar_timezone TEXT NOT NULL,
      normal_hours_per_day REAL NOT NULL,
      monthly_day_divisor REAL NOT NULL,
      ordinary_overtime_multiplier REAL NOT NULL,
      rest_day_overtime_multiplier REAL NOT NULL,
      paid_leave_days REAL NOT NULL,
      paid_leave_eligible_after_months INTEGER NOT NULL,
      sso_treatment TEXT NOT NULL,
      salary_payment_day INTEGER NOT NULL,
      rule_notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (profile_key) REFERENCES payroll_contract_profiles(profile_key)
    );
    CREATE TABLE payroll_employees (
      employee_key TEXT PRIMARY KEY,
      profile_key TEXT NOT NULL,
      auth_user_id TEXT UNIQUE,
      employee_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      linked_at TEXT,
      linked_by TEXT,
      FOREIGN KEY (profile_key) REFERENCES payroll_contract_profiles(profile_key),
      FOREIGN KEY (auth_user_id) REFERENCES users(user_id),
      FOREIGN KEY (linked_by) REFERENCES users(user_id)
    );
    CREATE TABLE payroll_contract_compensation_rules (
      compensation_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_version_id INTEGER NOT NULL,
      rule_key TEXT NOT NULL UNIQUE,
      effective_from_bangkok TEXT NOT NULL,
      effective_to_bangkok TEXT,
      month_mask TEXT,
      monthly_base_salary REAL NOT NULL,
      monthly_food_allowance REAL NOT NULL,
      monthly_housing_allowance REAL NOT NULL,
      monthly_accommodation_deduction REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (profile_version_id) REFERENCES payroll_contract_profile_versions(profile_version_id)
    );
  `);

  const runtimeMigration = readFileSync(new URL("../migrations/0060_payroll_contract_runtime_activation.sql", import.meta.url), "utf8");
  const profileMigration = readFileSync(new URL("../migrations/0061_payroll_employee_profile_0005.sql", import.meta.url), "utf8");
  db.exec(runtimeMigration);
  db.exec(profileMigration);
  db.exec(profileMigration);

  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM payroll_contract_profiles").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM payroll_employees").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM payroll_contract_profile_versions").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM payroll_contract_compensation_rules").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM payroll_contract_runtime_activations").get().count, 0);

  const employee = db.prepare("SELECT employee_key, profile_key, auth_user_id, linked_at, linked_by FROM payroll_employees").get();
  assert.deepEqual({ ...employee }, {
    employee_key: "EMPLOYEE-0005",
    profile_key: "PROFILE-0005",
    auth_user_id: null,
    linked_at: null,
    linked_by: null,
  });
  const version = db.prepare(`
    SELECT contract_type, effective_from_bangkok, effective_to_bangkok,
      paid_leave_days, paid_leave_eligible_after_months, sso_treatment,
      salary_payment_day, rule_notes
    FROM payroll_contract_profile_versions
  `).get();
  assert.deepEqual({ ...version }, {
    contract_type: "SEASONAL",
    effective_from_bangkok: "2026-10-01",
    effective_to_bangkok: "2027-04-30",
    paid_leave_days: 0,
    paid_leave_eligible_after_months: 0,
    sso_treatment: "SECTION_33",
    salary_payment_day: 2,
    rule_notes: "Base weekly rest day: Friday. Roster changes require notice.",
  });
  const compensation = db.prepare(`
    SELECT monthly_base_salary, monthly_food_allowance,
      monthly_housing_allowance, monthly_accommodation_deduction
    FROM payroll_contract_compensation_rules
  `).get();
  assert.deepEqual({ ...compensation }, {
    monthly_base_salary: 13_500,
    monthly_food_allowance: 1_500,
    monthly_housing_allowance: 0,
    monthly_accommodation_deduction: 0,
  });
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});
