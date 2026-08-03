import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const vanaraComponents = [
  "src/components/vanara/VanaraDataGrid.tsx",
  "src/components/vanara/VanaraGlassRegion.tsx",
  "src/components/vanara/VanaraGlassSheet.tsx",
  "src/components/vanara/VanaraSectionHeader.tsx",
  "src/components/vanara/VanaraSummaryGrid.tsx",
];

const stickyGlassHeader = readSource("src/components/StickyGlassHeader.tsx");
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

test("Rooms and Staff Home consume shared presentation instead of page glass copies", () => {
  assert.match(readSource("src/components/rooms/RoomExpandedWorkspace.tsx"), /VanaraGlassSheet/);
  assert.match(readSource("src/components/rooms/RoomExpandedWorkspace.tsx"), /variant="elevated"/);
  assert.match(readSource("src/components/rooms/RoomHero.tsx"), /vc-sheet-identity/);
  assert.match(readSource("src/pages/StaffPage.tsx"), /variant="compact"/);
  assert.match(readSource("src/pages/RoomsPage.tsx"), /vc-secondary-glass-action rooms-home-back-button/);
});
