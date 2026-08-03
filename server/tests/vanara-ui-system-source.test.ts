import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const vanaraComponents = [
  "src/components/vanara/VanaraDataGrid.tsx",
  "src/components/vanara/VanaraGlassRegion.tsx",
  "src/components/vanara/VanaraGlassSheet.tsx",
  "src/components/vanara/VanaraInteractiveGlass.tsx",
  "src/components/vanara/VanaraSectionHeader.tsx",
  "src/components/vanara/VanaraSummaryGrid.tsx",
];

const stickyGlassHeader = readSource("src/components/StickyGlassHeader.tsx");
const appRoot = readSource("src/App.tsx");
const glassPhysicsHook = readSource("src/hooks/useGlassPhysics.ts");
const interactiveGlass = readSource("src/components/vanara/VanaraInteractiveGlass.tsx");
const uiSoundService = readSource("src/services/uiSound.service.ts");
const uiTapHook = readSource("src/hooks/useUiTapSound.ts");
const tokens = readSource("src/theme/tokens.css");
const vanaraUi = readSource("src/theme/vanara-ui.css");
const migratedWorkspaceCss = [
  "src/styles/RoomsPage.css",
  "src/styles/StaffPage.css",
  "src/styles/HousekeepingV2Page.css",
  "src/styles/MaintenancePage.css",
  "src/styles/StickyGlassHeader.css",
].map(readSource).join("\n");

test("Vanara shared components expose stable typed contracts and documentation", () => {
  for (const path of vanaraComponents) {
    const source = readSource(path);

    for (const section of ["Purpose:", "When to use:", "When NOT to use:", "Expected children:", "Accessibility notes:"]) {
      assert.match(source, new RegExp(section.replace(":", ":")));
    }

    assert.doesNotMatch(source, /\b(roomName|unitId|taskId|ticketId|bookingId|guestName)\??:/);
  }
});

test("Vanara official variants are centralized in shared components", () => {
  assert.match(readSource("src/components/vanara/VanaraGlassSheet.tsx"), /export type VanaraGlassSheetVariant = "default" \| "elevated" \| "quiet"/);
  assert.match(readSource("src/components/vanara/VanaraGlassRegion.tsx"), /export type VanaraGlassRegionVariant = "default" \| "compact"/);
  assert.match(readSource("src/components/vanara/VanaraSummaryGrid.tsx"), /export type VanaraSummaryVariant = "default" \| "compact"/);
  assert.match(stickyGlassHeader, /export type StickyGlassHeaderVariant = "default"/);
});

test("Vanara material recipes are tokenized instead of duplicated in migrated workspaces", () => {
  for (const tokenName of [
    "--vc-glass-list-background",
    "--vc-glass-sheet-background",
    "--vc-glass-region-background",
    "--vc-navigation-glass-background",
    "--vc-row-expanded-background",
    "--vc-focus-glass",
  ]) {
    assert.match(tokens, new RegExp(tokenName));
  }

  assert.match(vanaraUi, /background: var\(--vc-glass-list-background\)/);
  assert.match(vanaraUi, /background: var\(--vc-glass-sheet-background\)/);
  assert.match(vanaraUi, /background: var\(--vc-glass-region-background\)/);
  assert.match(stickyGlassHeader, /sticky-glass-nav-surface--\$\{variant\}/);
  assert.match(migratedWorkspaceCss, /var\(--vc-row-expanded-background\)/);
  assert.match(migratedWorkspaceCss, /var\(--vc-focus-glass\)/);

  assert.doesNotMatch(migratedWorkspaceCss, /rgba\(10,\s*43,\s*32,\s*0\.24\)/);
  assert.doesNotMatch(migratedWorkspaceCss, /rgba\(222,\s*238,\s*226,\s*0\.075\)/);
  assert.doesNotMatch(migratedWorkspaceCss, /rgba\(238,\s*244,\s*236,\s*0\.075\)/);
  assert.doesNotMatch(migratedWorkspaceCss, /backdrop-filter:\s*blur\(14px\)\s*saturate\(112%\)/);
  assert.doesNotMatch(migratedWorkspaceCss, /outline:\s*2px solid rgba\(242,\s*235,\s*213/);
});

test("Vanara Glass Physics v1 centralizes press and release material behaviour", () => {
  assert.match(tokens, /--vc-physics-press-scale:\s*0\.968/);
  assert.match(tokens, /--vc-physics-press-translate-y:\s*2px/);
  assert.match(tokens, /--vc-physics-hover-scale:\s*1\.006/);
  assert.match(tokens, /--vc-physics-press-duration:\s*78ms/);
  assert.match(tokens, /--vc-physics-release-duration:\s*230ms/);
  assert.match(tokens, /--vc-physics-highlight-pressed:\s*0\.72/);
  assert.match(tokens, /--vc-physics-border-pressed:\s*0\.78/);
  assert.match(tokens, /--vc-physics-shadow-pressed:\s*0\.68/);
  assert.match(tokens, /--vc-physics-inner-light-pressed:\s*0\.82/);
  assert.match(vanaraUi, /translate3d\(0,\s*var\(--vc-physics-y\),\s*0\)/);
  assert.match(vanaraUi, /scale\(var\(--vc-physics-scale\)\)/);
  assert.match(vanaraUi, /\.vc-interactive-surface__material/);
  assert.match(vanaraUi, /\.vc-interactive-surface__highlight/);
  assert.match(vanaraUi, /\[data-pressed="true"\]/);
  assert.match(glassPhysicsHook, /export function useGlassPhysics/);
  assert.match(glassPhysicsHook, /export function useGlobalGlassPhysics/);
  assert.match(glassPhysicsHook, /PRESS_CANCEL_DISTANCE_PX = 10/);
  assert.match(glassPhysicsHook, /document\.addEventListener\("pointerdown", handlePointerDown, \{ capture: true \}\)/);
  assert.match(glassPhysicsHook, /document\.addEventListener\("scroll", clearPointer, \{ capture: true \}\)/);
  assert.match(interactiveGlass, /vc-interactive-surface__material/);
  assert.match(interactiveGlass, /vc-interactive-surface__highlight/);
  assert.match(appRoot, /useGlobalGlassPhysics\(\)/);
  assert.match(migratedWorkspaceCss, /sticky-glass-nav-surface\[data-pressed="true"\]/);
  assert.doesNotMatch(vanaraUi, /:active[\s\S]{0,120}scale/);
  assert.doesNotMatch(migratedWorkspaceCss, /:active[\s\S]{0,120}transform/);
});

test("Rooms and Staff Home consume shared presentation instead of page glass copies", () => {
  assert.match(readSource("src/components/rooms/RoomExpandedWorkspace.tsx"), /VanaraGlassSheet/);
  assert.match(readSource("src/components/rooms/RoomExpandedWorkspace.tsx"), /variant="elevated"/);
  assert.match(readSource("src/components/rooms/RoomHero.tsx"), /vc-sheet-identity/);
  assert.match(readSource("src/pages/StaffPage.tsx"), /variant="compact"/);
  assert.match(readSource("src/pages/RoomsPage.tsx"), /vc-secondary-glass-action rooms-home-back-button/);
});

test("Vanara UI tap sound is centralized and uses the approved bundled asset", () => {
  assert.equal(existsSync(new URL("../../src/utils/navigation-sound.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../../public/audio/ui-tap-soft.mp3", import.meta.url)), false);
  assert.equal(existsSync(new URL("../../src/assets/sounds/click.mp3", import.meta.url)), true);
  assert.match(uiSoundService, /export const UI_TAP_VOLUME = 0\.2/);
  assert.match(uiSoundService, /import uiTapSoftSrc from "\.\.\/assets\/sounds\/click\.mp3"/);
  assert.match(uiSoundService, /const UI_TAP_SOFT_SRC = uiTapSoftSrc/);
  assert.match(uiSoundService, /export function playUiTap\(\): void/);
  assert.match(uiSoundService, /uiTapUnavailable = true/);
  assert.match(uiSoundService, /warnUiSoundFailure/);
  assert.doesNotMatch(uiSoundService, /\/audio\/ui-tap-soft\.mp3/);
  assert.doesNotMatch(uiSoundService, /UI_TAP_ASSET_ENABLED/);
  assert.doesNotMatch(uiSoundService, /export function play(?:Success|Warning|Critical)/);

  assert.match(uiTapHook, /document\.addEventListener\("pointerdown", handlePointerDown, \{ capture: true \}\)/);
  assert.match(uiTapHook, /document\.addEventListener\("keydown", handleKeyDown, \{ capture: true \}\)/);
  assert.match(uiTapHook, /input/);
  assert.match(uiTapHook, /textarea/);
  assert.match(uiTapHook, /select/);
  assert.match(uiTapHook, /playUiTap\(\)/);
  assert.match(appRoot, /useUiTapSound\(\)/);
  assert.doesNotMatch(`${appRoot}\n${uiTapHook}\n${stickyGlassHeader}`, /\bnew Audio\(|\bAudio\(/);
});
