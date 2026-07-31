import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import worker from "../src/index.ts";

interface WebhookRow {
  webhook_event_id: number;
  idempotency_key: string;
  event: string;
  booking_id: string;
  request_id: string;
  received_at: string;
  processing_status: string;
}

class FakeWebhookStmt {
  private params: unknown[] = [];

  constructor(private db: FakeWebhookDB, private sql: string) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  run() {
    return this.db.run(this.sql, this.params);
  }
}

class FakeWebhookDB {
  rows: WebhookRow[] = [];

  prepare(sql: string) {
    return new FakeWebhookStmt(this, sql);
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT OR IGNORE INTO beds24_webhook_events")) {
      const idempotencyKey = String(params[0]);
      if (this.rows.some((row) => row.idempotency_key === idempotencyKey)) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }

      const webhook_event_id = this.rows.length + 1;
      this.rows.push({
        webhook_event_id,
        idempotency_key: idempotencyKey,
        event: String(params[1]),
        booking_id: String(params[2]),
        request_id: String(params[3]),
        received_at: String(params[4]),
        processing_status: "accepted",
      });
      return { meta: { changes: 1, last_row_id: webhook_event_id } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }
}

function env(db = new FakeWebhookDB(), secret = "local-webhook-secret") {
  return {
    DB: db as unknown as D1Database,
    BEDS24_WEBHOOK_SECRET: secret,
  };
}

async function request(method: string, body: string | null, data: ReturnType<typeof env>, secret: string | null = "local-webhook-secret", contentType = "application/json") {
  const headers = new Headers();
  if (secret !== null) headers.set("X-Vanara-Webhook-Secret", secret);
  if (contentType.length > 0) headers.set("content-type", contentType);
  return worker.fetch(new Request("https://local.test/api/webhooks/beds24", {
    method,
    headers,
    body,
  }), data as never, {} as never);
}

async function payload(response: Response) {
  return response.json() as Promise<{ success: boolean; error?: { code: string; message: string } }>;
}

function captureLogs(t: TestContext) {
  const logs: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (message?: unknown) => {
    logs.push(String(message));
  };
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  console.error = (message?: unknown) => {
    errors.push(String(message));
  };
  t.after(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  });
  return { logs, warnings, errors };
}

for (const event of ["booking_created", "booking_updated", "booking_cancelled"] as const) {
  test(`Beds24 webhook accepts ${event}`, async () => {
    const db = new FakeWebhookDB();
    const response = await request("POST", JSON.stringify({ event, bookingId: "123456" }), env(db));

    assert.equal(response.status, 200);
    assert.deepEqual(await payload(response), { success: true });
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.event, event);
    assert.equal(db.rows[0]?.booking_id, "123456");
    assert.equal(db.rows[0]?.processing_status, "accepted");
    assert.ok(db.rows[0]?.request_id);
    assert.ok(db.rows[0]?.received_at);
  });
}

test("Beds24 webhook rejects missing secret", async (t) => {
  const db = new FakeWebhookDB();
  const { warnings } = captureLogs(t);
  const response = await request("POST", JSON.stringify({ event: "booking_created", bookingId: "123456" }), env(db), null);
  const body = await payload(response);

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error?.code, "webhook_secret_missing");
  assert.equal(db.rows.length, 0);
  assert.ok(warnings.some((line) => line.includes("beds24_webhook_auth_rejected") && line.includes("missing_secret")));
  assert.equal(warnings.some((line) => line.includes("local-webhook-secret")), false);
});

test("Beds24 webhook rejects invalid secret", async (t) => {
  const db = new FakeWebhookDB();
  const { warnings } = captureLogs(t);
  const response = await request("POST", JSON.stringify({ event: "booking_created", bookingId: "123456" }), env(db), "wrong-secret");
  const body = await payload(response);

  assert.equal(response.status, 401);
  assert.equal(body.error?.code, "webhook_secret_invalid");
  assert.equal(db.rows.length, 0);
  assert.ok(warnings.some((line) => line.includes("beds24_webhook_auth_rejected") && line.includes("invalid_secret")));
  assert.equal(warnings.some((line) => line.includes("wrong-secret")), false);
});

test("Beds24 webhook rejects invalid JSON", async (t) => {
  const db = new FakeWebhookDB();
  const { warnings } = captureLogs(t);
  const response = await request("POST", "{invalid", env(db));
  const body = await payload(response);

  assert.equal(response.status, 400);
  assert.equal(body.error?.code, "webhook_json_invalid");
  assert.equal(db.rows.length, 0);
  assert.ok(warnings.some((line) => line.includes("beds24_webhook_invalid_payload") && line.includes("invalid_json")));
});

test("Beds24 webhook rejects non-JSON content type", async () => {
  const db = new FakeWebhookDB();
  const response = await request("POST", JSON.stringify({ event: "booking_created", bookingId: "123456" }), env(db), "local-webhook-secret", "text/plain");
  const body = await payload(response);

  assert.equal(response.status, 400);
  assert.equal(body.error?.code, "webhook_content_type_invalid");
  assert.equal(db.rows.length, 0);
});

test("Beds24 webhook rejects unsupported events", async (t) => {
  const db = new FakeWebhookDB();
  const { warnings } = captureLogs(t);
  const response = await request("POST", JSON.stringify({ event: "booking_deleted", bookingId: "123456" }), env(db));
  const body = await payload(response);

  assert.equal(response.status, 400);
  assert.equal(body.error?.code, "webhook_payload_invalid");
  assert.equal(db.rows.length, 0);
  assert.ok(warnings.some((line) => line.includes("webhook_payload_invalid")));
});

test("Beds24 webhook rejects missing bookingId", async () => {
  const db = new FakeWebhookDB();
  const response = await request("POST", JSON.stringify({ event: "booking_created" }), env(db));
  const body = await payload(response);

  assert.equal(response.status, 400);
  assert.equal(body.error?.code, "webhook_payload_invalid");
  assert.equal(db.rows.length, 0);
});

test("Beds24 webhook treats duplicate delivery as successful without duplicate records", async (t) => {
  const db = new FakeWebhookDB();
  captureLogs(t);
  const data = env(db);

  const first = await request("POST", JSON.stringify({ event: "booking_updated", bookingId: "123456" }), data);
  const second = await request("POST", JSON.stringify({ event: "booking_updated", bookingId: "123456" }), data);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(db.rows.length, 1);
});

test("Beds24 webhook rejects non-POST methods", async () => {
  const db = new FakeWebhookDB();
  const response = await request("GET", null, env(db));
  const body = await payload(response);

  assert.equal(response.status, 405);
  assert.equal(body.error?.code, "webhook_method_invalid");
  assert.equal(db.rows.length, 0);
});
