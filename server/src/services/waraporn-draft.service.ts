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
const WARAPORN_FOUNDATION_RETRIEVAL_FILENAME_SET = new Set<string>(WARAPORN_FOUNDATION_RETRIEVAL_FILENAMES);
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const WARAPORN_DECISION_FILE_SEARCH_MAX_RESULTS = 10;
const WARAPORN_RETRIEVAL_MAX_ATTEMPTS = 3;

interface RetrievedFileSearchResult {
  filename: string;
  text: string | null;
  score: number | null;
}

interface OpenAiResponsesResult {
  text: string;
  responseId: string | null;
  retrievalFilenames: string[];
  retrievalResults: RetrievedFileSearchResult[];
  fileSearchCompleted: boolean;
}

interface FoundationRetrievalResult {
  filenames: string[];
  results: RetrievedFileSearchResult[];
  responseId: string;
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
      | "retrieval_verification_failed"
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

function pushUniqueFilename(target: string[], filename: string): void {
  if (!target.includes(filename)) target.push(filename);
}

function isFoundationFilename(filename: string): boolean {
  return WARAPORN_FOUNDATION_RETRIEVAL_FILENAME_SET.has(filename);
}

function retrievedFoundationFilenameSet(filenames: readonly string[]): Set<string> {
  return new Set(filenames.filter(isFoundationFilename));
}

function missingFoundationRetrievalFilenames(filenames: readonly string[]): string[] {
  const found = retrievedFoundationFilenameSet(filenames);
  return WARAPORN_FOUNDATION_RETRIEVAL_FILENAMES.filter((filename) => !found.has(filename));
}

function fileSearchCompletedFrom(response: unknown): boolean {
  if (!isRecord(response) || !Array.isArray(response.output)) return false;
  return response.output.some((outputItem) => {
    return isRecord(outputItem)
      && outputItem.type === "file_search_call"
      && (outputItem.status === undefined || outputItem.status === "completed");
  });
}

function retrievalResultsFrom(response: unknown): RetrievedFileSearchResult[] {
  if (!isRecord(response) || !Array.isArray(response.output)) return [];
  const results: RetrievedFileSearchResult[] = [];

  for (const outputItem of response.output) {
    if (!isRecord(outputItem) || outputItem.type !== "file_search_call" || !Array.isArray(outputItem.results)) continue;
    for (const result of outputItem.results) {
      if (!isRecord(result) || typeof result.filename !== "string" || !result.filename.trim()) continue;
      results.push({
        filename: result.filename.trim(),
        text: typeof result.text === "string" && result.text.trim() ? result.text.trim() : null,
        score: typeof result.score === "number" && Number.isFinite(result.score) ? result.score : null,
      });
    }
  }

  return results;
}

function combinedRetrievalFilenames(foundation: FoundationRetrievalResult, decision: OpenAiResponsesResult): string[] {
  const filenames: string[] = [];
  for (const filename of foundation.filenames) pushUniqueFilename(filenames, filename);
  for (const filename of decision.retrievalFilenames) pushUniqueFilename(filenames, filename);
  return filenames;
}

export function buildWarapornFoundationRetrievalRequest(
  storeId: string,
  filenames: readonly string[] = WARAPORN_FOUNDATION_RETRIEVAL_FILENAMES,
  previousResponseId: string | null = null,
): JsonRecord {
  const request: JsonRecord = {
    model: OPENAI_WARAPORN_DRAFT_MODEL,
    instructions: [
      "Retrieve only the exact Vanara Waraporn foundation filenames requested by the user input.",
      "Do not answer any guest question.",
      "Do not retrieve destination, transport, room, activity, price, or area documents in this phase.",
      "Return FOUNDATION_RETRIEVAL_COMPLETE after the file search call.",
    ].join("\n"),
    input: [{
      role: "user",
      content: [
        ...inputPair("FOUNDATION FILES TO RETRIEVE", filenames.join("\n")),
        ...inputPair("RETRIEVAL SCOPE", "Foundation contracts only. No decision-specific knowledge."),
      ],
    }],
    include: OPENAI_RESPONSES_FILE_SEARCH_INCLUDE,
    tools: [{
      type: "file_search",
      vector_store_ids: [storeId],
      max_num_results: Math.max(filenames.length, 1),
    }],
    tool_choice: "required",
    text: {
      format: {
        type: "text",
      },
    },
    store: true,
  };
  if (previousResponseId) request.previous_response_id = previousResponseId;
  return request;
}

export function buildWarapornResponsesRequest(
  promptText: string,
  context: VerifiedMessageContext,
  storeId: string,
  foundation: FoundationRetrievalResult,
): JsonRecord {
  const content = [
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
    previous_response_id: foundation.responseId,
    input: [{
      role: "user",
      content,
    }],
    include: OPENAI_RESPONSES_FILE_SEARCH_INCLUDE,
    tools: [{
      type: "file_search",
      vector_store_ids: [storeId],
      max_num_results: WARAPORN_DECISION_FILE_SEARCH_MAX_RESULTS,
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

async function retrieveWarapornFoundation(
  env: WarapornDraftBindings,
  storeId: string,
  options: GenerateWarapornDraftOptions,
): Promise<FoundationRetrievalResult> {
  let missing: string[] = [...WARAPORN_FOUNDATION_RETRIEVAL_FILENAMES];
  const retrievedFilenames: string[] = [];
  const retrievedResults: RetrievedFileSearchResult[] = [];
  let previousResponseId: string | null = null;

  for (let attempt = 1; attempt <= WARAPORN_RETRIEVAL_MAX_ATTEMPTS; attempt += 1) {
    const requestBody = buildWarapornFoundationRetrievalRequest(storeId, missing, previousResponseId);
    const generated = await callOpenAiResponses(env, requestBody, options);

    if (!generated.fileSearchCompleted) {
      throw new WarapornDraftError(
        "Waraporn foundation retrieval did not complete.",
        "retrieval_verification_failed",
        502,
      );
    }
    if (!generated.responseId) {
      throw new WarapornDraftError(
        "OpenAI foundation retrieval response did not include a response id.",
        "openai_invalid_response",
        502,
      );
    }
    previousResponseId = generated.responseId;

    for (const filename of generated.retrievalFilenames) {
      if (isFoundationFilename(filename)) {
        pushUniqueFilename(retrievedFilenames, filename);
      }
    }
    for (const result of generated.retrievalResults) {
      if (isFoundationFilename(result.filename)) {
        retrievedResults.push(result);
      }
    }

    missing = missingFoundationRetrievalFilenames(retrievedFilenames);
    if (missing.length === 0) {
      return {
        filenames: [...WARAPORN_FOUNDATION_RETRIEVAL_FILENAMES],
        results: retrievedResults,
        responseId: previousResponseId,
      };
    }
  }

  throw new WarapornDraftError(
    `Waraporn foundation retrieval verification failed. Missing: ${missing.join(", ")}`,
    "retrieval_verification_failed",
    502,
  );
}

async function callOpenAiResponsesWithRetrievalVerification(
  env: WarapornDraftBindings,
  promptText: string,
  context: VerifiedMessageContext,
  storeId: string,
  options: GenerateWarapornDraftOptions,
): Promise<{ text: string; responseId: string | null; retrievalFilenames: string[]; foundationFilenames: string[]; decisionFilenames: string[] }> {
  const foundation = await retrieveWarapornFoundation(env, storeId, options);
  const requestBody = buildWarapornResponsesRequest(promptText, context, storeId, foundation);
  const decision = await callOpenAiResponses(env, requestBody, options);

  if (!decision.fileSearchCompleted) {
    throw new WarapornDraftError(
      "Waraporn decision retrieval did not complete.",
      "retrieval_verification_failed",
      502,
    );
  }

  return {
    text: decision.text,
    responseId: decision.responseId,
    foundationFilenames: foundation.filenames,
    decisionFilenames: decision.retrievalFilenames,
    retrievalFilenames: combinedRetrievalFilenames(foundation, decision),
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
): Promise<OpenAiResponsesResult> {
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
    retrievalFilenames: retrievalFilenamesFrom(payload),
    retrievalResults: retrievalResultsFrom(payload),
    fileSearchCompleted: fileSearchCompletedFrom(payload),
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
  const generated = await callOpenAiResponsesWithRetrievalVerification(env, prompt.text, context.context, storeId, options);

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
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    generated.retrievalFilenames.length,
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
      AND m.state <> 'FAILED'
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
