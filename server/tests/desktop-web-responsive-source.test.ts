import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceCss = readFileSync(new URL("../../src/styles/WorkspaceShell.css", import.meta.url), "utf8");
const staffCss = readFileSync(new URL("../../src/styles/StaffPage.css", import.meta.url), "utf8");
const roomsCss = readFileSync(new URL("../../src/styles/RoomsPage.css", import.meta.url), "utf8");
const receptionCss = readFileSync(new URL("../../src/styles/ReceptionPage.css", import.meta.url), "utf8");

function block(source: string, selector: string): string {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `Missing selector ${selector}`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `Missing selector close ${selector}`);
  return source.slice(start, end + 2);
}

test("desktop web shell widens only at desktop breakpoints and keeps mobile cap intact", () => {
  assert.match(workspaceCss, /\.workspace-shell\s*\{[\s\S]*width:\s*min\(100%, 480px\)/);
  assert.match(workspaceCss, /@media \(min-width: 760px\)[\s\S]*width:\s*min\(100%, 540px\)/);
  assert.match(workspaceCss, /@media \(min-width: 1024px\)[\s\S]*\.workspace-shell\s*\{[\s\S]*width:\s*min\(calc\(100% - 72px\), 1080px\)/);
  assert.match(workspaceCss, /@media \(min-width: 1440px\)[\s\S]*\.workspace-shell\s*\{[\s\S]*width:\s*min\(calc\(100% - 96px\), 1160px\)/);
  assert.match(workspaceCss, /\.workspace-shell--wide\s*\{[\s\S]*width:\s*min\(calc\(100% - 72px\), 1280px\)/);
});

test("staff home uses desktop card grids without truncating operational copy", () => {
  assert.match(staffCss, /@media \(min-width: 900px\)[\s\S]*\.staff-workspace-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(staffCss, /@media \(min-width: 1280px\)[\s\S]*\.staff-workspace-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(staffCss, /\.staff-workspace__description,[\s\S]*\.staff-workspace__summary-lines span\s*\{[\s\S]*white-space:\s*normal/);
  assert.match(staffCss, /\.staff-workspace__description,[\s\S]*\.staff-workspace__summary-lines span\s*\{[\s\S]*text-overflow:\s*clip/);
});

test("rooms desktop layout uses a wider operational list while retaining mobile override", () => {
  assert.match(roomsCss, /@media \(min-width: 1024px\)[\s\S]*\.rooms-home\s*\{[\s\S]*grid-template-columns:\s*minmax\(220px, 0\.28fr\) minmax\(0, 1fr\)/);
  assert.match(roomsCss, /@media \(min-width: 1024px\)[\s\S]*\.rooms-home__summary\s*\{[\s\S]*position:\s*sticky/);
  assert.match(roomsCss, /@media \(min-width: 1024px\)[\s\S]*\.room-row\s*\{[\s\S]*grid-template-areas:\s*"icon identity signals chevron"/);
  assert.match(roomsCss, /@media \(max-width: 420px\)[\s\S]*\.room-row\s*\{[\s\S]*grid-template-areas:\s*\n\s*"icon identity chevron"\s*\n\s*"icon signals chevron"/);
});

test("reception desktop layout creates two columns and keeps sheets bounded", () => {
  assert.match(receptionCss, /@media \(min-width: 1024px\)[\s\S]*\.reception-agenda\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(receptionCss, /@media \(min-width: 1024px\)[\s\S]*\.reception-details-sheet__panel\s*\{[\s\S]*width:\s*min\(100%, 1120px\)/);
  assert.match(receptionCss, /@media \(min-width: 1024px\)[\s\S]*\.reception-details-sheet__panel\s*\{[\s\S]*max-height:\s*calc\(100dvh - 48px\)/);
  assert.match(receptionCss, /@media \(max-width: 420px\)[\s\S]*\.reception-date-picker,[\s\S]*\.reception-date-picker__trigger\s*\{[\s\S]*width:\s*100%/);
});

test("desktop responsive CSS keeps text containers flexible instead of forcing overflow", () => {
  for (const source of [workspaceCss, staffCss, roomsCss, receptionCss]) {
    assert.doesNotMatch(source, /(?<!@media \()min-width:\s*760px/);
    assert.doesNotMatch(source, /(?<!min-)width:\s*1440px/);
  }

  assert.match(block(workspaceCss, ".workspace-body {"), /min-width:\s*0/);
  assert.match(block(roomsCss, ".room-signals {"), /min-width:\s*0/);
  assert.match(block(receptionCss, ".reception-card {"), /min-width:\s*0/);
});
