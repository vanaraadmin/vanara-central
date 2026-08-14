import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = join(repoRoot, "dist", "client");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function entryAssets(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]).sort();
}

const manifest = JSON.parse(readFileSync(join(distRoot, "app-version.json"), "utf8"));
const htmlEntries = entryAssets(readFileSync(join(distRoot, "index.html"), "utf8"));
const manifestEntries = manifest.entryAssets.map((entry) => entry.url).sort();
if (!manifest.buildId || manifest.buildId.includes("__VANARA_BUILD_ID__")) throw new Error("PWA build ID was not stamped");
if (JSON.stringify(htmlEntries) !== JSON.stringify(manifestEntries)) throw new Error("PWA manifest entries do not match index.html");

for (const entry of manifest.entryAssets) {
  const actual = sha256(readFileSync(join(distRoot, entry.url.replace(/^\//, ""))));
  if (actual !== entry.sha256) throw new Error(`${entry.url} does not match its PWA manifest hash`);
}

const serviceWorker = readFileSync(join(distRoot, "sw.js"), "utf8");
if (!serviceWorker.includes(`const VANARA_BUILD_ID = "${manifest.buildId}";`)) throw new Error("sw.js and app-version.json build IDs differ");
if (serviceWorker.includes("__VANARA_BUILD_ID__")) throw new Error("sw.js still contains the build placeholder");

const clientContainsBuildId = manifest.entryAssets
  .filter((entry) => entry.url.endsWith(".js"))
  .some((entry) => readFileSync(join(distRoot, entry.url.replace(/^\//, "")), "utf8").includes(manifest.buildId));
if (!clientContainsBuildId) throw new Error("Client entry does not contain the stamped build ID");

const headers = readFileSync(join(distRoot, "_headers"), "utf8");
if (!/\/sw\.js[\s\S]*Cache-Control:\s*no-store, no-cache, must-revalidate/.test(headers)) throw new Error("sw.js no-store header is missing");
if (!/\/app-version\.json[\s\S]*Cache-Control:\s*no-store, no-cache, must-revalidate/.test(headers)) throw new Error("app-version.json no-store header is missing");

console.log(`PWA_BUILD_VERIFIED=PASS build=${manifest.buildId} entries=${manifest.entryAssets.length}`);
