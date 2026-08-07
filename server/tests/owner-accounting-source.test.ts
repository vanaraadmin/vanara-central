import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const index = read("src/index.ts");
const accounting = read("src/services/accounting.service.ts");
const dashboard = read("src/services/dashboard.service.ts");
const migration = read("migrations/0043_owner_accounting.sql");
const staffOverview = read("src/services/staff-overview.service.ts");
const workspaceShell = read("../src/components/WorkspaceShell.tsx");
const englishCopy = read("../src/i18n/en.ts");
const thaiCopy = read("../src/i18n/th.ts");
const accountingPage = read("../src/pages/AccountingPage.tsx");
const accountingCss = read("../src/styles/AccountingPage.css");

test("accounting module is owner-only and staff home card is owner gated", () => {
  assert.match(index, /async function accountingOwner[\s\S]*requireOwner\(user\)[\s\S]*requireModulePermission\(user, "accounting"/);
  assert.match(index, /\/api\/accounting\/overview/);
  assert.match(staffOverview, /function canUseAccounting[\s\S]*isOwner\(user\)[\s\S]*canAccess\(user, "accounting"\)/);
  assert.doesNotMatch(staffOverview, /canAccess\(user, "accounting"\)[\s\S]*role !== "Owner"/);
});

test("financial migration stores normalized OTA records and manual receipt references", () => {
  assert.match(migration, /CREATE TABLE ota_financial_records/);
  assert.match(migration, /expected_net_payout REAL/);
  assert.match(migration, /raw_rate_description TEXT/);
  assert.match(migration, /raw_channel_info TEXT/);
  assert.match(migration, /CREATE TABLE manual_accounting_entries/);
  assert.match(migration, /receipt_object_key TEXT/);
  assert.match(migration, /module_key IN \([\s\S]*'accounting'/);
});

test("dashboard uses normalized expected net payout and does not sum raw Beds24 booking price as revenue", () => {
  assert.match(dashboard, /FROM ota_financial_records/);
  assert.match(dashboard, /SUM\(f\.expected_net_payout\)/);
  assert.match(dashboard, /INNER JOIN bookings b[\s\S]*b\.beds24_booking_id = f\.beds24_booking_id/);
  assert.match(dashboard, /f\.check_in <= \?[\s\S]*provider_deleted/);
  assert.match(dashboard, /f\.check_in > \?[\s\S]*provider_deleted/);
  assert.match(dashboard, /Checked-In Net Revenue/);
  assert.match(dashboard, /Future Booked Net Forecast/);
  assert.match(dashboard, /financialSnapshot/);
  assert.match(dashboard, /manual_accounting_entries/);
  assert.match(dashboard, /payroll_records[\s\S]*status = 'FINALIZED'/);
  assert.match(dashboard, /salaryAdvances|salary_advances_received/);
  assert.match(dashboard, /Payroll \/ Wages/);
  assert.match(dashboard, /Social security \/ SSO/);
  assert.doesNotMatch(dashboard, /SUM\([^)]*bookings[^)]*price|SUM\(price\)/i);
});

test("owner financial dashboard remains business-facing and owner scoped", () => {
  const dashboardPage = read("../src/pages/DashboardPage.tsx");
  const dashboardCss = read("../src/styles/DashboardPage.css");
  assert.match(dashboardPage, /FinancialDashboard/);
  assert.match(dashboardPage, /WorkspaceShell/);
  assert.match(dashboardPage, /workspace="ownerDashboard"/);
  assert.match(workspaceShell, /ownerDashboard:\s*"11"/);
  assert.match(workspaceShell, /ownerDashboard:\s*"payroll"/);
  assert.match(dashboardPage, /Owner finance/);
  assert.match(dashboardPage, /Income composition/);
  assert.match(dashboardPage, /Expenses composition/);
  assert.match(dashboardPage, /Payroll \/ Wages/);
  assert.match(dashboardPage, /Salary advances are not counted as extra cost/);
  assert.match(dashboardPage, /financial-dashboard__donut/);
  assert.match(dashboardPage, /financial-dashboard__metrics/);
  assert.match(dashboardPage, /Future booked net forecast/);
  assert.match(dashboardPage, /financial-dashboard__list/);
  assert.match(dashboardPage, /setView\("income"\)/);
  assert.match(dashboardPage, /setView\("expenses"\)/);
  assert.match(dashboardPage, /id\.includes\("manual"\) \? "manual-expenses"/);
  assert.match(dashboardPage, /title: "Manual expenses"/);
  assert.match(dashboardPage, /setView\(next\)/);
  assert.doesNotMatch(dashboardPage, /normalized data|backend|debug|raw Beds24|Open Accounting|QuickAccess|BusinessCard|Breakdown|MetricCard|AlertCard|Guest origins|OTA channels|todaySection|housekeeping|maintenance|quickAccess/i);
  assert.doesNotMatch(dashboardPage, /\["overview", "Overview"\]|\["income", "Income"\]|\["expenses", "Expenses"\]/);
  assert.doesNotMatch(dashboardPage, /<table|<thead|<tbody/i);
  assert.match(dashboardCss, /\.financial-dashboard[\s\S]*overflow: hidden/);
  assert.doesNotMatch(dashboardCss, /\.dashboard-header|\.financial-dashboard__tabs|\.business-grid|\.dashboard-breakdowns|\.quick-access-grid|\.control-alerts|\.control-section|\.control-card/);
  assert.doesNotMatch(dashboardCss, /146,\s*91,\s*60|178,\s*138,\s*70/);
  assert.match(dashboardCss, /\.financial-dashboard__donut-wrap[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(132px, 176px\) minmax\(0, 1fr\)/);
  assert.match(dashboardCss, /\.financial-dashboard__list b[\s\S]*max-width: 42%/);
  assert.match(dashboardCss, /\.dashboard-finance-stack[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(220px, 320px\)/);
});

test("manual accounting receipt upload uses R2 and validates expenses", () => {
  assert.match(accounting, /R2_STORAGE\.put/);
  assert.match(accounting, /MAX_RECEIPT_BYTES/);
  assert.match(accounting, /Entry type must be income or expense/);
  assert.match(accounting, /Amount must be greater than zero/);
});

test("Accounting UI uses business language and keeps date controls contained", () => {
  assert.match(accountingPage, />Manual entry</);
  assert.match(accountingPage, />Export for accountant</);
  assert.match(accountingPage, />Checked-in net</);
  assert.match(accountingPage, />Future net forecast</);
  const afterExport = accountingPage.slice(accountingPage.indexOf(">Export for accountant<"));
  assert.doesNotMatch(afterExport, /<section className="accounting-panel"[\s\S]*<h2>/);
  assert.match(`${englishCopy}\n${thaiCopy}\n${staffOverview}`, /Income, expenses, and accountant export\./);
  assert.doesNotMatch(
    `${accountingPage}\n${englishCopy}\n${thaiCopy}\n${staffOverview}`,
    /Other income|Expected payable by booking channel|Revenue review|Recent Movements?|Owner entered income and expenses|OTA Income|Normalized OTA income|Normalized income|normalized data|source of truth|Beds24 raw price|Manual entries|manual entries log|backend|debug|raw manual/i,
  );
  assert.doesNotMatch(accountingPage, /latestOta|manualEntries|accounting-table|accounting-entry-list/);
  assert.doesNotMatch(accountingCss, /\.accounting-table|\.accounting-entry-list/);
  assert.match(accountingCss, /\.accounting-form input\[type="date"\],[\s\S]*\.accounting-export-range input\[type="date"\][\s\S]*inline-size: 100%;[\s\S]*max-width: 100%;[\s\S]*min-inline-size: 0;/);
  assert.match(accountingCss, /accent-color: var\(--vc-color-jungle-900\)/);
  assert.match(accountingCss, /::-webkit-calendar-picker-indicator[\s\S]*color: var\(--vc-color-jungle-900\)/);
  assert.match(accountingCss, /\.accounting-form input:focus-visible,[\s\S]*\.accounting-export-range input:focus-visible[\s\S]*border-color: rgba\(23, 71, 52, 0\.72\)/);
  assert.match(accountingCss, /\.workspace-shell--accounting \.vc-staff-home-action[\s\S]*color: var\(--vc-text-inverse\)[\s\S]*background: linear-gradient/);
});
