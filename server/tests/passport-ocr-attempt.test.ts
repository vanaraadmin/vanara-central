import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupExpiredPassportOcrAttempts,
  ensurePassportOcrAttempt,
  runPersistedPassportOpenAiResponse,
} from "../src/services/passport-ocr-attempt.service.ts";

type Row = Record<string, unknown>;

class FakeStatement {
  private params: unknown[] = [];

  constructor(private readonly db: FakePassportAttemptDb, private readonly sql: string) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  first<T>() {
    return this.db.first<T>(this.sql, this.params);
  }

  run() {
    return this.db.run(this.sql, this.params);
  }
}

class FakePassportAttemptDb {
  attempts = new Map<string, Row>();
  responses = new Map<string, Row>();

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  async first<T>(sql: string, params: unknown[]): Promise<T | null> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.includes("FROM passport_ocr_attempts") && normalized.includes("booking_id = ?")) {
      const [bookingId, slotKey, imageSha] = params;
      return ([...this.attempts.values()].find((row) => row.booking_id === bookingId && row.slot_key === slotKey && row.image_sha256 === imageSha) ?? null) as T | null;
    }
    if (normalized === "SELECT object_key FROM passport_ocr_attempts WHERE id = ? LIMIT 1") {
      const row = this.attempts.get(String(params[0]));
      return (row ? { object_key: row.object_key ?? null } : null) as T | null;
    }
    if (normalized.includes("FROM passport_ocr_response_attempts") && normalized.includes("attempt_id = ? AND stage = ?")) {
      const [attemptId, stage] = params;
      return ([...this.responses.values()].find((row) => row.attempt_id === attemptId && row.stage === stage) ?? null) as T | null;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    let changes = 0;
    if (normalized.startsWith("INSERT OR IGNORE INTO passport_ocr_attempts")) {
      const [id, bookingId, slotKey, imageSha256, createdBy, createdAt, updatedAt, expiresAt] = params;
      const duplicate = [...this.attempts.values()].some((row) => row.booking_id === bookingId && row.slot_key === slotKey && row.image_sha256 === imageSha256);
      if (!duplicate) {
        this.attempts.set(String(id), {
          id, booking_id: bookingId, slot_key: slotKey, image_sha256: imageSha256, object_key: null,
          state: "ACTIVE", created_by: createdBy, created_at: createdAt, updated_at: updatedAt, expires_at: expiresAt,
        });
        changes = 1;
      }
    } else if (normalized.startsWith("INSERT OR IGNORE INTO passport_ocr_response_attempts")) {
      const [id, attemptId, stage, clientRequestId, createdAt, updatedAt] = params;
      const duplicate = [...this.responses.values()].some((row) => row.attempt_id === attemptId && row.stage === stage);
      if (!duplicate) {
        this.responses.set(String(id), {
          id, attempt_id: attemptId, stage, client_request_id: clientRequestId, response_id: null,
          provider_status: null, state: "PENDING", result_json: null, openai_request_id: null,
          http_status: null, submitted_at: null, updated_at: updatedAt, created_at: createdAt,
        });
        changes = 1;
      }
    } else if (normalized.includes("SET state = 'SUBMITTING'")) {
      const [submittedAt, updatedAt, id] = params;
      const row = this.responses.get(String(id));
      if (row?.state === "PENDING" && !row.response_id) {
        Object.assign(row, { state: "SUBMITTING", submitted_at: submittedAt, updated_at: updatedAt });
        changes = 1;
      }
    } else if (normalized.includes("SET response_id = COALESCE(response_id, ?), provider_status = ?, state = 'POLLING'")) {
      const [responseId, providerStatus, openAiRequestId, httpStatus, lastPolledAt, updatedAt, id] = params;
      const row = this.responses.get(String(id));
      if (row) {
        Object.assign(row, {
          response_id: row.response_id ?? responseId,
          provider_status: providerStatus,
          state: "POLLING",
          openai_request_id: row.openai_request_id ?? openAiRequestId,
          http_status: httpStatus,
          last_polled_at: lastPolledAt,
          updated_at: updatedAt,
        });
        changes = 1;
      }
    } else if (normalized.includes("provider_status = 'completed', state = 'COMPLETED'")) {
      const [responseId, resultJson, openAiRequestId, httpStatus, completedAt, lastPolledAt, updatedAt, id] = params;
      const row = this.responses.get(String(id));
      if (row) {
        Object.assign(row, {
          response_id: row.response_id ?? responseId,
          provider_status: "completed",
          state: "COMPLETED",
          result_json: resultJson,
          openai_request_id: row.openai_request_id ?? openAiRequestId,
          http_status: httpStatus,
          completed_at: completedAt,
          last_polled_at: lastPolledAt,
          updated_at: updatedAt,
          error_code: null,
          error_message: null,
        });
        changes = 1;
      }
    } else if (normalized.includes("SET response_id = COALESCE(response_id, ?), state = 'POLLING', error_code = 'poll_timeout'")) {
      const [responseId, errorMessage, updatedAt, id] = params;
      const row = this.responses.get(String(id));
      if (row) {
        Object.assign(row, { response_id: row.response_id ?? responseId, state: "POLLING", error_code: "poll_timeout", error_message: errorMessage, updated_at: updatedAt });
        changes = 1;
      }
    } else if (normalized.includes("SET response_id = COALESCE(response_id, ?), state = 'FAILED'")) {
      const [responseId, errorCode, errorMessage, updatedAt, id] = params;
      const row = this.responses.get(String(id));
      if (row) {
        Object.assign(row, { response_id: row.response_id ?? responseId, state: "FAILED", error_code: errorCode, error_message: errorMessage, updated_at: updatedAt });
        changes = 1;
      }
    } else if (normalized.includes("SET state = 'MANUAL_REVIEW', error_code = ?")) {
      const [errorCode, errorMessage, updatedAt, id] = params;
      const row = this.responses.get(String(id));
      if (row && !row.response_id && ["PENDING", "SUBMITTING"].includes(String(row.state))) {
        Object.assign(row, { state: "MANUAL_REVIEW", error_code: errorCode, error_message: errorMessage, updated_at: updatedAt });
        changes = 1;
      }
    } else if (normalized.includes("UPDATE passport_ocr_attempts") && normalized.includes("SET state = 'MANUAL_REVIEW'")) {
      const [errorCode, errorMessage, updatedAt, expiresAt, id] = params;
      const row = this.attempts.get(String(id));
      if (row) {
        Object.assign(row, { state: "MANUAL_REVIEW", last_error_code: errorCode, last_error_message: errorMessage, updated_at: updatedAt, expires_at: expiresAt });
        changes = 1;
      }
    } else if (normalized.startsWith("DELETE FROM passport_ocr_attempts")) {
      const cutoff = String(params[0]);
      for (const [id, row] of this.attempts) {
        if (String(row.expires_at) <= cutoff && ["ACTIVE", "CLASSIFIED", "OCR_COMPLETED", "PASSPORT_SAVED", "FAILED", "MANUAL_REVIEW", "DISCARDED"].includes(String(row.state))) {
          this.attempts.delete(id);
          for (const [responseId, response] of this.responses) if (response.attempt_id === id) this.responses.delete(responseId);
          changes += 1;
        }
      }
    }
    return { success: true, meta: { changes } };
  }
}

async function attempt(db: FakePassportAttemptDb) {
  return ensurePassportOcrAttempt({ DB: db as never, OPENAI_API_KEY: "test-key" }, {
    bookingId: 9001,
    slotKey: "booking:9001:image:stable-slot",
    imageSha256: "a".repeat(64),
    createdBy: "owner-1",
  });
}

function completedPayload(id: string) {
  return {
    id,
    status: "completed",
    output: [{ content: [{ type: "output_text", text: "{\"ok\":true}" }] }],
  };
}

test("passport OCR survives a Worker restart and resumes the persisted response with GET only", async () => {
  const db = new FakePassportAttemptDb();
  const handle = await attempt(db);
  let posts = 0;
  let gets = 0;
  await assert.rejects(runPersistedPassportOpenAiResponse({
    env: { DB: db as never, OPENAI_API_KEY: "test-key" },
    attempt: handle,
    stage: "VISUAL_BIODATA",
    body: { model: "test", input: "passport" },
    pollIntervalMs: 1,
    timeoutMs: 15,
    fetcher: async (_input, init) => {
      if (init.method === "POST") {
        posts += 1;
        return new Response(JSON.stringify({ id: "resp-restart", status: "in_progress" }), { status: 200 });
      }
      gets += 1;
      throw new TypeError("Worker restarted while polling");
    },
  }));

  const result = await runPersistedPassportOpenAiResponse({
    env: { DB: db as never, OPENAI_API_KEY: "test-key" },
    attempt: handle,
    stage: "VISUAL_BIODATA",
    body: { model: "test", input: "passport" },
    pollIntervalMs: 1,
    timeoutMs: 1_000,
    fetcher: async (input, init) => {
      assert.equal(init.method, "GET");
      assert.equal(input, "https://api.openai.com/v1/responses/resp-restart");
      gets += 1;
      return new Response(JSON.stringify(completedPayload("resp-restart")), { status: 200 });
    },
  });

  assert.equal(posts, 1);
  assert.ok(gets >= 1);
  assert.equal(result.responseId, "resp-restart");
});

test("concurrent duplicate passport OCR submissions create exactly one provider POST", async () => {
  const db = new FakePassportAttemptDb();
  const firstHandle = await attempt(db);
  const duplicateHandle = await attempt(db);
  assert.equal(firstHandle.id, duplicateHandle.id);
  let posts = 0;
  let gets = 0;
  const fetcher = async (_input: string, init: RequestInit) => {
    if (init.method === "POST") {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ id: "resp-concurrent", status: "in_progress" }), { status: 200 });
    }
    gets += 1;
    return new Response(JSON.stringify(completedPayload("resp-concurrent")), { status: 200 });
  };
  const options = {
    env: { DB: db as never, OPENAI_API_KEY: "test-key" },
    stage: "MRZ" as const,
    body: { model: "test", input: "passport" },
    pollIntervalMs: 1,
    timeoutMs: 1_000,
    fetcher,
  };
  const [first, second] = await Promise.all([
    runPersistedPassportOpenAiResponse({ ...options, attempt: firstHandle }),
    runPersistedPassportOpenAiResponse({ ...options, attempt: duplicateHandle }),
  ]);
  assert.equal(posts, 1);
  assert.ok(gets >= 1);
  assert.equal(first.responseId, "resp-concurrent");
  assert.equal(second.responseId, "resp-concurrent");
});

test("ambiguous initial POST enters manual review and is never blindly retried", async () => {
  const db = new FakePassportAttemptDb();
  const handle = await attempt(db);
  let posts = 0;
  const run = () => runPersistedPassportOpenAiResponse({
    env: { DB: db as never, OPENAI_API_KEY: "test-key" },
    attempt: handle,
    stage: "VERIFICATION" as const,
    body: { model: "test", input: "passport" },
    pollIntervalMs: 1,
    timeoutMs: 100,
    fetcher: async (_input, init) => {
      if (init.method === "POST") posts += 1;
      throw new TypeError("connection closed after request left the Worker");
    },
  });
  await assert.rejects(run(), /outcome is unknown/i);
  await assert.rejects(run(), /manual review/i);
  assert.equal(posts, 1);
  assert.equal([...db.responses.values()][0]?.state, "MANUAL_REVIEW");
  assert.equal([...db.attempts.values()][0]?.state, "MANUAL_REVIEW");
});

test("OCR attempt cleanup removes expired attempt metadata without touching passport records", async () => {
  const db = new FakePassportAttemptDb();
  const handle = await attempt(db);
  const row = db.attempts.get(handle.id)!;
  row.state = "PASSPORT_SAVED";
  row.expires_at = "2026-08-01T00:00:00.000Z";
  const removed = await cleanupExpiredPassportOcrAttempts({ DB: db as never }, new Date("2026-08-13T00:00:00.000Z"));
  assert.equal(removed, 1);
  assert.equal(db.attempts.size, 0);
});

test("OCR attempt identity separates a new image in the same booking slot", async () => {
  const db = new FakePassportAttemptDb();
  const first = await attempt(db);
  const second = await ensurePassportOcrAttempt({ DB: db as never, OPENAI_API_KEY: "test-key" }, {
    bookingId: 9001,
    slotKey: "booking:9001:image:stable-slot",
    imageSha256: "b".repeat(64),
    createdBy: "owner-1",
  });
  assert.notEqual(first.id, second.id);
  assert.equal(db.attempts.size, 2);
});
