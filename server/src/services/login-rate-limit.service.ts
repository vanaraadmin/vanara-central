export interface LoginRateLimitBindings {
  DB: D1Database;
}

interface LoginRateLimitRow {
  failed_count: number;
  window_started_at: string;
  blocked_until: string | null;
}

export class LoginRateLimitError extends Error {
  constructor(message = "Too many login attempts. Please wait a few minutes.") {
    super(message);
    this.name = "LoginRateLimitError";
  }
}

const LOGIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;
const MAX_LOGIN_FAILURES = 8;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normalizeIp(ip: string | null): string {
  return (ip ?? "unknown").split(",", 1)[0]?.trim() || "unknown";
}

async function loginRateLimitKey(username: string, ip: string): Promise<{ key: string; username: string; ipHash: string }> {
  const normalizedUsername = normalizeUsername(username);
  const normalizedIp = normalizeIp(ip);
  const ipHash = await sha256(`ip:${normalizedIp}`);
  const key = await sha256(`login:${normalizedUsername}:${ipHash}`);
  return { key, username: normalizedUsername, ipHash };
}

export function loginClientIp(headers: Headers): string {
  return normalizeIp(headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for"));
}

export async function assertLoginAllowed(env: LoginRateLimitBindings, username: string, ip: string, now = new Date()): Promise<void> {
  const { key } = await loginRateLimitKey(username, ip);
  const row = await env.DB.prepare(`
    SELECT failed_count, window_started_at, blocked_until
    FROM login_rate_limits
    WHERE rate_limit_key = ?
  `).bind(key).first<LoginRateLimitRow>();
  if (!row?.blocked_until) return;
  if (new Date(row.blocked_until).getTime() > now.getTime()) throw new LoginRateLimitError();
}

export async function recordLoginSuccess(env: LoginRateLimitBindings, username: string, ip: string): Promise<void> {
  const { key } = await loginRateLimitKey(username, ip);
  await env.DB.prepare("DELETE FROM login_rate_limits WHERE rate_limit_key = ?").bind(key).run();
}

export async function recordLoginFailure(env: LoginRateLimitBindings, username: string, ip: string, now = new Date()): Promise<void> {
  const { key, username: normalizedUsername, ipHash } = await loginRateLimitKey(username, ip);
  const row = await env.DB.prepare(`
    SELECT failed_count, window_started_at, blocked_until
    FROM login_rate_limits
    WHERE rate_limit_key = ?
  `).bind(key).first<LoginRateLimitRow>();
  const windowStartedAt = row?.window_started_at ? new Date(row.window_started_at) : now;
  const insideWindow = now.getTime() - windowStartedAt.getTime() <= LOGIN_FAILURE_WINDOW_MS;
  const failedCount = insideWindow ? (row?.failed_count ?? 0) + 1 : 1;
  const nextWindowStartedAt = insideWindow ? windowStartedAt : now;
  const blockedUntil = failedCount >= MAX_LOGIN_FAILURES
    ? new Date(now.getTime() + LOGIN_BLOCK_MS).toISOString()
    : null;

  await env.DB.prepare(`
    INSERT INTO login_rate_limits (
      rate_limit_key, username, ip_hash, failed_count, window_started_at, last_failed_at, blocked_until
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(rate_limit_key) DO UPDATE SET
      failed_count = excluded.failed_count,
      window_started_at = excluded.window_started_at,
      last_failed_at = excluded.last_failed_at,
      blocked_until = excluded.blocked_until
  `).bind(
    key,
    normalizedUsername,
    ipHash,
    failedCount,
    nextWindowStartedAt.toISOString(),
    now.toISOString(),
    blockedUntil,
  ).run();
}
