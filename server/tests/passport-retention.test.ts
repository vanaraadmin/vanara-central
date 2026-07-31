import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
  cleanupExpiredPassports,
  isPassportRetentionEligible,
  passportRetentionDays,
} from "../src/services/passport-retention.service.ts";

interface RetentionRow {
  id: number;
  booking_id: number;
  object_key: string;
  created_at: string;
}

class FakeRetentionStmt {
  private params: unknown[] = [];

  constructor(private db: FakeRetentionDB, private sql: string) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  all<T>() {
    return this.db.all<T>(this.sql, this.params);
  }

  run() {
    return this.db.run(this.sql, this.params);
  }
}

class FakeRetentionDB {
  rows: RetentionRow[];

  constructor(rows: RetentionRow[]) {
    this.rows = [...rows];
  }

  prepare(sql: string) {
    return new FakeRetentionStmt(this, sql);
  }

  async all<T>(sql: string, params: unknown[]) {
    if (sql.includes("FROM booking_passports")) {
      const cutoff = String(params[0]);
      const limit = Number(params[1]);
      return {
        results: this.rows
          .filter((row) => row.created_at < cutoff)
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
          .slice(0, limit) as T[],
      };
    }
    return { results: [] as T[] };
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("DELETE FROM booking_passports")) {
      const id = Number(params[0]);
      const before = this.rows.length;
      this.rows = this.rows.filter((row) => row.id !== id);
      return { meta: { changes: before - this.rows.length, last_row_id: 0 } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }
}

class FakeRetentionR2 {
  deleted: string[] = [];

  constructor(private failKeys = new Set<string>()) {}

  async delete(key: string) {
    if (this.failKeys.has(key)) throw new Error("R2 delete unavailable");
    this.deleted.push(key);
  }
}

function env(rows: RetentionRow[], r2 = new FakeRetentionR2(), retentionDays = "45") {
  return {
    DB: new FakeRetentionDB(rows) as unknown as D1Database,
    R2_STORAGE: r2 as unknown as R2Bucket,
    PASSPORT_RETENTION_DAYS: retentionDays,
  };
}

function captureLogs(t: TestContext) {
  const logs: string[] = [];
  const warnings: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (message?: unknown) => {
    logs.push(String(message));
  };
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  t.after(() => {
    console.log = originalLog;
    console.warn = originalWarn;
  });
  return { logs, warnings };
}

test("passport retention uses configured days with a 45 day default", () => {
  assert.equal(passportRetentionDays({ PASSPORT_RETENTION_DAYS: "30" }), 30);
  assert.equal(passportRetentionDays({ PASSPORT_RETENTION_DAYS: "0" }), 45);
  assert.equal(passportRetentionDays({}), 45);
});

test("passport retention eligibility separates older and newer objects", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  assert.equal(isPassportRetentionEligible("2026-06-15T11:59:59.000Z", now, 45), true);
  assert.equal(isPassportRetentionEligible("2026-06-16T12:00:01.000Z", now, 45), false);
  assert.equal(isPassportRetentionEligible("invalid", now, 45), false);
});

test("passport retention deletes expired passport objects and leaves newer rows", async (t) => {
  const r2 = new FakeRetentionR2();
  const data = env([
    { id: 1, booking_id: 9001, object_key: "passports/2026-06-01/old.jpg", created_at: "2026-06-01T00:00:00.000Z" },
    { id: 2, booking_id: 9002, object_key: "passports/2026-07-20/new.jpg", created_at: "2026-07-20T00:00:00.000Z" },
  ], r2);
  const { logs } = captureLogs(t);

  const summary = await cleanupExpiredPassports(data, new Date("2026-07-31T12:00:00.000Z"));
  const db = data.DB as unknown as FakeRetentionDB;

  assert.deepEqual(r2.deleted, ["passports/2026-06-01/old.jpg"]);
  assert.deepEqual(db.rows.map((row) => row.id), [2]);
  assert.equal(summary.deleted, 1);
  assert.equal(summary.failed, 0);
  assert.ok(logs.some((line) => line.includes("passport_retention_deleted")));
  assert.ok(logs.some((line) => line.includes("passport_retention_summary")));
});

test("passport retention skips unrelated R2 prefixes", async (t) => {
  const r2 = new FakeRetentionR2();
  const data = env([
    { id: 1, booking_id: 9001, object_key: "damage-reports/old.jpg", created_at: "2026-06-01T00:00:00.000Z" },
  ], r2);
  const { logs } = captureLogs(t);

  const summary = await cleanupExpiredPassports(data, new Date("2026-07-31T12:00:00.000Z"));
  const db = data.DB as unknown as FakeRetentionDB;

  assert.deepEqual(r2.deleted, []);
  assert.deepEqual(db.rows.map((row) => row.id), [1]);
  assert.equal(summary.skipped, 1);
  assert.ok(logs.some((line) => line.includes("passport_retention_skipped") && line.includes("non_passport_prefix")));
});

test("passport retention is idempotent after successful deletion", async () => {
  const r2 = new FakeRetentionR2();
  const data = env([
    { id: 1, booking_id: 9001, object_key: "passports/2026-06-01/old.jpg", created_at: "2026-06-01T00:00:00.000Z" },
  ], r2);

  const first = await cleanupExpiredPassports(data, new Date("2026-07-31T12:00:00.000Z"));
  const second = await cleanupExpiredPassports(data, new Date("2026-07-31T12:00:00.000Z"));

  assert.equal(first.deleted, 1);
  assert.equal(second.checked, 0);
  assert.deepEqual(r2.deleted, ["passports/2026-06-01/old.jpg"]);
});

test("passport retention logs deletion failures and continues processing", async (t) => {
  const failingKey = "passports/2026-06-01/fail.jpg";
  const r2 = new FakeRetentionR2(new Set([failingKey]));
  const data = env([
    { id: 1, booking_id: 9001, object_key: failingKey, created_at: "2026-06-01T00:00:00.000Z" },
    { id: 2, booking_id: 9002, object_key: "passports/2026-06-02/ok.jpg", created_at: "2026-06-02T00:00:00.000Z" },
  ], r2);
  const { warnings } = captureLogs(t);

  const summary = await cleanupExpiredPassports(data, new Date("2026-07-31T12:00:00.000Z"));
  const db = data.DB as unknown as FakeRetentionDB;

  assert.equal(summary.failed, 1);
  assert.equal(summary.deleted, 1);
  assert.deepEqual(r2.deleted, ["passports/2026-06-02/ok.jpg"]);
  assert.deepEqual(db.rows.map((row) => row.id), [1]);
  assert.ok(warnings.some((line) => line.includes("passport_retention_delete_failed") && line.includes("R2 delete unavailable")));
});
