import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import { getPromptChecksum } from "../src/services/message-prompt.service.ts";
import {
  DEFAULT_WARAPORN_VECTOR_STORE_ID,
  generateWarapornDraft,
  OPENAI_RESPONSES_FILE_SEARCH_INCLUDE,
  OPENAI_WARAPORN_DRAFT_MODEL,
  WARAPORN_REQUIRED_RETRIEVAL_FILENAMES,
} from "../src/services/waraporn-draft.service.ts";

const NOW = "2026-08-04T10:00:00.000Z";
const READY_DRAFT_TEXT = "Of course, Khun Daniel. We can help with that.";

type PermissionRow = { module_key: string; can_access: number; can_edit: number };
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
type DraftRow = {
  message_draft_id: number;
  message_id: number;
  message_conversation_id: number;
  booking_id: number | null;
  prompt_key: string;
  prompt_version: string;
  prompt_checksum: string;
  draft_text: string;
  status: "READY";
  model: string;
  vector_store_id: string;
  openai_response_id: string | null;
  context_hash: string;
  runtime_context_json: string | null;
  retrieval_filenames: string;
  retrieval_result_count: number;
  created_at: string;
  updated_at: string;
};
type ConversationRow = {
  message_conversation_id: number;
  state: string;
  updated_at: string;
};
type BookingRow = {
  booking_id: number;
  beds24_booking_id: number;
  guest_name: string | null;
  first_name: string | null;
  arrival_date: string;
  departure_date: string;
  status: string;
  api_source: string | null;
  channel: string | null;
  language_code: string | null;
  unit_id: number | null;
  room_type_id: number;
};

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
  constructor(private db: FakeWarapornDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

class FakeWarapornDB {
  messages: MessageRow[] = [];
  drafts: DraftRow[] = [];
  conversations: ConversationRow[] = [{ message_conversation_id: 1, state: "OPEN", updated_at: NOW }];
  bookings: BookingRow[] = [{
    booking_id: 1,
    beds24_booking_id: 9001,
    guest_name: "Daniel Padurariu",
    first_name: "Daniel",
    arrival_date: "2026-12-28",
    departure_date: "2027-01-01",
    status: "Confirmed",
    api_source: "Agoda",
    channel: "Agoda",
    language_code: "en",
    unit_id: 1,
    room_type_id: 1,
  }];
  nextDraftId = 1;
  authenticated = true;
  owner = true;

  constructor(options: { authenticated?: boolean; owner?: boolean; linked?: boolean } = {}) {
    this.authenticated = options.authenticated ?? true;
    this.owner = options.owner ?? true;
    const linked = options.linked ?? true;
    this.messages = [{
      message_id: 1,
      message_conversation_id: 1,
      provider: "BEDS24",
      provider_message_id: "provider-message-1",
      provider_booking_id: linked ? 9001 : 9999,
      booking_id: linked ? 1 : null,
      beds24_booking_id: linked ? 9001 : 9999,
      direction: "INBOUND",
      author: "GUEST",
      received_at: "2026-08-04T09:00:00.000Z",
      guest_message: "Can we have a late check-in?",
      language: "en",
      channel: "AGODA",
      state: linked ? "ASSOCIATED" : "UNLINKED",
      association_state: linked ? "LINKED" : "UNLINKED",
      raw_provider_payload: "{}",
      idempotency_key: "BEDS24:provider-message-1",
      created_at: NOW,
      updated_at: NOW,
    }];
  }

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(stmts.map((stmt) => stmt.run()));
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT s.session_id")) {
      return (this.authenticated ? OWNER_ROW : null) as T | null;
    }
    if (sql.includes("FROM message_drafts") && sql.includes("WHERE message_id = ?")) {
      const messageId = Number(params[0]);
      const draft = this.drafts.find((item) => item.message_id === messageId && item.status === "READY") ?? null;
      return draft as T | null;
    }
    if (sql.includes("FROM messages m") && sql.includes("LEFT JOIN bookings b") && sql.includes("WHERE m.message_id = ?")) {
      const messageId = Number(params[0]);
      const message = this.messages.find((item) => item.message_id === messageId);
      if (!message) return null;
      const booking = this.bookings.find((item) => item.booking_id === message.booking_id) ?? null;
      return {
        message_id: message.message_id,
        message_conversation_id: message.message_conversation_id,
        provider: message.provider,
        booking_id: message.booking_id,
        beds24_booking_id: message.beds24_booking_id,
        guest_message: message.guest_message,
        received_at: message.received_at,
        language: message.language,
        channel: message.channel,
        booking_status: booking?.status ?? null,
        booking_source: booking?.api_source ?? null,
        booking_channel: booking?.channel ?? null,
        booking_language_code: booking?.language_code ?? null,
        guest_name: booking?.guest_name ?? null,
        first_name: booking?.first_name ?? null,
        arrival_date: booking?.arrival_date ?? null,
        departure_date: booking?.departure_date ?? null,
        unit_name: booking ? "Bungalow 1" : null,
        unit_type: booking ? "bungalow" : null,
        room_type_name: booking ? "Garden Bungalow" : null,
        room_name: booking ? "Bungalow" : null,
      } as T;
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
    if (sql.includes("FROM unit_availability_cache uac")) {
      const stayDates = params.filter((value): value is string => typeof value === "string");
      return {
        results: stayDates.map((stayDate) => ({
          unit_id: 1,
          unit_name: "Bungalow 1",
          beds24_unit_id: 1001,
          unit_type: "bungalow",
          position: 1,
          room_type_id: 1,
          room_type_name: "Garden Bungalow",
          room_name: "Bungalow",
          beds24_room_id: 501,
          stay_date: stayDate,
          availability: 1,
          closed: 0,
        })) as T[],
      };
    }
    if (sql.includes("FROM offer_prices")) {
      const stayDates = params.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
      return {
        results: stayDates.map((stayDate, index) => ({
          room_type_id: 1,
          offer_id: 10,
          beds24_offer_id: 20,
          arrival_date: stayDate,
          departure_date: new Date(Date.parse(`${stayDate}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10),
          price: 2500 + index * 100,
        })) as T[],
      };
    }
    if (sql.includes("SELECT m.message_id") && sql.includes("d.message_draft_id IS NULL")) {
      return {
        results: this.messages
          .filter((message) => !this.drafts.some((draft) => draft.message_id === message.message_id && draft.status === "READY"))
          .map((message) => ({ message_id: message.message_id }))
          .slice(0, Number(params[0])) as T[],
      };
    }
    if (sql.includes("d.draft_text") && sql.includes("WHERE m.message_conversation_id = ?")) {
      const conversationId = Number(params[0]);
      return {
        results: this.messages
          .filter((message) => message.message_conversation_id === conversationId)
          .map((message) => ({
            message_id: message.message_id,
            received_at: message.received_at,
            guest_message: message.guest_message,
            draft_text: this.drafts.find((draft) => draft.message_id === message.message_id)?.draft_text ?? null,
          })) as T[],
      };
    }
    if (sql.includes("FROM messages m") && sql.includes("ORDER BY m.received_at DESC")) {
      const limit = Number(params[0]);
      return {
        results: this.messages.slice(0, limit).map((message) => {
          const draft = this.drafts.find((item) => item.message_id === message.message_id && item.status === "READY") ?? null;
          return {
            ...message,
            draft_id: draft?.message_draft_id ?? null,
            draft_status: draft?.status ?? null,
          };
        }) as T[],
      };
    }
    return { results: [] as T[] };
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO message_drafts")) {
      const messageId = Number(params[0]);
      if (this.drafts.some((draft) => draft.message_id === messageId)) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      this.drafts.push({
        message_draft_id: this.nextDraftId++,
        message_id: messageId,
        message_conversation_id: Number(params[1]),
        booking_id: params[2] as number | null,
        prompt_key: String(params[3]),
        prompt_version: String(params[4]),
        prompt_checksum: String(params[5]),
        draft_text: String(params[6]),
        status: "READY",
        model: String(params[7]),
        vector_store_id: String(params[8]),
        openai_response_id: params[9] as string | null,
        context_hash: String(params[10]),
        runtime_context_json: params[11] as string | null,
        retrieval_filenames: String(params[12]),
        retrieval_result_count: Number(params[13]),
        created_at: String(params[14]),
        updated_at: String(params[15]),
      });
      return { meta: { changes: 1, last_row_id: this.drafts.length } };
    }
    if (sql.includes("UPDATE messages SET state = 'DRAFT_READY'")) {
      const message = this.messages.find((item) => item.message_id === Number(params[1]));
      if (message) {
        message.state = "DRAFT_READY";
        message.updated_at = String(params[0]);
      }
      return { meta: { changes: message ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE message_conversations")) {
      const conversation = this.conversations.find((item) => item.message_conversation_id === Number(params[1]));
      if (conversation) {
        conversation.state = "DRAFT_READY";
        conversation.updated_at = String(params[0]);
      }
      return { meta: { changes: conversation ? 1 : 0, last_row_id: 0 } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }
}

function env(db: FakeWarapornDB, fetcher?: typeof fetch) {
  return {
    DB: db,
    OPENAI_API_KEY: "test-openai-key",
    WARAPORN_VECTOR_STORE_ID: DEFAULT_WARAPORN_VECTOR_STORE_ID,
    BEDS24_BASE_URL: "https://beds24.test/v2",
    BEDS24_LONG_LIFE_TOKEN: "test-token-not-real",
    fetcher,
  };
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status });
}

function openAiFetcher(outputText = READY_DRAFT_TEXT): { fetcher: typeof fetch; bodies: Array<Record<string, unknown>> } {
  const bodies: Array<Record<string, unknown>> = [];
  return {
    bodies,
    fetcher: async (_input, init) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse(200, {
        id: "resp-test-1",
        output_text: outputText,
        output: [{
          id: "fs-test-1",
          type: "file_search_call",
          status: "completed",
          queries: ["Waraporn character identity"],
          results: WARAPORN_REQUIRED_RETRIEVAL_FILENAMES.map((filename, index) => ({
            file_id: `file-${index + 1}`,
            filename,
            score: 0.9,
            text: `Retrieved ${filename}`,
          })),
        }],
      });
    },
  };
}

function requestText(body: Record<string, unknown>): string {
  const input = body.input as Array<{ content: Array<{ text: string }> }>;
  return input[0]!.content.map((item) => item.text).join("\n");
}

test("message generates one draft and stores it with the frozen prompt checksum", async () => {
  const db = new FakeWarapornDB();
  const { fetcher, bodies } = openAiFetcher();

  const draft = await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  assert.equal(draft.state, "READY");
  assert.equal(draft.body, READY_DRAFT_TEXT);
  assert.equal(draft.promptChecksum, getPromptChecksum());
  assert.equal(db.drafts.length, 1);
  assert.equal(db.drafts[0]!.prompt_checksum, getPromptChecksum());
  assert.equal(db.drafts[0]!.retrieval_result_count, WARAPORN_REQUIRED_RETRIEVAL_FILENAMES.length);
  assert.deepEqual(JSON.parse(db.drafts[0]!.retrieval_filenames), [...WARAPORN_REQUIRED_RETRIEVAL_FILENAMES]);
  assert.equal(db.messages[0]!.state, "DRAFT_READY");
  assert.equal(db.conversations[0]!.state, "DRAFT_READY");
  assert.equal(bodies.length, 1);
});

test("Waraporn draft request attaches the Make vector store at Responses API level", async () => {
  const db = new FakeWarapornDB();
  const { fetcher, bodies } = openAiFetcher();

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  const body = bodies[0]!;
  assert.equal(body.model, OPENAI_WARAPORN_DRAFT_MODEL);
  assert.equal(body.store, true);
  assert.deepEqual(body.include, [...OPENAI_RESPONSES_FILE_SEARCH_INCLUDE]);
  assert.deepEqual(body.tools, [{
    type: "file_search",
    vector_store_ids: [DEFAULT_WARAPORN_VECTOR_STORE_ID],
    max_num_results: 50,
  }]);
  assert.equal(body.tool_choice, "required");
});

test("Waraporn draft request carries the complete verified runtime envelope", async () => {
  const db = new FakeWarapornDB();
  db.messages[0]!.guest_message = "Can we extend one more night and what is the price?";
  const { fetcher, bodies } = openAiFetcher();

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  const text = requestText(bodies[0]!);
  assert.match(text, /GUEST FIRST NAME\s+Daniel/);
  assert.match(text, /CHECK-IN DATE\s+2026-12-28/);
  assert.match(text, /CHECK-OUT DATE\s+2027-01-01/);
  assert.match(text, /CONVERSATION CONTEXT\s+No previous conversation history stored in Vanara\./);
  assert.match(text, /CURRENT GUEST MESSAGE\s+Can we extend one more night and what is the price\?/);
  assert.match(text, /CURRENT BANGKOK DATE\s+2026-08-04/);
  assert.match(text, /CURRENT BANGKOK TIME\s+17:00/);
  assert.match(text, /TRAVEL PHASE\s+pre-arrival/);
  assert.match(text, /BOOKING STATUS\s+Confirmed/);
  assert.match(text, /GUEST LANGUAGE\s+en/);
  assert.match(text, /PROVIDER\s+BEDS24/);
  assert.match(text, /CHANNEL\s+AGODA/);
  assert.match(text, /BOOKING SOURCE\s+Agoda/);
  assert.match(text, /ACCOMMODATION TYPE\s+Bungalow/);
  assert.match(text, /PHYSICAL UNIT\s+Bungalow 1/);
  assert.match(text, /VERIFIED AVAILABILITY AND PRICES STATUS\s+USED/);
  assert.match(text, /Beds24 verified commercial cache/);
  assert.match(text, /Bungalow: 1\/1 available/);
  for (const filename of WARAPORN_REQUIRED_RETRIEVAL_FILENAMES) assert.match(text, new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const storedContext = JSON.parse(db.drafts[0]!.runtime_context_json ?? "{}") as Record<string, unknown>;
  assert.equal(storedContext.currentBangkokDate, "2026-08-04");
  assert.equal(storedContext.travelPhase, "pre-arrival");
  assert.equal(storedContext.availabilityPricesStatus, "USED");
});

test("availability and prices context is explicit when not applicable", async () => {
  const db = new FakeWarapornDB();
  const { fetcher, bodies } = openAiFetcher();

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  const text = requestText(bodies[0]!);
  assert.match(text, /VERIFIED AVAILABILITY AND PRICES STATUS\s+NOT_APPLICABLE/);
  assert.match(text, /Not applicable to the current guest message\./);
});

test("missing mandatory file search retrieval prevents a READY draft", async () => {
  const db = new FakeWarapornDB();
  let calls = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    calls += 1;
    assert.deepEqual((JSON.parse(String(init.body)) as Record<string, unknown>).include, [...OPENAI_RESPONSES_FILE_SEARCH_INCLUDE]);
    return jsonResponse(200, {
      id: "resp-test-missing-retrieval",
      output_text: READY_DRAFT_TEXT,
      output: [{
        id: "fs-test-1",
        type: "file_search_call",
        status: "completed",
        results: [{
          file_id: "file-other",
          filename: "Other_File.md",
          score: 0.5,
          text: "Wrong file",
        }],
      }],
    });
  };

  await assert.rejects(
    generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW }),
    /retrieval verification failed/i,
  );
  assert.equal(db.drafts.length, 0);
  assert.equal(db.messages[0]!.state, "ASSOCIATED");
  assert.equal(calls, 3);
});

test("missing mandatory retrieval is retried with exact filenames before saving READY", async () => {
  const db = new FakeWarapornDB();
  const bodies: Array<Record<string, unknown>> = [];
  let calls = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    calls += 1;
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    const filenames = calls === 1
      ? WARAPORN_REQUIRED_RETRIEVAL_FILENAMES.slice(0, 2)
      : [...WARAPORN_REQUIRED_RETRIEVAL_FILENAMES];

    return jsonResponse(200, {
      id: `resp-test-retry-${calls}`,
      output_text: READY_DRAFT_TEXT,
      output: [{
        id: `fs-test-retry-${calls}`,
        type: "file_search_call",
        status: "completed",
        results: filenames.map((filename, index) => ({
          file_id: `file-${index + 1}`,
          filename,
          score: 0.9,
          text: `Retrieved ${filename}`,
        })),
      }],
    });
  };

  const draft = await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  assert.equal(draft.state, "READY");
  assert.equal(calls, 2);
  assert.equal(db.drafts.length, 1);
  assert.deepEqual(JSON.parse(db.drafts[0]!.retrieval_filenames), [...WARAPORN_REQUIRED_RETRIEVAL_FILENAMES]);
  const retryText = requestText(bodies[1]!);
  assert.match(retryText, /RETRIEVAL RETRY REQUIRED FILENAMES/);
  assert.match(retryText, /Guest_Information_Relevance_Filter\.md/);
  assert.match(retryText, /Waraporn_Conversational_Instincts\.md/);
});

test("second generate call reuses an existing READY draft without calling OpenAI again", async () => {
  const db = new FakeWarapornDB();
  const { fetcher, bodies } = openAiFetcher();
  const bindings = env(db, fetcher) as never;

  const first = await generateWarapornDraft(bindings, 1, { now: NOW });
  const replay = await generateWarapornDraft(bindings, 1, { now: NOW });

  assert.equal(first.draftId, replay.draftId);
  assert.equal(db.drafts.length, 1);
  assert.equal(bodies.length, 1);
});

test("OpenAI failure is handled without storing a draft", async () => {
  const db = new FakeWarapornDB();
  const fetcher: typeof fetch = async () => jsonResponse(500, { error: { message: "temporary model failure" } });

  await assert.rejects(
    generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW }),
    /temporary model failure/,
  );

  assert.equal(db.drafts.length, 0);
});

test("malformed AI response is rejected without storing a draft", async () => {
  const db = new FakeWarapornDB();
  const fetcher: typeof fetch = async () => jsonResponse(200, { output: [] });

  await assert.rejects(
    generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW }),
    /draft text/,
  );

  assert.equal(db.drafts.length, 0);
});

test("GET /api/messages reports draft status without exposing draft body", async () => {
  const db = new FakeWarapornDB();
  const { fetcher } = openAiFetcher();
  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  const get = await worker.fetch(new Request("https://vanara.test/api/messages", {
    headers: { cookie: "vanara_session=x" },
  }), env(db, fetcher) as never);

  assert.equal(get.status, 200);
  const body = await get.json() as { success: boolean; data: Array<Record<string, unknown>> };
  assert.equal(body.success, true);
  assert.equal(body.data[0]!.draftExists, true);
  assert.equal(body.data[0]!.draftStatus, "READY");
  assert.equal(body.data[0]!.draftId, "1");
  assert.equal("draftText" in body.data[0]!, false);
  assert.equal("draft_text" in body.data[0]!, false);
});

test("POST /api/messages/:messageId/generate creates and replays a READY draft", async () => {
  const db = new FakeWarapornDB();
  const { fetcher, bodies } = openAiFetcher();
  const bindings = env(db, fetcher) as never;

  const first = await worker.fetch(new Request("https://vanara.test/api/messages/1/generate", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
  }), bindings);
  const replay = await worker.fetch(new Request("https://vanara.test/api/messages/1/generate", {
    method: "POST",
    headers: { cookie: "vanara_session=x" },
  }), bindings);

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal(db.drafts.length, 1);
  assert.equal(bodies.length, 1);
  const firstBody = await first.json() as { data: { draftId: string; state: string } };
  const replayBody = await replay.json() as { data: { draftId: string; state: string } };
  assert.equal(firstBody.data.draftId, replayBody.data.draftId);
  assert.equal(replayBody.data.state, "READY");
});
