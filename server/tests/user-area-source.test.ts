import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profilePanel = readFileSync(new URL("../../src/components/ProfilePanel.tsx", import.meta.url), "utf8");
const dashboardPage = readFileSync(new URL("../../src/pages/DashboardPage.tsx", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const mainTsx = readFileSync(new URL("../../src/main.tsx", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8");
const pwaService = readFileSync(new URL("../../src/services/pwa.service.ts", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const workspaceCss = readFileSync(new URL("../../src/styles/WorkspaceShell.css", import.meta.url), "utf8");
const currentUserService = readFileSync(new URL("../src/services/current-user.service.ts", import.meta.url), "utf8");

test("profile panel owns TM30 and user management without exposing owner tools to staff", () => {
  assert.match(profilePanel, /currentUser\?\.isOwner|owner/);
  assert.match(profilePanel, /href="\/api\/owner\/tm30\/export"/);
  assert.match(profilePanel, /aria-label="Download TM30"/);
  assert.match(profilePanel, /profile-panel__owner-utility/);
  assert.match(profilePanel, /TM30 export/);
  assert.match(profilePanel, /Manage Users/);
  assert.match(profilePanel, /tab === "owner" && owner/);
  assert.match(profilePanel, /tabs\.filter\(\(item\) => !item\.ownerOnly \|\| owner\)/);
  assert.doesNotMatch(profilePanel, /PanelTab = "profile" \| "password" \| "updates" \| "owner" \| "users"/);
  assert.doesNotMatch(dashboardPage, /href="\/api\/owner\/tm30\/export"/);
});

test("profile panel exposes app update and logout while keeping owner actions separate", () => {
  assert.match(profilePanel, /updateVanaraCentral/);
  assert.match(profilePanel, /pwaUpdatePlaceholder/);
  assert.match(profilePanel, /checkVanaraUpdate/);
  assert.match(profilePanel, /applyVanaraUpdate/);
  assert.match(profilePanel, /vanaraCentralUpToDate/);
  assert.match(profilePanel, /logoutMutation/);
  assert.match(profilePanel, /currentUser\?\.preferredLanguage/);
  assert.match(profilePanel, /changeLanguage\(currentUser\.preferredLanguage\)/);
  assert.match(profilePanel, /tab === "profile"/);
  assert.match(profilePanel, /tab === "updates"/);
  assert.match(profilePanel, /tab === "owner" && owner/);
});

test("profile panel exposes user-action notification opt-in with Somkiat-approved labels", () => {
  const english = readFileSync(new URL("../../src/i18n/en.ts", import.meta.url), "utf8");
  const thai = readFileSync(new URL("../../src/i18n/th.ts", import.meta.url), "utf8");

  assert.match(profilePanel, /enablePushNotifications/);
  assert.match(profilePanel, /checkPushNotificationStatus/);
  assert.match(profilePanel, /profile-panel__notifications/);
  assert.match(profilePanel, /translate\("enableNotifications"\)/);
  assert.match(pwaService, /Notification\.requestPermission\(\)/);
  assert.match(pwaService, /pushManager\.subscribe/);
  assert.match(pwaService, /refreshExistingPushSubscription/);
  assert.match(pwaService, /pushManager\.getSubscription\(\)/);
  assert.match(pwaService, /syncPushSubscription\(subscription\)/);
  assert.match(pwaService, /\/api\/notifications\/push\/subscriptions/);
  assert.match(english, /enableNotifications: "Enable notifications"/);
  assert.match(thai, /enableNotifications: "เปิดแจ้งเตือน"/);
  assert.match(thai, /notificationsUnsupportedDevice: "เครื่องนี้ใช้แจ้งเตือนไม่ได้"/);
});

test("Vanara Central is installable as a PWA without caching operational API data", () => {
  const parsed = JSON.parse(manifest) as { name?: string; start_url?: string; scope?: string; display?: string; icons?: Array<{ src: string; sizes: string; purpose: string }> };

  assert.match(indexHtml, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  assert.match(indexHtml, /apple-mobile-web-app-capable/);
  assert.match(indexHtml, /apple-touch-icon/);
  assert.match(mainTsx, /import\.meta\.env\.PROD\)\s*registerVanaraServiceWorker\(\)/);
  assert.equal(parsed.name, "Vanara Central");
  assert.equal(parsed.start_url, "/");
  assert.equal(parsed.scope, "/");
  assert.equal(parsed.display, "standalone");
  assert.ok(parsed.icons?.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
  assert.ok(parsed.icons?.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  assert.match(pwaService, /navigator\.serviceWorker\.register\("\/sw\.js",\s*\{\s*scope:\s*"\/"/);
  assert.match(serviceWorker, /if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/);
  assert.match(serviceWorker, /self\.addEventListener\("push"/);
  assert.match(serviceWorker, /self\.addEventListener\("notificationclick"/);
  assert.doesNotMatch(serviceWorker, /cache\.addAll\([^)]*\/api\//);
});

test("installed PWA reduces native browser callouts without blocking forms or chat actions", () => {
  assert.match(workspaceCss, /@media \(display-mode: standalone\)/);
  assert.match(workspaceCss, /\.workspace-page,[\s\S]*\.sticky-glass-nav\s*\{[\s\S]*-webkit-touch-callout:\s*none/);
  assert.match(workspaceCss, /\.workspace-masthead img,[\s\S]*\.workspace-canopy img,[\s\S]*\.sticky-glass-nav img\s*\{[\s\S]*-webkit-user-drag:\s*none/);
  assert.match(workspaceCss, /\.workspace-page input,[\s\S]*\.workspace-page textarea,[\s\S]*\.workspace-page select,[\s\S]*\.workspace-page \[contenteditable="true"\]\s*\{[\s\S]*-webkit-touch-callout:\s*default/);
  assert.doesNotMatch(workspaceCss, /onContextMenu|preventDefault/);
});

test("profile panel uses styled photo controls and preserves create-user input when role changes", () => {
  assert.match(profilePanel, /profilePhotoInputRef/);
  assert.match(profilePanel, /userPhotoInputRef/);
  assert.match(profilePanel, /className="profile-panel__file-input"/);
  assert.match(profilePanel, /translate\("changePhoto"\)/);
  assert.doesNotMatch(profilePanel, /image\/gif|GIF/);
  assert.match(profilePanel, /function setUserRole\(ownerRole: boolean\)/);
  assert.doesNotMatch(profilePanel, /onChange=\{\(event\) => startCreate\(event\.target\.value === "owner"\)\}/);
  assert.match(profilePanel, /window\.confirm/);
});

test("profile popup is mobile-safe and keeps avatar circle-safe", () => {
  assert.match(workspaceCss, /\.profile-panel__overlay/);
  assert.match(workspaceCss, /max-height:\s*min\(720px,\s*calc\(100dvh - var\(--vc-safe-top\) - var\(--vc-safe-bottom\) - 28px\)\)/);
  assert.match(workspaceCss, /overflow:\s*auto/);
  assert.match(workspaceCss, /\.profile-panel,\s*\n\.profile-panel \*[\s\S]*box-sizing:\s*border-box/);
  assert.match(workspaceCss, /\.profile-panel__sheet[\s\S]*max-width:\s*100%/);
  assert.match(workspaceCss, /\.profile-panel__sheet[\s\S]*scrollbar-width:\s*thin/);
  assert.match(workspaceCss, /\.profile-panel__tabs[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(112px, 1fr\)\)/);
  assert.match(workspaceCss, /\.profile-panel__tabs button,[\s\S]*white-space:\s*normal/);
  assert.match(workspaceCss, /\.profile-panel__notice,[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(workspaceCss, /input\.profile-panel__file-input[\s\S]*width:\s*1px[\s\S]*min-height:\s*1px[\s\S]*clip-path:\s*inset\(50%\)/);
  assert.match(workspaceCss, /\.profile-panel__avatar[\s\S]*border-radius:\s*999px/);
  assert.match(workspaceCss, /\.profile-panel__avatar img[\s\S]*object-fit:\s*cover/);
  assert.match(workspaceCss, /@media \(max-width: 520px\)/);
  assert.match(workspaceCss, /\.profile-panel__user-actions[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("password hashing stays within Cloudflare Workers PBKDF2 limits", () => {
  assert.match(currentUserService, /const PASSWORD_ITERATIONS = 100_000;/);
  assert.doesNotMatch(currentUserService, /const PASSWORD_ITERATIONS = 120_000;/);
});
