import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

test("Reception calendar and quick actions stay contained without duplicated month labels", () => {
  const css = source("src/styles/ReceptionPage.css");
  assert.match(css, /\.reception-date-picker__panel \.rdp-caption_label\s*\{[\s\S]*clip:\s*rect\(0, 0, 0, 0\);/);
  assert.match(css, /\.reception-card__quick-actions \.vc-secondary-action,[\s\S]*\.reception-report-issue\s*\{[\s\S]*min-height:\s*var\(--vc-touch-min\);/);
  assert.match(css, /\.reception-card__quick-actions \.vc-secondary-action,[\s\S]*line-height:\s*1;/);
});

test("Procurement card sections keep header copy inside glass containers and use validated Thai labels", () => {
  const css = source("src/styles/ProcurementPage.css");
  const th = source("src/i18n/th.ts");
  assert.match(css, /\.procurement-compose\s*\{[\s\S]*padding:\s*clamp\(var\(--vc-space-3\), 3vw, var\(--vc-space-4\)\);[\s\S]*overflow:\s*hidden;[\s\S]*border:\s*var\(--vc-glass-region-border\);/);
  assert.match(css, /\.procurement-section\s*\{[\s\S]*padding:\s*clamp\(var\(--vc-space-3\), 3vw, var\(--vc-space-4\)\);[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.procurement-owner-note\s*\{[\s\S]*overflow-wrap:\s*anywhere;/);
  assert.match(th, /openRequests:\s*"คำขอที่ยังเปิดอยู่"/);
  assert.match(th, /procurementOwnerNote:\s*"อ่านข้อความที่พนักงานเขียนไว้ แล้วเลือกซื้อแล้วหรือไม่อนุมัติ"/);
  assert.match(th, /pendingRequests:\s*"คำขอที่รออยู่"/);
  assert.match(th, /noPendingRequests:\s*"ไม่มีคำขอที่รออยู่"/);
});

test("Social upload dropzone remains a styled Vanara control with the file rule visible", () => {
  const page = source("src/pages/SocialAutomationPage.tsx");
  const css = source("src/styles/SocialAutomationPage.css");
  assert.match(page, /JPG, PNG or WebP\. HEIC is not supported\./);
  assert.match(css, /\.social-dropzone\s*\{[\s\S]*color:\s*var\(--workspace-cream\);[\s\S]*border:\s*1px dashed rgba\(244, 237, 223, 0\.54\);/);
  assert.match(css, /\.social-dropzone:hover,[\s\S]*\.social-dropzone:focus-within/);
  assert.match(css, /\.social-dropzone input\s*\{[\s\S]*clip-path:\s*inset\(50%\);/);
});

test("Payroll owner UI uses adjustment wording and keeps date controls inside containers", () => {
  const page = source("src/pages/PayrollPage.tsx");
  const css = source("src/styles/PayrollPage.css");
  assert.match(page, /Monthly adjustments/);
  assert.match(page, /Adjustment date/);
  assert.match(page, /Adjustment type/);
  assert.match(page, /Add adjustment/);
  assert.match(page, /No adjustments recorded for this month\./);
  assert.doesNotMatch(page, /Monthly events|Event date|Add event|No monthly events recorded\./);
  assert.match(css, /\.payroll-month,[\s\S]*\.payroll-field\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.payroll-month input\[type="month"\],[\s\S]*\.payroll-field input\[type="date"\]\s*\{[\s\S]*inline-size:\s*100%;/);
  assert.match(css, /\.payroll-event-form\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
});

test("Team chat composer is compact while preserving the custom message action surface", () => {
  const component = source("src/components/chat/TeamChatSurface.tsx");
  const chatCss = source("src/styles/ChatPage.css");
  const bubbleCss = source("src/styles/FloatingTeamChat.css");
  assert.match(component, /className="chat-composer__cancel-focus"[\s\S]*aria-label=\{translate\("exitWritingMode"\)\}/);
  assert.doesNotMatch(component, /chat-composer__focus-row/);
  assert.match(chatCss, /\.chat-thread:has\(\.chat-composer\.is-focused\) \.chat-thread__messages\s*\{[\s\S]*overscroll-behavior:\s*none;/);
  assert.match(chatCss, /\.chat-composer\s*\{[\s\S]*padding:\s*0\.42rem var\(--vc-space-2\)/);
  assert.match(chatCss, /\.chat-composer__tools button,[\s\S]*\.chat-composer__send\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*40px;/);
  assert.match(chatCss, /\.chat-context-menu/);
  assert.match(bubbleCss, /\.staff-chat__orb\s*\{[\s\S]*border-radius:\s*999px;[\s\S]*backdrop-filter:\s*blur\(16px\);/);
});
