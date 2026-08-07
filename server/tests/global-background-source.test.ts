import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceShell = readFileSync(new URL("../../src/components/WorkspaceShell.tsx", import.meta.url), "utf8");
const backgroundConfig = readFileSync(new URL("../../src/config/workspaceBackgrounds.ts", import.meta.url), "utf8");
const shellCss = readFileSync(new URL("../../src/styles/WorkspaceShell.css", import.meta.url), "utf8");
const staffCss = readFileSync(new URL("../../src/styles/StaffPage.css", import.meta.url), "utf8");

test("global Vanara background is lightweight CSS/SVG instead of raster wallpaper", () => {
  assert.doesNotMatch(backgroundConfig, /background_.*\.(png|jpe?g|webp)|from "\.\.\/assets\/img\/background_/i);
  assert.doesNotMatch(workspaceShell, /background_.*\.(png|jpe?g|webp)|WORKSPACE_BACKGROUNDS/);
  assert.match(backgroundConfig, /workspaceThemes/);
  assert.match(backgroundConfig, /"--workspace-bg-top"/);
  assert.match(backgroundConfig, /"--workspace-botanical-opacity"/);
  assert.match(shellCss, /data:image\/svg\+xml/);
  assert.match(shellCss, /\.workspace-page::before/);
  assert.match(shellCss, /\.workspace-page::after/);
  assert.match(shellCss, /radial-gradient/);
  assert.match(shellCss, /linear-gradient/);
});

test("module background tuning stays subtle and shared across the same shell", () => {
  for (const key of [
    "staffHome",
    "reception",
    "rooms",
    "housekeeping",
    "maintenance",
    "procurement",
    "social",
    "payroll",
    "messages",
    "chat",
  ]) {
    assert.match(backgroundConfig, new RegExp(`${key}: \\{[\\s\\S]*botanical: "0\\.0[1-3]`));
  }

  assert.match(workspaceShell, /<main className="workspace-page" style=\{workspaceBackgroundStyle\(backgroundKey\)\}>/);
  assert.match(workspaceShell, /`workspace-shell--\$\{workspace\}`/);
  assert.doesNotMatch(workspaceShell, /if \(workspace ===|switch \(workspace\)/);
  assert.doesNotMatch(shellCss, /workspace-shell--staffHome[\s\S]*background|workspace-shell--rooms[\s\S]*background|workspace-shell--ownerDashboard[\s\S]*background/);
});

test("mobile density is reduced before content-heavy cards render over the forest system", () => {
  assert.match(shellCss, /@media \(max-width: 520px\)/);
  assert.match(shellCss, /--workspace-botanical-opacity: 0\.018/);
  assert.match(shellCss, /--workspace-contour-opacity: 0\.038/);
  assert.match(shellCss, /right -248px top 16px/);
  assert.match(shellCss, /@media \(min-width: 1024px\)/);
  assert.match(shellCss, /@media \(display-mode: standalone\)/);
  assert.doesNotMatch(shellCss, /animation:\s*(?!none)|@keyframes\s+workspace|filter:\s*url\(/);
});

test("Home menu card press feedback is scoped and reduced-motion safe", () => {
  assert.match(staffCss, /\.staff-workspace\s*\{[\s\S]*transform 240ms cubic-bezier\(0\.22, 1\.22, 0\.36, 1\)/);
  assert.match(staffCss, /\.staff-workspace:active\s*\{[\s\S]*transform: translateY\(2px\) scale\(0\.988\)/);
  assert.match(staffCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.staff-workspace\s*\{[\s\S]*transition: none/);
  assert.match(staffCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.staff-workspace:active\s*\{[\s\S]*transform: none/);
  assert.doesNotMatch(staffCss, /jiggle|draggable|drag|@keyframes\s+staff-workspace/i);
});
