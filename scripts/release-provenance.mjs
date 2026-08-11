import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = join(repoRoot, "dist", "client");
const outputRoot = join(repoRoot, "outputs", "release-provenance");

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function filesBelow(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(path, entry.name);
    return entry.isDirectory() ? filesBelow(fullPath) : [fullPath];
  });
}

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function entryAssets(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
}

function manifestPath(commit) {
  return join(outputRoot, `${commit}.json`);
}

async function capture() {
  const commit = option("--commit", git("rev-parse", "HEAD"));
  const actualCommit = git("rev-parse", "HEAD");
  if (commit !== actualCommit) throw new Error(`Build commit ${actualCommit} does not match requested release commit ${commit}`);

  const files = Object.fromEntries(filesBelow(distRoot).map((file) => [
    relative(distRoot, file).replaceAll("\\", "/"),
    sha256(readFileSync(file)),
  ]));
  const indexHtml = readFileSync(join(distRoot, "index.html"), "utf8");
  const record = {
    commit,
    capturedAt: new Date().toISOString(),
    files,
    entryAssets: entryAssets(indexHtml),
  };

  mkdirSync(dirname(manifestPath(commit)), { recursive: true });
  writeFileSync(manifestPath(commit), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`RELEASE_PROVENANCE_CAPTURED=${manifestPath(commit)}`);
}

async function verifyOnline() {
  const commit = option("--commit", git("rev-parse", "HEAD"));
  const versionId = option("--version");
  const productionUrl = new URL(option("--url", "https://central.vanararetreat.com/"));
  const record = JSON.parse(readFileSync(manifestPath(commit), "utf8"));
  const response = await fetch(new URL(`/?release_check=${Date.now()}`, productionUrl), { cache: "no-store" });
  if (!response.ok) throw new Error(`Production entry returned HTTP ${response.status}`);

  const onlineEntries = entryAssets(await response.text());
  if (JSON.stringify(onlineEntries) !== JSON.stringify(record.entryAssets)) {
    throw new Error(`Online entry assets do not match commit ${commit}`);
  }

  const verifiedAssets = {};
  for (const assetPath of onlineEntries) {
    const assetResponse = await fetch(new URL(assetPath, productionUrl), { cache: "no-store" });
    if (!assetResponse.ok) throw new Error(`${assetPath} returned HTTP ${assetResponse.status}`);
    const actualHash = sha256(Buffer.from(await assetResponse.arrayBuffer()));
    const relativePath = assetPath.replace(/^\//, "");
    if (actualHash !== record.files[relativePath]) throw new Error(`${assetPath} hash does not match commit ${commit}`);
    verifiedAssets[relativePath] = actualHash;
  }

  const healthResponse = await fetch(new URL("/health", productionUrl), { cache: "no-store" });
  if (!healthResponse.ok) throw new Error(`Production health returned HTTP ${healthResponse.status}`);

  const verifiedRecord = {
    ...record,
    cloudflareVersionId: versionId,
    onlineVerifiedAt: new Date().toISOString(),
    productionUrl: productionUrl.origin,
    healthStatus: healthResponse.status,
    verifiedAssets,
  };
  writeFileSync(manifestPath(commit), `${JSON.stringify(verifiedRecord, null, 2)}\n`);
  console.log(`RELEASE_ONLINE_VERIFIED=PASS commit=${commit} version=${versionId} health=${healthResponse.status}`);
}

const command = process.argv[2];
if (command === "capture") await capture();
else if (command === "verify-online") await verifyOnline();
else throw new Error("Use capture or verify-online");
