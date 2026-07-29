import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "../..");
const persistTo = "./server/.wrangler/state";
const seedFile = "./server/seed/local.sql";
const wranglerConfig = "./wrangler.jsonc";
const databaseName = "vanara-central";
const wranglerBin = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");

function fail(message, details) {
  console.error(`[local-dev] ${message}`);
  if (details) {
    console.error(details.trim());
  }
  process.exit(1);
}

function runWrangler(args, label) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    fail(
      `${label} failed before Wrangler could start. Run "npm install" and retry.`,
      result.error.message,
    );
  }

  if (result.status !== 0) {
    fail(
      `${label} failed. Check the local D1 setup and retry "npm run dev:prepare".`,
      [result.stdout, result.stderr].filter(Boolean).join("\n"),
    );
  }
}

if (!existsSync(resolve(projectRoot, "node_modules"))) {
  fail('Dependencies are missing. Run "npm install" from the project root first.');
}

if (!existsSync(resolve(projectRoot, wranglerConfig))) {
  fail(`Missing ${wranglerConfig}. Restore the root Wrangler configuration before starting dev.`);
}

if (!existsSync(resolve(projectRoot, "server/migrations/0001_initial.sql"))) {
  fail("Missing local D1 migrations. Expected server/migrations/0001_initial.sql.");
}

if (!existsSync(resolve(projectRoot, seedFile))) {
  fail(`Missing local development seed file: ${seedFile}.`);
}

mkdirSync(resolve(projectRoot, persistTo), { recursive: true });

console.log("[local-dev] Preparing local D1 database...");

runWrangler([
  "d1",
  "migrations",
  "apply",
  databaseName,
  "--local",
  "--persist-to",
  persistTo,
  "--config",
  wranglerConfig,
], "Applying local D1 migrations");

runWrangler([
  "d1",
  "execute",
  databaseName,
  "--local",
  "--persist-to",
  persistTo,
  "--config",
  wranglerConfig,
  "--file",
  seedFile,
  "--yes",
], "Applying local D1 seed");

console.log("[local-dev] Local D1 database ready.");
