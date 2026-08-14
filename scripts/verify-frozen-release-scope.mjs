import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = join(repoRoot, "scripts", "release-frozen-baseline.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function hashFile(relativePath) {
  const bytes = readFileSync(join(repoRoot, relativePath));
  const content = manifest.binaryExtensions.includes(extname(relativePath).toLowerCase())
    ? bytes
    : Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
  return createHash("sha256").update(content).digest("hex");
}

function normalizedSource(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function projectWorkerConfig(config) {
  return {
    name: config.name,
    main: config.main,
    workers_dev: config.workers_dev,
    routes: config.routes,
    vapidPublicKey: config.vars?.VAPID_PUBLIC_KEY,
    database: config.d1_databases?.find((entry) => entry.binding === "DB"),
    chatAttachmentBucket: config.r2_buckets?.find((entry) => entry.binding === "R2_STORAGE"),
    durableObjects: config.durable_objects,
    durableObjectMigrations: config.migrations,
    assets: config.assets,
    compatibilityFlags: config.compatibility_flags,
  };
}

const failures = [];

for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
  if (!existsSync(join(repoRoot, relativePath))) {
    failures.push(`${relativePath}: missing`);
    continue;
  }
  const actualHash = hashFile(relativePath);
  if (actualHash !== expectedHash) failures.push(`${relativePath}: frozen hash changed`);
}

for (const section of manifest.frozenSections ?? []) {
  if (!existsSync(join(repoRoot, section.path))) {
    failures.push(`${section.path}: frozen section file missing`);
    continue;
  }
  const source = normalizedSource(section.path);
  const start = source.indexOf(section.start);
  const end = section.end ? source.indexOf(section.end, start + section.start.length) : source.length;
  if (start < 0 || end < 0 || end <= start) {
    failures.push(`${section.path}: frozen section markers missing`);
    continue;
  }
  if (hashText(source.slice(start, end)) !== section.sha256) {
    failures.push(`${section.path}: frozen push/notification section changed`);
  }
}

const workerConfig = JSON.parse(readFileSync(join(repoRoot, "wrangler.jsonc"), "utf8"));
if (JSON.stringify(projectWorkerConfig(workerConfig)) !== JSON.stringify(manifest.workerConfig)) {
  failures.push("wrangler.jsonc: frozen route, storage, push, asset, or Durable Object configuration changed");
}

const migrationsRoot = join(repoRoot, "server", "migrations");
for (const fileName of readdirSync(migrationsRoot).filter((name) => name.endsWith(".sql"))) {
  const relativePath = `server/migrations/${fileName}`;
  if (Object.hasOwn(manifest.files, relativePath)) continue;
  const source = readFileSync(join(migrationsRoot, fileName), "utf8");
  if (/\b(chat_|push_subscriptions|notification_events|notification_deliveries)\b/i.test(source)) {
    failures.push(`${relativePath}: unapproved chat or notification schema change`);
  }
}

try {
  execFileSync("git", ["merge-base", "--is-ancestor", manifest.canonicalAncestor, "HEAD"], { cwd: repoRoot, stdio: "ignore" });
} catch {
  failures.push(`HEAD does not descend from canonical production ${manifest.canonicalAncestor}`);
}

const mergeCommits = git("rev-list", "--merges", `${manifest.canonicalAncestor}..HEAD`);
if (mergeCommits) failures.push("release lineage contains a post-baseline merge; apply surgical commits to the canonical line instead");

if (process.argv.includes("--release")) {
  const workingTreeStatus = git("status", "--porcelain", "--untracked-files=all");
  if (workingTreeStatus) failures.push("release requires a clean working tree tied to one exact commit");
}

if (failures.length > 0) {
  console.error("FROZEN RELEASE GUARD FAILED");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`FROZEN_RELEASE_GUARD=PASS baseline=${manifest.canonicalAncestor} head=${git("rev-parse", "HEAD")}`);
