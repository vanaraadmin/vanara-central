import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workerSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const loginRateLimitService = readFileSync(new URL("../src/services/login-rate-limit.service.ts", import.meta.url), "utf8");
const loginRateLimitMigration = readFileSync(new URL("../migrations/0043_login_rate_limits.sql", import.meta.url), "utf8");
const wranglerConfig = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");

test("owner bootstrap is disabled by default and only available behind an explicit flag", () => {
  assert.match(workerSource, /VANARA_ENABLE_OWNER_BOOTSTRAP/);
  assert.match(workerSource, /Owner bootstrap is disabled/);
  assert.match(workerSource, /\/api\/auth\/bootstrap-owner/);
});

test("public health endpoint stays minimal and does not expose database identifiers or secret status", () => {
  const healthHandler = workerSource.slice(workerSource.indexOf("async function healthHandler"), workerSource.indexOf("async function loadTm30Template"));
  assert.match(healthHandler, /SELECT 1 AS ok/);
  assert.match(healthHandler, /return c\.json\(\{ ok: true, worker: "ok", api: "ok", d1: "ok" \}\)/);
  assert.doesNotMatch(healthHandler, /databaseId|databaseName|databaseEnvironment|beds24Token|BEDS24_LONG_LIFE_TOKEN/);
});

test("login attempts are throttled through D1 and return HTTP 429 when blocked", () => {
  assert.match(loginRateLimitMigration, /CREATE TABLE IF NOT EXISTS login_rate_limits/);
  assert.match(loginRateLimitMigration, /rate_limit_key TEXT PRIMARY KEY/);
  assert.match(loginRateLimitService, /MAX_LOGIN_FAILURES = 8/);
  assert.match(loginRateLimitService, /LOGIN_BLOCK_MS = 10 \* 60 \* 1000/);
  assert.match(workerSource, /assertLoginAllowed/);
  assert.match(workerSource, /recordLoginFailure/);
  assert.match(workerSource, /recordLoginSuccess/);
  assert.match(workerSource, /LoginRateLimitError[\s\S]*429/);
});

test("workers.dev preview hostname is disabled for production", () => {
  assert.match(wranglerConfig, /"workers_dev"\s*:\s*false/);
  assert.match(wranglerConfig, /"pattern"\s*:\s*"central\.vanararetreat\.com"/);
});
