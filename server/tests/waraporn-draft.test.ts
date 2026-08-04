import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import { getPromptChecksum } from "../src/services/message-prompt.service.ts";
import {
  DEFAULT_WARAPORN_VECTOR_STORE_ID,
  generatePendingWarapornDrafts,
  generateWarapornDraft,
  OPENAI_RESPONSES_FILE_SEARCH_INCLUDE,
  OPENAI_WARAPORN_DRAFT_MODEL,
  WARAPORN_FOUNDATION_RETRIEVAL_FILENAMES,
  WARAPORN_REQUIRED_RETRIEVAL_FILENAMES,
  WARAPORN_SINGLE_REQUEST_FOUNDATION_INSTRUCTION,
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
  status: "READY" | "FAILED";
  model: string;
  vector_store_id: string;
  openai_response_id: string | null;
  context_hash: string;
  runtime_context_json: string | null;
  retrieval_filenames: string;
  retrieval_result_count: number;
  openai_request_count: number;
  openai_input_tokens: number;
  openai_cached_input_tokens: number;
  openai_output_tokens: number;
  openai_reasoning_tokens: number;
  openai_total_tokens: number;
  openai_elapsed_ms: number;
  estimated_cost_usd: number;
  failure_code: string | null;
  failure_message: string | null;
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
          .filter((message) => !this.drafts.some((draft) => draft.message_id === message.message_id))
          .filter((message) => sql.includes("m.state = 'ASSOCIATED'") ? message.state === "ASSOCIATED" : true)
          .filter((message) => sql.includes("m.association_state = 'LINKED'") ? message.association_state === "LINKED" : true)
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
    if (sql.includes("UPDATE messages") && sql.includes("state = 'GENERATING'")) {
      const messageId = Number(params[1]);
      const message = this.messages.find((item) => item.message_id === messageId);
      const hasDraft = this.drafts.some((draft) => draft.message_id === messageId);
      if (!message || message.state !== "ASSOCIATED" || message.association_state !== "LINKED" || hasDraft) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      message.state = "GENERATING";
      message.updated_at = String(params[0]);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO message_drafts")) {
      const messageId = Number(params[0]);
      if (this.drafts.some((draft) => draft.message_id === messageId)) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      const failed = sql.includes("'FAILED'");
      this.drafts.push({
        message_draft_id: this.nextDraftId++,
        message_id: messageId,
        message_conversation_id: Number(params[1]),
        booking_id: params[2] as number | null,
        prompt_key: String(params[3]),
        prompt_version: String(params[4]),
        prompt_checksum: String(params[5]),
        draft_text: failed ? "" : String(params[6]),
        status: failed ? "FAILED" : "READY",
        model: String(params[failed ? 6 : 7]),
        vector_store_id: String(params[failed ? 7 : 8]),
        openai_response_id: failed ? null : params[9] as string | null,
        context_hash: String(params[failed ? 8 : 10]),
        runtime_context_json: params[failed ? 9 : 11] as string | null,
        retrieval_filenames: failed ? "[]" : String(params[12]),
        retrieval_result_count: failed ? 0 : Number(params[13]),
        openai_request_count: failed ? Number(params[10]) : 1,
        openai_input_tokens: failed ? 0 : Number(params[14]),
        openai_cached_input_tokens: failed ? 0 : Number(params[15]),
        openai_output_tokens: failed ? 0 : Number(params[16]),
        openai_reasoning_tokens: failed ? 0 : Number(params[17]),
        openai_total_tokens: failed ? 0 : Number(params[18]),
        openai_elapsed_ms: failed ? 0 : Number(params[19]),
        estimated_cost_usd: failed ? 0 : Number(params[20]),
        failure_code: failed ? String(params[11]) : null,
        failure_message: failed ? String(params[12]) : null,
        created_at: String(params[failed ? 13 : 21]),
        updated_at: String(params[failed ? 14 : 22]),
      });
      return { meta: { changes: 1, last_row_id: this.drafts.length } };
    }
    if (sql.includes("UPDATE messages") && sql.includes("state = 'FAILED_MANUAL_RETRY'")) {
      const message = this.messages.find((item) => item.message_id === Number(params[1]));
      if (message && message.state !== "DRAFT_READY") {
        message.state = "FAILED_MANUAL_RETRY";
        message.updated_at = String(params[0]);
      }
      return { meta: { changes: message ? 1 : 0, last_row_id: 0 } };
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

function openAiFileSearchPayload(id: string, outputText: string, filenames: readonly string[]): Record<string, unknown> {
  return {
    id,
    output_text: outputText,
    usage: {
      input_tokens: 1200,
      input_tokens_details: { cached_tokens: 200 },
      output_tokens: 100,
      output_tokens_details: { reasoning_tokens: 40 },
      total_tokens: 1300,
    },
    output: [{
      id: `fs-${id}`,
      type: "file_search_call",
      status: "completed",
      queries: ["Waraporn retrieval"],
      results: filenames.map((filename, index) => ({
        file_id: `file-${index + 1}`,
        filename,
        score: 0.9,
        text: `Retrieved ${filename}`,
      })),
    }],
  };
}

function openAiFetcher(
  outputText = READY_DRAFT_TEXT,
  filenames: readonly string[] = WARAPORN_FOUNDATION_RETRIEVAL_FILENAMES,
): { fetcher: typeof fetch; bodies: Array<Record<string, unknown>> } {
  const bodies: Array<Record<string, unknown>> = [];
  return {
    bodies,
    fetcher: async (_input, init) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return jsonResponse(200, openAiFileSearchPayload("resp-single", outputText, filenames));
    },
  };
}

function requestText(body: Record<string, unknown>): string {
  const input = body.input as Array<{ content: Array<{ text: string }> }>;
  return input[0]!.content.map((item) => item.text).join("\n");
}

test("one OTA message creates exactly one OpenAI Responses request with the foundation instruction", async () => {
  const db = new FakeWarapornDB();
  const { fetcher, bodies } = openAiFetcher();

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  assert.deepEqual([...WARAPORN_REQUIRED_RETRIEVAL_FILENAMES], [
    "Waraporn_Conversation_Composer.md",
    "Vanara_Hospitality_Behaviour.md",
    "Guest_Information_Relevance_Filter.md",
    "Waraporn_Conversational_Instincts.md",
    "Seasonal_Advices.md",
    "Thai Holidays_TrafficLogics_Koh_Chang.md",
  ]);

  assert.equal(bodies.length, 1);
  const body = bodies[0]!;
  const text = requestText(body);
  assert.match(text, /Before composing, retrieve and apply these six exact foundation documents/);
  for (const filename of WARAPORN_FOUNDATION_RETRIEVAL_FILENAMES) assert.match(text, new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(text.includes(WARAPORN_SINGLE_REQUEST_FOUNDATION_INSTRUCTION), true);
  assert.equal("previous_response_id" in body, false);
  assert.deepEqual(body.tools, [{
    type: "file_search",
    vector_store_ids: [DEFAULT_WARAPORN_VECTOR_STORE_ID],
    max_num_results: 10,
  }]);
});

test("additional retrieval remains decision-driven without backend filename retries", async () => {
  const db = new FakeWarapornDB();
  db.messages[0]!.guest_message = "Is it safe to rent a scooter if we normally drive motorbikes?";
  const { fetcher, bodies } = openAiFetcher(READY_DRAFT_TEXT, ["MOBILITY_REASONING_CONTRACT_v1.md"]);

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  assert.equal(bodies.length, 1);
  const text = requestText(bodies[0]!);
  assert.doesNotMatch(text, /CURRENT DECISION REQUIRED RETRIEVAL FILENAMES/);
  assert.doesNotMatch(text, /RETRIEVAL RETRY REQUIRED FILENAMES/);
  assert.doesNotMatch(text, /FOUNDATION RETRIEVAL VERIFIED FILENAMES/);
  assert.equal("previous_response_id" in bodies[0]!, false);
  assert.deepEqual(JSON.parse(db.drafts[0]!.retrieval_filenames), ["MOBILITY_REASONING_CONTRACT_v1.md"]);
});

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
  assert.equal(db.drafts[0]!.openai_request_count, 1);
  assert.equal(db.drafts[0]!.openai_input_tokens, 1200);
  assert.equal(db.drafts[0]!.openai_cached_input_tokens, 200);
  assert.equal(db.drafts[0]!.openai_output_tokens, 100);
  assert.equal(db.drafts[0]!.openai_reasoning_tokens, 40);
  assert.equal(db.drafts[0]!.openai_total_tokens, 1300);
  assert.equal(db.drafts[0]!.estimated_cost_usd, 0.0081);
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
    max_num_results: 10,
  }]);
  assert.equal(body.tool_choice, "required");
  assert.equal("previous_response_id" in body, false);
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
  const storedContext = JSON.parse(db.drafts[0]!.runtime_context_json ?? "{}") as Record<string, unknown>;
  assert.equal(storedContext.currentBangkokDate, "2026-08-04");
  assert.equal(storedContext.travelPhase, "pre-arrival");
  assert.equal(storedContext.availabilityPricesStatus, "USED");
});

test("Waraporn reply language follows the current guest message, not booking language", async () => {
  const db = new FakeWarapornDB();
  db.messages[0]!.language = "it";
  db.bookings[0]!.language_code = "it";
  db.messages[0]!.guest_message = "We will arrive from Milan to Bangkok at around 11:00 in the morning. We are 2 people.";
  const { fetcher, bodies } = openAiFetcher();

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  const text = requestText(bodies[0]!);
  assert.match(text, /GUEST LANGUAGE\s+en/);
  const storedContext = JSON.parse(db.drafts[0]!.runtime_context_json ?? "{}") as Record<string, unknown>;
  assert.equal(storedContext.language, "en");
});

test("availability and prices context is explicit when not applicable", async () => {
  const db = new FakeWarapornDB();
  const { fetcher, bodies } = openAiFetcher();

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  const text = requestText(bodies[0]!);
  assert.match(text, /VERIFIED AVAILABILITY AND PRICES STATUS\s+NOT_APPLICABLE/);
  assert.match(text, /Not applicable to the current guest message\./);
});

test("successful assistant text is accepted without backend retrieval filename rejection", async () => {
  const db = new FakeWarapornDB();
  let calls = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    calls += 1;
    assert.deepEqual((JSON.parse(String(init.body)) as Record<string, unknown>).include, [...OPENAI_RESPONSES_FILE_SEARCH_INCLUDE]);
    return jsonResponse(200, openAiFileSearchPayload("resp-test-missing-retrieval", READY_DRAFT_TEXT, ["Other_File.md"]));
  };

  const draft = await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  assert.equal(draft.state, "READY");
  assert.equal(calls, 1);
  assert.equal(db.drafts.length, 1);
  assert.deepEqual(JSON.parse(db.drafts[0]!.retrieval_filenames), ["Other_File.md"]);
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

test("concurrent pending generation cannot call OpenAI twice for the same message", async () => {
  const db = new FakeWarapornDB();
  let calls = 0;
  let release: (() => void) | null = null;
  let resolveEntered: (() => void) | null = null;
  const entered = new Promise<void>((resolve) => { resolveEntered = resolve; });
  const fetcher: typeof fetch = async (_input, init) => {
    calls += 1;
    resolveEntered?.();
    await new Promise<void>((resolve) => { release = resolve; });
    return openAiFetcher().fetcher(_input, init);
  };
  const bindings = env(db, fetcher) as never;

  const first = generateWarapornDraft(bindings, 1, { now: NOW });
  await entered;
  const second = generateWarapornDraft(bindings, 1, { now: NOW }).catch((error: unknown) => error);
  release?.();
  const [draft, blocked] = await Promise.all([first, second]);

  assert.equal(draft.state, "READY");
  assert.ok(blocked instanceof Error);
  assert.match(blocked.message, /not eligible/i);
  assert.equal(calls, 1);
  assert.equal(db.drafts.length, 1);

  const replay = await generateWarapornDraft(bindings, 1, { now: NOW });
  assert.equal(replay.draftId, draft.draftId);
  assert.equal(calls, 1);
});

test("pending Waraporn generation ignores terminal failed messages without calling OpenAI", async () => {
  const db = new FakeWarapornDB();
  db.messages[0]!.state = "FAILED_MANUAL_RETRY";
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return jsonResponse(500, { error: { message: "should not be called" } });
  };

  const result = await generatePendingWarapornDrafts(env(db, fetcher) as never, { now: NOW });

  assert.equal(result.attempted, 0);
  assert.equal(result.generated, 0);
  assert.equal(result.reused, 0);
  assert.equal(result.failed, 0);
  assert.equal(calls, 0);
});

test("OpenAI failure persists FAILED_MANUAL_RETRY and is not retried by later cron cycles", async () => {
  const db = new FakeWarapornDB();
  let calls = 0;
  const fetcher: typeof fetch = async () => jsonResponse(500, { error: { message: "temporary model failure" } });
  const countingFetcher: typeof fetch = async (input, init) => {
    calls += 1;
    return fetcher(input, init);
  };

  await assert.rejects(
    generateWarapornDraft(env(db, countingFetcher) as never, 1, { now: NOW }),
    /temporary model failure/,
  );

  assert.equal(calls, 1);
  assert.equal(db.messages[0]!.state, "FAILED_MANUAL_RETRY");
  assert.equal(db.drafts.length, 1);
  assert.equal(db.drafts[0]!.status, "FAILED");
  assert.equal(db.drafts[0]!.openai_request_count, 1);
  assert.equal(db.drafts[0]!.failure_code, "openai_request_failed");

  const result = await generatePendingWarapornDrafts(env(db, countingFetcher) as never, { now: NOW });
  assert.equal(result.attempted, 0);
  assert.equal(calls, 1);
});

test("malformed AI response becomes terminal without retrying", async () => {
  const db = new FakeWarapornDB();
  let calls = 0;
  const fetcher: typeof fetch = async () => jsonResponse(200, { output: [] });
  const countingFetcher: typeof fetch = async (input, init) => {
    calls += 1;
    return fetcher(input, init);
  };

  await assert.rejects(
    generateWarapornDraft(env(db, countingFetcher) as never, 1, { now: NOW }),
    /draft text/,
  );

  assert.equal(calls, 1);
  assert.equal(db.messages[0]!.state, "FAILED_MANUAL_RETRY");
  assert.equal(db.drafts.length, 1);
  assert.equal(db.drafts[0]!.status, "FAILED");
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
