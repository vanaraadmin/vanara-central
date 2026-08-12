import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalManualExpenseCategory,
  exportAccountingCsv,
  manualAccountingCategory,
} from "../src/services/accounting.service.ts";

test("legacy manual expense categories remain readable under the canonical taxonomy", () => {
  assert.equal(canonicalManualExpenseCategory("Software & Subscriptions"), "IT Costs");
  assert.equal(canonicalManualExpenseCategory("IT Costs"), "IT Costs");
  assert.equal(canonicalManualExpenseCategory("Garden & Outdoor"), "Garden");
  assert.equal(canonicalManualExpenseCategory("Garden & Pool"), "Garden");
  assert.equal(manualAccountingCategory("category: Software & Subscriptions", "Other Expenses"), "IT Costs");
  assert.equal(manualAccountingCategory("category: Garden & Outdoor; source: owner", "Other Expenses"), "Garden");
});

test("accountant export adds canonical category without rewriting the stored note", async () => {
  const rows = [
    {
      accounting_entry_id: 1,
      entry_type: "expense",
      entry_date: "2026-08-12",
      amount: 2588,
      description: "OpenAI credit recharge",
      note: "category: Software & Subscriptions",
      receipt_object_key: "accounting/receipts/1/receipt.pdf",
      receipt_file_name: "Receipt.pdf",
      receipt_content_type: "application/pdf",
      receipt_uploaded_at: "2026-08-12T09:00:00.000Z",
      created_at: "2026-08-12T09:00:00.000Z",
      updated_at: "2026-08-12T09:00:00.000Z",
    },
  ];
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async all<T>() { return { results: rows as T[], success: true, meta: {} }; },
      };
    },
  } as unknown as D1Database;

  const csv = await exportAccountingCsv({ DB: db, R2_STORAGE: {} as R2Bucket }, "2026-08-12", "2026-08-12");

  assert.match(csv, /^date,type,amount,description,category,note,receipt_file/m);
  assert.match(csv, /"IT Costs"/);
  assert.match(csv, /"category: Software & Subscriptions"/);
  assert.match(csv, /"Receipt\.pdf"/);
});
