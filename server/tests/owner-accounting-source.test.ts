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
  assert.match(dashboard, /SUM\(expected_net_payout\)/);
  assert.doesNotMatch(dashboard, /SUM\([^)]*bookings[^)]*price|SUM\(price\)/i);
});

test("manual accounting receipt upload uses R2 and validates expenses", () => {
  assert.match(accounting, /R2_STORAGE\.put/);
  assert.match(accounting, /MAX_RECEIPT_BYTES/);
  assert.match(accounting, /Entry type must be income or expense/);
  assert.match(accounting, /Amount must be greater than zero/);
});
