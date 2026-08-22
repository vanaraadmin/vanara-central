import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import { payrollStaffProvisioningRoutes } from "../src/routes/payroll-staff-provisioning.routes.ts";
import {
  changeSelfPassword,
  hashUserPassword,
  login,
  logout,
  PasswordChangeRequiredError,
  resolveCurrentUser,
  type CurrentUser,
} from "../src/services/current-user.service.ts";
import {
  normalizePayrollStaffProvisioningRequest,
  PayrollStaffProvisioningError,
  provisionPayrollStaffAccounts,
} from "../src/services/payroll-staff-provisioning.service.ts";

class SqliteD1Statement {
  private params: unknown[] = [];

  constructor(readonly statement: StatementSync) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (this.statement.get(...this.params) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, never> }> {
    return { results: this.statement.all(...this.params) as T[], success: true, meta: {} };
  }

  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    return this.execute();
  }

  execute(): { success: true; meta: { changes: number; last_row_id: number } } {
    const result = this.statement.run(...this.params);
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }
}

class SqliteD1 {
  readonly DB = this as unknown as D1Database;

  constructor(readonly sqlite: DatabaseSync) {}

  prepare(sql: string) {
    return new SqliteD1Statement(this.sqlite.prepare(sql));
  }

  async batch(statements: SqliteD1Statement[]) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.execute());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

function schema(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      user_id TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      full_name TEXT NOT NULL,
      display_name TEXT,
      profile_photo_url TEXT,
      role TEXT NOT NULL,
      preferred_language TEXT NOT NULL DEFAULT 'en',
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );
    CREATE TABLE user_views (
      user_id TEXT NOT NULL,
      view_key TEXT NOT NULL,
      PRIMARY KEY (user_id, view_key),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );
    CREATE TABLE user_module_permissions (
      user_id TEXT NOT NULL,
      module_key TEXT NOT NULL,
      can_access INTEGER NOT NULL,
      can_edit INTEGER NOT NULL,
      PRIMARY KEY (user_id, module_key),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );
    CREATE TABLE user_action_permissions (
      user_id TEXT NOT NULL,
      action_key TEXT NOT NULL,
      allowed INTEGER NOT NULL,
      PRIMARY KEY (user_id, action_key),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );
    CREATE TABLE user_sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );
    CREATE TABLE payroll_employees (
      employee_key TEXT PRIMARY KEY,
      profile_key TEXT NOT NULL,
      auth_user_id TEXT UNIQUE,
      employee_status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      linked_at TEXT,
      linked_by TEXT,
      FOREIGN KEY (auth_user_id) REFERENCES users(user_id),
      FOREIGN KEY (linked_by) REFERENCES users(user_id)
    );
  `);
  const migration = readFileSync(new URL("../migrations/0058_payroll_staff_account_provisioning.sql", import.meta.url), "utf8");
  db.exec(migration);
  db.exec(migration);
}

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  schema(sqlite);
  return { sqlite, d1: new SqliteD1(sqlite) };
}

function credential(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}

function randomUsername(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

const actor: CurrentUser = {
  id: "owner-exact-id",
  firstName: "Owner",
  lastName: "User",
  displayName: "Owner",
  fullName: "Owner User",
  profilePhotoUrl: null,
  role: "Owner",
  preferredLanguage: "en",
  username: "owner-account",
  email: null,
  status: "active",
  views: ["owner", "staff"],
  permissions: [],
  actionPermissions: [],
  lastLoginAt: null,
  mustChangePassword: false,
};

async function insertUser(
  database: SqliteD1,
  options: { id: string; username: string; password: string; role?: string; staff?: boolean },
) {
  const now = new Date().toISOString();
  await database.prepare(`
    INSERT INTO users (
      user_id, first_name, last_name, full_name, display_name, profile_photo_url,
      role, preferred_language, username, email, password_hash, status,
      created_at, updated_at, last_login_at
    ) VALUES (?, 'Test', 'User', 'Test User', 'Test', NULL, ?, 'en', ?, NULL, ?, 'active', ?, ?, NULL)
  `).bind(options.id, options.role ?? "Operations", options.username, await hashUserPassword(options.password), now, now).run();
  if (options.staff) await database.prepare("INSERT INTO user_views (user_id, view_key) VALUES (?, 'staff')").bind(options.id).run();
}

function insertEmployee(database: SqliteD1, key: string) {
  return database.prepare(`
    INSERT INTO payroll_employees (employee_key, profile_key, auth_user_id, employee_status, created_at)
    VALUES (?, 'PROFILE-TEST', NULL, 'ACTIVE', ?)
  `).bind(key, new Date().toISOString()).run();
}

function cookie(token: string): string {
  return `vanara_session=${token}`;
}

test("migration 0058 is idempotent and provisioning audit is append-only", () => {
  const { sqlite } = createDatabase();
  const triggers = sqlite.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'trigger' AND name LIKE 'payroll_staff_provisioning_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;
  assert.deepEqual(triggers.map((row) => row.name), [
    "payroll_staff_provisioning_audit_no_delete",
    "payroll_staff_provisioning_audit_no_update",
    "payroll_staff_provisioning_link_guard",
  ]);
  const migration = readFileSync(new URL("../migrations/0058_payroll_staff_account_provisioning.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /EMPLOYEE-000[1-4]|Nong|Suwan|Thipnet|Kwanreuan/i);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);

  const now = new Date().toISOString();
  sqlite.prepare(`
    INSERT INTO users (
      user_id, first_name, last_name, full_name, display_name, profile_photo_url,
      role, preferred_language, username, email, password_hash, status,
      created_at, updated_at, last_login_at
    ) VALUES ('audit-user', 'Audit', 'User', 'Audit User', 'Audit', NULL,
      'Operations', 'en', 'audit-user', NULL, 'unused-test-hash', 'active', ?, ?, NULL)
  `).run(now, now);
  sqlite.prepare(`
    INSERT INTO payroll_employees (employee_key, profile_key, auth_user_id, employee_status, created_at)
    VALUES ('EMPLOYEE-AUDIT', 'PROFILE-TEST', 'audit-user', 'ACTIVE', ?)
  `).run(now);
  sqlite.prepare(`
    INSERT INTO payroll_staff_account_provisioning_audit (
      provisioning_audit_id, request_key, operation_kind, employee_key,
      auth_user_id, request_fingerprint, requested_by, created_at
    ) VALUES ('audit-row', 'audit-request', 'LINK_EXISTING_ACCOUNT', 'EMPLOYEE-AUDIT',
      'audit-user', 'fingerprint', 'audit-user', ?)
  `).run(now);
  assert.throws(
    () => sqlite.prepare("UPDATE payroll_staff_account_provisioning_audit SET request_fingerprint = 'changed' WHERE provisioning_audit_id = 'audit-row'").run(),
    /append-only/,
  );
  assert.throws(
    () => sqlite.prepare("DELETE FROM payroll_staff_account_provisioning_audit WHERE provisioning_audit_id = 'audit-row'").run(),
    /append-only/,
  );
});

test("Owner provisioning creates and links one Staff account atomically with forced password change", async () => {
  const { sqlite, d1 } = createDatabase();
  const ownerPassword = credential();
  await insertUser(d1, { id: actor.id, username: actor.username, password: ownerPassword, role: "Owner", staff: true });
  await d1.prepare("INSERT INTO user_views (user_id, view_key) VALUES (?, 'owner')").bind(actor.id).run();
  await insertEmployee(d1, "EMPLOYEE-0004");
  const temporary = credential();
  const newUsername = randomUsername("staff");
  const input = normalizePayrollStaffProvisioningRequest({
    operations: [{
      kind: "CREATE_STAFF_ACCOUNT",
      requestKey: `provision:${crypto.randomUUID()}`,
      employeeKey: "EMPLOYEE-0004",
      firstName: "Synthetic",
      lastName: "Worker",
      displayName: "Worker",
      username: newUsername,
      temporaryPassword: temporary,
    }],
  });

  const [created] = await provisionPayrollStaffAccounts(d1 as unknown as { DB: D1Database }, actor, input);
  assert.ok(created);
  assert.equal(created.replayed, false);
  assert.equal(created.username, newUsername);
  assert.equal("temporaryPassword" in created, false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM users").get()!.total, 2);
  assert.equal(sqlite.prepare("SELECT auth_user_id FROM payroll_employees WHERE employee_key = 'EMPLOYEE-0004'").get()!.auth_user_id, created.authUserId);
  assert.equal(sqlite.prepare("SELECT must_change_password FROM user_password_requirements WHERE user_id = ?").get(created.authUserId)!.must_change_password, 1);
  assert.equal(sqlite.prepare("SELECT allowed FROM user_action_permissions WHERE user_id = ? AND action_key = 'can_complete_checkin_checkout'").get(created.authUserId)!.allowed, 0);
  const payrollPermission = sqlite.prepare("SELECT can_access, can_edit FROM user_module_permissions WHERE user_id = ? AND module_key = 'payroll'").get(created.authUserId)!;
  assert.equal(payrollPermission.can_access, 1);
  assert.equal(payrollPermission.can_edit, 0);

  const passwordHashBefore = sqlite.prepare("SELECT password_hash FROM users WHERE user_id = ?").get(created.authUserId)!.password_hash;
  const [replay] = await provisionPayrollStaffAccounts(d1 as unknown as { DB: D1Database }, actor, input);
  assert.equal(replay?.replayed, true);
  assert.equal(replay?.authUserId, created.authUserId);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM users").get()!.total, 2);
  assert.equal(sqlite.prepare("SELECT password_hash FROM users WHERE user_id = ?").get(created.authUserId)!.password_hash, passwordHashBefore);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM payroll_staff_account_provisioning_audit").get()!.total, 1);

  const session = await login(d1 as unknown as { DB: D1Database }, { username: newUsername, password: temporary });
  assert.equal(session.user.mustChangePassword, true);
  const allowedContext = {
    env: d1 as unknown as { DB: D1Database },
    req: { raw: new Request("https://local.test/api/current-user", { headers: { cookie: cookie(session.token) } }) },
  };
  assert.equal((await resolveCurrentUser(allowedContext)).id, created.authUserId);
  await assert.rejects(
    resolveCurrentUser({ ...allowedContext, req: { raw: new Request("https://local.test/api/chat/conversations", { headers: { cookie: cookie(session.token) } }) } }),
    PasswordChangeRequiredError,
  );

  const replacement = credential();
  await changeSelfPassword(d1 as unknown as { DB: D1Database }, created.authUserId, { currentPassword: temporary, newPassword: replacement });
  assert.equal(sqlite.prepare("SELECT must_change_password FROM user_password_requirements WHERE user_id = ?").get(created.authUserId)!.must_change_password, 0);
  await assert.rejects(resolveCurrentUser(allowedContext));
  assert.equal((await login(d1 as unknown as { DB: D1Database }, { username: newUsername, password: replacement })).user.mustChangePassword, false);
});

test("normal users retain ordinary push and chat authentication behavior", async () => {
  const { d1 } = createDatabase();
  const password = credential();
  const userId = crypto.randomUUID();
  const value = randomUsername("normal");
  await insertUser(d1, { id: userId, username: value, password, staff: true });
  const session = await login(d1 as unknown as { DB: D1Database }, { username: value, password });
  for (const path of ["/api/notifications/push/public-key", "/api/chat/conversations"]) {
    const current = await resolveCurrentUser({
      env: d1 as unknown as { DB: D1Database },
      req: { raw: new Request(`https://local.test${path}`, { headers: { cookie: cookie(session.token) } }) },
    });
    assert.equal(current.id, userId);
    assert.equal(current.mustChangePassword, false);
  }
  await logout({
    env: d1 as unknown as { DB: D1Database },
    req: { raw: new Request("https://local.test/api/auth/logout", { headers: { cookie: cookie(session.token) } }) },
  });
});

test("exact existing Staff account links without name guessing and collisions fail closed", async () => {
  const { sqlite, d1 } = createDatabase();
  const exactUserId = crypto.randomUUID();
  await insertUser(d1, { id: actor.id, username: actor.username, password: credential(), role: "Owner", staff: true });
  await insertUser(d1, { id: exactUserId, username: randomUsername("existing"), password: credential(), staff: true });
  await insertEmployee(d1, "EMPLOYEE-0001");
  await insertEmployee(d1, "EMPLOYEE-0002");

  const request = normalizePayrollStaffProvisioningRequest({
    operations: [{
      kind: "LINK_EXISTING_ACCOUNT",
      requestKey: `link:${crypto.randomUUID()}`,
      employeeKey: "EMPLOYEE-0001",
      authUserId: exactUserId,
    }],
  });
  const [linked] = await provisionPayrollStaffAccounts(d1 as unknown as { DB: D1Database }, actor, request);
  assert.equal(linked?.authUserId, exactUserId);
  assert.equal(sqlite.prepare("SELECT auth_user_id FROM payroll_employees WHERE employee_key = 'EMPLOYEE-0001'").get()!.auth_user_id, exactUserId);

  await assert.rejects(
    provisionPayrollStaffAccounts(d1 as unknown as { DB: D1Database }, actor, normalizePayrollStaffProvisioningRequest({
      operations: [{
        kind: "LINK_EXISTING_ACCOUNT",
        requestKey: `link:${crypto.randomUUID()}`,
        employeeKey: "EMPLOYEE-0002",
        authUserId: exactUserId,
      }],
    })),
    (error: unknown) => error instanceof PayrollStaffProvisioningError && error.code === "ACCOUNT_ALREADY_LINKED",
  );
  assert.equal(sqlite.prepare("SELECT auth_user_id FROM payroll_employees WHERE employee_key = 'EMPLOYEE-0002'").get()!.auth_user_id, null);
});

test("provisioning batch rolls back every account and link when a final audit guard fails", async () => {
  const { sqlite, d1 } = createDatabase();
  await insertUser(d1, { id: actor.id, username: actor.username, password: credential(), role: "Owner", staff: true });
  await insertEmployee(d1, "EMPLOYEE-0003");
  await insertEmployee(d1, "EMPLOYEE-0004");
  const secondRequestKey = `fail:${crypto.randomUUID()}`;
  sqlite.exec(`
    CREATE TRIGGER fail_second_provisioning_audit
    BEFORE INSERT ON payroll_staff_account_provisioning_audit
    WHEN NEW.request_key = '${secondRequestKey}'
    BEGIN
      SELECT RAISE(ABORT, 'simulated_final_audit_failure');
    END;
  `);
  const beforeUsers = Number(sqlite.prepare("SELECT COUNT(*) AS total FROM users").get()!.total);
  const request = normalizePayrollStaffProvisioningRequest({
    operations: [
      {
        kind: "CREATE_STAFF_ACCOUNT",
        requestKey: `batch:${crypto.randomUUID()}`,
        employeeKey: "EMPLOYEE-0003",
        firstName: "One",
        lastName: "Worker",
        username: randomUsername("batch-one"),
        temporaryPassword: credential(),
      },
      {
        kind: "CREATE_STAFF_ACCOUNT",
        requestKey: secondRequestKey,
        employeeKey: "EMPLOYEE-0004",
        firstName: "Two",
        lastName: "Worker",
        username: randomUsername("batch-two"),
        temporaryPassword: credential(),
      },
    ],
  });
  await assert.rejects(provisionPayrollStaffAccounts(d1 as unknown as { DB: D1Database }, actor, request));
  assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS total FROM users").get()!.total), beforeUsers);
  assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS total FROM payroll_staff_account_provisioning_audit").get()!.total), 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM payroll_employees WHERE auth_user_id IS NOT NULL").get()!.total, 0);
});

test("provisioning route is Owner-only and never echoes a temporary password", async () => {
  const { d1 } = createDatabase();
  const ownerPassword = credential();
  await insertUser(d1, { id: actor.id, username: actor.username, password: ownerPassword, role: "Owner", staff: true });
  await d1.prepare("INSERT INTO user_views (user_id, view_key) VALUES (?, 'owner')").bind(actor.id).run();
  await insertEmployee(d1, "EMPLOYEE-0004");
  const ownerSession = await login(d1 as unknown as { DB: D1Database }, { username: actor.username, password: ownerPassword });
  const temporary = credential();
  const response = await payrollStaffProvisioningRoutes.fetch(new Request("https://local.test/", {
    method: "POST",
    headers: { cookie: cookie(ownerSession.token), "content-type": "application/json" },
    body: JSON.stringify({
      operations: [{
        kind: "CREATE_STAFF_ACCOUNT",
        requestKey: `route:${crypto.randomUUID()}`,
        employeeKey: "EMPLOYEE-0004",
        firstName: "Route",
        lastName: "Worker",
        username: randomUsername("route"),
        temporaryPassword: temporary,
      }],
    }),
  }), d1 as unknown as { DB: D1Database });
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), new RegExp(temporary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const staffPassword = credential();
  const staffId = crypto.randomUUID();
  const staffUsername = randomUsername("staff-denied");
  await insertUser(d1, { id: staffId, username: staffUsername, password: staffPassword, staff: true });
  const staffSession = await login(d1 as unknown as { DB: D1Database }, { username: staffUsername, password: staffPassword });
  const denied = await payrollStaffProvisioningRoutes.fetch(new Request("https://local.test/", {
    method: "POST",
    headers: { cookie: cookie(staffSession.token), "content-type": "application/json" },
    body: JSON.stringify({ operations: [] }),
  }), d1 as unknown as { DB: D1Database });
  assert.equal(denied.status, 403);
});

test("2C source wiring is limited and the forced-password UI is fail closed", () => {
  const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const router = readFileSync(new URL("../../src/router/AppRouter.tsx", import.meta.url), "utf8");
  const loginPage = readFileSync(new URL("../../src/pages/LoginPage.tsx", import.meta.url), "utf8");
  const passwordPage = readFileSync(new URL("../../src/pages/PasswordChangeRequiredPage.tsx", import.meta.url), "utf8");
  assert.equal((index.match(/payrollStaffProvisioningRoutes/g) ?? []).length, 2);
  assert.match(index, /app\.route\("\/api\/payroll\/staff-accounts", payrollStaffProvisioningRoutes\)/);
  assert.match(router, /mustChangePassword[\s\S]*Navigate replace to="\/change-password"/);
  assert.match(loginPage, /user\.mustChangePassword \? "\/change-password" : from/);
  assert.match(passwordPage, /changeCurrentUserPassword/);
  assert.match(passwordPage, /logout/);
  assert.doesNotMatch(passwordPage, /\/api\/(?:chat|notifications|payroll)/);
});
