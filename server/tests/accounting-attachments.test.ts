import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  createManualAccountingEntry,
  getAccountingAttachment,
  getAccountingReceipt,
  listAccountingAttachments,
  normalizeManualAccountingInput,
  normalizeReceiptInput,
  type ManualAccountingInput,
  type ReceiptInput,
} from "../src/services/accounting.service.ts";
import type { CurrentUser } from "../src/services/current-user.service.ts";

function dataUrl(contentType: string, size: number): string {
  return `data:${contentType};base64,${Buffer.alloc(size, 7).toString("base64")}`;
}

const owner = { id: "owner-1" } as CurrentUser;

function input(overrides: Partial<ManualAccountingInput> = {}): ManualAccountingInput {
  return {
    entryType: "expense",
    entryDate: "2026-08-15",
    amount: 100,
    description: "Receipt test",
    note: "category: Resort Supplies",
    receiptUnavailable: false,
    ...overrides,
  };
}

interface FakeEntryRow {
  accounting_entry_id: number;
  entry_type: "income" | "expense";
  entry_date: string;
  amount: number;
  description: string;
  note: string | null;
  receipt_object_key: string | null;
  receipt_file_name: string | null;
  receipt_content_type: string | null;
  receipt_uploaded_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FakeAttachmentRow {
  accounting_attachment_id: number;
  accounting_entry_id: number;
  sort_order: number;
  object_key: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  uploaded_at: string;
}

class FakeStatement {
  constructor(private readonly db: FakeAccountingDb, private readonly sql: string, private readonly values: unknown[] = []) {}

  bind(...values: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, values);
  }

  async run(): Promise<D1Result> {
    const sql = this.sql.replace(/\s+/g, " ").trim();
    if (sql.startsWith("INSERT INTO manual_accounting_entries")) {
      const id = this.db.nextEntryId++;
      const [entryType, entryDate, amount, description, note, , createdAt, updatedAt] = this.values;
      this.db.entries.set(id, {
        accounting_entry_id: id,
        entry_type: entryType as "income" | "expense",
        entry_date: entryDate as string,
        amount: amount as number,
        description: description as string,
        note: note as string | null,
        receipt_object_key: null,
        receipt_file_name: null,
        receipt_content_type: null,
        receipt_uploaded_at: null,
        created_at: createdAt as string,
        updated_at: updatedAt as string,
      });
      return { success: true, meta: { last_row_id: id } } as D1Result;
    }
    if (sql.startsWith("INSERT INTO accounting_entry_attachments")) {
      const [entryId, sortOrder, objectKey, fileName, contentType, byteSize, uploadedAt] = this.values;
      this.db.attachments.push({
        accounting_attachment_id: this.db.nextAttachmentId++,
        accounting_entry_id: entryId as number,
        sort_order: sortOrder as number,
        object_key: objectKey as string,
        file_name: fileName as string,
        content_type: contentType as string,
        byte_size: byteSize as number,
        uploaded_at: uploadedAt as string,
      });
      return { success: true, meta: {} } as D1Result;
    }
    if (sql.startsWith("UPDATE manual_accounting_entries")) {
      const [objectKey, fileName, contentType, uploadedAt, updatedAt, entryId] = this.values;
      const row = this.db.entries.get(entryId as number);
      if (row) {
        row.receipt_object_key = objectKey as string;
        row.receipt_file_name = fileName as string;
        row.receipt_content_type = contentType as string;
        row.receipt_uploaded_at = uploadedAt as string;
        row.updated_at = updatedAt as string;
      }
      return { success: true, meta: {} } as D1Result;
    }
    if (sql.startsWith("DELETE FROM manual_accounting_entries")) {
      const entryId = this.values[0] as number;
      this.db.entries.delete(entryId);
      this.db.attachments = this.db.attachments.filter((row) => row.accounting_entry_id !== entryId);
      return { success: true, meta: {} } as D1Result;
    }
    throw new Error(`Unexpected run SQL: ${sql}`);
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("FROM accounting_entry_attachments")) {
      const entryId = this.values[0] as number;
      const attachmentId = this.sql.includes("accounting_attachment_id = ?") ? this.values[1] as number : null;
      const row = this.db.attachments
        .filter((item) => item.accounting_entry_id === entryId && (attachmentId === null || item.accounting_attachment_id === attachmentId))
        .sort((a, b) => a.sort_order - b.sort_order)[0];
      return (row ? { object_key: row.object_key, file_name: row.file_name, content_type: row.content_type } : null) as T | null;
    }
    if (this.sql.includes("FROM manual_accounting_entries")) {
      const row = this.db.entries.get(this.values[0] as number) ?? null;
      if (row && this.sql.includes("AS object_key")) {
        return (row.receipt_object_key ? {
          object_key: row.receipt_object_key,
          file_name: row.receipt_file_name,
          content_type: row.receipt_content_type,
        } : null) as T | null;
      }
      return row as T | null;
    }
    throw new Error(`Unexpected first SQL: ${this.sql}`);
  }

  async all<T>(): Promise<D1Result<T>> {
    if (this.sql.includes("FROM accounting_entry_attachments")) {
      const entryId = this.values[0] as number;
      return {
        success: true,
        results: this.db.attachments.filter((row) => row.accounting_entry_id === entryId).sort((a, b) => a.sort_order - b.sort_order) as T[],
        meta: {},
      } as D1Result<T>;
    }
    throw new Error(`Unexpected all SQL: ${this.sql}`);
  }
}

class FakeAccountingDb {
  entries = new Map<number, FakeEntryRow>();
  attachments: FakeAttachmentRow[] = [];
  nextEntryId = 1;
  nextAttachmentId = 1;

  prepare(sql: string): D1PreparedStatement {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const entrySnapshot = new Map(this.entries);
    const attachmentSnapshot = [...this.attachments];
    try {
      const results: D1Result<T>[] = [];
      for (const statement of statements) results.push(await statement.run<T>());
      return results;
    } catch (error) {
      this.entries = entrySnapshot;
      this.attachments = attachmentSnapshot;
      throw error;
    }
  }
}

class FakeR2 {
  objects = new Map<string, ArrayBuffer>();
  deleted: string[] = [];
  puts = 0;

  constructor(private readonly failPutAt: number | null = null) {}

  async put(key: string, value: ArrayBuffer): Promise<void> {
    this.puts += 1;
    if (this.puts === this.failPutAt) throw new Error("simulated R2 failure");
    this.objects.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.deleted.push(key);
    this.objects.delete(key);
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const value = this.objects.get(key);
    return value ? { body: new Blob([value]).stream() } as unknown as R2ObjectBody : null;
  }
}

function env(db = new FakeAccountingDb(), r2 = new FakeR2()) {
  return { DB: db as unknown as D1Database, R2_STORAGE: r2 as unknown as R2Bucket, db, r2 };
}

test("receipt normalization accepts 0, 1, 2, and 5 mixed attachments and preserves duplicate names", () => {
  assert.deepEqual(normalizeReceiptInput({}), []);
  assert.equal(normalizeReceiptInput({ receiptDataUrl: dataUrl("image/jpeg", 2), receiptFileName: "old.jpg" }).length, 1);
  const two = normalizeReceiptInput({ receipts: [
    { dataUrl: dataUrl("image/png", 2), fileName: "same.png" },
    { dataUrl: dataUrl("application/pdf", 3), fileName: "same.png" },
  ] });
  assert.equal(two.length, 2);
  assert.deepEqual(two.map((receipt) => receipt.fileName), ["same.png", "same.png"]);
  const five = normalizeReceiptInput({ receipts: [
    ["image/jpeg", "one.jpg"],
    ["image/png", "two.png"],
    ["image/webp", "three.webp"],
    ["application/pdf", "four.pdf"],
    ["image/jpeg", "five.jpg"],
  ].map(([contentType, fileName]) => ({ dataUrl: dataUrl(contentType, 4), fileName })) });
  assert.equal(five.length, 5);
});

test("receipt normalization rejects invalid, empty, oversized, and excessive attachment sets", () => {
  assert.throws(() => normalizeReceiptInput({ receipts: [{ dataUrl: "not-data", fileName: "x.jpg" }] }), /data URL/);
  assert.throws(() => normalizeReceiptInput({ receipts: [{ dataUrl: dataUrl("text/plain", 2), fileName: "x.txt" }] }), /JPG, PNG, WebP, or PDF/);
  assert.throws(() => normalizeReceiptInput({ receipts: [{ dataUrl: dataUrl("image/jpeg", 8 * 1024 * 1024 + 1), fileName: "large.jpg" }] }), /too large/);
  assert.throws(() => normalizeReceiptInput({ receipts: Array.from({ length: 11 }, () => ({ dataUrl: dataUrl("image/jpeg", 1), fileName: "x.jpg" })) }), /maximum of 10/);
});

test("expense requires receipt or explicit unavailable flag while income keeps the current optional contract", async () => {
  const missing = env();
  await assert.rejects(() => createManualAccountingEntry(missing, input(), [], owner), /Add at least one receipt/);
  assert.equal(missing.db.entries.size, 0);

  const unavailable = env();
  const savedExpense = await createManualAccountingEntry(unavailable, input({ receiptUnavailable: true }), [], owner);
  assert.equal(savedExpense.receiptUnavailable, true);
  assert.match(savedExpense.note ?? "", /receipt: unavailable/);

  const incomeEnv = env();
  const savedIncome = await createManualAccountingEntry(incomeEnv, input({ entryType: "income" }), [], owner);
  assert.equal(savedIncome.attachments.length, 0);
});

test("two receipt pages save once, preserve order, and keep the first-page legacy contract", async () => {
  const fixture = env();
  const receipts: ReceiptInput[] = [
    { fileName: "same.jpg", contentType: "image/jpeg", body: new Uint8Array([1, 2]).buffer },
    { fileName: "same.jpg", contentType: "application/pdf", body: new Uint8Array([3, 4, 5]).buffer },
  ];
  const saved = await createManualAccountingEntry(fixture, input(), receipts, owner);
  assert.equal(saved.attachments.length, 2);
  assert.deepEqual(saved.attachments.map((item) => item.page), [1, 2]);
  assert.equal(saved.receipt?.fileName, "same.jpg");
  assert.equal(fixture.r2.objects.size, 2);
  assert.equal(fixture.db.entries.size, 1);
  const legacyDownload = await getAccountingReceipt(fixture, saved.id);
  assert.equal(legacyDownload?.fileName, "same.jpg");
  const listed = await listAccountingAttachments(fixture, saved.id);
  assert.deepEqual(listed.map((item) => [item.page, item.fileName]), [[1, "same.jpg"], [2, "same.jpg"]]);
  const secondPage = await getAccountingAttachment(fixture, saved.id, listed[1].id);
  assert.equal(secondPage?.contentType, "application/pdf");
});

test("a partial R2 failure removes only objects and entry created by the failed request", async () => {
  const fixture = env(new FakeAccountingDb(), new FakeR2(2));
  const receipts: ReceiptInput[] = [
    { fileName: "one.jpg", contentType: "image/jpeg", body: new Uint8Array([1]).buffer },
    { fileName: "two.jpg", contentType: "image/jpeg", body: new Uint8Array([2]).buffer },
  ];
  await assert.rejects(() => createManualAccountingEntry(fixture, input(), receipts, owner), /simulated R2 failure/);
  assert.equal(fixture.db.entries.size, 0);
  assert.equal(fixture.db.attachments.length, 0);
  assert.equal(fixture.r2.objects.size, 0);
  assert.equal(fixture.r2.deleted.length, 1);
});

test("migration preserves six legacy attachment keys and is idempotent", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (user_id TEXT PRIMARY KEY);
    INSERT INTO users (user_id) VALUES ('owner-1');
    CREATE TABLE manual_accounting_entries (
      accounting_entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_object_key TEXT,
      receipt_file_name TEXT,
      receipt_content_type TEXT,
      receipt_uploaded_at TEXT,
      created_by_user_id TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const insert = db.prepare(`
    INSERT INTO manual_accounting_entries (
      receipt_object_key, receipt_file_name, receipt_content_type, receipt_uploaded_at, created_by_user_id, created_at
    ) VALUES (?, ?, 'image/jpeg', '2026-08-15T00:00:00.000Z', 'owner-1', '2026-08-15T00:00:00.000Z')
  `);
  for (let index = 1; index <= 6; index += 1) insert.run(`accounting/receipts/${index}/receipt.jpg`, `receipt-${index}.jpg`);
  const migration = readFileSync(new URL("../migrations/0054_accounting_entry_attachments.sql", import.meta.url), "utf8");
  db.exec(migration);
  db.exec(migration);
  const rows = db.prepare("SELECT object_key FROM accounting_entry_attachments ORDER BY accounting_entry_id").all() as Array<{ object_key: string }>;
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((row) => row.object_key), Array.from({ length: 6 }, (_, index) => `accounting/receipts/${index + 1}/receipt.jpg`));
  db.close();
});

test("manual accounting normalization accepts the explicit receipt unavailable flag", () => {
  const normalized = normalizeManualAccountingInput({
    entryType: "expense",
    entryDate: "2026-08-15",
    amount: 100,
    description: "No receipt",
    note: "category: Other Expenses",
    receiptUnavailable: true,
  });
  assert.equal(normalized.receiptUnavailable, true);
});
