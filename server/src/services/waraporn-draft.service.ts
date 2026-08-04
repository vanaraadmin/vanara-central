import { buildMessageContext, type MessageContextBuilderBindings } from "./message-context-builder.service.js";
import { DEFAULT_WARAPORN_PROMPT_KEY, loadPrompt, verifyPromptChecksum } from "./message-prompt.service.js";
import type { Draft, MessagePromptKey, VerifiedMessageContext } from "../types/messages.js";

export interface WarapornDraftBindings extends MessageContextBuilderBindings {
  OPENAI_API_KEY: string;
  WARAPORN_VECTOR_STORE_ID?: string;
  fetcher?: Fetcher;
}

export interface GenerateWarapornDraftOptions {
  now?: string;
  fetcher?: Fetcher;
}

export interface GeneratePendingWarapornDraftsOptions extends GenerateWarapornDraftOptions {
  limit?: number;
}

export interface GeneratePendingWarapornDraftsResult {
  attempted: number;
  generated: number;
  reused: number;
  failed: number;
  draftIds: string[];
}

interface DraftRow {
  message_draft_id: number;
  message_id: number;
  message_conversation_id: number;
  booking_id: number | null;
  prompt_key: MessagePromptKey;
  prompt_version: string;
  prompt_checksum: string;
  draft_text: string | null;
  status: Draft["state"];
  created_at: string;
  updated_at: string;
}

interface MessageDraftTargetRow {
  message_id: number;
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

export const OPENAI_WARAPORN_DRAFT_MODEL = "gpt-5.5";
export const OPENAI_WARAPORN_DRAFT_TIMEOUT_MS = 30_000;
export const DEFAULT_WARAPORN_VECTOR_STORE_ID = "vs_6a48c08b24a88191b45bc43c2579d37f";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const WARAPORN_FILE_SEARCH_MAX_RESULTS = 10;

export class WarapornDraftError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "message_not_found"
      | "prompt_checksum_mismatch"
      | "openai_request_failed"
      | "openai_timeout"
      | "openai_invalid_response"
      | "draft_persistence_failed",
    public readonly status: 400 | 404 | 500 | 502 = 400,
  ) {
    super(message);
    this.name = "WarapornDraftError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function openAiErrorMessage(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.message !== "string") {
    return "OpenAI Waraporn draft request failed.";
  }
  return payload.error.message;
}

function openAiResponseId(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return typeof payload.id === "string" ? payload.id : null;
}

function outputTextFrom(response: unknown): string {
  if (!isRecord(response)) {
    throw new WarapornDraftError("OpenAI returned an invalid response.", "openai_invalid_response", 502);
  }
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  if (!Array.isArray(response.output)) {
    throw new WarapornDraftError("OpenAI response did not include draft text.", "openai_invalid_response", 502);
  }

  const parts: string[] = [];
  for (const outputItem of response.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (isRecord(contentItem) && contentItem.type === "output_text" && typeof contentItem.text === "string") {
        parts.push(contentItem.text);
      }
    }
  }
  const text = parts.join("").trim();
  if (!text) throw new WarapornDraftError("OpenAI response did not include draft text.", "openai_invalid_response", 502);
  return text;
}

function vectorStoreId(env: Pick<WarapornDraftBindings, "WARAPORN_VECTOR_STORE_ID">): string {
  return clean(env.WARAPORN_VECTOR_STORE_ID) ?? DEFAULT_WARAPORN_VECTOR_STORE_ID;
}

function unknown(value: string | null): string {
  return value ?? "UNKNOWN";
}

export function buildWarapornResponsesRequest(
  promptText: string,
  context: VerifiedMessageContext,
  storeId: string,
): JsonRecord {
  return {
    model: OPENAI_WARAPORN_DRAFT_MODEL,
    instructions: promptText,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: "GUEST FIRST NAME" },
        { type: "input_text", text: unknown(context.guestFirstName) },
        { type: "input_text", text: "CHECK-IN DATE" },
        { type: "input_text", text: unknown(context.arrivalDate) },
        { type: "input_text", text: "CHECK-OUT DATE" },
        { type: "input_text", text: unknown(context.departureDate) },
        { type: "input_text", text: "CONVERSATION CONTEXT" },
        { type: "input_text", text: context.conversationContext },
        { type: "input_text", text: "CURRENT GUEST MESSAGE" },
        { type: "input_text", text: context.currentGuestMessage },
      ],
    }],
    tools: [{
      type: "file_search",
      vector_store_ids: [storeId],
      max_num_results: WARAPORN_FILE_SEARCH_MAX_RESULTS,
    }],
    text: {
      format: {
        type: "text",
      },
    },
    store: true,
  };
}

function toDraft(row: DraftRow): Draft {
  return {
    draftId: String(row.message_draft_id),
    messageId: String(row.message_id),
    conversationId: String(row.message_conversation_id),
    promptKey: row.prompt_key,
    promptVersion: row.prompt_version,
    promptChecksum: row.prompt_checksum,
    state: row.status,
    body: row.draft_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadReadyDraft(env: Pick<WarapornDraftBindings, "DB">, messageId: number): Promise<Draft | null> {
  const row = await env.DB.prepare(`
    SELECT
      message_draft_id,
      message_id,
      message_conversation_id,
      booking_id,
      prompt_key,
      prompt_version,
      prompt_checksum,
      draft_text,
      status,
      created_at,
      updated_at
    FROM message_drafts
    WHERE message_id = ?
      AND status = 'READY'
    LIMIT 1
  `).bind(messageId).first<DraftRow>();

  return row ? toDraft(row) : null;
}

async function callOpenAiResponses(
  env: WarapornDraftBindings,
  requestBody: JsonRecord,
  options: GenerateWarapornDraftOptions,
): Promise<{ text: string; responseId: string | null }> {
  const apiKey = clean(env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new WarapornDraftError("OPENAI_API_KEY is missing.", "openai_request_failed", 502);
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), OPENAI_WARAPORN_DRAFT_TIMEOUT_MS);
  const fetcher = options.fetcher ?? env.fetcher ?? fetch;

  let response: Response;
  try {
    response = await fetcher(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: abortController.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new WarapornDraftError("OpenAI Waraporn draft request timed out.", "openai_timeout", 502);
    }
    throw new WarapornDraftError("OpenAI Waraporn draft request failed.", "openai_request_failed", 502);
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WarapornDraftError(openAiErrorMessage(payload), "openai_request_failed", 502);
  }

  return {
    text: outputTextFrom(payload),
    responseId: openAiResponseId(payload),
  };
}

export async function generateWarapornDraft(
  env: WarapornDraftBindings,
  messageId: number,
  options: GenerateWarapornDraftOptions = {},
): Promise<Draft> {
  const existing = await loadReadyDraft(env, messageId);
  if (existing) return existing;

  const now = options.now ?? new Date().toISOString();
  const prompt = await loadPrompt(DEFAULT_WARAPORN_PROMPT_KEY);
  if (!await verifyPromptChecksum(prompt.key)) {
    throw new WarapornDraftError("Frozen Waraporn prompt checksum mismatch.", "prompt_checksum_mismatch", 500);
  }

  const context = await buildMessageContext(env, { messageId, now });
  if (!context) throw new WarapornDraftError("Message not found.", "message_not_found", 404);

  const storeId = vectorStoreId(env);
  const requestBody = buildWarapornResponsesRequest(prompt.text, context.context, storeId);
  const generated = await callOpenAiResponses(env, requestBody, options);

  const inserted = await env.DB.prepare(`
    INSERT INTO message_drafts (
      message_id,
      message_conversation_id,
      booking_id,
      prompt_key,
      prompt_version,
      prompt_checksum,
      draft_text,
      status,
      model,
      vector_store_id,
      openai_response_id,
      context_hash,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO NOTHING
  `).bind(
    messageId,
    Number(context.context.conversationId),
    context.context.bookingId,
    prompt.key,
    prompt.version,
    prompt.checksum,
    generated.text,
    OPENAI_WARAPORN_DRAFT_MODEL,
    storeId,
    generated.responseId,
    context.contextHash,
    now,
    now,
  ).run();

  if ((inserted.meta?.changes ?? 0) === 0) {
    const replay = await loadReadyDraft(env, messageId);
    if (replay) return replay;
    throw new WarapornDraftError("Waraporn draft could not be persisted.", "draft_persistence_failed", 500);
  }

  const draft = await loadReadyDraft(env, messageId);
  if (!draft) throw new WarapornDraftError("Waraporn draft could not be persisted.", "draft_persistence_failed", 500);

  await env.DB.batch([
    env.DB.prepare("UPDATE messages SET state = 'DRAFT_READY', updated_at = ? WHERE message_id = ?").bind(now, messageId),
    env.DB.prepare(`
      UPDATE message_conversations
      SET state = 'DRAFT_READY', updated_at = ?
      WHERE message_conversation_id = ?
    `).bind(now, Number(draft.conversationId)),
  ]);

  return draft;
}

export async function generatePendingWarapornDrafts(
  env: WarapornDraftBindings,
  options: GeneratePendingWarapornDraftsOptions = {},
): Promise<GeneratePendingWarapornDraftsResult> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 100);
  const rows = await env.DB.prepare(`
    SELECT m.message_id
    FROM messages m
    LEFT JOIN message_drafts d
      ON d.message_id = m.message_id
      AND d.status = 'READY'
    WHERE d.message_draft_id IS NULL
    ORDER BY m.received_at ASC, m.message_id ASC
    LIMIT ?
  `).bind(limit).all<MessageDraftTargetRow>();

  let generated = 0;
  let reused = 0;
  let failed = 0;
  const draftIds: string[] = [];

  for (const row of rows.results ?? []) {
    try {
      const before = await loadReadyDraft(env, row.message_id);
      const draft = await generateWarapornDraft(env, row.message_id, options);
      if (before) reused += 1;
      else generated += 1;
      draftIds.push(draft.draftId);
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        event: "waraporn_draft_generation_failed",
        messageId: row.message_id,
        error: error instanceof WarapornDraftError ? error.code : "unknown",
      }));
    }
  }

  return {
    attempted: (rows.results ?? []).length,
    generated,
    reused,
    failed,
    draftIds,
  };
}
