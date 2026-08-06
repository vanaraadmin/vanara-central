import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profilePanel = readFileSync(new URL("../../src/components/ProfilePanel.tsx", import.meta.url), "utf8");
const dashboardPage = readFileSync(new URL("../../src/pages/DashboardPage.tsx", import.meta.url), "utf8");
const workspaceCss = readFileSync(new URL("../../src/styles/WorkspaceShell.css", import.meta.url), "utf8");
const currentUserService = readFileSync(new URL("../src/services/current-user.service.ts", import.meta.url), "utf8");

test("profile panel owns TM30 and user management without exposing owner tools to staff", () => {
  assert.match(profilePanel, /currentUser\?\.isOwner|owner/);
  assert.match(profilePanel, /href="\/api\/owner\/tm30\/export"/);
  assert.match(profilePanel, /Manage Users/);
  assert.match(profilePanel, /tab === "owner" && owner/);
  assert.doesNotMatch(profilePanel, /PanelTab = "profile" \| "password" \| "updates" \| "owner" \| "users"/);
  assert.doesNotMatch(dashboardPage, /href="\/api\/owner\/tm30\/export"/);
});

test("profile panel exposes app update and logout while keeping owner actions separate", () => {
  assert.match(profilePanel, /updateVanaraCentral/);
  assert.match(profilePanel, /pwaUpdatePlaceholder/);
  assert.match(profilePanel, /logoutMutation/);
  assert.match(profilePanel, /currentUser\?\.preferredLanguage/);
  assert.match(profilePanel, /changeLanguage\(currentUser\.preferredLanguage\)/);
  assert.match(profilePanel, /tab === "profile"/);
  assert.match(profilePanel, /tab === "updates"/);
  assert.match(profilePanel, /tab === "owner" && owner/);
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
