import { buildMessageContext, type MessageContextBuilderBindings } from "./message-context-builder.service.js";
import { notifyGuestMessageDraftReady, notifyGuestMessageInbound, type GuestMessageNotificationBindings } from "./guest-message-notifications.service.js";
import { DEFAULT_WARAPORN_PROMPT_KEY, loadPrompt, verifyPromptChecksum } from "./message-prompt.service.js";
import type { Draft, MessagePromptKey, VerifiedMessageContext } from "../types/messages.js";

export interface WarapornDraftBindings extends MessageContextBuilderBindings, GuestMessageNotificationBindings {
  OPENAI_API_KEY: string;
  WARAPORN_VECTOR_STORE_ID?: string;
  fetcher?: Fetcher;
}

export interface GenerateWarapornDraftOptions {
  now?: string;
  fetcher?: Fetcher;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
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
  openai_file_search_call_count: number | null;
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

interface WarapornResponseJobRow {
  message_id: number;
  message_conversation_id: number;
  booking_id: number | null;
  openai_response_id: string | null;
  response_status: string;
  prompt_key: MessagePromptKey;
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
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

export const OPENAI_WARAPORN_DRAFT_MODEL = "gpt-5.5-2026-04-23";
export const OPENAI_WARAPORN_DRAFT_TIMEOUT_MS = 180_000;
export const DEFAULT_WARAPORN_VECTOR_STORE_ID = "vs_6a48c08b24a88191b45bc43c2579d37f";
export const OPENAI_RESPONSES_FILE_SEARCH_INCLUDE = ["file_search_call.results"] as const;
export const WARAPORN_FILE_SEARCH_MAX_RESULTS = 10;
export const WARAPORN_FILE_SEARCH_DIAGNOSTIC_THRESHOLD = 8;
export const WARAPORN_PROMPT_CACHE_KEY = "waraporn-v4-rc3-make-faithful";
export const WARAPORN_SUBMISSION_RECOVERY_GRACE_MS = 300_000;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const GPT_5_5_INPUT_USD_PER_MILLION = 5;
const GPT_5_5_CACHED_INPUT_USD_PER_MILLION = 0.5;
const GPT_5_5_OUTPUT_USD_PER_MILLION = 30;
const FILE_SEARCH_USD_PER_CALL = 0.0025;

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
  fileSearchCallCount: number;
  usage: OpenAiUsage;
  elapsedMs: number;
  estimatedCostUsd: number;
}

interface OpenAiResponseEnvelope {
  payload: unknown;
  responseId: string;
  status: string;
  elapsedMs: number;
}

type WarapornDraftErrorWithResult = WarapornDraftError & {
  openAiResult?: OpenAiResponsesResult;
};

export class WarapornDraftError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "message_not_found"
      | "prompt_checksum_mismatch"
      | "openai_request_failed"
      | "openai_timeout"
      | "openai_response_pending"
      | "openai_invalid_response"
      | "openai_tool_call_limit_exceeded"
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

function openAiResponseStatus(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.status !== "string") {
    return isRecord(payload) && (typeof payload.output_text === "string" || Array.isArray(payload.output))
      ? "completed"
      : "unknown";
  }
  return payload.status.toLowerCase();
}

function persistedResponseStatus(status: string): string {
  const normalized = status.replaceAll("-", "_").toUpperCase();
  if (["QUEUED", "IN_PROGRESS", "COMPLETED", "FAILED", "INCOMPLETE", "CANCELLED"].includes(normalized)) {
    return normalized;
  }
  return "UNKNOWN";
}

function responseIsPending(status: string): boolean {
  return status === "queued" || status === "in_progress";
}

function responseIsFailed(status: string): boolean {
  return status === "failed" || status === "incomplete" || status === "cancelled";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function fileSearchCallCountFrom(response: unknown): number {
  if (!isRecord(response) || !Array.isArray(response.output)) return 0;
  return response.output.filter((outputItem) => isRecord(outputItem) && outputItem.type === "file_search_call").length;
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

function estimateGpt55CostUsd(usage: OpenAiUsage, fileSearchCallCount: number): number {
  const uncachedInputTokens = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  const tokenCost = (
    uncachedInputTokens * GPT_5_5_INPUT_USD_PER_MILLION
    + usage.cachedInputTokens * GPT_5_5_CACHED_INPUT_USD_PER_MILLION
    + usage.outputTokens * GPT_5_5_OUTPUT_USD_PER_MILLION
  ) / 1_000_000;
  return Number((tokenCost + fileSearchCallCount * FILE_SEARCH_USD_PER_CALL).toFixed(8));
}

function attachOpenAiResult(error: unknown, result: OpenAiResponsesResult): void {
  if (error instanceof WarapornDraftError) {
    (error as WarapornDraftErrorWithResult).openAiResult = result;
  }
}

function openAiResultFromError(error: unknown): OpenAiResponsesResult | null {
  return error instanceof WarapornDraftError
    ? ((error as WarapornDraftErrorWithResult).openAiResult ?? null)
    : null;
}

export function buildWarapornResponsesRequest(
  promptText: string,
  context: VerifiedMessageContext,
  storeId: string,
): JsonRecord {
  const content = [
    ...inputPair("GUEST FIRST NAME", context.guestFirstName),
    ...inputPair("CHECK-IN DATE", context.arrivalDate),
    ...inputPair("CHECK-OUT DATE", context.departureDate),
    ...inputPair("CONVERSATION CONTEXT", context.conversationContext),
    ...inputPair("CURRENT GUEST MESSAGE", context.currentGuestMessage),
  ];

  return {
    model: OPENAI_WARAPORN_DRAFT_MODEL,
    instructions: promptText,
    top_p: 0.98,
    reasoning: {
      effort: "medium",
    },
    tools: [{
      type: "file_search",
      vector_store_ids: [storeId],
      max_num_results: WARAPORN_FILE_SEARCH_MAX_RESULTS,
    }],
    text: {
      verbosity: "medium",
      format: {
        type: "text",
      },
    },
    prompt_cache_key: WARAPORN_PROMPT_CACHE_KEY,
    prompt_cache_retention: "24h",
    include: OPENAI_RESPONSES_FILE_SEARCH_INCLUDE,
    background: true,
    input: [{
      role: "user",
      content,
    }],
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
      openai_file_search_call_count,
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

async function loadResponseJob(
  env: Pick<WarapornDraftBindings, "DB">,
  messageId: number,
): Promise<WarapornResponseJobRow | null> {
  return env.DB.prepare(`
    SELECT
      message_id,
      message_conversation_id,
      booking_id,
      openai_response_id,
      response_status,
      prompt_key,
      prompt_version,
      prompt_checksum,
      model,
      vector_store_id,
      context_hash,
      runtime_context_json,
      openai_request_count,
      submitted_at,
      last_checked_at,
      completed_at,
      failure_code,
      failure_message,
      created_at,
      updated_at
    FROM waraporn_response_jobs
    WHERE message_id = ?
    LIMIT 1
  `).bind(messageId).first<WarapornResponseJobRow>();
}

async function createResponseJobLease(
  env: Pick<WarapornDraftBindings, "DB">,
  params: {
    messageId: number;
    now: string;
    prompt: Awaited<ReturnType<typeof loadPrompt>>;
    context: NonNullable<Awaited<ReturnType<typeof buildMessageContext>>>;
    storeId: string;
  },
): Promise<boolean> {
  const inserted = await env.DB.prepare(`
    INSERT INTO waraporn_response_jobs (
      message_id,
      message_conversation_id,
      booking_id,
      response_status,
      prompt_key,
      prompt_version,
      prompt_checksum,
      model,
      vector_store_id,
      context_hash,
      runtime_context_json,
      openai_request_count,
      created_at,
      updated_at
    )
    SELECT ?, ?, ?, 'SUBMITTING', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
    FROM messages m
    WHERE m.message_id = ?
      AND m.state IN ('ASSOCIATED', 'FAILED_MANUAL_RETRY')
      AND m.association_state = 'LINKED'
      AND NOT EXISTS (SELECT 1 FROM message_drafts d WHERE d.message_id = m.message_id)
      AND NOT EXISTS (SELECT 1 FROM waraporn_response_jobs j WHERE j.message_id = m.message_id)
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
    params.now,
    params.now,
    params.messageId,
  ).run();
  if ((inserted.meta?.changes ?? 0) === 0) return false;

  await env.DB.prepare(`
    UPDATE messages
    SET state = 'GENERATING', updated_at = ?
    WHERE message_id = ?
  `).bind(params.now, params.messageId).run();
  return true;
}

async function updateResponseJob(
  env: Pick<WarapornDraftBindings, "DB">,
  params: {
    messageId: number;
    responseId?: string | null;
    status: string;
    now: string;
    failureCode?: string | null;
    failureMessage?: string | null;
  },
): Promise<void> {
  await env.DB.prepare(`
    UPDATE waraporn_response_jobs
    SET openai_response_id = COALESCE(?, openai_response_id),
        response_status = ?,
        submitted_at = CASE WHEN ? IS NOT NULL THEN COALESCE(submitted_at, ?) ELSE submitted_at END,
        last_checked_at = ?,
        completed_at = CASE WHEN ? IN ('COMPLETED', 'FAILED', 'INCOMPLETE', 'CANCELLED') THEN ? ELSE completed_at END,
        failure_code = ?,
        failure_message = ?,
        updated_at = ?
    WHERE message_id = ?
  `).bind(
    params.responseId ?? null,
    persistedResponseStatus(params.status),
    params.responseId ?? null,
    params.now,
    params.now,
    persistedResponseStatus(params.status),
    params.now,
    params.failureCode ?? null,
    params.failureMessage ?? null,
    params.now,
    params.messageId,
  ).run();
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
  env: WarapornDraftBindings,
  params: {
    messageId: number;
    now: string;
    prompt: Awaited<ReturnType<typeof loadPrompt>> | null;
    context: Awaited<ReturnType<typeof buildMessageContext>> | null;
    storeId: string;
    openAiRequestCount: 0 | 1;
    openAiResult?: OpenAiResponsesResult | null;
    error: unknown;
  },
): Promise<void> {
  if (!params.prompt || !params.context) {
    await markMessageFailedManualRetry(env, params.messageId, params.now);
    const target = await env.DB.prepare(`
      SELECT message_conversation_id
      FROM messages
      WHERE message_id = ?
      LIMIT 1
    `).bind(params.messageId).first<{ message_conversation_id: number }>();
    if (target) {
      await notifyGuestMessageInbound(env, {
        messageId: params.messageId,
        conversationId: target.message_conversation_id,
      }).catch((error: unknown) => {
        console.warn(JSON.stringify({ message: "Guest message failed package notification failed", error: error instanceof Error ? error.message : "unknown", messageId: params.messageId }));
      });
    }
    return;
  }
  const result = params.openAiResult ?? null;
  const usage = result?.usage ?? {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };

  const failedDraftInsert = env.DB.prepare(`
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
      openai_file_search_call_count,
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
    VALUES (?, ?, ?, ?, ?, ?, '', 'FAILED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    result?.responseId ?? null,
    params.context.contextHash,
    JSON.stringify(params.context.context),
    JSON.stringify(result?.retrievalFilenames ?? []),
    result?.retrievalResultCount ?? 0,
    result?.fileSearchCallCount ?? 0,
    params.openAiRequestCount,
    usage.inputTokens,
    usage.cachedInputTokens,
    usage.outputTokens,
    usage.reasoningTokens,
    usage.totalTokens,
    result?.elapsedMs ?? 0,
    result?.estimatedCostUsd ?? 0,
    failureCode(params.error),
    failureMessage(params.error),
    params.now,
    params.now,
  );
  const failedMessageUpdate = env.DB.prepare(`
    UPDATE messages
    SET state = 'FAILED_MANUAL_RETRY',
        updated_at = ?
    WHERE message_id = ?
      AND state <> 'DRAFT_READY'
  `).bind(params.now, params.messageId);

  try {
    await env.DB.batch([failedDraftInsert, failedMessageUpdate]);
  } catch (insertError) {
    console.error("waraporn_failed_draft_persist_failed", {
      messageId: params.messageId,
      failureCode: failureCode(params.error),
      failureMessage: failureMessage(params.error),
      insertError: failureMessage(insertError),
    });
    throw insertError;
  }
  await notifyGuestMessageInbound(env, {
    messageId: params.messageId,
    conversationId: Number(params.context.context.conversationId),
  }).catch((error: unknown) => {
    console.warn(JSON.stringify({ message: "Guest message failed package notification failed", error: error instanceof Error ? error.message : "unknown", messageId: params.messageId }));
  });
}

function openAiHeaders(apiKey: string): HeadersInit {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

async function submitOpenAiResponse(
  env: WarapornDraftBindings,
  requestBody: JsonRecord,
  options: GenerateWarapornDraftOptions,
): Promise<OpenAiResponseEnvelope> {
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
      headers: openAiHeaders(apiKey),
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
  const responseId = openAiResponseId(payload);
  if (!responseId) throw new WarapornDraftError("OpenAI response did not include an id.", "openai_invalid_response", 502);
  return {
    payload,
    responseId,
    status: openAiResponseStatus(payload),
    elapsedMs,
  };
}

async function retrieveOpenAiResponse(
  env: WarapornDraftBindings,
  responseId: string,
  options: GenerateWarapornDraftOptions,
): Promise<OpenAiResponseEnvelope> {
  const apiKey = clean(env.OPENAI_API_KEY);
  if (!apiKey) throw new WarapornDraftError("OPENAI_API_KEY is missing.", "openai_request_failed", 502);
  const fetcher = options.fetcher ?? env.fetcher ?? fetch;
  const started = Date.now();
  const url = `${OPENAI_RESPONSES_URL}/${encodeURIComponent(responseId)}?include%5B%5D=file_search_call.results`;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: openAiHeaders(apiKey),
    });
  } catch {
    throw new WarapornDraftError("OpenAI response retrieval is pending.", "openai_response_pending", 502);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WarapornDraftError(openAiErrorMessage(payload), "openai_request_failed", 502);
  }
  return {
    payload,
    responseId: openAiResponseId(payload) ?? responseId,
    status: openAiResponseStatus(payload),
    elapsedMs: Date.now() - started,
  };
}

function completedOpenAiResult(envelope: OpenAiResponseEnvelope, elapsedMs: number): OpenAiResponsesResult {
  const usage = usageFrom(envelope.payload);
  const fileSearchCallCount = fileSearchCallCountFrom(envelope.payload);
  const result: OpenAiResponsesResult = {
    text: "",
    responseId: envelope.responseId,
    retrievalFilenames: retrievalFilenamesFrom(envelope.payload),
    retrievalResultCount: retrievalResultCountFrom(envelope.payload),
    fileSearchCallCount,
    usage,
    elapsedMs,
    estimatedCostUsd: estimateGpt55CostUsd(usage, fileSearchCallCount),
  };
  try {
    return { ...result, text: outputTextFrom(envelope.payload) };
  } catch (error) {
    attachOpenAiResult(error, result);
    throw error;
  }
}

async function waitForOpenAiResponse(
  env: WarapornDraftBindings,
  messageId: number,
  initial: OpenAiResponseEnvelope,
  options: GenerateWarapornDraftOptions,
  submittedAt: string,
): Promise<OpenAiResponsesResult> {
  const pollTimeoutMs = Math.max(options.pollTimeoutMs ?? OPENAI_WARAPORN_DRAFT_TIMEOUT_MS, 0);
  const pollIntervalMs = Math.max(options.pollIntervalMs ?? 2_000, 0);
  const sleep = options.sleep ?? delay;
  const deadline = Date.now() + pollTimeoutMs;
  let current = initial;

  while (responseIsPending(current.status)) {
    await updateResponseJob(env, {
      messageId,
      responseId: current.responseId,
      status: current.status,
      now: new Date().toISOString(),
    });
    if (Date.now() >= deadline) {
      throw new WarapornDraftError("OpenAI response is still processing.", "openai_response_pending", 502);
    }
    await sleep(pollIntervalMs);
    current = await retrieveOpenAiResponse(env, current.responseId, options);
  }

  const checkedAt = new Date().toISOString();
  await updateResponseJob(env, {
    messageId,
    responseId: current.responseId,
    status: current.status,
    now: checkedAt,
    failureCode: responseIsFailed(current.status) ? `openai_${current.status}` : null,
    failureMessage: responseIsFailed(current.status) ? openAiErrorMessage(current.payload) : null,
  });
  if (responseIsFailed(current.status)) {
    throw new WarapornDraftError(openAiErrorMessage(current.payload), "openai_request_failed", 502);
  }
  if (current.status !== "completed") {
    throw new WarapornDraftError("OpenAI returned an unknown response state.", "openai_response_pending", 502);
  }
  const elapsedMs = options.now
    ? current.elapsedMs
    : Math.max(Date.now() - Date.parse(submittedAt), current.elapsedMs);
  return completedOpenAiResult(current, elapsedMs);
}

function jobPrompt(job: WarapornResponseJobRow): Awaited<ReturnType<typeof loadPrompt>> {
  return {
    key: job.prompt_key,
    version: job.prompt_version,
    checksumAlgorithm: "sha256",
    checksum: job.prompt_checksum,
    text: "",
  };
}

function jobContext(job: WarapornResponseJobRow): NonNullable<Awaited<ReturnType<typeof buildMessageContext>>> {
  const context = JSON.parse(job.runtime_context_json) as VerifiedMessageContext;
  return { context, contextHash: job.context_hash };
}

async function persistReadyDraft(
  env: WarapornDraftBindings,
  job: WarapornResponseJobRow,
  generated: OpenAiResponsesResult,
  now: string,
): Promise<Draft> {
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
      openai_file_search_call_count,
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
    VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(message_id) DO NOTHING
  `).bind(
    job.message_id,
    job.message_conversation_id,
    job.booking_id,
    job.prompt_key,
    job.prompt_version,
    job.prompt_checksum,
    generated.text,
    job.model,
    job.vector_store_id,
    generated.responseId,
    job.context_hash,
    job.runtime_context_json,
    JSON.stringify(generated.retrievalFilenames),
    generated.retrievalResultCount,
    generated.fileSearchCallCount,
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

  const draft = await loadReadyDraft(env, job.message_id);
  if (!draft) throw new WarapornDraftError("Waraporn draft could not be persisted.", "draft_persistence_failed", 500);

  await env.DB.batch([
    env.DB.prepare("UPDATE messages SET state = 'DRAFT_READY', updated_at = ? WHERE message_id = ?").bind(now, job.message_id),
    env.DB.prepare(`
      UPDATE message_conversations
      SET state = 'DRAFT_READY', updated_at = ?
      WHERE message_conversation_id = ?
    `).bind(now, job.message_conversation_id),
  ]);
  await updateResponseJob(env, {
    messageId: job.message_id,
    responseId: generated.responseId,
    status: "completed",
    now,
  });

  if ((inserted.meta?.changes ?? 0) > 0) {
    await notifyGuestMessageDraftReady(env, {
      messageId: job.message_id,
      draftId: draft.draftId,
      conversationId: draft.conversationId,
    }).catch((error: unknown) => {
      console.warn(JSON.stringify({ message: "Guest message draft push notification failed", error: error instanceof Error ? error.message : "unknown", messageId: job.message_id, draftId: draft.draftId }));
    });
  }

  return draft;
}

async function recoverResponseJob(
  env: WarapornDraftBindings,
  job: WarapornResponseJobRow,
  options: GenerateWarapornDraftOptions,
): Promise<Draft> {
  if (!job.openai_response_id) {
    const ageMs = Math.max(Date.parse(options.now ?? new Date().toISOString()) - Date.parse(job.created_at), 0);
    if (ageMs < WARAPORN_SUBMISSION_RECOVERY_GRACE_MS) {
      throw new WarapornDraftError("Waraporn response submission is still in progress.", "openai_response_pending", 502);
    }
    const error = new WarapornDraftError("Waraporn response submission did not return a recoverable id.", "openai_request_failed", 502);
    await updateResponseJob(env, {
      messageId: job.message_id,
      status: "failed",
      now: options.now ?? new Date().toISOString(),
      failureCode: error.code,
      failureMessage: error.message,
    });
    await persistFailedDraftAttempt(env, {
      messageId: job.message_id,
      now: options.now ?? new Date().toISOString(),
      prompt: jobPrompt(job),
      context: jobContext(job),
      storeId: job.vector_store_id,
      openAiRequestCount: 1,
      error,
    });
    throw error;
  }

  let generated: OpenAiResponsesResult | null = null;
  try {
    const current = await retrieveOpenAiResponse(env, job.openai_response_id, options);
    generated = await waitForOpenAiResponse(
      env,
      job.message_id,
      current,
      options,
      job.submitted_at ?? job.created_at,
    );
    return await persistReadyDraft(env, job, generated, options.now ?? new Date().toISOString());
  } catch (error) {
    if (error instanceof WarapornDraftError && error.code === "openai_response_pending") throw error;
    await persistFailedDraftAttempt(env, {
      messageId: job.message_id,
      now: options.now ?? new Date().toISOString(),
      prompt: jobPrompt(job),
      context: jobContext(job),
      storeId: job.vector_store_id,
      openAiRequestCount: 1,
      openAiResult: generated ?? openAiResultFromError(error),
      error,
    });
    throw error;
  }
}

export async function generateWarapornDraft(
  env: WarapornDraftBindings,
  messageId: number,
  options: GenerateWarapornDraftOptions = {},
): Promise<Draft> {
  const existing = await loadReadyDraft(env, messageId);
  if (existing) return existing;

  const now = options.now ?? new Date().toISOString();
  const pendingJob = await loadResponseJob(env, messageId);
  if (pendingJob) return recoverResponseJob(env, pendingJob, options);

  const storeId = vectorStoreId(env);
  let prompt: Awaited<ReturnType<typeof loadPrompt>> | null = null;
  let context: Awaited<ReturnType<typeof buildMessageContext>> | null = null;
  let openAiRequestCount: 0 | 1 = 0;
  let openAiResult: OpenAiResponsesResult | null = null;

  try {
    context = await buildMessageContext(env, { messageId, now });
    if (!context) throw new WarapornDraftError("Message not found.", "message_not_found", 404);
    prompt = await loadPrompt(DEFAULT_WARAPORN_PROMPT_KEY);
    if (!await verifyPromptChecksum(prompt.key)) {
      throw new WarapornDraftError("Frozen Waraporn prompt checksum mismatch.", "prompt_checksum_mismatch", 500);
    }

    const leased = await createResponseJobLease(env, {
      messageId,
      now,
      prompt,
      context,
      storeId,
    });
    if (!leased) {
      const replay = await loadReadyDraft(env, messageId);
      if (replay) return replay;
      const existingJob = await loadResponseJob(env, messageId);
      if (existingJob) return recoverResponseJob(env, existingJob, options);
      throw new WarapornDraftError("Waraporn draft generation is not eligible for automatic retry.", "draft_not_eligible", 400);
    }
    const requestBody = buildWarapornResponsesRequest(prompt.text, context.context, storeId);
    openAiRequestCount = 1;
    const submitted = await submitOpenAiResponse(env, requestBody, options);
    const submittedAt = options.now ?? new Date().toISOString();
    await updateResponseJob(env, {
      messageId,
      responseId: submitted.responseId,
      status: submitted.status,
      now: submittedAt,
    });
    const job = await loadResponseJob(env, messageId);
    if (!job) throw new WarapornDraftError("Waraporn response job could not be reloaded.", "draft_persistence_failed", 500);
    const generated = await waitForOpenAiResponse(env, messageId, submitted, options, submittedAt);
    openAiResult = generated;
    if (generated.fileSearchCallCount > WARAPORN_FILE_SEARCH_DIAGNOSTIC_THRESHOLD) {
      console.warn(JSON.stringify({
        event: "waraporn_file_search_diagnostic_threshold_exceeded",
        messageId,
        responseId: generated.responseId,
        fileSearchCallCount: generated.fileSearchCallCount,
        diagnosticThreshold: WARAPORN_FILE_SEARCH_DIAGNOSTIC_THRESHOLD,
        action: "preserve_valid_final_answer",
      }));
    }

    return persistReadyDraft(env, job, generated, now);
  } catch (error) {
    if (error instanceof WarapornDraftError && error.code === "openai_response_pending") throw error;
    await persistFailedDraftAttempt(env, {
      messageId,
      now,
      prompt,
      context,
      storeId,
      openAiRequestCount,
      openAiResult: openAiResult ?? openAiResultFromError(error),
      error,
    });
    throw error;
  }
}

export async function generatePendingWarapornDrafts(
  env: WarapornDraftBindings,
  options: GeneratePendingWarapornDraftsOptions = {},
): Promise<GeneratePendingWarapornDraftsResult> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 100);
  const recoveryRows = await env.DB.prepare(`
    SELECT message_id
    FROM waraporn_response_jobs
    WHERE response_status IN ('SUBMITTING', 'QUEUED', 'IN_PROGRESS', 'COMPLETED', 'UNKNOWN')
      AND NOT EXISTS (
        SELECT 1 FROM message_drafts d
        WHERE d.message_id = waraporn_response_jobs.message_id
      )
    ORDER BY updated_at ASC, message_id ASC
    LIMIT ?
  `).bind(limit).all<MessageDraftTargetRow>();
  const remaining = Math.max(limit - (recoveryRows.results ?? []).length, 0);
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
  `).bind(remaining).all<MessageDraftTargetRow>();
  const targets = [...(recoveryRows.results ?? []), ...(rows.results ?? [])];

  let generated = 0;
  let reused = 0;
  let failed = 0;
  const draftIds: string[] = [];

  for (const row of targets) {
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
    attempted: targets.length,
    generated,
    reused,
    failed,
    draftIds,
  };
}
