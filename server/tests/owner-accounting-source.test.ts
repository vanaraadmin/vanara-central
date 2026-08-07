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
  assert.match(dashboardPage, /Owner finance/);
  assert.match(dashboardPage, /Income Composition/);
  assert.match(dashboardPage, /Expenses Composition/);
  assert.match(dashboardPage, /Payroll \/ Wages/);
  assert.match(dashboardPage, /Salary advances are not counted as extra cost/);
  assert.match(dashboardPage, /financial-dashboard__donut/);
  assert.match(dashboardPage, /financial-dashboard__metrics/);
  assert.match(dashboardPage, /Future booked net forecast/);
  assert.match(dashboardPage, /financial-dashboard__list/);
  assert.doesNotMatch(dashboardPage, /normalized data|backend|debug|raw Beds24/i);
  assert.doesNotMatch(dashboardPage, /<table|<thead|<tbody/i);
  assert.match(dashboardCss, /\.financial-dashboard[\s\S]*overflow: hidden/);
  assert.match(dashboardCss, /\.financial-dashboard__tabs[\s\S]*overflow-x: auto/);
  assert.match(dashboardCss, /\.financial-dashboard__list b[\s\S]*max-width: 44%/);
  assert.match(dashboardCss, /grid-template-columns: minmax\(220px, 320px\) minmax\(0, 1fr\)/);
});

test("manual accounting receipt upload uses R2 and validates expenses", () => {
  assert.match(accounting, /R2_STORAGE\.put/);
  assert.match(accounting, /MAX_RECEIPT_BYTES/);
  assert.match(accounting, /Entry type must be income or expense/);
  assert.match(accounting, /Amount must be greater than zero/);
});

test("Accounting UI uses business language and keeps date controls contained", () => {
  assert.match(accountingPage, />OTA Income</);
  assert.match(accountingPage, />Recent Movements</);
  assert.match(accountingPage, />Export for accountant</);
  assert.doesNotMatch(accountingPage, /Normalized OTA income|Normalized income|normalized data|source of truth|Beds24 raw price|Manual entries|manual entries log|backend|log/i);
  assert.match(accountingCss, /\.accounting-form input\[type="date"\],[\s\S]*\.accounting-export-range input\[type="date"\][\s\S]*inline-size: 100%;[\s\S]*max-width: 100%;[\s\S]*min-inline-size: 0;/);
  assert.match(accountingCss, /accent-color: var\(--vc-color-jungle-900\)/);
  assert.match(accountingCss, /\.accounting-form input:focus-visible,[\s\S]*\.accounting-export-range input:focus-visible[\s\S]*border-color: rgba\(23, 71, 52, 0\.72\)/);
  assert.match(accountingCss, /\.workspace-shell--accounting \.vc-staff-home-action[\s\S]*color: var\(--vc-text-inverse\)[\s\S]*background: linear-gradient/);
});
