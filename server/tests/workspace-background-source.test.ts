import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const config = readFileSync(new URL("../../src/config/workspaceBackgrounds.ts", import.meta.url), "utf8");
const workspaceShell = readFileSync(new URL("../../src/components/WorkspaceShell.tsx", import.meta.url), "utf8");
const staffPage = readFileSync(new URL("../../src/pages/StaffPage.tsx", import.meta.url), "utf8");
const staffCss = readFileSync(new URL("../../src/styles/StaffPage.css", import.meta.url), "utf8");
const workspaceCss = readFileSync(new URL("../../src/styles/WorkspaceShell.css", import.meta.url), "utf8");
const operationsCss = readFileSync(new URL("../../src/styles/OperationsShell.css", import.meta.url), "utf8");
const wranglerConfig = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
const passportWorkflow = readFileSync(new URL("../../src/components/passport/PassportWorkflow.tsx", import.meta.url), "utf8");
const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));
const assetsRoot = fileURLToPath(new URL("../../src/assets/img", import.meta.url));

const workspaceKeys = ["staffHome", "reception", "rooms", "housekeeping", "maintenance", "procurement", "social", "payroll", "messages", "chat"] as const;

function sourceFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const fullPath = join(path, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return sourceFiles(fullPath);
    return /\.(css|ts|tsx)$/.test(fullPath) ? [fullPath] : [];
  });
}

test("typed workspace background configuration uses one canonical image for every workspace", () => {
  assert.match(config, /export type WorkspaceBackgroundKey/);
  assert.match(config, /import workspaceBackground from "\.\.\/assets\/img\/background_room\.png"/);
  assert.match(config, /WORKSPACE_BACKGROUNDS = \{/);
  assert.match(config, /satisfies Record<WorkspaceBackgroundKey, string>/);

  for (const key of workspaceKeys) {
    assert.match(config, new RegExp(`${key}: workspaceBackground`));
  }

  assert.equal(statSync(join(assetsRoot, "background_room.png")).isFile(), true);
  assert.match(config, /link\.dataset\.workspaceBackground = "global"/);
  assert.doesNotMatch(config, /background_(home_staff|checkin_checkout|housekeeping|maintenance|procurement|chat)\.png/);
});

test("Staff Home and WorkspaceShell consume the single shared background config", () => {
  assert.match(staffPage, /translate\("sawasdee"\)/);
  assert.match(staffPage, /<WorkspaceShell[\s\S]*workspace="staffHome"[\s\S]*bodyClassName="staff-page"[\s\S]*>/);
  assert.match(workspaceShell, /workspaceBackgroundKeys: Record<WorkspaceKey, WorkspaceBackgroundKey>/);
  for (const key of workspaceKeys) assert.match(workspaceShell, new RegExp(`"${key}"`));
  assert.match(workspaceShell, /workspaceBackgroundStyle\(backgroundKey\)/);
  assert.match(workspaceShell, /preloadWorkspaceBackground\(backgroundKey\)/);
});

test("all implemented workspaces remain on the common WorkspaceShell", () => {
  const pageMappings = [
    ["ReceptionPage.tsx", /workspace="reception"/],
    ["MovementsPage.tsx", /workspace="reception"/],
    ["RoomsPage.tsx", /workspace="rooms"/],
    ["HousekeepingV2Page.tsx", /workspace="housekeeping"/],
    ["MaintenancePage.tsx", /workspace="maintenance"/],
    ["ProcurementPage.tsx", /workspace="procurement"/],
    ["SocialAutomationPage.tsx", /workspace="social"/],
    ["MessagesPage.tsx", /workspace="messages"/],
    ["DashboardPage.tsx", /workspace="ownerDashboard"/],
    ["AccountingPage.tsx", /workspace="accounting"/],
    ["PayrollPage.tsx", /workspace="payroll"/],
  ] as const;

  for (const [page, pattern] of pageMappings) {
    assert.match(readFileSync(new URL(`../../src/pages/${page}`, import.meta.url), "utf8"), pattern);
  }
});

test("workspace and application shells use one cover position and one readability veil", () => {
  assert.doesNotMatch(staffCss, /background-image:\s*var\(--workspace-background, none\)/);
  assert.match(workspaceCss, /--workspace-background-fallback:\s*#0c241a/);
  assert.match(workspaceCss, /background-image:\s*var\(--workspace-background, none\)/);
  assert.match(workspaceCss, /background-position:\s*center top/);
  assert.match(workspaceCss, /background-size:\s*cover/);
  assert.match(workspaceCss, /\.workspace-page__veil\s*\{[\s\S]*linear-gradient/);
  assert.match(operationsCss, /url\("\.\.\/assets\/img\/background_room\.png"\)/);
  assert.match(operationsCss, /background-position:\s*center top/);
  assert.match(operationsCss, /background-size:\s*cover/);
  assert.doesNotMatch(`${workspaceCss}\n${operationsCss}`, /background-attachment:\s*fixed|cover fixed no-repeat/);
});

test("old background variants are unreachable from frontend source", () => {
  const oldVariant = /background_(home_staff|checkin_checkout|housekeeping|maintenance|procurement|chat)\.png/;
  for (const file of sourceFiles(sourceRoot)) {
    assert.doesNotMatch(readFileSync(file, "utf8"), oldVariant, file);
  }
  assert.doesNotMatch(passportWorkflow, /workspaceBackground|WORKSPACE_BACKGROUNDS|Background_|background_/);
});

test("workspace background is compiled into Worker static assets", () => {
  assert.match(wranglerConfig, /"assets"\s*:\s*\{/);
  assert.match(wranglerConfig, /"binding"\s*:\s*"ASSETS"/);
  assert.match(wranglerConfig, /"directory"\s*:\s*"\.\/dist\/client"/);
  assert.match(wranglerConfig, /"not_found_handling"\s*:\s*"single-page-application"/);
});
