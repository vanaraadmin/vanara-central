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
