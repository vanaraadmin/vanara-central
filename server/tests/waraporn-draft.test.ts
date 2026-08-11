import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import worker from "../src/index.ts";
import { getPromptChecksum } from "../src/services/message-prompt.service.ts";
import {
  DEFAULT_WARAPORN_VECTOR_STORE_ID,
  generatePendingWarapornDrafts,
  generateWarapornDraft,
  OPENAI_RESPONSES_FILE_SEARCH_INCLUDE,
  OPENAI_WARAPORN_DRAFT_MODEL,
  OPENAI_WARAPORN_DRAFT_TIMEOUT_MS,
  WARAPORN_FILE_SEARCH_DIAGNOSTIC_THRESHOLD,
  WARAPORN_FILE_SEARCH_MAX_RESULTS,
  WARAPORN_PROMPT_CACHE_KEY,
  WARAPORN_SUBMISSION_RECOVERY_GRACE_MS,
} from "../src/services/waraporn-draft.service.ts";

const NOW = "2026-08-04T10:00:00.000Z";
const READY_DRAFT_TEXT = "Of course, Khun Daniel. We can help with that.";
const DEFAULT_RETRIEVAL_FILENAMES = ["GUEST_SERVICES_MASTER.md"] as const;
const SCOOTER_DRAFT_TEXT = "We have one Vanara scooter available at 200 THB per day, or around 180 THB per day for a longer rental. Helmets are included, the deposit is 3,000 THB, and we do not keep your passport.";
const ELEPHANT_DRAFT_TEXT = "For the option Vanara considers strongest on animal welfare, I would choose Klong Son Elephant Camp. Other known choices include Baan Chang Thai Elephant Tracking and Feed the Elephants near Khlong Phlu, plus Kai Bae Meechai Elephant Camp; the last three should be presented neutrally rather than as ethical sanctuaries.";

type PermissionRow = { module_key: string; can_access: number; can_edit: number };
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
  openai_file_search_call_count: number;
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
type NotificationEventRow = {
  notification_event_id: number;
  dedupe_key: string;
  notification_type: string;
  entity_type: string;
  entity_id: string;
  audience: string;
  sound_type: string;
  payload_json: string;
  created_at: string;
};
type WarapornResponseJobRow = {
  message_id: number;
  message_conversation_id: number;
  booking_id: number | null;
  openai_response_id: string | null;
  response_status: string;
  prompt_key: string;
  prompt_version: string;
  prompt_checksum: string;
  model: string;
  vector_store_id: string;
  context_hash: string;
  runtime_context_json: string;
  openai_request_count: number;
  submitted_at: string | null;
  last_checked_at: string | null;
  completed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
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
  notificationEvents: NotificationEventRow[] = [];
  responseJobs: WarapornResponseJobRow[] = [];
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
  nextNotificationEventId = 1;
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
    if (sql.includes("FROM waraporn_response_jobs") && sql.includes("WHERE message_id = ?")) {
      return (this.responseJobs.find((item) => item.message_id === Number(params[0])) ?? null) as T | null;
    }
    if (sql.includes("SELECT message_conversation_id") && sql.includes("FROM messages") && sql.includes("WHERE message_id = ?")) {
      const message = this.messages.find((item) => item.message_id === Number(params[0]));
      return (message ? { message_conversation_id: message.message_conversation_id } : null) as T | null;
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
    if (sql.includes("SELECT notification_event_id") && sql.includes("FROM notification_events")) {
      const dedupeKey = String(params[0]);
      const event = this.notificationEvents.find((item) => item.dedupe_key === dedupeKey);
      return (event ? { notification_event_id: event.notification_event_id, dedupe_key: event.dedupe_key, created_at: event.created_at } : null) as T | null;
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
    if (sql.includes("FROM waraporn_response_jobs") && sql.includes("response_status IN")) {
      return {
        results: this.responseJobs
          .filter((job) => ["SUBMITTING", "QUEUED", "IN_PROGRESS", "COMPLETED", "UNKNOWN"].includes(job.response_status))
          .filter((job) => !this.drafts.some((draft) => draft.message_id === job.message_id))
          .map((job) => ({ message_id: job.message_id }))
          .slice(0, Number(params[0])) as T[],
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
    if (sql.includes("FROM messages m") && sql.includes("WHERE m.message_conversation_id = ?") && sql.includes("m.direction")) {
      const conversationId = Number(params[0]);
      const currentReceivedAt = String(params[1]);
      const currentMessageId = Number(params[3]);
      return {
        results: this.messages
          .filter((message) => message.message_conversation_id === conversationId)
          .filter((message) => message.received_at < currentReceivedAt || (message.received_at === currentReceivedAt && message.message_id < currentMessageId))
          .filter((message) => (message.direction === "INBOUND" && message.author === "GUEST")
            || (message.direction === "OUTBOUND" && message.author === "WARAPORN" && message.state === "SENT"))
          .map((message) => ({
            message_id: message.message_id,
            received_at: message.received_at,
            direction: message.direction,
            author: message.author,
            guest_message: message.guest_message,
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
    if (sql.includes("FROM push_subscriptions")) {
      return { results: [] as T[] };
    }
    return { results: [] as T[] };
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO waraporn_response_jobs")) {
      const messageId = Number(params[0]);
      const message = this.messages.find((item) => item.message_id === messageId);
      const eligible = message
        && ["ASSOCIATED", "FAILED_MANUAL_RETRY"].includes(message.state)
        && message.association_state === "LINKED"
        && !this.drafts.some((draft) => draft.message_id === messageId)
        && !this.responseJobs.some((job) => job.message_id === messageId);
      if (!eligible) return { meta: { changes: 0, last_row_id: 0 } };
      this.responseJobs.push({
        message_id: messageId,
        message_conversation_id: Number(params[1]),
        booking_id: params[2] as number | null,
        openai_response_id: null,
        response_status: "SUBMITTING",
        prompt_key: String(params[3]),
        prompt_version: String(params[4]),
        prompt_checksum: String(params[5]),
        model: String(params[6]),
        vector_store_id: String(params[7]),
        context_hash: String(params[8]),
        runtime_context_json: String(params[9]),
        openai_request_count: 1,
        submitted_at: null,
        last_checked_at: null,
        completed_at: null,
        failure_code: null,
        failure_message: null,
        created_at: String(params[10]),
        updated_at: String(params[11]),
      });
      return { meta: { changes: 1, last_row_id: this.responseJobs.length } };
    }
    if (sql.includes("UPDATE waraporn_response_jobs")) {
      const job = this.responseJobs.find((item) => item.message_id === Number(params[10]));
      if (!job) return { meta: { changes: 0, last_row_id: 0 } };
      if (params[0] !== null) {
        job.openai_response_id = String(params[0]);
        job.submitted_at ??= String(params[3]);
      }
      job.response_status = String(params[1]);
      job.last_checked_at = String(params[4]);
      if (["COMPLETED", "FAILED", "INCOMPLETE", "CANCELLED"].includes(String(params[5]))) {
        job.completed_at = String(params[6]);
      }
      job.failure_code = params[7] as string | null;
      job.failure_message = params[8] as string | null;
      job.updated_at = String(params[9]);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE messages") && sql.includes("state = 'GENERATING'")) {
      const messageId = Number(params[1]);
      const message = this.messages.find((item) => item.message_id === messageId);
      const hasDraft = this.drafts.some((draft) => draft.message_id === messageId);
      if (!message || !["ASSOCIATED", "FAILED_MANUAL_RETRY"].includes(message.state) || message.association_state !== "LINKED" || hasDraft) {
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
        openai_response_id: params[failed ? 8 : 9] as string | null,
        context_hash: String(params[failed ? 9 : 10]),
        runtime_context_json: params[failed ? 10 : 11] as string | null,
        retrieval_filenames: String(params[failed ? 11 : 12]),
        retrieval_result_count: Number(params[failed ? 12 : 13]),
        openai_file_search_call_count: Number(params[failed ? 13 : 14]),
        openai_request_count: failed ? Number(params[14]) : 1,
        openai_input_tokens: Number(params[failed ? 15 : 15]),
        openai_cached_input_tokens: Number(params[failed ? 16 : 16]),
        openai_output_tokens: Number(params[failed ? 17 : 17]),
        openai_reasoning_tokens: Number(params[failed ? 18 : 18]),
        openai_total_tokens: Number(params[failed ? 19 : 19]),
        openai_elapsed_ms: Number(params[failed ? 20 : 20]),
        estimated_cost_usd: Number(params[failed ? 21 : 21]),
        failure_code: failed ? String(params[22]) : null,
        failure_message: failed ? String(params[23]) : null,
        created_at: String(params[failed ? 24 : 22]),
        updated_at: String(params[failed ? 25 : 23]),
      });
      return { meta: { changes: 1, last_row_id: this.drafts.length } };
    }
    if (sql.includes("INSERT OR IGNORE INTO notification_events")) {
      const dedupeKey = String(params[0]);
      if (this.notificationEvents.some((event) => event.dedupe_key === dedupeKey)) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      this.notificationEvents.push({
        notification_event_id: this.nextNotificationEventId++,
        dedupe_key: dedupeKey,
        notification_type: String(params[1]),
        entity_type: String(params[2]),
        entity_id: String(params[3]),
        audience: String(params[4]),
        sound_type: String(params[5]),
        payload_json: String(params[6]),
        created_at: String(params[7]),
      });
      return { meta: { changes: 1, last_row_id: this.notificationEvents.length } };
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

function openAiFileSearchPayload(
  id: string,
  outputText: string,
  filenames: readonly string[],
  fileSearchCallCount = 1,
  options: {
    queries?: readonly string[];
    resultTextByFilename?: Readonly<Record<string, string>>;
  } = {},
): Record<string, unknown> {
  return {
    id,
    status: "completed",
    output_text: outputText,
    usage: {
      input_tokens: 1200,
      input_tokens_details: { cached_tokens: 200 },
      output_tokens: 100,
      output_tokens_details: { reasoning_tokens: 40 },
      total_tokens: 1300,
    },
    output: Array.from({ length: fileSearchCallCount }, (_, callIndex) => ({
      id: `fs-${id}-${callIndex + 1}`,
      type: "file_search_call",
      status: "completed",
      queries: [...(options.queries ?? ["Waraporn retrieval"])],
      results: filenames.map((filename, index) => ({
        file_id: `file-${index + 1}`,
        filename,
        score: 0.9,
        text: options.resultTextByFilename?.[filename] ?? `Retrieved ${filename}`,
      })),
    })),
  };
}

function openAiFetcher(
  outputText = READY_DRAFT_TEXT,
  filenames: readonly string[] = DEFAULT_RETRIEVAL_FILENAMES,
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

test("one OTA message creates exactly one Make-compatible OpenAI Responses request", async () => {
  const db = new FakeWarapornDB();
  const { fetcher, bodies } = openAiFetcher();

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  assert.equal(bodies.length, 1);
  const body = bodies[0]!;
  const instructions = String(body.instructions);
  assert.match(instructions, /SYSTEM_PROMPT_V4_RC3_HARD_EXECUTION_GATE/);
  assert.match(instructions, /Seasonal_Advices\.md/);
  assert.match(instructions, /Thai Holidays_TrafficLogics_Koh_Chang\.md/);
  assert.equal("previous_response_id" in body, false);
  assert.equal("tool_choice" in body, false);
  assert.equal("max_tool_calls" in body, false);
  assert.equal(body.top_p, 0.98);
  assert.deepEqual(body.reasoning, { effort: "medium" });
  assert.equal((body.text as Record<string, unknown>).verbosity, "medium");
  assert.equal(body.prompt_cache_key, WARAPORN_PROMPT_CACHE_KEY);
  assert.equal(body.prompt_cache_retention, "24h");
  assert.equal(body.background, true);
  assert.equal(OPENAI_WARAPORN_DRAFT_TIMEOUT_MS, 180_000);
  const input = requestText(body);
  assert.match(input, /GUEST FIRST NAME\s+Daniel/);
  assert.match(input, /CURRENT GUEST MESSAGE\s+Can we have a late check-in\?/);
  assert.deepEqual(body.tools, [{
    type: "file_search",
    vector_store_ids: [DEFAULT_WARAPORN_VECTOR_STORE_ID],
    max_num_results: WARAPORN_FILE_SEARCH_MAX_RESULTS,
  }]);
});

test("an autonomous scooter retrieval trace uses Vanara Guest Services without request hardcoding", async () => {
  const db = new FakeWarapornDB();
  db.messages[0]!.guest_message = "How much does it cost to rent a scooter from Vanara?";
  const filenames = ["MOBILITY_REASONING_CONTRACT_v1.md", "GUEST_SERVICES_MASTER.md"];
  const bodies: Array<Record<string, unknown>> = [];
  const trace = openAiFileSearchPayload("resp-scooter", SCOOTER_DRAFT_TEXT, filenames, 1, {
    queries: ["Vanara Resort scooter rental price Guest Services"],
    resultTextByFilename: {
      "GUEST_SERVICES_MASTER.md": "Vanara scooter rental: 200 THB per day; around 180 THB per day for longer rentals; helmets included; 3,000 THB deposit; passport is not retained.",
    },
  });
  const fetcher: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return jsonResponse(200, trace);
  };

  const draft = await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  const toolCall = (trace.output as Array<Record<string, unknown>>)[0]!;
  assert.deepEqual(toolCall.queries, ["Vanara Resort scooter rental price Guest Services"]);
  assert.match(JSON.stringify(toolCall.results), /200 THB per day/);
  assert.equal(bodies.length, 1);
  const text = requestText(bodies[0]!);
  assert.doesNotMatch(text, /CURRENT DECISION REQUIRED RETRIEVAL FILENAMES/);
  assert.doesNotMatch(text, /RETRIEVAL RETRY REQUIRED FILENAMES/);
  assert.doesNotMatch(text, /FOUNDATION RETRIEVAL VERIFIED FILENAMES/);
  const request = JSON.stringify(bodies[0]);
  assert.doesNotMatch(request, /GUEST_SERVICES_MASTER/i);
  assert.doesNotMatch(request, /200\s*THB/i);
  assert.doesNotMatch(request, /VANARA OPERATIONAL DOCUMENTS/i);
  assert.equal("previous_response_id" in bodies[0]!, false);
  assert.deepEqual(JSON.parse(db.drafts[0]!.retrieval_filenames), filenames);
  assert.match(draft.body, /200 THB per day/);
  assert.match(draft.body, /180 THB per day/);
  assert.match(draft.body, /3,000 THB/);
  assert.match(draft.body, /do not keep your passport/);
});

test("elephant retrieval covers Vanara's preferred option and the known alternatives", async () => {
  const db = new FakeWarapornDB();
  db.messages[0]!.guest_message = "What elephant experiences are available on Koh Chang, and which one would Vanara recommend?";
  const filenames = [
    "White Sand – Ao Sapparot Ferry_Corridor_MASTER.md",
    "Khlong Phrao - Chai Chet Corridor_MASTER.md",
    "Kai_Bae_MASTER.md",
  ];
  const { fetcher, bodies } = openAiFetcher(ELEPHANT_DRAFT_TEXT, filenames);

  const draft = await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  assert.equal(bodies.length, 1);
  assert.deepEqual(JSON.parse(db.drafts[0]!.retrieval_filenames), filenames);
  assert.match(draft.body, /Klong Son Elephant Camp/);
  assert.match(draft.body, /Baan Chang Thai Elephant Tracking/);
  assert.match(draft.body, /Feed the Elephants/);
  assert.match(draft.body, /Kai Bae Meechai Elephant Camp/);
  assert.match(draft.body, /animal welfare/);
  assert.match(draft.body, /neutrally rather than as ethical sanctuaries/);
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
  assert.equal(db.drafts[0]!.retrieval_result_count, DEFAULT_RETRIEVAL_FILENAMES.length);
  assert.deepEqual(JSON.parse(db.drafts[0]!.retrieval_filenames), [...DEFAULT_RETRIEVAL_FILENAMES]);
  assert.equal(db.drafts[0]!.openai_file_search_call_count, 1);
  assert.equal(db.drafts[0]!.openai_request_count, 1);
  assert.equal(db.drafts[0]!.openai_input_tokens, 1200);
  assert.equal(db.drafts[0]!.openai_cached_input_tokens, 200);
  assert.equal(db.drafts[0]!.openai_output_tokens, 100);
  assert.equal(db.drafts[0]!.openai_reasoning_tokens, 40);
  assert.equal(db.drafts[0]!.openai_total_tokens, 1300);
  assert.equal(db.drafts[0]!.estimated_cost_usd, 0.0106);
  assert.equal(db.messages[0]!.state, "DRAFT_READY");
  assert.equal(db.conversations[0]!.state, "DRAFT_READY");
  assert.equal(db.notificationEvents.length, 1);
  assert.equal(db.notificationEvents[0]!.notification_type, "guest_message.draft_ready");
  assert.equal(db.notificationEvents[0]!.dedupe_key, "guest-message:draft-ready:1:1");
  assert.equal(db.notificationEvents[0]!.audience, "owners");
  assert.equal(db.notificationEvents[0]!.sound_type, "event");
  assert.match(db.notificationEvents[0]!.payload_json, /Waraporn reply ready for review/);
  assert.match(db.notificationEvents[0]!.payload_json, /"\/messages"/);
  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });
  assert.equal(db.notificationEvents.length, 1);
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
    max_num_results: WARAPORN_FILE_SEARCH_MAX_RESULTS,
  }]);
  assert.equal("tool_choice" in body, false);
  assert.equal("max_tool_calls" in body, false);
  assert.equal(body.top_p, 0.98);
  assert.deepEqual(body.reasoning, { effort: "medium" });
  assert.equal((body.text as Record<string, unknown>).verbosity, "medium");
  assert.equal("previous_response_id" in body, false);
});

test("Waraporn draft request keeps the Make runtime input structure", async () => {
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
  assert.doesNotMatch(text, /VANARA VERIFIED RUNTIME CONTEXT/);
  assert.doesNotMatch(text, /"messageId"/);
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
  assert.match(text, /CURRENT GUEST MESSAGE\s+We will arrive from Milan to Bangkok at around 11:00 in the morning\. We are 2 people\./);
  assert.doesNotMatch(text, /Guest-message language:/);
  const storedContext = JSON.parse(db.drafts[0]!.runtime_context_json ?? "{}") as Record<string, unknown>;
  assert.equal(storedContext.language, "en");
});

test("availability and prices context is omitted from the request when not applicable", async () => {
  const db = new FakeWarapornDB();
  const { fetcher, bodies } = openAiFetcher();

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  const text = requestText(bodies[0]!);
  assert.doesNotMatch(text, /Verified availability\/prices/);
  assert.doesNotMatch(text, /Not applicable to the current guest message\./);
});

test("current guest message appears exactly once even when a repeated test message exists", async () => {
  const db = new FakeWarapornDB();
  db.messages[0]!.guest_message = "Should we go to Koh Mak or Koh Kood after checkout?";
  db.messages.unshift({
    ...db.messages[0]!,
    message_id: 2,
    provider_message_id: "provider-message-duplicate",
    received_at: "2026-08-04T08:30:00.000Z",
    guest_message: "Should we go to Koh Mak or Koh Kood after checkout?",
    state: "FAILED_MANUAL_RETRY",
  });
  const { fetcher, bodies } = openAiFetcher();

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  const text = requestText(bodies[0]!);
  assert.equal(text.match(/Should we go to Koh Mak or Koh Kood after checkout\?/g)?.length, 1);
});

test("conversation history excludes unsent drafts and includes only actual sent Waraporn messages", async () => {
  const db = new FakeWarapornDB();
  db.messages.unshift({
    ...db.messages[0]!,
    message_id: 2,
    provider_message_id: "provider-message-history",
    received_at: "2026-08-04T08:00:00.000Z",
    guest_message: "hello vanara",
    state: "DRAFT_READY",
  });
  db.drafts.push({
    message_draft_id: db.nextDraftId++,
    message_id: 2,
    message_conversation_id: 1,
    booking_id: 1,
    prompt_key: "waraporn-general-requests-v4-rc3",
    prompt_version: "SYSTEM_PROMPT_V4_RC3_HARD_EXECUTION_GATE",
    prompt_checksum: getPromptChecksum(),
    draft_text: "Unsent Italian draft that never reached Booking.com.",
    status: "READY",
    model: OPENAI_WARAPORN_DRAFT_MODEL,
    vector_store_id: DEFAULT_WARAPORN_VECTOR_STORE_ID,
    openai_response_id: "resp-old",
    context_hash: "hash-old",
    runtime_context_json: "{}",
    retrieval_filenames: "[]",
    retrieval_result_count: 0,
    openai_file_search_call_count: 0,
    openai_request_count: 1,
    openai_input_tokens: 0,
    openai_cached_input_tokens: 0,
    openai_output_tokens: 0,
    openai_reasoning_tokens: 0,
    openai_total_tokens: 0,
    openai_elapsed_ms: 0,
    estimated_cost_usd: 0,
    failure_code: null,
    failure_message: null,
    created_at: NOW,
    updated_at: NOW,
  });
  db.messages.unshift({
    ...db.messages[0]!,
    message_id: 3,
    provider_message_id: "provider-message-sent",
    direction: "OUTBOUND",
    author: "WARAPORN",
    received_at: "2026-08-04T08:15:00.000Z",
    guest_message: "This reply was actually sent to Booking.com.",
    state: "SENT",
  });
  const { fetcher, bodies } = openAiFetcher();

  await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  const text = requestText(bodies[0]!);
  assert.match(text, /Guest: hello vanara/);
  assert.match(text, /Waraporn sent: This reply was actually sent to Booking.com/);
  assert.doesNotMatch(text, /Unsent Italian draft/);
  assert.doesNotMatch(text, /Waraporn draft:/);
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

test("many internal file searches still use one Responses POST and preserve the final answer exactly once", async () => {
  const db = new FakeWarapornDB();
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return jsonResponse(200, openAiFileSearchPayload(
      "resp-soft-limit",
      READY_DRAFT_TEXT,
      ["MOBILITY_REASONING_CONTRACT_v1.md"],
      WARAPORN_FILE_SEARCH_DIAGNOSTIC_THRESHOLD + 1,
    ));
  };
  const bindings = env(db, fetcher) as never;

  const draft = await generateWarapornDraft(bindings, 1, { now: NOW });
  const replay = await generateWarapornDraft(bindings, 1, { now: NOW });

  assert.equal(draft.state, "READY");
  assert.equal(draft.body, READY_DRAFT_TEXT);
  assert.equal(replay.draftId, draft.draftId);
  assert.equal(calls, 1);
  assert.equal(db.drafts.length, 1);
  assert.equal(db.drafts[0]!.status, "READY");
  assert.equal(db.drafts[0]!.openai_file_search_call_count, WARAPORN_FILE_SEARCH_DIAGNOSTIC_THRESHOLD + 1);
  assert.equal(db.messages[0]!.state, "DRAFT_READY");
});

test("an ambiguous timeout performs zero automatic retries and becomes terminal", async () => {
  const db = new FakeWarapornDB();
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    const error = new Error("request aborted");
    error.name = "AbortError";
    throw error;
  };
  const bindings = env(db, fetcher) as never;

  await assert.rejects(
    generateWarapornDraft(bindings, 1, { now: NOW }),
    /timed out/i,
  );

  assert.equal(calls, 1);
  assert.equal(db.messages[0]!.state, "FAILED_MANUAL_RETRY");
  assert.equal(db.drafts[0]!.openai_request_count, 1);
  const pending = await generatePendingWarapornDrafts(bindings, { now: NOW });
  assert.equal(pending.attempted, 0);
  assert.equal(calls, 1);
});

test("an in-progress Response is recovered by id after restart without a second POST", async () => {
  const db = new FakeWarapornDB();
  let postCalls = 0;
  let getCalls = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    if (init.method === "POST") {
      postCalls += 1;
      return jsonResponse(200, { id: "resp-recoverable", status: "in_progress" });
    }
    getCalls += 1;
    return jsonResponse(200, openAiFileSearchPayload("resp-recoverable", READY_DRAFT_TEXT, DEFAULT_RETRIEVAL_FILENAMES));
  };
  const bindings = env(db, fetcher) as never;

  await assert.rejects(
    generateWarapornDraft(bindings, 1, { now: NOW, pollTimeoutMs: 0 }),
    /still processing/i,
  );
  assert.equal(postCalls, 1);
  assert.equal(getCalls, 0);
  assert.equal(db.drafts.length, 0);
  assert.equal(db.responseJobs[0]!.openai_response_id, "resp-recoverable");

  const draft = await generateWarapornDraft(bindings, 1, { now: NOW, pollIntervalMs: 0, sleep: async () => {} });

  assert.equal(draft.body, READY_DRAFT_TEXT);
  assert.equal(postCalls, 1);
  assert.equal(getCalls, 1);
  assert.equal(db.drafts.length, 1);
  assert.equal(db.notificationEvents.length, 1);
});

test("a stale submission without a response id becomes one manual fallback without another POST", async () => {
  const db = new FakeWarapornDB();
  const createdAt = new Date(Date.parse(NOW) - WARAPORN_SUBMISSION_RECOVERY_GRACE_MS - 1).toISOString();
  db.responseJobs.push({
    message_id: 1,
    message_conversation_id: 1,
    booking_id: 1,
    openai_response_id: null,
    response_status: "SUBMITTING",
    prompt_key: "waraporn-general-requests-v4-rc3",
    prompt_version: "SYSTEM_PROMPT_V4_RC3_HARD_EXECUTION_GATE",
    prompt_checksum: "test-checksum",
    model: OPENAI_WARAPORN_DRAFT_MODEL,
    vector_store_id: DEFAULT_WARAPORN_VECTOR_STORE_ID,
    context_hash: "test-context-hash",
    runtime_context_json: JSON.stringify({
      messageId: "1",
      conversationId: "1",
      bookingId: 1,
      guestFirstName: "Daniel",
      arrivalDate: "2026-12-28",
      departureDate: "2027-01-01",
      conversationContext: "No previous conversation history stored in Vanara.",
      currentGuestMessage: "Can we have a late check-in?",
      availabilityAndPrices: null,
      language: "en",
    }),
    openai_request_count: 1,
    submitted_at: null,
    last_checked_at: null,
    completed_at: null,
    failure_code: null,
    failure_message: null,
    created_at: createdAt,
    updated_at: createdAt,
  });
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return jsonResponse(500, { error: { message: "must not be called" } });
  };

  await assert.rejects(
    generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW }),
    /did not return a recoverable id/i,
  );

  assert.equal(calls, 0);
  assert.equal(db.messages[0]!.state, "FAILED_MANUAL_RETRY");
  assert.equal(db.drafts.length, 1);
  assert.equal(db.drafts[0]!.status, "FAILED");
  assert.equal(db.notificationEvents.length, 1);
  assert.equal(db.notificationEvents[0]!.dedupe_key, "guest-message:inbound:1");
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
  assert.match(blocked.message, /still in progress/i);
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

test("manual Waraporn generation can recover a linked failed message with no draft", async () => {
  const db = new FakeWarapornDB();
  db.messages[0]!.state = "FAILED_MANUAL_RETRY";
  const { fetcher, bodies } = openAiFetcher();

  const draft = await generateWarapornDraft(env(db, fetcher) as never, 1, { now: NOW });

  assert.equal(draft.state, "READY");
  assert.equal(draft.body, READY_DRAFT_TEXT);
  assert.equal(db.messages[0]!.state, "DRAFT_READY");
  assert.equal(db.drafts.length, 1);
  assert.equal(bodies.length, 1);
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

test("paid malformed AI response stores a FAILED draft row and becomes terminal without retrying", async () => {
  const db = new FakeWarapornDB();
  let calls = 0;
  const fetcher: typeof fetch = async () => jsonResponse(200, {
    id: "resp-paid-invalid",
    output: [],
    usage: {
      input_tokens: 700,
      input_tokens_details: { cached_tokens: 100 },
      output_tokens: 25,
      output_tokens_details: { reasoning_tokens: 5 },
      total_tokens: 725,
    },
  });
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
  assert.equal(db.drafts[0]!.openai_response_id, "resp-paid-invalid");
  assert.equal(db.drafts[0]!.openai_request_count, 1);
  assert.equal(db.drafts[0]!.openai_input_tokens, 700);
  assert.equal(db.drafts[0]!.openai_cached_input_tokens, 100);
  assert.equal(db.drafts[0]!.openai_output_tokens, 25);
  assert.equal(db.drafts[0]!.openai_reasoning_tokens, 5);
  assert.equal(db.drafts[0]!.openai_total_tokens, 725);
  assert.equal(db.drafts[0]!.failure_code, "openai_invalid_response");

  const pending = await generatePendingWarapornDrafts(env(db, countingFetcher) as never, { now: NOW });
  assert.equal(pending.attempted, 0);
  assert.equal(calls, 1);
  assert.equal(db.drafts.length, 1);
});

test("failed draft persistence SQL keeps message draft values aligned with schema", () => {
  const source = readFileSync(new URL("../src/services/waraporn-draft.service.ts", import.meta.url), "utf8");
  const failedInsert = /INSERT INTO message_drafts \(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?'FAILED'[\s\S]*?)\)\s*ON CONFLICT\(message_id\) DO NOTHING/.exec(source);
  assert.ok(failedInsert);
  const columns = failedInsert[1]!
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter(Boolean);
  const values = failedInsert[2]!
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const placeholders = failedInsert[2]!.match(/\?/g)?.length ?? 0;

  assert.equal(columns.length, 28);
  assert.equal(values.length, columns.length);
  assert.equal(placeholders, 26);
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
