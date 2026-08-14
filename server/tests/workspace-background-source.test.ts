import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceShell = readFileSync(new URL("../../src/components/WorkspaceShell.tsx", import.meta.url), "utf8");
const appLayout = readFileSync(new URL("../../src/layouts/AppLayout.tsx", import.meta.url), "utf8");
const staffPage = readFileSync(new URL("../../src/pages/StaffPage.tsx", import.meta.url), "utf8");
const staffCss = readFileSync(new URL("../../src/styles/StaffPage.css", import.meta.url), "utf8");
const workspaceCss = readFileSync(new URL("../../src/styles/WorkspaceShell.css", import.meta.url), "utf8");
const operationsCss = readFileSync(new URL("../../src/styles/OperationsShell.css", import.meta.url), "utf8");
const wranglerConfig = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
const passportWorkflow = readFileSync(new URL("../../src/components/passport/PassportWorkflow.tsx", import.meta.url), "utf8");
const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));
const assetsRoot = fileURLToPath(new URL("../../src/assets/img", import.meta.url));

const legacyPages = ["HomePage.tsx", "TodayPage.tsx", "OpsMvpPage.tsx"] as const;
const legacyStyles = ["TodayPage.css", "OpsMvpPage.css"] as const;
const legacyBackgrounds = [
  "background_chat.png",
  "background_checkin_checkout.png",
  "background_home_staff.png",
  "background_housekeeping.png",
  "background_maintenance.png",
  "background_procurement.png",
] as const;

function sourceFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const fullPath = join(path, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return sourceFiles(fullPath);
    return /\.(css|ts|tsx)$/.test(fullPath) ? [fullPath] : [];
  });
}

test("OperationsShell is the only owner of the canonical workspace background and veil", () => {
  assert.equal(statSync(join(assetsRoot, "background_room.png")).isFile(), true);
  assert.match(appLayout, /className="operations-shell"/);
  assert.match(operationsCss, /url\("\.\.\/assets\/img\/background_room\.png"\)/);
  assert.match(operationsCss, /linear-gradient/);
  assert.match(operationsCss, /background-position:\s*center top/);
  assert.match(operationsCss, /background-size:\s*cover/);
  assert.match(staffPage, /translate\("sawasdee"\)/);
  assert.match(staffPage, /<WorkspaceShell[\s\S]*workspace="staffHome"[\s\S]*bodyClassName="staff-page"[\s\S]*>/);
  assert.doesNotMatch(workspaceShell, /workspaceBackgroundStyle|preloadWorkspaceBackground|workspace-page__veil/);
  assert.doesNotMatch(workspaceCss, /background-image|workspace-page__veil|--workspace-background/);
  assert.match(workspaceCss, /\.workspace-page\s*\{[\s\S]*background:\s*transparent/);
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

test("route workspaces cannot repaint the application background after hydration", () => {
  const workspacePageRule = workspaceCss.slice(
    workspaceCss.indexOf(".workspace-page {"),
    workspaceCss.indexOf(".workspace-shell {"),
  );
  assert.doesNotMatch(staffCss, /background-image:\s*var\(--workspace-background, none\)/);
  assert.doesNotMatch(workspaceShell, /style=\{[^}]*background|workspace-page__veil/);
  assert.doesNotMatch(workspacePageRule, /url\(|linear-gradient|radial-gradient/);
  assert.match(workspacePageRule, /background:\s*transparent/);
  assert.equal((`${workspaceCss}\n${operationsCss}`.match(/background_room\.png/g) ?? []).length, 1);
  assert.doesNotMatch(operationsCss, /background-attachment:\s*fixed|cover fixed no-repeat/);
});

test("unreachable legacy pages, styles, and background variants are removed", () => {
  const oldVariant = /background_(home_staff|checkin_checkout|housekeeping|maintenance|procurement|chat)\.png/;
  for (const file of sourceFiles(sourceRoot)) {
    assert.doesNotMatch(readFileSync(file, "utf8"), oldVariant, file);
  }
  for (const page of legacyPages) assert.equal(existsSync(join(sourceRoot, "pages", page)), false, page);
  for (const style of legacyStyles) assert.equal(existsSync(join(sourceRoot, "styles", style)), false, style);
  for (const asset of legacyBackgrounds) assert.equal(existsSync(join(assetsRoot, asset)), false, asset);
  assert.doesNotMatch(passportWorkflow, /workspaceBackground|WORKSPACE_BACKGROUNDS|Background_|background_/);
});

test("workspace background is compiled into Worker static assets", () => {
  assert.match(wranglerConfig, /"assets"\s*:\s*\{/);
  assert.match(wranglerConfig, /"binding"\s*:\s*"ASSETS"/);
  assert.match(wranglerConfig, /"directory"\s*:\s*"\.\/dist\/client"/);
  assert.match(wranglerConfig, /"not_found_handling"\s*:\s*"single-page-application"/);
});
