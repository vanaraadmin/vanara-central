import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import {
  BEDS24_MESSAGES_ENDPOINT,
  BEDS24_MESSAGES_MAX_AGE,
  BEDS24_MESSAGES_SOURCE,
  MESSAGES_CURSOR_NAME,
  normalizeBeds24GuestMessage,
  syncMessages,
  type Beds24GuestMessage,
} from "../src/services/messages-sync.service.ts";

type PermissionRow = { module_key: string; can_access: number; can_edit: number };
type BookingRow = {
  booking_id: number;
  beds24_booking_id: number;
  channel: string | null;
  api_source: string | null;
  language_code: string | null;
};
type ConversationRow = {
  message_conversation_id: number;
  provider: "BEDS24";
  provider_conversation_id: string;
  booking_id: number | null;
  beds24_booking_id: number | null;
  channel: string;
  state: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};
type MessageRow = {
  message_id: number;
  message_conversation_id: number;
  provider: "BEDS24";
  provider_message_id: string;
  provider_booking_id: number | null;
  booking_id: number | null;
  beds24_booking_id: number | null;
  direction: "INBOUND";
  author: "GUEST";
  received_at: string;
  guest_message: string;
  language: string | null;
  channel: string;
  state: string;
  association_state: "LINKED" | "UNLINKED";
  raw_provider_payload: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};
type SyncRunRow = {
  sync_type: string;
  started_at: string;
  finished_at: string;
  status: string;
  records_read: number;
  records_written: number;
  records_failed: number;
  error_message: string | null;
};
type SyncIssueRow = {
  sync_type: string;
  issue_type: "failed" | "skipped";
  provider_record_id: string;
  first_failure_at: string;
  latest_failure_at: string;
  attempt_count: number;
  error_category: string;
  error_message: string;
  status: "pending" | "resolved";
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

const NOW = "2026-08-04T10:00:00.000Z";

const OWNER_ROW = {
  session_id: "session-1",
  expires_at: "2099-01-01T00:00:00.000Z",
  user_id: "owner-1",
  full_name: "Owner",
  profile_photo_url: null,
  role: "Owner",
  preferred_language: "en",
  username: "owner",
  email: null,
  password_hash: "not-used",
  status: "active",
  created_at: NOW,
  updated_at: NOW,
  last_login_at: null,
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeMessagesDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

class FakeMessagesDB {
  bookings: BookingRow[] = [];
  conversations: ConversationRow[] = [];
  messages: MessageRow[] = [];
  syncRuns: SyncRunRow[] = [];
  issues: SyncIssueRow[] = [];
  cursors = new Map<string, { cursor_value: string | null; updated_at: string }>();
  authenticated = true;
  owner = true;
  nextConversationId = 1;
  nextMessageId = 1;

  constructor(options: { bookings?: BookingRow[]; authenticated?: boolean; owner?: boolean } = {}) {
    this.bookings = options.bookings ?? [];
    this.authenticated = options.authenticated ?? true;
    this.owner = options.owner ?? true;
  }

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(stmts.map((stmt) => stmt.run()));
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT s.session_id")) {
      return (this.authenticated ? OWNER_ROW : null) as T | null;
    }
    if (sql.includes("FROM bookings") && sql.includes("beds24_booking_id = ?")) {
      const beds24BookingId = Number(params[0]);
      return (this.bookings.find((booking) => booking.beds24_booking_id === beds24BookingId) ?? null) as T | null;
    }
    if (sql.includes("SELECT message_conversation_id") && sql.includes("FROM message_conversations")) {
      const provider = String(params[0]);
      const key = String(params[1]);
      const conversation = this.conversations.find((item) => item.provider === provider && item.provider_conversation_id === key);
      return (conversation ? { message_conversation_id: conversation.message_conversation_id } : null) as T | null;
    }
    return null;
  }

  async all<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT view_key FROM user_views")) {
      return { results: (this.owner ? [{ view_key: "owner" }, { view_key: "staff" }] : [{ view_key: "staff" }]) as T[] };
    }
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) {
      return { results: [{ module_key: "settings", can_access: 1, can_edit: this.owner ? 1 : 0 }] as PermissionRow[] as T[] };
    }
    if (sql.includes("SELECT action_key, allowed FROM user_action_permissions")) {
      return { results: [] as T[] };
    }
    if (sql.includes("FROM messages m") && sql.includes("ORDER BY m.received_at DESC")) {
      const limit = Number(params[0]);
      return {
        results: [...this.messages]
          .sort((left, right) => right.received_at.localeCompare(left.received_at) || right.message_id - left.message_id)
          .slice(0, limit)
          .map((message) => ({ ...message, draft_id: null, draft_status: null })) as T[],
      };
    }
    return { results: [] as T[] };
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT OR IGNORE INTO sync_cursors")) {
      const name = String(params[0]);
      if (!this.cursors.has(name)) this.cursors.set(name, { cursor_value: String(params[1]), updated_at: String(params[2]) });
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE sync_cursors") && sql.includes("AND (cursor_value = ? OR updated_at < ?)")) {
      const token = String(params[0]);
      const updatedAt = String(params[1]);
      const name = String(params[2]);
      const idle = String(params[3]);
      const existing = this.cursors.get(name);
      const changed = existing?.cursor_value === idle;
      if (changed) this.cursors.set(name, { cursor_value: token, updated_at: updatedAt });
      return { meta: { changes: changed ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE sync_cursors") && sql.includes("WHERE cursor_name = ? AND cursor_value = ?")) {
      const value = String(params[0]);
      const updatedAt = String(params[1]);
      const name = String(params[2]);
      this.cursors.set(name, { cursor_value: value, updated_at: updatedAt });
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO message_conversations")) {
      const [provider, key, bookingId, beds24BookingId, channel, lastMessageAt, createdAt, updatedAt] = params;
      const existing = this.conversations.find((conversation) => (
        conversation.provider === provider && conversation.provider_conversation_id === key
      ));
      if (existing) {
        existing.booking_id = existing.booking_id ?? bookingId as number | null;
        existing.beds24_booking_id = existing.beds24_booking_id ?? beds24BookingId as number | null;
        existing.channel = channel === "UNKNOWN" ? existing.channel : String(channel);
        existing.last_message_at = !existing.last_message_at || String(lastMessageAt) > existing.last_message_at
          ? String(lastMessageAt)
          : existing.last_message_at;
        existing.updated_at = String(updatedAt);
      } else {
        this.conversations.push({
          message_conversation_id: this.nextConversationId++,
          provider: "BEDS24",
          provider_conversation_id: String(key),
          booking_id: bookingId as number | null,
          beds24_booking_id: beds24BookingId as number | null,
          channel: String(channel),
          state: "OPEN",
          last_message_at: String(lastMessageAt),
          created_at: String(createdAt),
          updated_at: String(updatedAt),
        });
      }
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO messages")) {
      const provider = String(params[1]);
      const providerMessageId = String(params[2]);
      if (this.messages.some((message) => message.provider === provider && message.provider_message_id === providerMessageId)) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      this.messages.push({
        message_id: this.nextMessageId++,
        message_conversation_id: Number(params[0]),
        provider: "BEDS24",
        provider_message_id: providerMessageId,
        provider_booking_id: params[3] as number | null,
        booking_id: params[4] as number | null,
        beds24_booking_id: params[5] as number | null,
        direction: "INBOUND",
        author: "GUEST",
        received_at: String(params[6]),
        guest_message: String(params[7]),
        language: params[8] as string | null,
        channel: String(params[9]),
        state: String(params[10]),
        association_state: params[11] as "LINKED" | "UNLINKED",
        raw_provider_payload: String(params[12]),
        idempotency_key: String(params[13]),
        created_at: String(params[14]),
        updated_at: String(params[15]),
      });
      return { meta: { changes: 1, last_row_id: this.messages.length } };
    }
    if (sql.includes("INSERT INTO sync_record_issues")) {
      const providerRecordId = String(params[1]);
      const existing = this.issues.find((issue) => issue.sync_type === "messages" && issue.provider_record_id === providerRecordId && issue.issue_type === "failed");
      if (existing) {
        existing.latest_failure_at = String(params[3]);
        existing.attempt_count += 1;
        existing.error_message = String(params[4]);
        existing.status = "pending";
        existing.resolved_at = null;
        existing.updated_at = String(params[6]);
      } else {
        this.issues.push({
          sync_type: String(params[0]),
          issue_type: "failed",
          provider_record_id: providerRecordId,
          first_failure_at: String(params[2]),
          latest_failure_at: String(params[3]),
          attempt_count: 1,
          error_category: "message_import_failed",
          error_message: String(params[4]),
          status: "pending",
          resolved_at: null,
          created_at: String(params[5]),
          updated_at: String(params[6]),
        });
      }
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE sync_record_issues")) {
      const providerRecordId = String(params[3]);
      for (const issue of this.issues) {
        if (issue.sync_type === "messages" && issue.provider_record_id === providerRecordId && issue.status === "pending") {
          issue.status = "resolved";
          issue.resolved_at = String(params[0]);
          issue.updated_at = String(params[1]);
        }
      }
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO sync_cursors") && sql.includes("ON CONFLICT(cursor_name)")) {
      this.cursors.set(String(params[0]), { cursor_value: String(params[1]), updated_at: String(params[2]) });
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO sync_runs")) {
      this.syncRuns.push({
        sync_type: String(params[0]),
        started_at: String(params[1]),
        finished_at: String(params[2]),
        status: sql.includes("'failed'") ? "failed" : String(params[3]),
        records_read: Number(sql.includes("'failed'") ? params[3] : params[4]),
        records_written: Number(sql.includes("'failed'") ? params[4] : params[5]),
        records_failed: Number(sql.includes("'failed'") ? params[5] : params[6]),
        error_message: sql.includes("'failed'") ? String(params[6]) : params[7] as string | null,
      });
      return { meta: { changes: 1, last_row_id: this.syncRuns.length } };
    }
    if (sql.includes("DELETE FROM user_sessions WHERE session_id")) {
      return { meta: { changes: 0, last_row_id: 0 } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }
}

function env(db: FakeMessagesDB, fetcher?: typeof fetch) {
  return {
    DB: db,
    BEDS24_BASE_URL: "https://beds24.test/v2",
    BEDS24_LONG_LIFE_TOKEN: "test-token-not-real",
    fetcher,
  };
}

function guestMessage(id: string, bookingId: number, message = "Hello"): Beds24GuestMessage {
  return {
    id,
    bookingId,
    message,
    source: "guest",
    time: "2026-08-04T09:00:00.000Z",
    language: "en",
  };
}

function jsonResponse(status: number, payload: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

function messagesFetcher(messages: Beds24GuestMessage[]): { fetcher: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    fetcher: async (input) => {
      urls.push(String(input));
      return jsonResponse(200, { success: true, data: messages });
    },
  };
}

test("message normalization accepts nested Beds24 message text and strips HTML", () => {
  const normalized = normalizeBeds24GuestMessage({
    messageID: "msg-nested",
    bookingID: "9001",
    messages: [{ html: "<p>Hello&nbsp;Vanara</p>" }],
    source: "guest",
    time: "2026-08-04T09:00:00.000Z",
    channel: "Booking.com",
  }, NOW);

  assert.ok(normalized);
  assert.equal(normalized.providerMessageId, "msg-nested");
  assert.equal(normalized.providerBookingId, 9001);
  assert.equal(normalized.guestMessage, "Hello Vanara");
  assert.equal(normalized.channel, "BOOKING_COM");
});

test("message normalization accepts non-canonical nested message body fields", () => {
  const normalized = normalizeBeds24GuestMessage({
    id: "msg-provider-shape",
    bookingId: 9001,
    message: {
      type: "text",
      authorOwnerId: 123,
      bodyHtml: "<div>Do you have parking?</div>",
    },
    source: "guest",
    time: "2026-08-04T09:00:00.000Z",
  }, NOW);

  assert.ok(normalized);
  assert.equal(normalized.providerMessageId, "msg-provider-shape");
  assert.equal(normalized.guestMessage, "Do you have parking?");
});

test("message normalization accepts numeric Beds24 message ids", () => {
  const normalized = normalizeBeds24GuestMessage({
    id: 123456789,
    bookingId: 9001,
    message: "Hello Vanara",
    source: "guest",
    time: "2026-08-04T09:00:00.000Z",
  }, NOW);

  assert.ok(normalized);
  assert.equal(normalized.providerMessageId, "123456789");
  assert.equal(normalized.idempotencyKey, "BEDS24:123456789");
});

test("message normalization reports provider payload keys when text is missing", () => {
  assert.throws(
    () => normalizeBeds24GuestMessage({
      id: "bad-1",
      bookingId: 9001,
      source: "guest",
      time: "2026-08-04T09:00:00.000Z",
      unexpected: true,
    }, NOW),
    /Keys: bookingId, id, source, time, unexpected/,
  );
});

test("messages imported, linked and unlinked records are persisted with cursor update", async () => {
  const db = new FakeMessagesDB({
    bookings: [{ booking_id: 1, beds24_booking_id: 9001, channel: "Booking.com", api_source: "Booking.com", language_code: "en" }],
  });
  const { fetcher, urls } = messagesFetcher([
    guestMessage("msg-1", 9001),
    guestMessage("msg-2", 9999, "Unlinked booking"),
  ]);

  const result = await syncMessages(env(db) as never, {
    now: NOW,
    requestOptions: { fetcher, pauseAfterMs: 0, sleep: async () => undefined },
  });

  assert.equal(urls.length, 1);
  const url = new URL(urls[0]!);
  assert.equal(url.pathname, "/v2/bookings/messages");
  assert.equal(url.searchParams.get("source"), BEDS24_MESSAGES_SOURCE);
  assert.equal(url.searchParams.get("maxAge"), String(BEDS24_MESSAGES_MAX_AGE));
  assert.equal(result.endpoint, BEDS24_MESSAGES_ENDPOINT);
  assert.equal(result.recordsRead, 2);
  assert.equal(result.recordsWritten, 2);
  assert.equal(result.recordsLinked, 1);
  assert.equal(result.recordsUnlinked, 1);
  assert.equal(db.messages.length, 2);
  assert.equal(db.messages[0]!.booking_id, 1);
  assert.equal(db.messages[0]!.association_state, "LINKED");
  assert.equal(db.messages[1]!.booking_id, null);
  assert.equal(db.messages[1]!.association_state, "UNLINKED");
  assert.equal(db.cursors.get(MESSAGES_CURSOR_NAME)?.cursor_value, "2026-08-04T09:00:00.000Z");
  assert.equal(db.syncRuns.at(-1)?.status, "success");
});

test("message import does not copy booking language into the guest message language", async () => {
  const db = new FakeMessagesDB({
    bookings: [{ booking_id: 1, beds24_booking_id: 9001, channel: "Booking.com", api_source: "Booking.com", language_code: "it" }],
  });
  const message = guestMessage("msg-language", 9001, "We will arrive from Milan to Bangkok at around 11:00 in the morning.");
  delete message.language;
  const { fetcher } = messagesFetcher([message]);

  await syncMessages(env(db) as never, {
    now: NOW,
    requestOptions: { fetcher, pauseAfterMs: 0, sleep: async () => undefined },
  });

  assert.equal(db.messages.length, 1);
  assert.equal(db.messages[0]!.language, null);
});

test("duplicate provider messages are ignored by provider_message_id", async () => {
  const db = new FakeMessagesDB({
    bookings: [{ booking_id: 1, beds24_booking_id: 9001, channel: "Direct", api_source: "Direct", language_code: null }],
  });
  const { fetcher } = messagesFetcher([guestMessage("msg-1", 9001)]);

  await syncMessages(env(db) as never, {
    now: NOW,
    requestOptions: { fetcher, pauseAfterMs: 0, sleep: async () => undefined },
  });
  const replay = await syncMessages(env(db) as never, {
    now: NOW,
    requestOptions: { fetcher, pauseAfterMs: 0, sleep: async () => undefined },
  });

  assert.equal(db.messages.length, 1);
  assert.equal(replay.recordsWritten, 0);
  assert.equal(replay.recordsDeduplicated, 1);
});

test("provider retry succeeds after a transient Beds24 failure", async () => {
  const db = new FakeMessagesDB();
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse(500, { error: "temporary" }, { "Retry-After": "0" });
    return jsonResponse(200, { success: true, data: [guestMessage("msg-1", 9001)] });
  };

  const result = await syncMessages(env(db) as never, {
    now: NOW,
    requestOptions: { fetcher, pauseAfterMs: 0, sleep: async () => undefined },
  });

  assert.equal(calls, 2);
  assert.equal(result.recordsWritten, 1);
  assert.equal(result.recordsUnlinked, 1);
});

test("provider failure records a failed sync run without writing messages", async () => {
  const db = new FakeMessagesDB();
  const fetcher: typeof fetch = async () => jsonResponse(400, { error: "bad request" });

  await assert.rejects(
    syncMessages(env(db) as never, {
      now: NOW,
      requestOptions: { fetcher, pauseAfterMs: 0, sleep: async () => undefined },
    }),
  );

  assert.equal(db.messages.length, 0);
  assert.equal(db.syncRuns.at(-1)?.status, "failed");
  assert.equal(db.syncRuns.at(-1)?.records_failed, 1);
});

test("malformed provider message records a retryable issue and continues later records", async () => {
  const db = new FakeMessagesDB();
  const { fetcher } = messagesFetcher([
    { id: "bad-1", bookingId: 9001, source: "guest", time: "2026-08-04T09:00:00.000Z" },
    guestMessage("msg-2", 9002),
  ]);

  const result = await syncMessages(env(db) as never, {
    now: NOW,
    requestOptions: { fetcher, pauseAfterMs: 0, sleep: async () => undefined },
  });

  assert.equal(result.recordsRead, 2);
  assert.equal(result.recordsWritten, 1);
  assert.equal(result.recordsFailed, 1);
  assert.equal(db.issues[0]?.provider_record_id, "bad-1");
  assert.equal(db.issues[0]?.status, "pending");
  assert.equal(db.syncRuns.at(-1)?.status, "partial_success");
});

test("GET /api/messages returns imported messages and POST /sync/messages executes sync", async () => {
  const db = new FakeMessagesDB({
    bookings: [{ booking_id: 1, beds24_booking_id: 9001, channel: "Agoda", api_source: "Agoda", language_code: "en" }],
  });
  const { fetcher } = messagesFetcher([guestMessage("msg-1", 9001)]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    const post = await worker.fetch(new Request("https://vanara.test/sync/messages", {
      method: "POST",
      headers: { cookie: "vanara_session=x" },
    }), env(db) as never);
    assert.equal(post.status, 200);
    const postBody = await post.json() as { recordsWritten: number; recordsLinked: number };
    assert.equal(postBody.recordsWritten, 1);
    assert.equal(postBody.recordsLinked, 1);

    const get = await worker.fetch(new Request("https://vanara.test/api/messages", {
      headers: { cookie: "vanara_session=x" },
    }), env(db) as never);
    assert.equal(get.status, 200);
    const getBody = await get.json() as { success: boolean; data: Array<{ providerMessageId: string; associationState: string }> };
    assert.equal(getBody.success, true);
    assert.equal(getBody.data.length, 1);
    assert.equal(getBody.data[0]!.providerMessageId, "msg-1");
    assert.equal(getBody.data[0]!.associationState, "LINKED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST /sync/messages can import messages without generating drafts when explicitly requested", async () => {
  const db = new FakeMessagesDB({
    bookings: [{ booking_id: 1, beds24_booking_id: 9001, channel: "Agoda", api_source: "Agoda", language_code: "en" }],
  });
  const { fetcher } = messagesFetcher([guestMessage("msg-1", 9001)]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    const post = await worker.fetch(new Request("https://vanara.test/sync/messages?generateDrafts=false", {
      method: "POST",
      headers: { cookie: "vanara_session=x" },
    }), env(db) as never);
    assert.equal(post.status, 200);
    const body = await post.json() as { recordsWritten: number; drafts: { attempted: number; generated: number; failed: number } };
    assert.equal(body.recordsWritten, 1);
    assert.deepEqual(body.drafts, { attempted: 0, generated: 0, reused: 0, failed: 0, draftIds: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("messages endpoints reject unauthenticated and non-owner access", async () => {
  const unauthenticated = await worker.fetch(new Request("https://vanara.test/sync/messages", {
    method: "POST",
  }), env(new FakeMessagesDB({ authenticated: false })) as never);
  assert.equal(unauthenticated.status, 401);

  const staff = await worker.fetch(new Request("https://vanara.test/sync/messages", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
  }), env(new FakeMessagesDB({ owner: false })) as never);
  assert.equal(staff.status, 403);
});
