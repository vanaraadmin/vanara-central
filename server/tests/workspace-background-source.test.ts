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
const wranglerConfig = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
const passportWorkflow = readFileSync(new URL("../../src/components/passport/PassportWorkflow.tsx", import.meta.url), "utf8");
const pagesRoot = fileURLToPath(new URL("../../src/pages", import.meta.url));
const assetsRoot = fileURLToPath(new URL("../../src/assets/img", import.meta.url));

const mappings = {
  staffHome: {
    importName: "backgroundHomeStaff",
    fileName: "background_home_staff.png",
  },
  reception: {
    importName: "backgroundCheckinCheckout",
    fileName: "background_checkin_checkout.png",
  },
  rooms: {
    importName: "backgroundRooms",
    fileName: "background_room.png",
  },
  housekeeping: {
    importName: "backgroundHousekeeping",
    fileName: "background_housekeeping.png",
  },
  maintenance: {
    importName: "backgroundMaintenance",
    fileName: "background_maintenance.png",
  },
  procurement: {
    importName: "backgroundProcurement",
    fileName: "background_procurement.png",
  },
  social: {
    importName: "backgroundProcurement",
    fileName: "background_procurement.png",
  },
  messages: {
    importName: "backgroundRooms",
    fileName: "background_room.png",
  },
  chat: {
    importName: "backgroundChat",
    fileName: "background_chat.png",
  },
} as const;

function pageFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const fullPath = join(path, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return pageFiles(fullPath);
    return fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

test("typed workspace background configuration imports canonical source image assets", () => {
  assert.match(config, /export type WorkspaceBackgroundKey/);
  assert.match(config, /WORKSPACE_BACKGROUNDS = \{/);
  assert.match(config, /satisfies Record<WorkspaceBackgroundKey, string>/);

  for (const [key, mapping] of Object.entries(mappings)) {
    assert.match(config, new RegExp(`${key}: ${mapping.importName}`));
    assert.match(config, new RegExp(`import ${mapping.importName} from "\\.\\./assets/img/${mapping.fileName}"`));
    assert.equal(statSync(join(assetsRoot, mapping.fileName)).isFile(), true);
  }

  assert.doesNotMatch(config, /"\/assets\/img\//);
  assert.doesNotMatch(config, /Background_|background1\.png/);
});

test("Staff Home and WorkspaceShell consume backgrounds through the shared config", () => {
  assert.match(staffPage, /translate\("sawasdeeName", \{ name \}\)/);
  assert.match(staffPage, /translate\("sawasdee"\)/);
  assert.match(staffPage, /<WorkspaceShell[\s\S]*title=\{title\}[\s\S]*stickyNavigationTitle=\{translate\("home"\)\}[\s\S]*workspace="staffHome"[\s\S]*bodyClassName="staff-page">/);
  assert.match(workspaceShell, /workspaceBackgroundKeys: Record<WorkspaceKey, WorkspaceBackgroundKey>/);
  assert.match(workspaceShell, /staffHome: "staffHome"/);
  assert.match(workspaceShell, /reception: "reception"/);
  assert.match(workspaceShell, /rooms: "rooms"/);
  assert.match(workspaceShell, /housekeeping: "housekeeping"/);
  assert.match(workspaceShell, /maintenance: "maintenance"/);
  assert.match(workspaceShell, /procurement: "procurement"/);
  assert.match(workspaceShell, /social: "social"/);
  assert.match(workspaceShell, /chat: "chat"/);
  assert.match(workspaceShell, /messages: "messages"/);
  assert.match(workspaceShell, /workspaceBackgroundStyle\(backgroundKey\)/);
  assert.match(workspaceShell, /preloadWorkspaceBackground\(backgroundKey\)/);
});

test("implemented workspaces map to the correct shared shell background keys", () => {
  assert.match(staffPage, /workspace="staffHome"/);
  assert.match(readFileSync(new URL("../../src/pages/ReceptionPage.tsx", import.meta.url), "utf8"), /workspace="reception"/);
  assert.match(readFileSync(new URL("../../src/pages/MovementsPage.tsx", import.meta.url), "utf8"), /workspace="reception"/);
  assert.match(readFileSync(new URL("../../src/pages/RoomsPage.tsx", import.meta.url), "utf8"), /workspace="rooms"/);
  assert.match(readFileSync(new URL("../../src/pages/RoomDetailPage.tsx", import.meta.url), "utf8"), /workspace=\{isTaskExecution \? "housekeeping" : "rooms"\}/);
  assert.match(readFileSync(new URL("../../src/pages/HousekeepingV2Page.tsx", import.meta.url), "utf8"), /workspace="housekeeping"/);
  assert.match(readFileSync(new URL("../../src/pages/MaintenancePage.tsx", import.meta.url), "utf8"), /workspace="maintenance"/);
  assert.match(readFileSync(new URL("../../src/pages/MaintenanceDetailPage.tsx", import.meta.url), "utf8"), /workspace="maintenance"/);
  assert.match(readFileSync(new URL("../../src/pages/ProcurementPage.tsx", import.meta.url), "utf8"), /workspace="procurement"/);
  assert.match(readFileSync(new URL("../../src/pages/ProcurementOwnerPage.tsx", import.meta.url), "utf8"), /to="\/procurement"/);
  assert.match(readFileSync(new URL("../../src/pages/SupplyRequestPage.tsx", import.meta.url), "utf8"), /to="\/procurement"/);
  assert.match(readFileSync(new URL("../../src/pages/SocialAutomationPage.tsx", import.meta.url), "utf8"), /workspace="social"/);
  assert.match(readFileSync(new URL("../../src/pages/ChatPage.tsx", import.meta.url), "utf8"), /workspace="chat"/);
  assert.match(readFileSync(new URL("../../src/pages/MessagesPage.tsx", import.meta.url), "utf8"), /workspace="messages"/);
});

test("workspace background CSS uses the variable, cover rules and dark fallback", () => {
  assert.doesNotMatch(staffCss, /background-image:\s*var\(--workspace-background, none\)/);

  for (const css of [workspaceCss]) {
    assert.match(css, /--workspace-background-fallback:\s*#0c241a/);
    assert.match(css, /background-color:\s*var\(--workspace-background-fallback, #031c15\)/);
    assert.match(css, /background-image:\s*var\(--workspace-background, none\)/);
    assert.match(css, /background-position:\s*center top/);
    assert.match(css, /background-size:\s*cover/);
    assert.match(css, /background-repeat:\s*no-repeat/);
    assert.doesNotMatch(css, /background-attachment:\s*fixed|cover fixed no-repeat/);
  }
});

test("workspace background imports are compiled into the configured Worker static assets", () => {
  assert.match(wranglerConfig, /"assets"\s*:\s*\{/);
  assert.match(wranglerConfig, /"directory"\s*:\s*"\.\/dist\/client"/);
  assert.match(wranglerConfig, /"not_found_handling"\s*:\s*"single-page-application"/);
});

test("workspace background paths are not duplicated in page components or Passport", () => {
  for (const file of pageFiles(pagesRoot)) {
    const content = readFileSync(file, "utf8");
    assert.doesNotMatch(content, /background_(home_staff|checkin_checkout|room|housekeeping|maintenance|procurement|chat)\.png/);
  }

  assert.doesNotMatch(passportWorkflow, /workspaceBackground|WORKSPACE_BACKGROUNDS|Background_|background_/);
});
