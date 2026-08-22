import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveContractRuntimeIdentity,
} from "../src/services/payroll-contract-runtime.service.ts";

interface IdentityFixture {
  employee_key: string;
  profile_key: string;
  auth_user_id: string | null;
}

function identityDb(fixtures: IdentityFixture[]): D1Database {
  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        async first<T>() {
          assert.match(sql, /FROM payroll_employees/);
          const identifier = String(params[0] ?? "");
          return (fixtures.find((fixture) => (
            fixture.employee_key === identifier || fixture.auth_user_id === identifier
          )) ?? null) as T | null;
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

test("a non-contract user remains eligible for the separate legacy path", async () => {
  const db = identityDb([]);
  assert.equal(await resolveContractRuntimeIdentity(db, "legacy-staff"), null);
});
