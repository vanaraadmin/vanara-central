import { SOCIAL_CAPTION_PROMPT } from "../assets/prompts/social-caption-v1.prompt.js";
import type { SocialAutomationBindings, SocialPostQueueItem } from "./social-automation.service.js";
import {
  DEFAULT_SOCIAL_CAPTION_MODEL,
  DEFAULT_SOCIAL_VECTOR_STORE_ID,
} from "./social-image-preparation.service.js";

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

export interface SocialCaptionBindings extends SocialAutomationBindings {
  OPENAI_API_KEY: string;
  SOCIAL_CAPTION_MODEL?: string;
  SOCIAL_VECTOR_STORE_ID?: string;
  WARAPORN_VECTOR_STORE_ID?: string;
  fetcher?: Fetcher;
}

export interface PrepareSocialCaptionOptions {
  now?: string;
  fetcher?: Fetcher;
}

export interface PrepareSocialCaptionResult {
  processed: boolean;
  item: SocialPostQueueItem | null;
}

interface SocialPostQueueRow {
  social_post_id: number;
  original_object_key: string;
  processed_object_key: string | null;
  original_file_name: string;
  content_type: string;
  byte_size: number;
  uploaded_by: string;
  uploaded_by_name: string;
  status: SocialPostQueueItem["status"];
  queued_at: string;
  processing_started_at: string | null;
  image_prepared_at: string | null;
  caption_prepared_at: string | null;
  scheduled_publish_at: string | null;
  posted_at: string | null;
  failed_at: string | null;
  updated_at: string;
  attempt_count: number;
  failure_code: string | null;
  failure_message: string | null;
  openai_request_count: number;
  openai_input_tokens: number;
  openai_cached_input_tokens: number;
  openai_output_tokens: number;
  openai_reasoning_tokens: number;
  openai_total_tokens: number;
  openai_elapsed_ms: number;
  estimated_cost_usd: number;
  analysis_json: string | null;
  caption_json: string | null;
  caption_style_fingerprint: string | null;
  source_metadata_json: string | null;
}

interface OpenAiUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

interface SocialCaptionOpenAiResult {
  captionJson: string;
  captionStyleFingerprint: string;
  responseId: string | null;
  usage: OpenAiUsage;
  elapsedMs: number;
  estimatedCostUsd: number;
  fileSearchCallCount: number;
}

interface RecentCaptionFingerprint {
  social_post_id: number;
  caption_style_fingerprint: string | null;
  caption_json: string | null;
  caption_prepared_at: string | null;
}

interface NormalizedCaptionJson {
  instagram_caption: string;
  instagram_caption_en: string;
  instagram_caption_th: string;
  facebook_caption: string;
  facebook_caption_en: string;
  facebook_caption_th: string;
  instagram_hashtags: string[];
  facebook_hashtags: string[];
  alt_text: string;
  grounding_used: string[];
  avoid_claims_respected: boolean;
  caption_style_fingerprint: JsonRecord;
  repetitive_warning: boolean;
  repetitive_warning_reason: string | null;
}

export class SocialCaptionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "social_post_not_found"
      | "social_post_not_eligible"
      | "analysis_json_missing"
      | "analysis_json_invalid"
      | "openai_request_failed"
      | "openai_timeout"
      | "openai_invalid_response"
      | "openai_tool_call_limit_exceeded"
      | "caption_persistence_failed",
    public readonly status: 400 | 404 | 500 | 502 = 400,
    public readonly openAiResult: SocialCaptionOpenAiResult | null = null,
  ) {
    super(message);
    this.name = "SocialCaptionError";
  }
}

export const SOCIAL_CAPTION_CRON = "30 23 * * *";
export const SOCIAL_CAPTION_MAX_TOOL_CALLS = 1;
export const SOCIAL_CAPTION_TIMEOUT_MS = 60_000;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const SOCIAL_CAPTION_FILE_SEARCH_MAX_RESULTS = 5;
const RECENT_CAPTION_LIMIT = 8;
const SOCIAL_MODEL_PRICING_USD_PER_MILLION: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-5.6": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.6-sol": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : 0;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function rowToItem(row: SocialPostQueueRow): SocialPostQueueItem {
  return {
    id: row.social_post_id,
    originalObjectKey: row.original_object_key,
    processedObjectKey: row.processed_object_key,
    originalFileName: row.original_file_name,
    contentType: row.content_type,
    byteSize: row.byte_size,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    status: row.status,
    queuedAt: row.queued_at,
    processingStartedAt: row.processing_started_at,
    imagePreparedAt: row.image_prepared_at,
    captionPreparedAt: row.caption_prepared_at,
    scheduledPublishAt: row.scheduled_publish_at,
    postedAt: row.posted_at,
    failedAt: row.failed_at,
    updatedAt: row.updated_at,
    attemptCount: row.attempt_count,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    openaiRequestCount: row.openai_request_count,
    estimatedCostUsd: row.estimated_cost_usd,
  };
}

function socialPostSelectSql(): string {
  return `
    SELECT
      social_post_id,
      original_object_key,
      processed_object_key,
      original_file_name,
      content_type,
      byte_size,
      uploaded_by,
      uploaded_by_name,
      status,
      queued_at,
      processing_started_at,
      image_prepared_at,
      caption_prepared_at,
      scheduled_publish_at,
      posted_at,
      failed_at,
      updated_at,
      attempt_count,
      failure_code,
      failure_message,
      openai_request_count,
      openai_input_tokens,
      openai_cached_input_tokens,
      openai_output_tokens,
      openai_reasoning_tokens,
      openai_total_tokens,
      openai_elapsed_ms,
      estimated_cost_usd,
      analysis_json,
      caption_json,
      caption_style_fingerprint,
      source_metadata_json
    FROM social_post_queue
  `;
}

function socialCaptionModel(env: Pick<SocialCaptionBindings, "SOCIAL_CAPTION_MODEL">): string {
  return clean(env.SOCIAL_CAPTION_MODEL) ?? DEFAULT_SOCIAL_CAPTION_MODEL;
}

function socialVectorStoreId(env: Pick<SocialCaptionBindings, "SOCIAL_VECTOR_STORE_ID" | "WARAPORN_VECTOR_STORE_ID">): string {
  return clean(env.SOCIAL_VECTOR_STORE_ID) ?? clean(env.WARAPORN_VECTOR_STORE_ID) ?? DEFAULT_SOCIAL_VECTOR_STORE_ID;
}

function usageFrom(response: unknown): OpenAiUsage {
  if (!isRecord(response) || !isRecord(response.usage)) {
    return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
  }
  const inputTokens = numeric(response.usage.input_tokens);
  const outputTokens = numeric(response.usage.output_tokens);
  return {
    inputTokens,
    cachedInputTokens: isRecord(response.usage.input_tokens_details) ? numeric(response.usage.input_tokens_details.cached_tokens) : 0,
    outputTokens,
    reasoningTokens: isRecord(response.usage.output_tokens_details) ? numeric(response.usage.output_tokens_details.reasoning_tokens) : 0,
    totalTokens: numeric(response.usage.total_tokens) || inputTokens + outputTokens,
  };
}

function estimateSocialCaptionCostUsd(usage: OpenAiUsage, model: string): number {
  const pricing = SOCIAL_MODEL_PRICING_USD_PER_MILLION[model] ?? SOCIAL_MODEL_PRICING_USD_PER_MILLION[DEFAULT_SOCIAL_CAPTION_MODEL];
  const uncachedInputTokens = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  const cost = (
    uncachedInputTokens * pricing.input
    + usage.cachedInputTokens * pricing.cachedInput
    + usage.outputTokens * pricing.output
  ) / 1_000_000;
  return Number(cost.toFixed(8));
}

function openAiResponseId(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.id === "string" ? payload.id : null;
}

function openAiErrorMessage(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.message !== "string") {
    return "OpenAI social caption request failed.";
  }
  return payload.error.message;
}

function fileSearchCallCountFrom(response: unknown): number {
  if (!isRecord(response) || !Array.isArray(response.output)) return 0;
  return response.output.filter((item) => isRecord(item) && item.type === "file_search_call").length;
}

function outputTextFrom(response: unknown): string {
  if (!isRecord(response)) return "";
  if (typeof response.output_text === "string") return response.output_text.trim();
  if (!Array.isArray(response.output)) return "";
  const parts: string[] = [];
  for (const outputItem of response.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (isRecord(contentItem) && contentItem.type === "output_text" && typeof contentItem.text === "string") {
        parts.push(contentItem.text);
      }
    }
  }
  return parts.join("").trim();
}

function parseJsonObject(value: string, code: "analysis_json_invalid" | "openai_invalid_response"): JsonRecord {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) throw new Error("not object");
    return parsed;
  } catch {
    throw new SocialCaptionError(
      code === "analysis_json_invalid" ? "Social image analysis is not valid JSON." : "OpenAI social caption response was not valid JSON.",
      code,
      502,
    );
  }
}

function stringField(source: JsonRecord, key: keyof NormalizedCaptionJson): string {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new SocialCaptionError(`OpenAI social caption response is missing ${String(key)}.`, "openai_invalid_response", 502);
  }
  return value.trim();
}

function stringArrayField(source: JsonRecord, key: keyof NormalizedCaptionJson, exactLength?: number): string[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new SocialCaptionError(`OpenAI social caption response is missing ${String(key)}.`, "openai_invalid_response", 502);
  }
  const strings = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  if (exactLength !== undefined && strings.length !== exactLength) {
    throw new SocialCaptionError(`OpenAI social caption response must include exactly ${exactLength} ${String(key)}.`, "openai_invalid_response", 502);
  }
  return strings;
}

function normalizedSignature(text: string): string {
  return text
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_-]+/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
}

function compactRecentFingerprint(row: RecentCaptionFingerprint): JsonRecord {
  const fingerprint = row.caption_style_fingerprint ? parseJsonObject(row.caption_style_fingerprint, "analysis_json_invalid") : {};
  const caption = row.caption_json ? parseJsonObject(row.caption_json, "analysis_json_invalid") : {};
  return {
    social_post_id: row.social_post_id,
    caption_prepared_at: row.caption_prepared_at,
    opening_pattern: typeof fingerprint.opening_pattern === "string" ? fingerprint.opening_pattern : null,
    first_words_signature: typeof fingerprint.first_words_signature === "string" ? fingerprint.first_words_signature : null,
    paragraph_count: typeof fingerprint.paragraph_count === "number" ? fingerprint.paragraph_count : null,
    cta_type: typeof fingerprint.cta_type === "string" ? fingerprint.cta_type : null,
    separator_style: typeof fingerprint.separator_style === "string" ? fingerprint.separator_style : null,
    main_theme: typeof fingerprint.main_theme === "string" ? fingerprint.main_theme : null,
    recent_instagram_opening: typeof caption.instagram_caption_en === "string" ? caption.instagram_caption_en.split(/\n+/)[0]?.slice(0, 120) ?? null : null,
    recent_facebook_opening: typeof caption.facebook_caption_en === "string" ? caption.facebook_caption_en.split(/\n+/)[0]?.slice(0, 120) ?? null : null,
  };
}

function normalizeCaptionJson(text: string, recentFingerprints: JsonRecord[]): NormalizedCaptionJson {
  const parsed = parseJsonObject(text, "openai_invalid_response");
  const fingerprint = parsed.caption_style_fingerprint;
  if (!isRecord(fingerprint)) {
    throw new SocialCaptionError("OpenAI social caption response is missing caption_style_fingerprint.", "openai_invalid_response", 502);
  }

  const normalized: NormalizedCaptionJson = {
    instagram_caption: stringField(parsed, "instagram_caption"),
    instagram_caption_en: stringField(parsed, "instagram_caption_en"),
    instagram_caption_th: stringField(parsed, "instagram_caption_th"),
    facebook_caption: stringField(parsed, "facebook_caption"),
    facebook_caption_en: stringField(parsed, "facebook_caption_en"),
    facebook_caption_th: stringField(parsed, "facebook_caption_th"),
    instagram_hashtags: stringArrayField(parsed, "instagram_hashtags", 7),
    facebook_hashtags: stringArrayField(parsed, "facebook_hashtags", 7),
    alt_text: stringField(parsed, "alt_text").slice(0, 300),
    grounding_used: stringArrayField(parsed, "grounding_used").slice(0, 8),
    avoid_claims_respected: parsed.avoid_claims_respected === true,
    caption_style_fingerprint: {
      opening_pattern: typeof fingerprint.opening_pattern === "string" ? fingerprint.opening_pattern : "unknown",
      first_words_signature: typeof fingerprint.first_words_signature === "string" ? fingerprint.first_words_signature : normalizedSignature(stringField(parsed, "instagram_caption_en")),
      paragraph_count: numeric(fingerprint.paragraph_count),
      cta_type: typeof fingerprint.cta_type === "string" ? fingerprint.cta_type : "unknown",
      separator_style: typeof fingerprint.separator_style === "string" ? fingerprint.separator_style : "unknown",
      main_theme: typeof fingerprint.main_theme === "string" ? fingerprint.main_theme : "unknown",
    },
    repetitive_warning: parsed.repetitive_warning === true,
    repetitive_warning_reason: typeof parsed.repetitive_warning_reason === "string" ? parsed.repetitive_warning_reason : null,
  };

  const outputSignature = normalizedSignature(normalized.instagram_caption_en);
  const outputOpening = String(normalized.caption_style_fingerprint.opening_pattern ?? "").toLowerCase();
  const repeated = recentFingerprints.some((recent) => {
    const recentSignature = typeof recent.first_words_signature === "string" ? normalizedSignature(recent.first_words_signature) : "";
    const recentPattern = typeof recent.opening_pattern === "string" ? recent.opening_pattern.toLowerCase() : "";
    return Boolean(outputSignature && recentSignature && outputSignature === recentSignature)
      || Boolean(outputOpening && recentPattern && outputOpening === recentPattern);
  });
  if (repeated) {
    normalized.repetitive_warning = true;
    normalized.repetitive_warning_reason = normalized.repetitive_warning_reason ?? "Opening pattern is similar to recent captions.";
  }

  return normalized;
}

export function buildSocialCaptionRequest(
  analysis: JsonRecord,
  sourceMetadata: JsonRecord | null,
  recentFingerprints: JsonRecord[],
  storeId: string,
  model = DEFAULT_SOCIAL_CAPTION_MODEL,
  now = new Date().toISOString(),
): JsonRecord {
  return {
    model,
    instructions: SOCIAL_CAPTION_PROMPT,
    tools: [{
      type: "file_search",
      vector_store_ids: [storeId],
      max_num_results: SOCIAL_CAPTION_FILE_SEARCH_MAX_RESULTS,
    }],
    tool_choice: "auto",
    max_tool_calls: SOCIAL_CAPTION_MAX_TOOL_CALLS,
    reasoning: { effort: "low" },
    text: {
      verbosity: "medium",
      format: { type: "json_object" },
    },
    prompt_cache_key: "vanara-social-caption-v1",
    prompt_cache_retention: "24h",
    include: ["file_search_call.results"],
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: [
          "Generate final Facebook and Instagram captions for this prepared Vanara social image.",
          "Do not request or use image input in this caption step.",
          "Use analysis_json as visual truth and recent fingerprints as anti-template guardrails.",
          JSON.stringify({
            job_date: now,
            scheduled_publish_at: typeof analysis.scheduled_publish_at === "string" ? analysis.scheduled_publish_at : null,
            location_context: isRecord(analysis.location_context) ? analysis.location_context : {
              resort: "Vanara",
              island: "Koh Chang",
              country: "Thailand",
              source: "app_default",
            },
            analysis_json: analysis,
            source_metadata_json: sourceMetadata,
            avoid_recent_patterns: recentFingerprints,
          }),
        ].join("\n"),
      }],
    }],
  };
}

async function recentCaptionFingerprints(env: Pick<SocialCaptionBindings, "DB">, socialPostId: number): Promise<JsonRecord[]> {
  const result = await env.DB.prepare(`
    SELECT social_post_id, caption_style_fingerprint, caption_json, caption_prepared_at
    FROM social_post_queue
    WHERE social_post_id <> ?
      AND caption_style_fingerprint IS NOT NULL
      AND caption_json IS NOT NULL
    ORDER BY COALESCE(caption_prepared_at, updated_at) DESC, social_post_id DESC
    LIMIT ?
  `).bind(socialPostId, RECENT_CAPTION_LIMIT).all<RecentCaptionFingerprint>();
  return (result.results ?? []).map(compactRecentFingerprint);
}

async function acquireCaptionPost(env: Pick<SocialCaptionBindings, "DB">, socialPostId: number | null, now: string): Promise<SocialPostQueueRow | null> {
  const sql = socialPostId === null
    ? `
      UPDATE social_post_queue
      SET status = 'CAPTIONING',
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = (
        SELECT social_post_id
        FROM social_post_queue
        WHERE status = 'IMAGE_READY'
          AND processed_object_key IS NOT NULL
          AND analysis_json IS NOT NULL
          AND openai_request_count <= 1
        ORDER BY queued_at ASC, social_post_id ASC
        LIMIT 1
      )
        AND status = 'IMAGE_READY'
      RETURNING *
    `
    : `
      UPDATE social_post_queue
      SET status = 'CAPTIONING',
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = ?
        AND status = 'IMAGE_READY'
        AND processed_object_key IS NOT NULL
        AND analysis_json IS NOT NULL
        AND openai_request_count <= 1
      RETURNING *
    `;
  const statement = env.DB.prepare(sql);
  const row = socialPostId === null
    ? await statement.bind(now).first<SocialPostQueueRow>()
    : await statement.bind(now, socialPostId).first<SocialPostQueueRow>();
  return row ?? null;
}

async function markFailed(
  env: Pick<SocialCaptionBindings, "DB">,
  socialPostId: number,
  code: SocialCaptionError["code"],
  message: string,
  now: string,
  result?: SocialCaptionOpenAiResult | null,
): Promise<SocialPostQueueItem | null> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET status = 'FAILED',
        failed_at = ?,
        updated_at = ?,
        failure_code = ?,
        failure_message = ?,
        caption_openai_response_id = COALESCE(?, caption_openai_response_id),
        openai_request_count = CASE WHEN ? IS NULL THEN openai_request_count ELSE 2 END,
        openai_input_tokens = openai_input_tokens + ?,
        openai_cached_input_tokens = openai_cached_input_tokens + ?,
        openai_output_tokens = openai_output_tokens + ?,
        openai_reasoning_tokens = openai_reasoning_tokens + ?,
        openai_total_tokens = openai_total_tokens + ?,
        openai_elapsed_ms = openai_elapsed_ms + ?,
        estimated_cost_usd = estimated_cost_usd + ?
    WHERE social_post_id = ?
  `).bind(
    now,
    now,
    code,
    message.slice(0, 240),
    result?.responseId ?? null,
    result ? 1 : null,
    result?.usage.inputTokens ?? 0,
    result?.usage.cachedInputTokens ?? 0,
    result?.usage.outputTokens ?? 0,
    result?.usage.reasoningTokens ?? 0,
    result?.usage.totalTokens ?? 0,
    result?.elapsedMs ?? 0,
    result?.estimatedCostUsd ?? 0,
    socialPostId,
  ).run();
  const row = await env.DB.prepare(`${socialPostSelectSql()} WHERE social_post_id = ?`).bind(socialPostId).first<SocialPostQueueRow>();
  return row ? rowToItem(row) : null;
}

async function callOpenAiSocialCaption(
  env: SocialCaptionBindings,
  analysis: JsonRecord,
  sourceMetadata: JsonRecord | null,
  recentFingerprints: JsonRecord[],
  storeId: string,
  options: PrepareSocialCaptionOptions,
): Promise<SocialCaptionOpenAiResult> {
  const apiKey = clean(env.OPENAI_API_KEY);
  if (!apiKey) throw new SocialCaptionError("OPENAI_API_KEY is missing.", "openai_request_failed", 502);

  const model = socialCaptionModel(env);
  const requestBody = buildSocialCaptionRequest(analysis, sourceMetadata, recentFingerprints, storeId, model, options.now);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), SOCIAL_CAPTION_TIMEOUT_MS);
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
    if (isAbortError(error)) throw new SocialCaptionError("OpenAI social caption request timed out.", "openai_timeout", 502);
    throw new SocialCaptionError(
      error instanceof Error ? error.message : "OpenAI social caption request failed.",
      "openai_request_failed",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);
  const elapsedMs = Date.now() - started;
  if (!response.ok) throw new SocialCaptionError(openAiErrorMessage(payload), "openai_request_failed", 502);

  const usage = usageFrom(payload);
  let normalized: NormalizedCaptionJson;
  try {
    normalized = normalizeCaptionJson(outputTextFrom(payload), recentFingerprints);
  } catch (error) {
    if (error instanceof SocialCaptionError) {
      throw new SocialCaptionError(error.message, error.code, error.status, {
        captionJson: "",
        captionStyleFingerprint: "",
        responseId: openAiResponseId(payload) ?? response.headers.get("x-request-id") ?? response.headers.get("openai-request-id"),
        usage,
        elapsedMs,
        estimatedCostUsd: estimateSocialCaptionCostUsd(usage, model),
        fileSearchCallCount: fileSearchCallCountFrom(payload),
      });
    }
    throw error;
  }
  return {
    captionJson: JSON.stringify(normalized),
    captionStyleFingerprint: JSON.stringify(normalized.caption_style_fingerprint),
    responseId: openAiResponseId(payload) ?? response.headers.get("x-request-id") ?? response.headers.get("openai-request-id"),
    usage,
    elapsedMs,
    estimatedCostUsd: estimateSocialCaptionCostUsd(usage, model),
    fileSearchCallCount: fileSearchCallCountFrom(payload),
  };
}

export async function prepareSocialCaption(
  env: SocialCaptionBindings,
  socialPostId: number | null = null,
  options: PrepareSocialCaptionOptions = {},
): Promise<PrepareSocialCaptionResult> {
  const now = options.now ?? new Date().toISOString();
  const leased = await acquireCaptionPost(env, socialPostId, now);
  if (!leased) {
    if (socialPostId === null) return { processed: false, item: null };
    throw new SocialCaptionError("Social post is not eligible for caption preparation.", "social_post_not_eligible", 400);
  }

  let openAiResult: SocialCaptionOpenAiResult | null = null;
  try {
    if (!leased.analysis_json) {
      const item = await markFailed(env, leased.social_post_id, "analysis_json_missing", "Social image analysis is missing.", now);
      return { processed: false, item };
    }
    const analysis = parseJsonObject(leased.analysis_json, "analysis_json_invalid");
    const sourceMetadata = leased.source_metadata_json ? parseJsonObject(leased.source_metadata_json, "analysis_json_invalid") : null;
    const recent = await recentCaptionFingerprints(env, leased.social_post_id);
    const storeId = socialVectorStoreId(env);

    openAiResult = await callOpenAiSocialCaption(env, analysis, sourceMetadata, recent, storeId, options);
    if (openAiResult.fileSearchCallCount > SOCIAL_CAPTION_MAX_TOOL_CALLS) {
      throw new SocialCaptionError("OpenAI exceeded the social caption file_search call limit.", "openai_tool_call_limit_exceeded", 502);
    }

    const updateResult = await env.DB.prepare(`
      UPDATE social_post_queue
      SET status = 'READY_TO_POST',
          caption_prepared_at = ?,
          updated_at = ?,
          caption_json = ?,
          caption_openai_response_id = ?,
          caption_style_fingerprint = ?,
          openai_request_count = 2,
          openai_input_tokens = openai_input_tokens + ?,
          openai_cached_input_tokens = openai_cached_input_tokens + ?,
          openai_output_tokens = openai_output_tokens + ?,
          openai_reasoning_tokens = openai_reasoning_tokens + ?,
          openai_total_tokens = openai_total_tokens + ?,
          openai_elapsed_ms = openai_elapsed_ms + ?,
          estimated_cost_usd = estimated_cost_usd + ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = ?
        AND status = 'CAPTIONING'
    `).bind(
      now,
      now,
      openAiResult.captionJson,
      openAiResult.responseId,
      openAiResult.captionStyleFingerprint,
      openAiResult.usage.inputTokens,
      openAiResult.usage.cachedInputTokens,
      openAiResult.usage.outputTokens,
      openAiResult.usage.reasoningTokens,
      openAiResult.usage.totalTokens,
      openAiResult.elapsedMs,
      openAiResult.estimatedCostUsd,
      leased.social_post_id,
    ).run();
    if (numeric(updateResult.meta.changes) !== 1) {
      throw new SocialCaptionError("Social caption could not be saved.", "caption_persistence_failed", 500);
    }

    const row = await env.DB.prepare(`${socialPostSelectSql()} WHERE social_post_id = ?`).bind(leased.social_post_id).first<SocialPostQueueRow>();
    return { processed: true, item: row ? rowToItem(row) : null };
  } catch (error) {
    if (error instanceof SocialCaptionError && error.code !== "caption_persistence_failed") {
      const item = await markFailed(env, leased.social_post_id, error.code, error.message, now, openAiResult ?? error.openAiResult);
      return { processed: false, item };
    }
    const item = await markFailed(env, leased.social_post_id, "caption_persistence_failed", "Social caption could not be saved.", now, openAiResult);
    if (error instanceof SocialCaptionError) return { processed: false, item };
    throw error;
  }
}

export async function prepareNextSocialCaption(
  env: SocialCaptionBindings,
  options: PrepareSocialCaptionOptions = {},
): Promise<PrepareSocialCaptionResult> {
  return prepareSocialCaption(env, null, options);
}
