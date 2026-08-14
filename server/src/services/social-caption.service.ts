import { SOCIAL_CAPTION_PROMPT } from "../assets/prompts/social-caption-v1.prompt.js";
import type { SocialAutomationBindings, SocialPostQueueItem } from "./social-automation.service.js";
import {
  runSocialOpenAiBackgroundResponse,
  SocialOpenAiBackgroundError,
  type SocialOpenAiBackgroundCheckpoint,
} from "./social-openai-background.service.js";
import { socialBangkokDayBounds, socialPublishSlotForBangkokDate } from "./social-schedule.service.js";

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
  dueBy?: string;
  fetcher?: Fetcher;
  backgroundTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface PrepareSocialCaptionResult {
  processed: boolean;
  item: SocialPostQueueItem | null;
}

export interface SocialCaptionWatchdogResult {
  retrySafe: number;
  manualReview: number;
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
  image_openai_response_id: string | null;
  caption_openai_response_id: string | null;
  caption_client_request_id: string | null;
  caption_provider_request_id: string | null;
  caption_provider_status: string | null;
  caption_submitted_at: string | null;
  caption_last_polled_at: string | null;
  caption_provider_terminal_at: string | null;
  caption_provider_error_code: string | null;
  caption_provider_error_message: string | null;
  caption_poll_lease_token: string | null;
  caption_poll_lease_at: string | null;
  caption_leased_at: string | null;
  caption_request_started_at: string | null;
  caption_response_received_at: string | null;
  caption_attempt_count: number;
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

export const SOCIAL_CAPTION_CRON = "*/10 22 * * *";
export const SOCIAL_CAPTION_MAX_TOOL_CALLS = 1;
export const SOCIAL_CAPTION_TIMEOUT_MS = 60_000;
export const DEFAULT_SOCIAL_CAPTION_MODEL = "gpt-5.6-terra";
export const DEFAULT_SOCIAL_VECTOR_STORE_ID = "vs_6a48c08b24a88191b45bc43c2579d37f";

const SOCIAL_CAPTION_STALE_LEASE_MS = 15 * 60_000;
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
      source_metadata_json,
      image_openai_response_id,
      caption_openai_response_id,
      caption_client_request_id,
      caption_provider_request_id,
      caption_provider_status,
      caption_submitted_at,
      caption_last_polled_at,
      caption_provider_terminal_at,
      caption_provider_error_code,
      caption_provider_error_message,
      caption_poll_lease_token,
      caption_poll_lease_at,
      caption_leased_at,
      caption_request_started_at,
      caption_response_received_at,
      caption_attempt_count
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

async function acquireCaptionPost(
  env: Pick<SocialCaptionBindings, "DB">,
  socialPostId: number | null,
  now: string,
  dueBy: string,
): Promise<SocialPostQueueRow | null> {
  const leaseToken = crypto.randomUUID();
  const clientRequestId = crypto.randomUUID();
  const staleLeaseCutoff = new Date(new Date(now).getTime() - SOCIAL_CAPTION_STALE_LEASE_MS).toISOString();
  const recoverySql = socialPostId === null
    ? `
      UPDATE social_post_queue
      SET caption_poll_lease_token = ?,
          caption_poll_lease_at = ?,
          caption_client_request_id = COALESCE(caption_client_request_id, ?),
          updated_at = ?
      WHERE social_post_id = (
        SELECT social_post_id
        FROM social_post_queue
        WHERE status = 'CAPTIONING'
          AND caption_openai_response_id IS NOT NULL
          AND scheduled_publish_at IS NOT NULL
          AND scheduled_publish_at <= ?
          AND (caption_poll_lease_at IS NULL OR caption_poll_lease_at <= ?)
        ORDER BY scheduled_publish_at ASC, queued_at ASC, social_post_id ASC
        LIMIT 1
      )
        AND status = 'CAPTIONING'
        AND caption_openai_response_id IS NOT NULL
        AND (caption_poll_lease_at IS NULL OR caption_poll_lease_at <= ?)
      RETURNING *
    `
    : `
      UPDATE social_post_queue
      SET caption_poll_lease_token = ?,
          caption_poll_lease_at = ?,
          caption_client_request_id = COALESCE(caption_client_request_id, ?),
          updated_at = ?
      WHERE social_post_id = ?
        AND status = 'CAPTIONING'
        AND caption_openai_response_id IS NOT NULL
        AND (caption_poll_lease_at IS NULL OR caption_poll_lease_at <= ?)
      RETURNING *
    `;
  const recovery = socialPostId === null
    ? await env.DB.prepare(recoverySql).bind(
      leaseToken,
      now,
      clientRequestId,
      now,
      dueBy,
      staleLeaseCutoff,
      staleLeaseCutoff,
    ).first<SocialPostQueueRow>()
    : await env.DB.prepare(recoverySql).bind(
      leaseToken,
      now,
      clientRequestId,
      now,
      socialPostId,
      staleLeaseCutoff,
    ).first<SocialPostQueueRow>();
  if (recovery) return recovery;

  const bounds = socialBangkokDayBounds(now);
  const sql = socialPostId === null
    ? `
      UPDATE social_post_queue
      SET status = 'CAPTIONING',
          caption_leased_at = ?,
          caption_client_request_id = COALESCE(caption_client_request_id, ?),
          caption_provider_status = 'created',
          caption_provider_error_code = NULL,
          caption_provider_error_message = NULL,
          caption_poll_lease_token = ?,
          caption_poll_lease_at = ?,
          caption_attempt_count = caption_attempt_count + 1,
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = (
        SELECT candidate.social_post_id
        FROM social_post_queue candidate
        WHERE candidate.status = 'IMAGE_READY'
          AND candidate.processed_object_key IS NOT NULL
          AND candidate.analysis_json IS NOT NULL
          AND candidate.image_openai_response_id IS NOT NULL
          AND candidate.openai_request_count = 1
          AND candidate.scheduled_publish_at IS NOT NULL
          AND candidate.scheduled_publish_at <= ?
          AND NOT EXISTS (
            SELECT 1
            FROM social_post_queue active
            WHERE active.social_post_id <> candidate.social_post_id
              AND active.status IN ('CAPTIONING','READY_TO_POST','POSTING')
              AND active.scheduled_publish_at IS NOT NULL
              AND active.scheduled_publish_at <= ?
          )
          AND NOT EXISTS (
            SELECT 1
            FROM social_post_queue started
            WHERE started.social_post_id <> candidate.social_post_id
              AND started.caption_leased_at >= ?
              AND started.caption_leased_at < ?
          )
        ORDER BY candidate.scheduled_publish_at ASC, candidate.queued_at ASC, candidate.social_post_id ASC
        LIMIT 1
      )
        AND status = 'IMAGE_READY'
      RETURNING *
    `
    : `
      UPDATE social_post_queue
      SET status = 'CAPTIONING',
          caption_leased_at = ?,
          caption_client_request_id = COALESCE(caption_client_request_id, ?),
          caption_provider_status = 'created',
          caption_provider_error_code = NULL,
          caption_provider_error_message = NULL,
          caption_poll_lease_token = ?,
          caption_poll_lease_at = ?,
          caption_attempt_count = caption_attempt_count + 1,
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = ?
        AND status = 'IMAGE_READY'
        AND processed_object_key IS NOT NULL
        AND analysis_json IS NOT NULL
        AND image_openai_response_id IS NOT NULL
        AND openai_request_count = 1
      RETURNING *
  `;
  const row = socialPostId === null
    ? await env.DB.prepare(sql).bind(
      now,
      clientRequestId,
      leaseToken,
      now,
      now,
      dueBy,
      dueBy,
      bounds.start,
      bounds.end,
    ).first<SocialPostQueueRow>()
    : await env.DB.prepare(sql).bind(now, clientRequestId, leaseToken, now, now, socialPostId).first<SocialPostQueueRow>();
  return row ?? null;
}

async function markCaptionPrerequisiteWaiting(
  env: Pick<SocialCaptionBindings, "DB">,
  dueBy: string,
  now: string,
): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET pipeline_stage = 'CAPTION_WAITING_FOR_IMAGE', updated_at = ?
    WHERE social_post_id = (
      SELECT social_post_id
      FROM social_post_queue
      WHERE status IN ('QUEUED','PREPARING_IMAGE')
        AND scheduled_publish_at IS NOT NULL
        AND scheduled_publish_at <= ?
      ORDER BY scheduled_publish_at ASC, queued_at ASC, social_post_id ASC
      LIMIT 1
    )
  `).bind(now, dueBy).run();
}

export async function reconcileStaleSocialCaptionPreparations(
  env: Pick<SocialCaptionBindings, "DB">,
  now = new Date().toISOString(),
): Promise<SocialCaptionWatchdogResult> {
  const cutoff = new Date(new Date(now).getTime() - SOCIAL_CAPTION_STALE_LEASE_MS).toISOString();
  const retrySafe = await env.DB.prepare(`
    UPDATE social_post_queue
    SET status = 'IMAGE_READY',
        caption_provider_status = 'retry_safe',
        caption_poll_lease_token = NULL,
        caption_poll_lease_at = NULL,
        caption_leased_at = NULL,
        updated_at = ?,
        failure_code = 'caption_preparation_interrupted_retry_safe',
        failure_message = 'Caption preparation stopped before any AI request. The prepared image is preserved.'
    WHERE status = 'CAPTIONING'
      AND COALESCE(caption_poll_lease_at, caption_leased_at) <= ?
      AND caption_request_started_at IS NULL
      AND caption_openai_response_id IS NULL
      AND openai_request_count = 1
  `).bind(now, cutoff).run();

  const manualReview = await env.DB.prepare(`
    UPDATE social_post_queue
    SET status = 'FAILED',
        pipeline_stage = 'MANUAL_REVIEW',
        caption_provider_status = 'failed',
        caption_provider_error_code = 'ambiguous_submission',
        caption_provider_error_message = 'Caption request outcome is unknown. Automatic retry is blocked.',
        caption_provider_terminal_at = ?,
        caption_poll_lease_token = NULL,
        caption_poll_lease_at = NULL,
        failed_at = ?,
        updated_at = ?,
        failure_code = 'caption_ambiguous_submission_manual_review',
        failure_message = 'Caption request outcome is unknown. Automatic retry is blocked.'
    WHERE status = 'CAPTIONING'
      AND COALESCE(caption_poll_lease_at, caption_leased_at) <= ?
      AND caption_openai_response_id IS NULL
      AND (caption_request_started_at IS NOT NULL OR openai_request_count > 1)
  `).bind(now, now, now, cutoff).run();

  return {
    retrySafe: numeric(retrySafe.meta.changes),
    manualReview: numeric(manualReview.meta.changes),
  };
}

async function markCaptionRequestStarted(
  env: Pick<SocialCaptionBindings, "DB">,
  socialPostId: number,
  now: string,
): Promise<void> {
  const result = await env.DB.prepare(`
    UPDATE social_post_queue
    SET caption_request_started_at = ?,
        caption_submitted_at = ?,
        caption_provider_status = 'submitting',
        openai_request_count = openai_request_count + 1,
        updated_at = ?
    WHERE social_post_id = ?
      AND status = 'CAPTIONING'
      AND caption_request_started_at IS NULL
      AND caption_client_request_id IS NOT NULL
      AND caption_openai_response_id IS NULL
      AND openai_request_count = 1
  `).bind(now, now, now, socialPostId).run();
  if (numeric(result.meta.changes) !== 1) {
    throw new SocialCaptionError("Social caption request checkpoint could not be saved.", "caption_persistence_failed", 500);
  }
}

async function checkpointCaptionResponse(
  env: Pick<SocialCaptionBindings, "DB">,
  socialPostId: number,
  checkpoint: SocialOpenAiBackgroundCheckpoint,
  now: string,
): Promise<void> {
  const result = await env.DB.prepare(`
    UPDATE social_post_queue
    SET caption_response_received_at = ?,
        caption_openai_response_id = ?,
        caption_provider_request_id = COALESCE(?, caption_provider_request_id),
        caption_provider_status = ?,
        caption_last_polled_at = ?,
        caption_poll_lease_at = ?,
        caption_provider_terminal_at = CASE WHEN ? IN ('completed','failed','cancelled','incomplete') THEN ? ELSE caption_provider_terminal_at END,
        updated_at = ?
    WHERE social_post_id = ?
      AND status = 'CAPTIONING'
      AND openai_request_count = 2
      AND caption_client_request_id IS NOT NULL
  `).bind(
    now,
    checkpoint.responseId,
    checkpoint.providerRequestId,
    checkpoint.status,
    now,
    now,
    checkpoint.status,
    now,
    now,
    socialPostId,
  ).run();
  if (numeric(result.meta.changes) !== 1) {
    throw new SocialCaptionError("Social caption response checkpoint could not be saved.", "caption_persistence_failed", 500);
  }
}

async function releaseCaptionPollLease(
  env: Pick<SocialCaptionBindings, "DB">,
  socialPostId: number,
  providerStatus: string,
  now: string,
): Promise<SocialPostQueueItem | null> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET caption_provider_status = ?,
        caption_last_polled_at = ?,
        caption_poll_lease_token = NULL,
        caption_poll_lease_at = NULL,
        updated_at = ?
    WHERE social_post_id = ?
      AND status = 'CAPTIONING'
      AND caption_openai_response_id IS NOT NULL
  `).bind(providerStatus, now, now, socialPostId).run();
  const row = await env.DB.prepare(`${socialPostSelectSql()} WHERE social_post_id = ?`).bind(socialPostId).first<SocialPostQueueRow>();
  return row ? rowToItem(row) : null;
}

async function markCaptionProviderFailure(
  env: Pick<SocialCaptionBindings, "DB">,
  socialPostId: number,
  error: SocialOpenAiBackgroundError,
  now: string,
): Promise<SocialPostQueueItem | null> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET status = 'FAILED',
        caption_provider_status = 'failed',
        caption_provider_error_code = ?,
        caption_provider_error_message = ?,
        caption_provider_terminal_at = ?,
        caption_poll_lease_token = NULL,
        caption_poll_lease_at = NULL,
        failed_at = ?,
        updated_at = ?,
        failure_code = ?,
        failure_message = ?
    WHERE social_post_id = ?
  `).bind(
    error.code,
    error.message.slice(0, 240),
    now,
    now,
    now,
    `caption_${error.code}_manual_review`,
    error.message.slice(0, 240),
    socialPostId,
  ).run();
  const row = await env.DB.prepare(`${socialPostSelectSql()} WHERE social_post_id = ?`).bind(socialPostId).first<SocialPostQueueRow>();
  return row ? rowToItem(row) : null;
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
  row: SocialPostQueueRow,
  analysis: JsonRecord,
  sourceMetadata: JsonRecord | null,
  recentFingerprints: JsonRecord[],
  storeId: string,
  options: PrepareSocialCaptionOptions,
): Promise<SocialCaptionOpenAiResult> {
  const apiKey = clean(env.OPENAI_API_KEY);
  if (!apiKey) throw new SocialCaptionError("OPENAI_API_KEY is missing.", "openai_request_failed", 502);
  if (!row.caption_client_request_id) {
    throw new SocialCaptionError("Social caption request id is missing.", "caption_persistence_failed", 500);
  }

  const model = socialCaptionModel(env);
  const fetcher = options.fetcher ?? env.fetcher ?? fetch;
  const started = Date.now();
  const backgroundResult = await runSocialOpenAiBackgroundResponse({
    apiKey,
    body: row.caption_openai_response_id
      ? null
      : buildSocialCaptionRequest(analysis, sourceMetadata, recentFingerprints, storeId, model, options.now),
    clientRequestId: row.caption_client_request_id,
    fetcher,
    responseId: row.caption_openai_response_id,
    timeoutMs: options.backgroundTimeoutMs ?? SOCIAL_CAPTION_TIMEOUT_MS,
    pollIntervalMs: options.pollIntervalMs,
    onCheckpoint: (checkpoint) => checkpointCaptionResponse(
      env,
      row.social_post_id,
      checkpoint,
      options.now ?? new Date().toISOString(),
    ),
  });
  const payload = backgroundResult.payload;
  const elapsedMs = Date.now() - started;

  const usage = usageFrom(payload);
  let normalized: NormalizedCaptionJson;
  try {
    normalized = normalizeCaptionJson(outputTextFrom(payload), recentFingerprints);
  } catch (error) {
    if (error instanceof SocialCaptionError) {
      throw new SocialCaptionError(error.message, error.code, error.status, {
        captionJson: "",
        captionStyleFingerprint: "",
        responseId: backgroundResult.responseId,
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
    responseId: backgroundResult.responseId,
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
  if (socialPostId === null) await reconcileStaleSocialCaptionPreparations(env, now);
  const dueBy = options.dueBy ?? socialPublishSlotForBangkokDate(now);
  const leased = await acquireCaptionPost(env, socialPostId, now, dueBy);
  if (!leased) {
    if (socialPostId === null) {
      await markCaptionPrerequisiteWaiting(env, dueBy, now);
      return { processed: false, item: null };
    }
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

    if (!leased.caption_openai_response_id) {
      await markCaptionRequestStarted(env, leased.social_post_id, options.now ?? new Date().toISOString());
    }
    openAiResult = await callOpenAiSocialCaption(env, leased, analysis, sourceMetadata, recent, storeId, options);
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
          caption_provider_status = 'completed',
          caption_provider_terminal_at = ?,
          caption_provider_error_code = NULL,
          caption_provider_error_message = NULL,
          caption_poll_lease_token = NULL,
          caption_poll_lease_at = NULL,
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
        AND processed_object_key IS NOT NULL
        AND image_openai_response_id IS NOT NULL
        AND caption_openai_response_id IS NOT NULL
        AND openai_request_count = 2
    `).bind(
      now,
      now,
      openAiResult.captionJson,
      openAiResult.responseId,
      options.now ?? new Date().toISOString(),
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
    if (error instanceof SocialOpenAiBackgroundError) {
      if (error.code === "timeout" && error.responseId) {
        const item = await releaseCaptionPollLease(env, leased.social_post_id, "in_progress", now);
        return { processed: false, item };
      }
      const item = await markCaptionProviderFailure(env, leased.social_post_id, error, now);
      return { processed: false, item };
    }
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
