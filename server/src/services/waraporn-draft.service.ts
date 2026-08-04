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
  model: string | null;
  vector_store_id: string | null;
  openai_response_id: string | null;
  context_hash: string | null;
  runtime_context_json: string | null;
  retrieval_filenames: string | null;
  retrieval_result_count: number | null;
  openai_request_count: number | null;
  openai_input_tokens: number | null;
  openai_cached_input_tokens: number | null;
  openai_output_tokens: number | null;
  openai_reasoning_tokens: number | null;
  openai_total_tokens: number | null;
  openai_elapsed_ms: number | null;
  estimated_cost_usd: number | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageDraftTargetRow {
  message_id: number;
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

export const OPENAI_WARAPORN_DRAFT_MODEL = "gpt-5.5";
export const OPENAI_WARAPORN_DRAFT_TIMEOUT_MS = 60_000;
export const DEFAULT_WARAPORN_VECTOR_STORE_ID = "vs_6a48c08b24a88191b45bc43c2579d37f";
export const OPENAI_RESPONSES_FILE_SEARCH_INCLUDE = ["file_search_call.results"] as const;
export const WARAPORN_FOUNDATION_RETRIEVAL_FILENAMES = [
  "Waraporn_Conversation_Composer.md",
  "Vanara_Hospitality_Behaviour.md",
  "Guest_Information_Relevance_Filter.md",
  "Waraporn_Conversational_Instincts.md",
  "Seasonal_Advices.md",
  "Thai Holidays_TrafficLogics_Koh_Chang.md",
] as const;
export const WARAPORN_REQUIRED_RETRIEVAL_FILENAMES = WARAPORN_FOUNDATION_RETRIEVAL_FILENAMES;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const WARAPORN_FILE_SEARCH_MAX_RESULTS = 10;
const GPT_5_5_INPUT_USD_PER_MILLION = 5;
const GPT_5_5_CACHED_INPUT_USD_PER_MILLION = 0.5;
const GPT_5_5_OUTPUT_USD_PER_MILLION = 30;
export const WARAPORN_SINGLE_REQUEST_FOUNDATION_INSTRUCTION = [
  "Before composing, retrieve and apply these six exact foundation documents from the attached Vector Store:",
  "",
  "- Waraporn_Conversation_Composer.md",
  "- Vanara_Hospitality_Behaviour.md",
  "- Guest_Information_Relevance_Filter.md",
  "- Waraporn_Conversational_Instincts.md",
  "- Seasonal_Advices.md",
  "- Thai Holidays_TrafficLogics_Koh_Chang.md",
  "",
  "Then retrieve only the additional documents genuinely required by the current guest decision.",
].join("\n");

interface OpenAiUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

interface OpenAiResponsesResult {
  text: string;
  responseId: string | null;
  retrievalFilenames: string[];
  retrievalResultCount: number;
  usage: OpenAiUsage;
  elapsedMs: number;
  estimatedCostUsd: number;
}

export class WarapornDraftError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "message_not_found"
      | "prompt_checksum_mismatch"
      | "openai_request_failed"
      | "openai_timeout"
      | "openai_invalid_response"
      | "draft_not_eligible"
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

function valueText(value: string | number | null | undefined): string {
  if (typeof value === "number") return String(value);
  return unknown(value ?? null);
}

function inputPair(label: string, value: string | number | null | undefined): Array<{ type: "input_text"; text: string }> {
  return [
    { type: "input_text", text: label },
    { type: "input_text", text: valueText(value) },
  ];
}

function runtimeContextText(context: VerifiedMessageContext): string {
  return JSON.stringify({
    messageId: context.messageId,
    conversationId: context.conversationId,
    bookingId: context.bookingId,
    beds24BookingId: context.beds24BookingId,
    guestName: context.guestName,
    guestFirstName: context.guestFirstName,
    arrivalDate: context.arrivalDate,
    departureDate: context.departureDate,
    bookingStatus: context.bookingStatus,
    bookingSource: context.bookingSource,
    accommodationType: context.accommodationType,
    physicalUnit: context.physicalUnit,
    roomSummary: context.roomSummary,
    language: context.language,
    provider: context.provider,
    channel: context.channel,
    currentBangkokDate: context.currentBangkokDate,
    currentBangkokTime: context.currentBangkokTime,
    travelPhase: context.travelPhase,
    availabilityPricesStatus: context.availabilityPricesStatus,
    verifiedAt: context.verifiedAt,
  }, null, 2);
}

function parseStoredFilenames(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function pushFilename(target: string[], value: unknown): void {
  if (typeof value === "string" && value.trim()) target.push(value.trim());
}

function retrievalFilenamesFrom(response: unknown): string[] {
  if (!isRecord(response) || !Array.isArray(response.output)) return [];
  const filenames: string[] = [];

  for (const outputItem of response.output) {
    if (!isRecord(outputItem)) continue;
    if (outputItem.type === "file_search_call" && Array.isArray(outputItem.results)) {
      for (const result of outputItem.results) {
        if (isRecord(result)) pushFilename(filenames, result.filename);
      }
    }
    if (!Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem) || !Array.isArray(contentItem.annotations)) continue;
      for (const annotation of contentItem.annotations) {
        if (isRecord(annotation) && annotation.type === "file_citation") pushFilename(filenames, annotation.filename);
      }
    }
  }

  return [...new Set(filenames)];
}

function retrievalResultCountFrom(response: unknown): number {
  if (!isRecord(response) || !Array.isArray(response.output)) return 0;
  let count = 0;

  for (const outputItem of response.output) {
    if (!isRecord(outputItem) || outputItem.type !== "file_search_call" || !Array.isArray(outputItem.results)) continue;
    count += outputItem.results.length;
  }

  return count;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : 0;
}

function usageFrom(response: unknown): OpenAiUsage {
  if (!isRecord(response) || !isRecord(response.usage)) {
    return {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    };
  }

  const inputTokens = numeric(response.usage.input_tokens);
  const outputTokens = numeric(response.usage.output_tokens);
  const totalTokens = numeric(response.usage.total_tokens) || inputTokens + outputTokens;
  const cachedInputTokens = isRecord(response.usage.input_tokens_details)
    ? numeric(response.usage.input_tokens_details.cached_tokens)
    : 0;
  const reasoningTokens = isRecord(response.usage.output_tokens_details)
    ? numeric(response.usage.output_tokens_details.reasoning_tokens)
    : 0;

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  };
}

function estimateGpt55CostUsd(usage: OpenAiUsage): number {
  const uncachedInputTokens = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  const cost = (
    uncachedInputTokens * GPT_5_5_INPUT_USD_PER_MILLION
    + usage.cachedInputTokens * GPT_5_5_CACHED_INPUT_USD_PER_MILLION
    + usage.outputTokens * GPT_5_5_OUTPUT_USD_PER_MILLION
  ) / 1_000_000;
  return Number(cost.toFixed(8));
}

export function buildWarapornResponsesRequest(
  promptText: string,
  context: VerifiedMessageContext,
  storeId: string,
): JsonRecord {
  const content = [
    { type: "input_text" as const, text: WARAPORN_SINGLE_REQUEST_FOUNDATION_INSTRUCTION },
    ...inputPair("GUEST FIRST NAME", context.guestFirstName),
    ...inputPair("CHECK-IN DATE", context.arrivalDate),
    ...inputPair("CHECK-OUT DATE", context.departureDate),
    ...inputPair("CONVERSATION CONTEXT", context.conversationContext),
    ...inputPair("CURRENT GUEST MESSAGE", context.currentGuestMessage),
    ...inputPair("VANARA VERIFIED RUNTIME CONTEXT", runtimeContextText(context)),
    ...inputPair("CURRENT BANGKOK DATE", context.currentBangkokDate),
    ...inputPair("CURRENT BANGKOK TIME", context.currentBangkokTime),
    ...inputPair("TRAVEL PHASE", context.travelPhase),
    ...inputPair("BOOKING STATUS", context.bookingStatus),
    ...inputPair("GUEST LANGUAGE", context.language),
    ...inputPair("PROVIDER", context.provider),
    ...inputPair("CHANNEL", context.channel),
    ...inputPair("BOOKING SOURCE", context.bookingSource),
    ...inputPair("ACCOMMODATION TYPE", context.accommodationType),
    ...inputPair("PHYSICAL UNIT", context.physicalUnit),
    ...inputPair("ROOM SUMMARY", context.roomSummary),
    ...inputPair("VERIFIED AVAILABILITY AND PRICES STATUS", context.availabilityPricesStatus),
    ...inputPair("VERIFIED AVAILABILITY AND PRICES", context.availabilityPricesContext),
  ];

  return {
    model: OPENAI_WARAPORN_DRAFT_MODEL,
    instructions: promptText,
    input: [{
      role: "user",
      content,
    }],
    include: OPENAI_RESPONSES_FILE_SEARCH_INCLUDE,
    tools: [{
      type: "file_search",
      vector_store_ids: [storeId],
      max_num_results: WARAPORN_FILE_SEARCH_MAX_RESULTS,
    }],
    tool_choice: "required",
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
    retrievalFilenames: parseStoredFilenames(row.retrieval_filenames),
    retrievalResultCount: row.retrieval_result_count ?? parseStoredFilenames(row.retrieval_filenames).length,
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
      model,
      vector_store_id,
      openai_response_id,
      context_hash,
      runtime_context_json,
      retrieval_filenames,
      retrieval_result_count,
      openai_request_count,
      openai_input_tokens,
      openai_cached_input_tokens,
      openai_output_tokens,
      openai_reasoning_tokens,
      openai_total_tokens,
      openai_elapsed_ms,
      estimated_cost_usd,
      failure_code,
      failure_message,
      created_at,
      updated_at
    FROM message_drafts
    WHERE message_id = ?
      AND status = 'READY'
    LIMIT 1
  `).bind(messageId).first<DraftRow>();

  return row ? toDraft(row) : null;
}

async function acquireDraftLease(env: Pick<WarapornDraftBindings, "DB">, messageId: number, now: string): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE messages
    SET state = 'GENERATING',
        updated_at = ?
    WHERE message_id = ?
      AND state = 'ASSOCIATED'
      AND association_state = 'LINKED'
      AND NOT EXISTS (
        SELECT 1
        FROM message_drafts
        WHERE message_id = ?
      )
  `).bind(now, messageId, messageId).run();
  return (result.meta?.changes ?? 0) > 0;
}

function failureCode(error: unknown): string {
  return error instanceof WarapornDraftError ? error.code : "unknown";
}

function failureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown Waraporn draft failure.";
  return message.slice(0, 1000);
}

async function markMessageFailedManualRetry(
  env: Pick<WarapornDraftBindings, "DB">,
  messageId: number,
  now: string,
): Promise<void> {
  await env.DB.prepare(`
    UPDATE messages
    SET state = 'FAILED_MANUAL_RETRY',
        updated_at = ?
    WHERE message_id = ?
      AND state <> 'DRAFT_READY'
  `).bind(now, messageId).run();
}

async function persistFailedDraftAttempt(
  env: Pick<WarapornDraftBindings, "DB">,
  params: {
    messageId: number;
    now: string;
    prompt: Awaited<ReturnType<typeof loadPrompt>> | null;
    context: Awaited<ReturnType<typeof buildMessageContext>> | null;
    storeId: string;
    openAiRequestCount: 0 | 1;
    error: unknown;
  },
): Promise<void> {
  await markMessageFailedManualRetry(env, params.messageId, params.now);
  if (!params.prompt || !params.context || params.openAiRequestCount !== 1) return;

  await env.DB.prepare(`
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
      runtime_context_json,
      retrieval_filenames,
      retrieval_result_count,
      openai_request_count,
      openai_input_tokens,
      openai_cached_input_tokens,
      openai_output_tokens,
      openai_reasoning_tokens,
      openai_total_tokens,
      openai_elapsed_ms,
      estimated_cost_usd,
      failure_code,
      failure_message,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, '', 'FAILED', ?, ?, NULL, ?, ?, '[]', 0, ?, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?)
    ON CONFLICT(message_id) DO NOTHING
  `).bind(
    params.messageId,
    Number(params.context.context.conversationId),
    params.context.context.bookingId,
    params.prompt.key,
    params.prompt.version,
    params.prompt.checksum,
    OPENAI_WARAPORN_DRAFT_MODEL,
    params.storeId,
    params.context.contextHash,
    JSON.stringify(params.context.context),
    params.openAiRequestCount,
    failureCode(params.error),
    failureMessage(params.error),
    params.now,
    params.now,
  ).run();
}

async function callOpenAiResponses(
  env: WarapornDraftBindings,
  requestBody: JsonRecord,
  options: GenerateWarapornDraftOptions,
): Promise<OpenAiResponsesResult> {
  const apiKey = clean(env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new WarapornDraftError("OPENAI_API_KEY is missing.", "openai_request_failed", 502);
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), OPENAI_WARAPORN_DRAFT_TIMEOUT_MS);
  const fetcher = options.fetcher ?? env.fetcher ?? fetch;
  const started = Date.now();

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
  const elapsedMs = Date.now() - started;
  if (!response.ok) {
    throw new WarapornDraftError(openAiErrorMessage(payload), "openai_request_failed", 502);
  }
  const usage = usageFrom(payload);

  return {
    text: outputTextFrom(payload),
    responseId: openAiResponseId(payload),
    retrievalFilenames: retrievalFilenamesFrom(payload),
    retrievalResultCount: retrievalResultCountFrom(payload),
    usage,
    elapsedMs,
    estimatedCostUsd: estimateGpt55CostUsd(usage),
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
  const leased = await acquireDraftLease(env, messageId, now);
  if (!leased) {
    const replay = await loadReadyDraft(env, messageId);
    if (replay) return replay;
    throw new WarapornDraftError("Waraporn draft generation is not eligible for automatic retry.", "draft_not_eligible", 400);
  }

  const storeId = vectorStoreId(env);
  let prompt: Awaited<ReturnType<typeof loadPrompt>> | null = null;
  let context: Awaited<ReturnType<typeof buildMessageContext>> | null = null;
  let openAiRequestCount: 0 | 1 = 0;

  try {
    prompt = await loadPrompt(DEFAULT_WARAPORN_PROMPT_KEY);
    if (!await verifyPromptChecksum(prompt.key)) {
      throw new WarapornDraftError("Frozen Waraporn prompt checksum mismatch.", "prompt_checksum_mismatch", 500);
    }

    context = await buildMessageContext(env, { messageId, now });
    if (!context) throw new WarapornDraftError("Message not found.", "message_not_found", 404);

    const requestBody = buildWarapornResponsesRequest(prompt.text, context.context, storeId);
    openAiRequestCount = 1;
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
        runtime_context_json,
        retrieval_filenames,
        retrieval_result_count,
        openai_request_count,
        openai_input_tokens,
        openai_cached_input_tokens,
        openai_output_tokens,
        openai_reasoning_tokens,
        openai_total_tokens,
        openai_elapsed_ms,
        estimated_cost_usd,
        failure_code,
        failure_message,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
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
      JSON.stringify(context.context),
      JSON.stringify(generated.retrievalFilenames),
      generated.retrievalResultCount,
      generated.usage.inputTokens,
      generated.usage.cachedInputTokens,
      generated.usage.outputTokens,
      generated.usage.reasoningTokens,
      generated.usage.totalTokens,
      generated.elapsedMs,
      generated.estimatedCostUsd,
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
  } catch (error) {
    await persistFailedDraftAttempt(env, { messageId, now, prompt, context, storeId, openAiRequestCount, error });
    throw error;
  }
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
    WHERE d.message_draft_id IS NULL
      AND m.state = 'ASSOCIATED'
      AND m.association_state = 'LINKED'
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
