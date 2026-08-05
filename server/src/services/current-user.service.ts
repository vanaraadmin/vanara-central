export type UserRole = "Owner" | "Manager" | "Reception" | "Housekeeping" | "Maintenance" | "Operations";
export type UserStatus = "invited" | "active" | "disabled";
export type UserView = "owner" | "staff";
export type ModuleKey =
  | "dashboard"
  | "rooms"
  | "housekeeping"
  | "movements"
  | "maintenance"
  | "procurement"
  | "messages"
  | "chat"
  | "owner-dashboard"
  | "settings";

export interface ModulePermission {
  module: ModuleKey;
  canAccess: boolean;
  canEdit: boolean;
}

export type ActionPermissionKey = "can_complete_checkin_checkout";

export interface ActionPermission {
  action: ActionPermissionKey;
  allowed: boolean;
}

export interface CurrentUser {
  id: string;
  displayName: string;
  fullName: string;
  profilePhotoUrl: string | null;
  role: UserRole;
  preferredLanguage: "en" | "th";
  username: string;
  email: string | null;
  status: UserStatus;
  views: UserView[];
  permissions: ModulePermission[];
  actionPermissions: ActionPermission[];
  lastLoginAt: string | null;
}

export interface AuthBindings {
  DB: D1Database;
}

interface AuthContextLike {
  req: { raw: Request };
  env: AuthBindings;
}

export class AuthenticationError extends Error {
  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const SESSION_COOKIE_NAME = "vanara_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const PASSWORD_ITERATIONS = 120_000;
const MAX_PROFILE_PHOTO_BYTES = 512 * 1024;
const PROFILE_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MODULES: ModuleKey[] = [
  "dashboard",
  "rooms",
  "housekeeping",
  "movements",
  "maintenance",
  "procurement",
  "messages",
  "chat",
  "owner-dashboard",
  "settings",
];
const ROLES: UserRole[] = ["Owner", "Manager", "Reception", "Housekeeping", "Maintenance", "Operations"];
const STATUSES: UserStatus[] = ["invited", "active", "disabled"];
const VIEWS: UserView[] = ["owner", "staff"];
const LANGUAGES = ["en", "th"] as const;
const ACTION_PERMISSIONS: ActionPermissionKey[] = ["can_complete_checkin_checkout"];

interface UserRow {
  user_id: string;
  full_name: string;
  profile_photo_url: string | null;
  role: UserRole;
  preferred_language: "en" | "th";
  username: string;
  email: string | null;
  password_hash: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

interface UserViewRow {
  view_key: UserView;
}

interface PermissionRow {
  module_key: ModuleKey;
  can_access: number;
  can_edit: number;
}

interface ActionPermissionRow {
  action_key: ActionPermissionKey;
  allowed: number;
}

interface SessionRow extends UserRow {
  session_id: string;
  expires_at: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface CreateUserInput {
  fullName: string;
  profilePhotoUrl: string | null;
  role: UserRole;
  preferredLanguage: "en" | "th";
  username: string;
  email: string | null;
  password: string;
  status: UserStatus;
  views: UserView[];
  permissions: ModulePermission[];
  actionPermissions?: ActionPermission[];
}

export type UpdateUserInput = Partial<Omit<CreateUserInput, "password">> & { password?: string | null };

export interface PublicManagedUser {
  id: string;
  fullName: string;
  displayName: string;
  profilePhotoUrl: string | null;
  role: UserRole;
  preferredLanguage: "en" | "th";
  username: string;
  email: string | null;
  status: UserStatus;
  views: UserView[];
  permissions: ModulePermission[];
  actionPermissions: ActionPermission[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

async function passwordHash(password: string, salt = randomToken(16), iterations = PASSWORD_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBytes = fromBase64Url(salt);
  const saltBuffer = saltBytes.buffer.slice(saltBytes.byteOffset, saltBytes.byteOffset + saltBytes.byteLength) as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    key,
    256,
  );
  return `pbkdf2_sha256$${iterations}$${salt}$${base64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsRaw, salt, expected] = stored.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationsRaw || !salt || !expected) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 10_000) return false;
  const actual = await passwordHash(password, salt, iterations);
  return timingSafeEqual(actual, stored);
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index]! ^ right[index]!;
  return diff === 0;
}

function normalizeText(value: unknown, label: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ValidationError(`${label} is required.`);
  return text.slice(0, max);
}

function normalizeOptionalText(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function profilePhotoBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

function normalizeProfilePhoto(value: unknown): string | null {
  const text = normalizeOptionalText(value, MAX_PROFILE_PHOTO_BYTES * 2);
  if (!text) return null;
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(text);
  if (!match) throw new ValidationError("Profile photo must be a base64 image data URL.");
  const mime = match[1]!.toLowerCase();
  if (!PROFILE_PHOTO_MIME_TYPES.has(mime)) throw new ValidationError("Profile photo type is not supported.");
  if (profilePhotoBytes(text) > MAX_PROFILE_PHOTO_BYTES) throw new ValidationError("Profile photo must be 512 KB or smaller.");
  return text;
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new ValidationError(`${label} is invalid.`);
}

function normalizeViews(value: unknown): UserView[] {
  if (!Array.isArray(value)) throw new ValidationError("At least one view is required.");
  const views = [...new Set(value.map((item) => normalizeEnum(item, VIEWS, "View")))];
  if (views.length === 0) throw new ValidationError("At least one view is required.");
  return views;
}

function normalizePermissions(value: unknown): ModulePermission[] {
  if (!Array.isArray(value)) throw new ValidationError("Permissions are required.");
  const byModule = new Map<ModuleKey, ModulePermission>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const module = normalizeEnum("module" in item ? item.module : undefined, MODULES, "Module");
    byModule.set(module, {
      module,
      canAccess: Boolean("canAccess" in item ? item.canAccess : false),
      canEdit: Boolean("canEdit" in item ? item.canEdit : false),
    });
  }
  return MODULES.map((module) => byModule.get(module) ?? { module, canAccess: false, canEdit: false });
}

function defaultActionPermissions(role: UserRole): ActionPermission[] {
  return ACTION_PERMISSIONS.map((action) => ({ action, allowed: role === "Owner" || role === "Manager" }));
}

function normalizeActionPermissions(value: unknown, role: UserRole): ActionPermission[] {
  if (value === undefined) return defaultActionPermissions(role);
  if (!Array.isArray(value)) throw new ValidationError("Action permissions are invalid.");
  const byAction = new Map<ActionPermissionKey, ActionPermission>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const action = normalizeEnum("action" in item ? item.action : undefined, ACTION_PERMISSIONS, "Action permission");
    byAction.set(action, {
      action,
      allowed: Boolean("allowed" in item ? item.allowed : false),
    });
  }
  return ACTION_PERMISSIONS.map((action) => byAction.get(action) ?? { action, allowed: false });
}

export function normalizeLoginInput(payload: unknown): LoginInput {
  if (!payload || typeof payload !== "object") throw new ValidationError("Login payload is required.");
  return {
    username: normalizeText("username" in payload ? payload.username : undefined, "Username", 120),
    password: normalizeText("password" in payload ? payload.password : undefined, "Password", 200),
  };
}

export function normalizeCreateUserInput(payload: unknown): CreateUserInput {
  if (!payload || typeof payload !== "object") throw new ValidationError("User payload is required.");
  return {
    fullName: normalizeText("fullName" in payload ? payload.fullName : undefined, "Full name", 120),
    profilePhotoUrl: normalizeProfilePhoto("profilePhotoUrl" in payload ? payload.profilePhotoUrl : undefined),
    role: normalizeEnum("role" in payload ? payload.role : undefined, ROLES, "Role"),
    preferredLanguage: normalizeEnum("preferredLanguage" in payload ? payload.preferredLanguage : undefined, LANGUAGES, "Preferred language"),
    username: normalizeText("username" in payload ? payload.username : undefined, "Username", 120).toLowerCase(),
    email: normalizeOptionalText("email" in payload ? payload.email : undefined, 180)?.toLowerCase() ?? null,
    password: normalizeText("password" in payload ? payload.password : undefined, "Password", 200),
    status: normalizeEnum("status" in payload ? payload.status : "invited", STATUSES, "Status"),
    views: normalizeViews("views" in payload ? payload.views : undefined),
    permissions: normalizePermissions("permissions" in payload ? payload.permissions : undefined),
    actionPermissions: normalizeActionPermissions("actionPermissions" in payload ? payload.actionPermissions : undefined, normalizeEnum("role" in payload ? payload.role : undefined, ROLES, "Role")),
  };
}

export function normalizeUpdateUserInput(payload: unknown): UpdateUserInput {
  if (!payload || typeof payload !== "object") throw new ValidationError("User payload is required.");
  const input: UpdateUserInput = {};
  if ("fullName" in payload) input.fullName = normalizeText(payload.fullName, "Full name", 120);
  if ("profilePhotoUrl" in payload) input.profilePhotoUrl = normalizeProfilePhoto(payload.profilePhotoUrl);
  if ("role" in payload) input.role = normalizeEnum(payload.role, ROLES, "Role");
  if ("preferredLanguage" in payload) input.preferredLanguage = normalizeEnum(payload.preferredLanguage, LANGUAGES, "Preferred language");
  if ("username" in payload) input.username = normalizeText(payload.username, "Username", 120).toLowerCase();
  if ("email" in payload) input.email = normalizeOptionalText(payload.email, 180)?.toLowerCase() ?? null;
  if ("password" in payload) input.password = normalizeOptionalText(payload.password, 200);
  if ("status" in payload) input.status = normalizeEnum(payload.status, STATUSES, "Status");
  if ("views" in payload) input.views = normalizeViews(payload.views);
  if ("permissions" in payload) input.permissions = normalizePermissions(payload.permissions);
  if ("actionPermissions" in payload) input.actionPermissions = normalizeActionPermissions(payload.actionPermissions, "role" in payload ? normalizeEnum(payload.role, ROLES, "Role") : "Operations");
  if (Object.keys(input).length === 0) throw new ValidationError("At least one user field is required.");
  return input;
}

function sessionCookie(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rawValue] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return rawValue.join("=") || null;
  }
  return null;
}

export function makeSessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${securePart}; Expires=${expiresAt.toUTCString()}`;
}

export function makeExpiredSessionCookie(secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=0`;
}

function mapPublicUser(row: UserRow, views: UserView[], permissions: ModulePermission[], actionPermissions: ActionPermission[]): PublicManagedUser {
  return {
    id: row.user_id,
    fullName: row.full_name,
    displayName: row.full_name,
    profilePhotoUrl: row.profile_photo_url,
    role: row.role,
    preferredLanguage: row.preferred_language,
    username: row.username,
    email: row.email,
    status: row.status,
    views,
    permissions,
    actionPermissions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

async function loadViews(env: AuthBindings, userId: string): Promise<UserView[]> {
  const rows = await env.DB.prepare("SELECT view_key FROM user_views WHERE user_id = ? ORDER BY view_key").bind(userId).all<UserViewRow>();
  return (rows.results ?? []).map((row) => row.view_key);
}

async function loadPermissions(env: AuthBindings, userId: string): Promise<ModulePermission[]> {
  const rows = await env.DB.prepare("SELECT module_key, can_access, can_edit FROM user_module_permissions WHERE user_id = ? ORDER BY module_key")
    .bind(userId)
    .all<PermissionRow>();
  const mapped = new Map((rows.results ?? []).map((row) => [row.module_key, {
    module: row.module_key,
    canAccess: row.can_access === 1,
    canEdit: row.can_edit === 1,
  }]));
  return MODULES.map((module) => mapped.get(module) ?? { module, canAccess: false, canEdit: false });
}

async function loadActionPermissions(env: AuthBindings, userId: string): Promise<ActionPermission[]> {
  const rows = await env.DB.prepare("SELECT action_key, allowed FROM user_action_permissions WHERE user_id = ? ORDER BY action_key")
    .bind(userId)
    .all<ActionPermissionRow>();
  const mapped = new Map((rows.results ?? []).map((row) => [row.action_key, {
    action: row.action_key,
    allowed: row.allowed === 1,
  }]));
  return ACTION_PERMISSIONS.map((action) => mapped.get(action) ?? { action, allowed: false });
}

async function loadPublicUser(env: AuthBindings, row: UserRow): Promise<PublicManagedUser> {
  const [views, permissions, actionPermissions] = await Promise.all([loadViews(env, row.user_id), loadPermissions(env, row.user_id), loadActionPermissions(env, row.user_id)]);
  return mapPublicUser(row, views, permissions, actionPermissions);
}

function toCurrentUser(user: PublicManagedUser): CurrentUser {
  return {
    id: user.id,
    displayName: user.displayName,
    fullName: user.fullName,
    profilePhotoUrl: user.profilePhotoUrl,
    role: user.role,
    preferredLanguage: user.preferredLanguage,
    username: user.username,
    email: user.email,
    status: user.status,
    views: user.views,
    permissions: user.permissions,
    actionPermissions: user.actionPermissions,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function resolveCurrentUser(c: AuthContextLike): Promise<CurrentUser> {
  const token = sessionCookie(c.req.raw);
  if (!token) throw new AuthenticationError();
  const tokenHash = await sha256(token);
  const row = await c.env.DB.prepare(`
    SELECT s.session_id, s.expires_at, u.*
    FROM user_sessions s
    INNER JOIN users u ON u.user_id = s.user_id
    WHERE s.token_hash = ?
  `).bind(tokenHash).first<SessionRow>();
  if (!row) throw new AuthenticationError();
  if (row.status !== "active") throw new AuthenticationError("User account is not active.");
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await c.env.DB.prepare("DELETE FROM user_sessions WHERE session_id = ?").bind(row.session_id).run();
    throw new AuthenticationError("Session has expired.");
  }
  const user = await loadPublicUser(c.env, row);
  return toCurrentUser(user);
}

export async function login(env: AuthBindings, input: LoginInput): Promise<{ token: string; expiresAt: Date; user: CurrentUser }> {
  const username = input.username.trim().toLowerCase();
  const row = await env.DB.prepare("SELECT * FROM users WHERE username = ? OR lower(email) = ?")
    .bind(username, username)
    .first<UserRow>();
  if (!row || row.status !== "active" || !(await verifyPassword(input.password, row.password_hash))) {
    throw new AuthenticationError("Invalid username or password.");
  }
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await env.DB.prepare(`
    INSERT INTO user_sessions (session_id, user_id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), row.user_id, tokenHash, now.toISOString(), expiresAt.toISOString()).run();
  await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE user_id = ?")
    .bind(now.toISOString(), now.toISOString(), row.user_id)
    .run();
  const user = await loadPublicUser(env, { ...row, last_login_at: now.toISOString(), updated_at: now.toISOString() });
  return { token, expiresAt, user: toCurrentUser(user) };
}

export async function logout(c: AuthContextLike): Promise<void> {
  const token = sessionCookie(c.req.raw);
  if (!token) return;
  await c.env.DB.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export function isOwner(user: CurrentUser): boolean {
  return user.role === "Owner" && user.views.includes("owner");
}

const staffOperationalModules = new Set<ModuleKey>([
  "rooms",
  "housekeeping",
  "movements",
  "maintenance",
  "procurement",
  "messages",
  "chat",
]);

export function hasModulePermission(user: CurrentUser, module: ModuleKey, action: "access" | "edit" = "access"): boolean {
  if (action === "access" && user.views.includes("staff") && staffOperationalModules.has(module)) {
    return true;
  }
  const permission = user.permissions.find((item) => item.module === module);
  if (!permission) return false;
  return action === "edit" ? permission.canAccess && permission.canEdit : permission.canAccess;
}

export function hasActionPermission(user: CurrentUser, action: ActionPermissionKey): boolean {
  return user.actionPermissions.some((permission) => permission.action === action && permission.allowed);
}

export function canCompleteReception(user: CurrentUser): boolean {
  return isOwner(user) || (user.views.includes("staff") && hasModulePermission(user, "movements", "access"));
}

export function requireActionPermission(user: CurrentUser, action: ActionPermissionKey): void {
  if (!hasActionPermission(user, action)) throw new ForbiddenError();
}

export function requireOwner(user: CurrentUser): void {
  if (!isOwner(user)) throw new ForbiddenError("Owner access is required.");
}

export function requireView(user: CurrentUser, view: UserView): void {
  if (!user.views.includes(view)) throw new ForbiddenError(`${view} view access is required.`);
}

export function requireModulePermission(user: CurrentUser, module: ModuleKey, action: "access" | "edit" = "access"): void {
  if (!hasModulePermission(user, module, action)) throw new ForbiddenError();
}

export function publicCurrentUser(user: CurrentUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    fullName: user.fullName,
    profilePhotoUrl: user.profilePhotoUrl,
    role: user.role,
    preferredLanguage: user.preferredLanguage,
    username: user.username,
    email: user.email,
    status: user.status,
    views: user.views,
    permissions: user.permissions,
    actionPermissions: user.actionPermissions,
    isOwner: isOwner(user),
  };
}

async function saveUserAccess(env: AuthBindings, userId: string, views: UserView[], permissions: ModulePermission[], actionPermissions: ActionPermission[] = []): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM user_views WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM user_module_permissions WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM user_action_permissions WHERE user_id = ?").bind(userId),
  ]);
  const statements = [
    ...views.map((view) => env.DB.prepare("INSERT INTO user_views (user_id, view_key) VALUES (?, ?)").bind(userId, view)),
    ...permissions.map((permission) => env.DB.prepare(`
      INSERT INTO user_module_permissions (user_id, module_key, can_access, can_edit)
      VALUES (?, ?, ?, ?)
    `).bind(userId, permission.module, permission.canAccess ? 1 : 0, permission.canEdit ? 1 : 0)),
    ...actionPermissions.map((permission) => env.DB.prepare(`
      INSERT INTO user_action_permissions (user_id, action_key, allowed)
      VALUES (?, ?, ?)
    `).bind(userId, permission.action, permission.allowed ? 1 : 0)),
  ];
  if (statements.length > 0) await env.DB.batch(statements);
}

export async function listUsers(env: AuthBindings): Promise<PublicManagedUser[]> {
  const rows = await env.DB.prepare("SELECT * FROM users ORDER BY full_name").all<UserRow>();
  return Promise.all((rows.results ?? []).map((row) => loadPublicUser(env, row)));
}

export async function createUser(env: AuthBindings, input: CreateUserInput): Promise<PublicManagedUser> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const hashed = await passwordHash(input.password);
  await env.DB.prepare(`
    INSERT INTO users (
      user_id, full_name, profile_photo_url, role, preferred_language, username, email,
      password_hash, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.fullName,
    input.profilePhotoUrl,
    input.role,
    input.preferredLanguage,
    input.username,
    input.email,
    hashed,
    input.status,
    now,
    now,
  ).run();
  await saveUserAccess(env, id, input.views, input.permissions, input.actionPermissions ?? defaultActionPermissions(input.role));
  const row = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(id).first<UserRow>();
  if (!row) throw new Error("User was created but could not be loaded.");
  return loadPublicUser(env, row);
}

export async function createInitialOwner(env: AuthBindings, input: CreateUserInput): Promise<PublicManagedUser> {
  if (input.role !== "Owner" || !input.views.includes("owner")) {
    throw new ValidationError("Initial bootstrap user must be an Owner with Owner view.");
  }
  const now = new Date().toISOString();
  const id = "owner-bootstrap";
  const hashed = await passwordHash(input.password);
  const result = await env.DB.prepare(`
    INSERT INTO users (
      user_id, full_name, profile_photo_url, role, preferred_language, username, email,
      password_hash, status, created_at, updated_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM users)
  `).bind(
    id,
    input.fullName,
    input.profilePhotoUrl,
    input.role,
    input.preferredLanguage,
    input.username,
    input.email,
    hashed,
    now,
    now,
  ).run();
  if ((result.meta.changes ?? 0) !== 1) throw new ForbiddenError("Bootstrap is available only before the first user exists.");
  await saveUserAccess(env, id, input.views, input.permissions, input.actionPermissions ?? defaultActionPermissions(input.role));
  const row = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(id).first<UserRow>();
  if (!row) throw new Error("Initial Owner was created but could not be loaded.");
  return loadPublicUser(env, row);
}

export async function updateUser(env: AuthBindings, userId: string, input: UpdateUserInput): Promise<PublicManagedUser | null> {
  const current = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(userId).first<UserRow>();
  if (!current) return null;
  const now = new Date().toISOString();
  const nextHash = input.password ? await passwordHash(input.password) : current.password_hash;
  await env.DB.prepare(`
    UPDATE users
    SET full_name = ?, profile_photo_url = ?, role = ?, preferred_language = ?, username = ?, email = ?,
        password_hash = ?, status = ?, updated_at = ?
    WHERE user_id = ?
  `).bind(
    input.fullName ?? current.full_name,
    input.profilePhotoUrl !== undefined ? input.profilePhotoUrl : current.profile_photo_url,
    input.role ?? current.role,
    input.preferredLanguage ?? current.preferred_language,
    input.username ?? current.username,
    input.email !== undefined ? input.email : current.email,
    nextHash,
    input.status ?? current.status,
    now,
    userId,
  ).run();
  if (input.status === "disabled") {
    await env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(userId).run();
  }
  if (input.views || input.permissions || input.actionPermissions) {
    const views = input.views ?? await loadViews(env, userId);
    const permissions = input.permissions ?? await loadPermissions(env, userId);
    const actionPermissions = input.actionPermissions ?? await loadActionPermissions(env, userId);
    await saveUserAccess(env, userId, views, permissions, actionPermissions);
  }
  const row = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(userId).first<UserRow>();
  return row ? loadPublicUser(env, row) : null;
}

export async function disableUser(env: AuthBindings, userId: string): Promise<PublicManagedUser | null> {
  return updateUser(env, userId, { status: "disabled" });
}

export const authOptions = {
  actionPermissions: ACTION_PERMISSIONS,
  modules: MODULES,
  roles: ROLES,
  statuses: STATUSES,
  views: VIEWS,
};
