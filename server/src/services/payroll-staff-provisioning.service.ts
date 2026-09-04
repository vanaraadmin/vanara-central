import {
  hashUserPassword,
  type CurrentUser,
  type ModuleKey,
  type UserRole,
} from "./current-user.service.js";

export interface PayrollStaffProvisioningBindings {
  DB: D1Database;
}

type PayrollProvisionedStaffRole = Extract<UserRole, "Reception" | "Housekeeping" | "Maintenance">;

export type PayrollStaffProvisioningOperation =
  | {
      kind: "CREATE_STAFF_ACCOUNT";
      requestKey: string;
      employeeKey: string;
      firstName: string;
      lastName: string;
      displayName: string;
      role: PayrollProvisionedStaffRole;
      username: string;
      temporaryPassword: string;
    }
  | {
      kind: "LINK_EXISTING_ACCOUNT";
      requestKey: string;
      employeeKey: string;
      authUserId: string;
    };

export interface PayrollStaffProvisioningRequest {
  operations: PayrollStaffProvisioningOperation[];
}

export interface PayrollStaffProvisioningResult {
  requestKey: string;
  operation: PayrollStaffProvisioningOperation["kind"];
  employeeKey: string;
  authUserId: string;
  username: string;
  replayed: boolean;
}

interface EmployeeRow {
  employee_key: string;
  auth_user_id: string | null;
  employee_status: "ACTIVE" | "INACTIVE";
}

interface UserRow {
  user_id: string;
  username: string;
  role: string;
  status: string;
}

interface ProvisioningAuditRow {
  request_key: string;
  operation_kind: PayrollStaffProvisioningOperation["kind"];
  employee_key: string;
  auth_user_id: string;
  request_fingerprint: string;
}

export class PayrollStaffProvisioningError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_PROVISIONING_REQUEST"
      | "REQUEST_KEY_COLLISION"
      | "USERNAME_COLLISION"
      | "EMPLOYEE_NOT_FOUND"
      | "EMPLOYEE_ALREADY_LINKED"
      | "ACCOUNT_NOT_FOUND"
      | "ACCOUNT_NOT_ELIGIBLE"
      | "ACCOUNT_ALREADY_LINKED",
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "PayrollStaffProvisioningError";
  }
}

const MODULES: ModuleKey[] = [
  "dashboard",
  "rooms",
  "housekeeping",
  "movements",
  "maintenance",
  "procurement",
  "messages",
  "chat",
  "social-automation",
  "payroll",
  "accounting",
  "owner-dashboard",
  "settings",
];

const STAFF_MODULES = new Set<ModuleKey>([
  "dashboard",
  "rooms",
  "housekeeping",
  "movements",
  "maintenance",
  "procurement",
  "chat",
]);

function invalid(message: string): never {
  throw new PayrollStaffProvisioningError(message, "INVALID_PROVISIONING_REQUEST", 400);
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) invalid(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) invalid(`${label} is too long.`);
  return normalized;
}

function requestKey(value: unknown): string {
  const normalized = requiredText(value, "Request key", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(normalized)) invalid("Request key is invalid.");
  return normalized;
}

function employeeKey(value: unknown): string {
  const normalized = requiredText(value, "Employee key", 64).toUpperCase();
  if (!/^EMPLOYEE-[A-Z0-9-]{4,48}$/.test(normalized)) invalid("Employee key is invalid.");
  return normalized;
}

function username(value: unknown): string {
  const normalized = requiredText(value, "Username", 64).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) invalid("Username is invalid.");
  return normalized;
}

function temporaryPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 200) {
    invalid("Temporary password must contain between 12 and 200 characters.");
  }
  return value;
}

function staffRole(value: unknown): PayrollProvisionedStaffRole {
  if (value !== "Reception" && value !== "Housekeeping" && value !== "Maintenance") {
    invalid("Staff role must be Reception, Housekeeping, or Maintenance.");
  }
  return value;
}

export function normalizePayrollStaffProvisioningRequest(payload: unknown): PayrollStaffProvisioningRequest {
  if (!payload || typeof payload !== "object" || !("operations" in payload) || !Array.isArray(payload.operations)) {
    invalid("Provisioning operations are required.");
  }
  if (payload.operations.length < 1 || payload.operations.length > 10) invalid("Provisioning batch size is invalid.");

  const operations = payload.operations.map((candidate): PayrollStaffProvisioningOperation => {
    if (!candidate || typeof candidate !== "object" || !("kind" in candidate)) invalid("Provisioning operation is invalid.");
    if (candidate.kind === "CREATE_STAFF_ACCOUNT") {
      const firstName = requiredText("firstName" in candidate ? candidate.firstName : undefined, "First name", 80);
      const lastName = requiredText("lastName" in candidate ? candidate.lastName : undefined, "Last name", 120);
      return {
        kind: candidate.kind,
        requestKey: requestKey("requestKey" in candidate ? candidate.requestKey : undefined),
        employeeKey: employeeKey("employeeKey" in candidate ? candidate.employeeKey : undefined),
        firstName,
        lastName,
        displayName: requiredText("displayName" in candidate ? candidate.displayName : firstName, "Display name", 80),
        role: staffRole("role" in candidate ? candidate.role : undefined),
        username: username("username" in candidate ? candidate.username : undefined),
        temporaryPassword: temporaryPassword("temporaryPassword" in candidate ? candidate.temporaryPassword : undefined),
      };
    }
    if (candidate.kind === "LINK_EXISTING_ACCOUNT") {
      return {
        kind: candidate.kind,
        requestKey: requestKey("requestKey" in candidate ? candidate.requestKey : undefined),
        employeeKey: employeeKey("employeeKey" in candidate ? candidate.employeeKey : undefined),
        authUserId: requiredText("authUserId" in candidate ? candidate.authUserId : undefined, "Auth user ID", 128),
      };
    }
    return invalid("Provisioning operation kind is invalid.");
  });

  const requestKeys = new Set<string>();
  const employeeKeys = new Set<string>();
  const usernames = new Set<string>();
  for (const operation of operations) {
    if (requestKeys.has(operation.requestKey)) invalid("Provisioning request keys must be unique within a batch.");
    if (employeeKeys.has(operation.employeeKey)) invalid("Each employee may appear only once in a provisioning batch.");
    requestKeys.add(operation.requestKey);
    employeeKeys.add(operation.employeeKey);
    if (operation.kind === "CREATE_STAFF_ACCOUNT") {
      if (usernames.has(operation.username)) invalid("Usernames must be unique within a provisioning batch.");
      usernames.add(operation.username);
    }
  }
  return { operations };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function operationFingerprint(operation: PayrollStaffProvisioningOperation): Promise<string> {
  const canonical = operation.kind === "CREATE_STAFF_ACCOUNT"
    ? [operation.kind, operation.employeeKey, operation.firstName, operation.lastName, operation.displayName, operation.role, operation.username]
    : [operation.kind, operation.employeeKey, operation.authUserId];
  return sha256Hex(JSON.stringify(canonical));
}

async function employee(env: PayrollStaffProvisioningBindings, key: string): Promise<EmployeeRow> {
  const row = await env.DB.prepare(`
    SELECT employee_key, auth_user_id, employee_status
    FROM payroll_employees
    WHERE employee_key = ?
  `).bind(key).first<EmployeeRow>();
  if (!row || row.employee_status !== "ACTIVE") {
    throw new PayrollStaffProvisioningError("Active payroll employee profile was not found.", "EMPLOYEE_NOT_FOUND", 404);
  }
  return row;
}

async function userById(env: PayrollStaffProvisioningBindings, userId: string): Promise<UserRow | null> {
  return env.DB.prepare(`
    SELECT user_id, username, role, status
    FROM users
    WHERE user_id = ?
  `).bind(userId).first<UserRow>();
}

async function userByUsername(env: PayrollStaffProvisioningBindings, value: string): Promise<UserRow | null> {
  return env.DB.prepare(`
    SELECT user_id, username, role, status
    FROM users
    WHERE username = ?
  `).bind(value).first<UserRow>();
}

async function auditByRequestKey(env: PayrollStaffProvisioningBindings, key: string): Promise<ProvisioningAuditRow | null> {
  return env.DB.prepare(`
    SELECT request_key, operation_kind, employee_key, auth_user_id, request_fingerprint
    FROM payroll_staff_account_provisioning_audit
    WHERE request_key = ?
  `).bind(key).first<ProvisioningAuditRow>();
}

async function linkedEmployeeForUser(env: PayrollStaffProvisioningBindings, userId: string): Promise<string | null> {
  const row = await env.DB.prepare(`
    SELECT employee_key
    FROM payroll_employees
    WHERE auth_user_id = ?
    LIMIT 1
  `).bind(userId).first<{ employee_key: string }>();
  return row?.employee_key ?? null;
}

async function hasStaffView(env: PayrollStaffProvisioningBindings, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT 1 AS present
    FROM user_views
    WHERE user_id = ? AND view_key = 'staff'
  `).bind(userId).first<{ present: number }>();
  return row?.present === 1;
}

function permission(module: ModuleKey): { canAccess: number; canEdit: number } {
  const canAccess = STAFF_MODULES.has(module);
  return {
    canAccess: canAccess ? 1 : 0,
    canEdit: canAccess && module !== "dashboard" && module !== "chat" && module !== "payroll" ? 1 : 0,
  };
}

export async function provisionPayrollStaffAccounts(
  env: PayrollStaffProvisioningBindings,
  actor: CurrentUser,
  request: PayrollStaffProvisioningRequest,
): Promise<PayrollStaffProvisioningResult[]> {
  const prepared: Array<{
    operation: PayrollStaffProvisioningOperation;
    fingerprint: string;
    authUserId: string;
    username: string;
    passwordHash?: string;
    replayed: boolean;
  }> = [];

  for (const operation of request.operations) {
    const fingerprint = await operationFingerprint(operation);
    const existingAudit = await auditByRequestKey(env, operation.requestKey);
    if (existingAudit) {
      if (existingAudit.request_fingerprint !== fingerprint) {
        throw new PayrollStaffProvisioningError("Request key was already used for different provisioning data.", "REQUEST_KEY_COLLISION", 409);
      }
      const existingUser = await userById(env, existingAudit.auth_user_id);
      if (!existingUser) throw new PayrollStaffProvisioningError("Provisioned account was not found.", "ACCOUNT_NOT_FOUND", 404);
      prepared.push({ operation, fingerprint, authUserId: existingUser.user_id, username: existingUser.username, replayed: true });
      continue;
    }

    const employeeRow = await employee(env, operation.employeeKey);
    if (operation.kind === "CREATE_STAFF_ACCOUNT") {
      if (employeeRow.auth_user_id) {
        throw new PayrollStaffProvisioningError("Payroll employee already has an account link.", "EMPLOYEE_ALREADY_LINKED", 409);
      }
      if (await userByUsername(env, operation.username)) {
        throw new PayrollStaffProvisioningError("Username is already in use.", "USERNAME_COLLISION", 409);
      }
      prepared.push({
        operation,
        fingerprint,
        authUserId: crypto.randomUUID(),
        username: operation.username,
        passwordHash: await hashUserPassword(operation.temporaryPassword),
        replayed: false,
      });
      continue;
    }

    if (employeeRow.auth_user_id && employeeRow.auth_user_id !== operation.authUserId) {
      throw new PayrollStaffProvisioningError("Payroll employee is linked to a different account.", "EMPLOYEE_ALREADY_LINKED", 409);
    }
    const existingUser = await userById(env, operation.authUserId);
    if (!existingUser) throw new PayrollStaffProvisioningError("Exact auth account was not found.", "ACCOUNT_NOT_FOUND", 404);
    if (existingUser.status !== "active" || existingUser.role === "Owner" || !(await hasStaffView(env, existingUser.user_id))) {
      throw new PayrollStaffProvisioningError("Exact auth account is not an active Staff account.", "ACCOUNT_NOT_ELIGIBLE", 409);
    }
    const linkedEmployee = await linkedEmployeeForUser(env, existingUser.user_id);
    if (linkedEmployee && linkedEmployee !== operation.employeeKey) {
      throw new PayrollStaffProvisioningError("Auth account is already linked to another payroll employee.", "ACCOUNT_ALREADY_LINKED", 409);
    }
    prepared.push({ operation, fingerprint, authUserId: existingUser.user_id, username: existingUser.username, replayed: false });
  }

  const statements: D1PreparedStatement[] = [];
  const now = new Date().toISOString();
  for (const item of prepared) {
    if (item.replayed) continue;
    const operation = item.operation;
    if (operation.kind === "CREATE_STAFF_ACCOUNT") {
      statements.push(env.DB.prepare(`
        INSERT INTO users (
          user_id, first_name, last_name, full_name, display_name, profile_photo_url,
          role, preferred_language, username, email, password_hash, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, 'th', ?, NULL, ?, 'active', ?, ?)
      `).bind(
        item.authUserId,
        operation.firstName,
        operation.lastName,
        `${operation.firstName} ${operation.lastName}`.trim(),
        operation.displayName,
        operation.role,
        operation.username,
        item.passwordHash!,
        now,
        now,
      ));
      statements.push(env.DB.prepare("INSERT INTO user_views (user_id, view_key) VALUES (?, 'staff')").bind(item.authUserId));
      for (const module of MODULES) {
        const access = permission(module);
        statements.push(env.DB.prepare(`
          INSERT INTO user_module_permissions (user_id, module_key, can_access, can_edit)
          VALUES (?, ?, ?, ?)
        `).bind(item.authUserId, module, access.canAccess, access.canEdit));
      }
      statements.push(env.DB.prepare(`
        INSERT INTO user_action_permissions (user_id, action_key, allowed)
        VALUES (?, 'can_complete_checkin_checkout', 0)
      `).bind(item.authUserId));
      statements.push(env.DB.prepare(`
        INSERT INTO user_password_requirements (
          user_id, must_change_password, required_at, required_by, password_changed_at
        ) VALUES (?, 1, ?, ?, NULL)
      `).bind(item.authUserId, now, actor.id));
    } else {
      statements.push(env.DB.prepare(`
        INSERT INTO user_module_permissions (user_id, module_key, can_access, can_edit)
        VALUES (?, 'payroll', 0, 0)
        ON CONFLICT(user_id, module_key) DO UPDATE SET can_access = 0, can_edit = 0
      `).bind(item.authUserId));
    }

    statements.push(env.DB.prepare(`
      UPDATE payroll_employees
      SET auth_user_id = ?, linked_at = ?, linked_by = ?
      WHERE employee_key = ?
        AND employee_status = 'ACTIVE'
        AND (auth_user_id IS NULL OR auth_user_id = ?)
    `).bind(item.authUserId, now, actor.id, operation.employeeKey, item.authUserId));
    statements.push(env.DB.prepare(`
      INSERT INTO payroll_staff_account_provisioning_audit (
        provisioning_audit_id, request_key, operation_kind, employee_key,
        auth_user_id, request_fingerprint, requested_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      operation.requestKey,
      operation.kind,
      operation.employeeKey,
      item.authUserId,
      item.fingerprint,
      actor.id,
      now,
    ));
  }

  if (statements.length > 0) {
    try {
      await env.DB.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/users\.username|UNIQUE constraint failed: users\.username/i.test(message)) {
        throw new PayrollStaffProvisioningError("Username is already in use.", "USERNAME_COLLISION", 409);
      }
      if (/request_key|payroll_staff_account_provisioning_audit\.request_key/i.test(message)) {
        throw new PayrollStaffProvisioningError("Request key was already used.", "REQUEST_KEY_COLLISION", 409);
      }
      if (/payroll_staff_account_link_mismatch|auth_user_id/i.test(message)) {
        throw new PayrollStaffProvisioningError("Payroll account link changed concurrently.", "EMPLOYEE_ALREADY_LINKED", 409);
      }
      throw error;
    }
  }

  return prepared.map((item) => ({
    requestKey: item.operation.requestKey,
    operation: item.operation.kind,
    employeeKey: item.operation.employeeKey,
    authUserId: item.authUserId,
    username: item.username,
    replayed: item.replayed,
  }));
}
