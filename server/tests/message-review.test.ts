import assert from "node:assert/strict";
import test from "node:test";

import { canReviewGuestMessages, approveMessageDraft, editMessageDraft, rejectMessageDraft } from "../src/services/message-review.service.ts";
import type { CurrentUser } from "../src/services/current-user.service.ts";

const NOW = "2026-08-04T10:00:00.000Z";

type MessageRow = {
  message_id: number;
  message_conversation_id: number;
  provider: "BEDS24";
  provider_message_id: string;
  provider_booking_id: number | null;
  booking_id: number | null;
  beds24_booking_id: number | null;
  direction: "INBOUND" | "OUTBOUND";
  author: "GUEST" | "WARAPORN" | "STAFF" | "PROVIDER";
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

type DraftRow = {
  message_draft_id: number;
  message_id: number;
  message_conversation_id: number;
  booking_id: number | null;
  prompt_key: "waraporn-general-requests-v4-rc3";
  prompt_version: string;
  prompt_checksum: string;
  draft_text: string;
  status: "READY" | "FAILED" | "REJECTED" | "APPROVED" | "SENT";
  model: string;
  vector_store_id: string;
  openai_response_id: string | null;
  context_hash: string;
  retrieval_filenames: string;
  retrieval_result_count: number;
  original_draft_text: string | null;
  edited_draft_text: string | null;
  edited_by: string | null;
  edited_by_name: string | null;
  edited_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  sent_at: string | null;
  beds24_message_id: string | null;
  provider_response_id: string | null;
  delivery_idempotency_key: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
};

type ConversationRow = {
  message_conversation_id: number;
  state: string;
  last_message_at: string | null;
  updated_at: string;
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeReviewDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

class FakeReviewDB {
  messages: MessageRow[] = [{
    message_id: 1,
    message_conversation_id: 1,
    provider: "BEDS24",
    provider_message_id: "inbound-1",
    provider_booking_id: 9001,
    booking_id: 1,
    beds24_booking_id: 9001,
    direction: "INBOUND",
    author: "GUEST",
    received_at: "2026-08-04T09:00:00.000Z",
    guest_message: "Can we arrange a transfer?",
    language: "en",
    channel: "BOOKING_COM",
    state: "DRAFT_READY",
    association_state: "LINKED",
    raw_provider_payload: "{}",
    idempotency_key: "BEDS24:inbound-1",
    created_at: NOW,
    updated_at: NOW,
  }];
  drafts: DraftRow[] = [draftRow("Of course, we can help arrange that.")];
  conversations: ConversationRow[] = [{
    message_conversation_id: 1,
    state: "DRAFT_READY",
    last_message_at: "2026-08-04T09:00:00.000Z",
    updated_at: NOW,
  }];

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(stmts.map((stmt) => stmt.run()));
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("FROM message_drafts d") && sql.includes("INNER JOIN messages m")) {
      const draftId = Number(params[0]);
      const draft = this.drafts.find((item) => item.message_draft_id === draftId);
      if (!draft) return null;
      const message = this.messages.find((item) => item.message_id === draft.message_id);
      return {
        ...draft,
        beds24_booking_id: message?.beds24_booking_id ?? null,
        provider: message?.provider ?? "BEDS24",
        channel: message?.channel ?? "UNKNOWN",
      } as T;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("SET original_draft_text = COALESCE")) {
      const draft = this.readyDraft(Number(params[6]));
      if (!draft) return { meta: { changes: 0, last_row_id: 0 } };
      draft.original_draft_text = draft.original_draft_text ?? draft.draft_text;
      draft.edited_draft_text = String(params[0]);
      draft.draft_text = String(params[1]);
      draft.edited_by = String(params[2]);
      draft.edited_by_name = String(params[3]);
      draft.edited_at = String(params[4]);
      draft.updated_at = String(params[5]);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("SET status = 'REJECTED'")) {
      const draft = this.readyDraft(Number(params[5]));
      if (!draft) return { meta: { changes: 0, last_row_id: 0 } };
      draft.status = "REJECTED";
      draft.rejected_by = String(params[0]);
      draft.rejected_by_name = String(params[1]);
      draft.rejected_at = String(params[2]);
      draft.rejection_reason = params[3] as string | null;
      draft.updated_at = String(params[4]);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("SET status = 'APPROVED'")) {
      const draft = this.readyDraft(Number(params[5]));
      if (!draft) return { meta: { changes: 0, last_row_id: 0 } };
      draft.status = "APPROVED";
      draft.approved_by = String(params[0]);
      draft.approved_by_name = String(params[1]);
      draft.approved_at = String(params[2]);
      draft.delivery_idempotency_key = String(params[3]);
      draft.updated_at = String(params[4]);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO messages") && sql.includes("'OUTBOUND'")) {
      if (this.messages.some((message) => message.idempotency_key === params[9])) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      this.messages.push({
        message_id: this.messages.length + 1,
        message_conversation_id: Number(params[0]),
        provider: "BEDS24",
        provider_message_id: String(params[1]),
        provider_booking_id: params[2] as number | null,
        booking_id: params[3] as number | null,
        beds24_booking_id: params[4] as number | null,
        direction: "OUTBOUND",
        author: "WARAPORN",
        received_at: String(params[5]),
        guest_message: String(params[6]),
        language: null,
        channel: String(params[7]),
        state: "SENT",
        association_state: "LINKED",
        raw_provider_payload: String(params[8]),
        idempotency_key: String(params[9]),
        created_at: String(params[10]),
        updated_at: String(params[11]),
      });
      return { meta: { changes: 1, last_row_id: this.messages.length } };
    }
    if (sql.includes("SET status = 'SENT'")) {
      const draft = this.drafts.find((item) => item.message_draft_id === Number(params[4]) && item.status === "APPROVED");
      if (!draft) return { meta: { changes: 0, last_row_id: 0 } };
      draft.status = "SENT";
      draft.sent_at = String(params[0]);
      draft.beds24_message_id = params[1] as string | null;
      draft.provider_response_id = params[2] as string | null;
      draft.failure_code = null;
      draft.failure_message = null;
      draft.updated_at = String(params[3]);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE messages SET state = 'SENT'")) {
      const message = this.messages.find((item) => item.message_id === Number(params[1]));
      if (message) {
        message.state = "SENT";
        message.updated_at = String(params[0]);
      }
      return { meta: { changes: message ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE messages SET state = 'REVIEW_PENDING'")) {
      const message = this.messages.find((item) => item.message_id === Number(params[1]));
      if (message) {
        message.state = "REVIEW_PENDING";
        message.updated_at = String(params[0]);
      }
      return { meta: { changes: message ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE message_conversations")) {
      const conversationId = Number(params.at(-1));
      const conversation = this.conversations.find((item) => item.message_conversation_id === conversationId);
      if (conversation) {
        conversation.state = sql.includes("state = 'SENT'") ? "SENT" : "OPEN";
        conversation.last_message_at = sql.includes("last_message_at = ?") ? String(params[0]) : conversation.last_message_at;
        conversation.updated_at = String(params[sql.includes("last_message_at = ?") ? 1 : 0]);
      }
      return { meta: { changes: conversation ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("failure_code = 'beds24_delivery_failed'")) {
      const draft = this.drafts.find((item) => item.message_draft_id === Number(params[2]) && item.status === "APPROVED");
      if (draft) {
        draft.failure_code = "beds24_delivery_failed";
        draft.failure_message = String(params[0]);
        draft.updated_at = String(params[1]);
      }
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }

  private readyDraft(draftId: number): DraftRow | null {
    return this.drafts.find((item) => item.message_draft_id === draftId && item.status === "READY") ?? null;
  }
}

function draftRow(body: string): DraftRow {
  return {
    message_draft_id: 1,
    message_id: 1,
    message_conversation_id: 1,
    booking_id: 1,
    prompt_key: "waraporn-general-requests-v4-rc3",
    prompt_version: "v4-rc3",
    prompt_checksum: "1534c2d9654b2ccca292784110d31b7a6aa739fb498709913bd3278ca5e6848e",
    draft_text: body,
    status: "READY",
    model: "gpt-5.5",
    vector_store_id: "vs_test",
    openai_response_id: "resp_test",
    context_hash: "hash",
    retrieval_filenames: "[]",
    retrieval_result_count: 0,
    original_draft_text: null,
    edited_draft_text: null,
    edited_by: null,
    edited_by_name: null,
    edited_at: null,
    approved_by: null,
    approved_by_name: null,
    approved_at: null,
    rejected_by: null,
    rejected_by_name: null,
    rejected_at: null,
    rejection_reason: null,
    sent_at: null,
    beds24_message_id: null,
    provider_response_id: null,
    delivery_idempotency_key: null,
    failure_code: null,
    failure_message: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

function user(role: CurrentUser["role"], options: { messagesEdit?: boolean; ownerView?: boolean } = {}): CurrentUser {
  return {
    id: `${role.toLowerCase()}-1`,
    displayName: role === "Owner" ? "Stefano" : role,
    fullName: role,
    profilePhotoUrl: null,
    role,
    preferredLanguage: "en",
    username: role.toLowerCase(),
    email: null,
    status: "active",
    views: options.ownerView ? ["owner", "staff"] : ["staff"],
    permissions: options.messagesEdit ? [{ module: "messages", canAccess: true, canEdit: true }] : [],
    actionPermissions: [],
    lastLoginAt: null,
  };
}

function env(db: FakeReviewDB) {
  return {
    DB: db,
    BEDS24_BASE_URL: "https://api.beds24.test/v2",
    BEDS24_LONG_LIFE_TOKEN: "secret",
  };
}

function beds24Fetcher(calls: unknown[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/authentication/token")) {
      return new Response(JSON.stringify({ data: { token: "beds24-access-token" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    calls.push(JSON.parse(String(init?.body ?? "null")) as unknown);
    return new Response(JSON.stringify([{ id: "beds24-message-1", responseId: "response-1" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function failingThenSuccessfulBeds24Fetcher(calls: unknown[]) {
  let postAttempts = 0;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/authentication/token")) {
      return new Response(JSON.stringify({ data: { token: "beds24-access-token" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    postAttempts += 1;
    calls.push(JSON.parse(String(init?.body ?? "null")) as unknown);
    if (postAttempts === 1) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify([{ id: "beds24-message-1", responseId: "response-1" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("approve sends the stored READY draft to Beds24 exactly once", async () => {
  const db = new FakeReviewDB();
  const calls: unknown[] = [];
  const result = await approveMessageDraft(env(db) as never, 1, user("Owner", { ownerView: true }), { now: NOW, requestOptions: { fetcher: beds24Fetcher(calls) } });

  assert.equal(result.state, "SENT");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [{ bookingId: 9001, message: "Of course, we can help arrange that." }]);
  assert.equal(db.drafts[0]!.status, "SENT");
  assert.equal(db.messages.filter((message) => message.direction === "OUTBOUND").length, 1);
});

test("duplicate approve replays SENT state without a second Beds24 outbound", async () => {
  const db = new FakeReviewDB();
  const calls: unknown[] = [];
  const api = env(db) as never;

  await approveMessageDraft(api, 1, user("Owner", { ownerView: true }), { now: NOW, requestOptions: { fetcher: beds24Fetcher(calls) } });
  const replay = await approveMessageDraft(api, 1, user("Owner", { ownerView: true }), { now: NOW, requestOptions: { fetcher: beds24Fetcher(calls) } });

  assert.equal(replay.state, "SENT");
  assert.equal(calls.length, 1);
  assert.equal(db.messages.filter((message) => message.direction === "OUTBOUND").length, 1);
});

test("approve can retry a failed Beds24 delivery without duplicating the outbound row", async () => {
  const db = new FakeReviewDB();
  const calls: unknown[] = [];
  const api = env(db) as never;

  await assert.rejects(
    approveMessageDraft(api, 1, user("Owner", { ownerView: true }), { now: NOW, requestOptions: { fetcher: failingThenSuccessfulBeds24Fetcher(calls) } }),
    /Beds24 API request failed with HTTP 401/,
  );
  assert.equal(db.drafts[0]!.status, "APPROVED");
  assert.equal(db.drafts[0]!.failure_code, "beds24_delivery_failed");

  const sent = await approveMessageDraft(api, 1, user("Owner", { ownerView: true }), { now: NOW, requestOptions: { fetcher: beds24Fetcher(calls) } });

  assert.equal(sent.state, "SENT");
  assert.equal(calls.length, 2);
  assert.equal(db.messages.filter((message) => message.direction === "OUTBOUND").length, 1);
  assert.equal(db.drafts[0]!.failure_code, null);
});

test("edit updates draft text and approve sends the edited version", async () => {
  const db = new FakeReviewDB();
  const calls: unknown[] = [];
  const api = env(db) as never;

  const edited = await editMessageDraft(api, 1, user("Manager"), "Updated transfer answer.", { now: NOW });
  assert.equal(edited.body, "Updated transfer answer.");
  assert.equal(db.drafts[0]!.original_draft_text, "Of course, we can help arrange that.");

  await approveMessageDraft(api, 1, user("Manager"), { now: NOW, requestOptions: { fetcher: beds24Fetcher(calls) } });
  assert.deepEqual(calls[0], [{ bookingId: 9001, message: "Updated transfer answer." }]);
  assert.equal(db.drafts[0]!.edited_by_name, "Manager");
});

test("reject never calls Beds24 and keeps the conversation needing reply", async () => {
  const db = new FakeReviewDB();
  const calls: unknown[] = [];
  const rejected = await rejectMessageDraft(env(db) as never, 1, user("Reception", { messagesEdit: true }), "Needs manual rewrite.", { now: NOW, requestOptions: { fetcher: beds24Fetcher(calls) } });

  assert.equal(rejected.state, "REJECTED");
  assert.equal(calls.length, 0);
  assert.equal(db.drafts[0]!.rejection_reason, "Needs manual rewrite.");
  assert.equal(db.messages[0]!.state, "REVIEW_PENDING");
  assert.equal(db.conversations[0]!.state, "OPEN");
});

test("messages review permissions match the approved Staff Owner model", () => {
  assert.equal(canReviewGuestMessages(user("Owner", { ownerView: true })), true);
  assert.equal(canReviewGuestMessages(user("Manager")), true);
  assert.equal(canReviewGuestMessages(user("Reception", { messagesEdit: true })), true);
  assert.equal(canReviewGuestMessages(user("Reception")), false);
  assert.equal(canReviewGuestMessages(user("Housekeeping")), false);
  assert.equal(canReviewGuestMessages(user("Maintenance")), false);
});
