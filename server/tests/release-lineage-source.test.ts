import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
const deployScript = readFileSync(new URL("../../scripts/deploy-production.ps1", import.meta.url), "utf8");
const preflightScript = readFileSync(new URL("../../scripts/deploy-preflight.ps1", import.meta.url), "utf8");
const frozenGuard = readFileSync(new URL("../../scripts/verify-frozen-release-scope.mjs", import.meta.url), "utf8");
const provenance = readFileSync(new URL("../../scripts/release-provenance.mjs", import.meta.url), "utf8");

test("build and production deploy are blocked by frozen hashes and canonical lineage", () => {
  assert.match(packageJson, /"deploy": "npm run deploy:production"/);
  assert.match(packageJson, /"prebuild": "npm run release:guard"/);
  assert.match(frozenGuard, /merge-base/);
  assert.match(frozenGuard, /rev-list", "--merges"/);
  assert.match(frozenGuard, /frozen hash changed/);
  assert.match(frozenGuard, /unapproved chat or notification schema change/);
  assert.match(frozenGuard, /--untracked-files=all/);
  assert.match(deployScript, /Frozen release and canonical lineage guard/);
  assert.match(deployScript, /"--release"/);
  assert.match(deployScript, /cloudflare-test-loader\.mjs/);
  assert.match(deployScript, /"file:\/\/\/" \+ \$cloudflareTestLoaderPath/);
  assert.match(deployScript, /Push-Location \(Join-Path \$RepoRoot "server"\)/);
  assert.match(deployScript, /"-ProductionUrl", \$ProductionUrl/);
  assert.match(preflightScript, /https:\/\/central\.vanararetreat\.com/);
  assert.doesNotMatch(preflightScript, /workers\.dev/);
});

test("production deploy records commit, Worker version, build hashes, and verifies online entry assets", () => {
  assert.match(deployScript, /Capture release build provenance/);
  assert.match(deployScript, /CLOUDFLARE_VERSION_ID/);
  assert.match(deployScript, /Verify online build provenance and public health/);
  assert.match(provenance, /git\("rev-parse", "HEAD"\)/);
  assert.match(provenance, /cloudflareVersionId/);
  assert.match(provenance, /entryAssets/);
  assert.match(provenance, /hash does not match commit/);
  assert.match(provenance, /healthStatus/);
});
