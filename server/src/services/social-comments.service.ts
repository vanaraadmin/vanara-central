import { SOCIAL_COMMENT_REPLY_PROMPT } from "../assets/prompts/social-comment-reply-v1.prompt.js";

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

export type SocialCommentPlatform = "FACEBOOK" | "INSTAGRAM";
export type SocialCommentStatus = "NEW" | "SKIPPED" | "GENERATING" | "NO_REPLY" | "PUBLISHING" | "REPLIED" | "FAILED";

export interface SocialCommentBindings {
  DB: D1Database;
  OPENAI_API_KEY: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_FACEBOOK_PAGE_ID?: string;
  META_INSTAGRAM_BUSINESS_ACCOUNT_ID?: string;
  META_GRAPH_API_VERSION?: string;
  SOCIAL_COMMENT_MODEL?: string;
  SOCIAL_COMMENT_AI_BUDGET_PER_RUN?: string;
  SOCIAL_VECTOR_STORE_ID?: string;
  WARAPORN_VECTOR_STORE_ID?: string;
  fetcher?: Fetcher;
}

export interface SocialCommentRunOptions {
  now?: string;
  fetcher?: Fetcher;
  maxAiComments?: number;
}

export interface SocialCommentRunResult {
  checked: number;
  imported: number;
  skippedLocal: number;
  aiEvaluated: number;
  repliesPublished: number;
  noReply: number;
  failed: number;
}

interface SocialCommentRow {
  social_comment_id: number;
  platform: SocialCommentPlatform;
  provider_comment_id: string;
  provider_parent_id: string;
  post_caption: string | null;
  post_permalink: string | null;
  author_provider_id: string | null;
  author_username: string | null;
  author_name: string | null;
  comment_text: string;
  commented_at: string | null;
  status: SocialCommentStatus;
  reply_text: string | null;
  openai_request_count: number;
  failure_code: string | null;
  created_at: string;
}

interface IncomingPost {
  platform: SocialCommentPlatform;
  id: string;
  caption: string;
  permalink: string | null;
}

interface IncomingComment {
  platform: SocialCommentPlatform;
  providerCommentId: string;
  providerParentId: string;
  postCaption: string;
  postPermalink: string | null;
  authorProviderId: string | null;
  authorUsername: string | null;
  authorName: string | null;
  text: string;
  commentedAt: string | null;
}

interface OpenAiUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

interface SocialCommentAiResult {
  shouldReply: boolean;
  replyText: string | null;
  language: string;
  reason: string;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  responseId: string | null;
  usage: OpenAiUsage;
  elapsedMs: number;
  estimatedCostUsd: number;
}

interface MetaConfig {
  token: string;
  facebookPageId: string;
  instagramBusinessAccountId: string;
  graphVersion: string;
}

export class SocialCommentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "social_comment_config_missing"
      | "social_comment_openai_failed"
      | "social_comment_openai_timeout"
      | "social_comment_invalid_ai_response"
      | "social_comment_publish_failed",
    public readonly status: 400 | 500 | 502 = 400,
  ) {
    super(message);
    this.name = "SocialCommentError";
  }
}

export const SOCIAL_COMMENT_CRON = "17 * * * *";
export const DEFAULT_SOCIAL_COMMENT_MODEL = "gpt-5.6-luna";
export const DEFAULT_SOCIAL_COMMENT_AI_BUDGET_PER_RUN = 6;

const DEFAULT_META_GRAPH_API_VERSION = "v25.0";
const DEFAULT_SOCIAL_VECTOR_STORE_ID = "vs_6a48c08b24a88191b45bc43c2579d37f";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const SOCIAL_COMMENT_TIMEOUT_MS = 45_000;
const SOCIAL_COMMENT_FILE_SEARCH_MAX_RESULTS = 4;
const SOCIAL_COMMENT_MAX_TOOL_CALLS = 1;
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

function clampedConfidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function requireMetaConfig(env: SocialCommentBindings): MetaConfig {
  const token = clean(env.META_PAGE_ACCESS_TOKEN);
  const facebookPageId = clean(env.META_FACEBOOK_PAGE_ID);
  const instagramBusinessAccountId = clean(env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID);
  if (!token || !facebookPageId || !instagramBusinessAccountId) {
    throw new SocialCommentError("Social comment automation configuration is missing.", "social_comment_config_missing", 500);
  }
  return {
    token,
    facebookPageId,
    instagramBusinessAccountId,
    graphVersion: clean(env.META_GRAPH_API_VERSION) ?? DEFAULT_META_GRAPH_API_VERSION,
  };
}

function model(env: Pick<SocialCommentBindings, "SOCIAL_COMMENT_MODEL">): string {
  return clean(env.SOCIAL_COMMENT_MODEL) ?? DEFAULT_SOCIAL_COMMENT_MODEL;
}

function storeId(env: Pick<SocialCommentBindings, "SOCIAL_VECTOR_STORE_ID" | "WARAPORN_VECTOR_STORE_ID">): string {
  return clean(env.SOCIAL_VECTOR_STORE_ID) ?? clean(env.WARAPORN_VECTOR_STORE_ID) ?? DEFAULT_SOCIAL_VECTOR_STORE_ID;
}

function aiBudget(env: Pick<SocialCommentBindings, "SOCIAL_COMMENT_AI_BUDGET_PER_RUN">, options: SocialCommentRunOptions): number {
  if (Number.isInteger(options.maxAiComments) && Number(options.maxAiComments) >= 0) return Math.min(Number(options.maxAiComments), 20);
  const configured = Number(env.SOCIAL_COMMENT_AI_BUDGET_PER_RUN);
  return Number.isInteger(configured) && configured >= 0 ? Math.min(configured, 20) : DEFAULT_SOCIAL_COMMENT_AI_BUDGET_PER_RUN;
}

function metaUrl(config: MetaConfig, path: string): string {
  return `https://graph.facebook.com/${config.graphVersion}/${path.replace(/^\/+/, "")}`;
}

async function metaGet(fetcher: Fetcher, config: MetaConfig, path: string, fields: Record<string, string>): Promise<JsonRecord> {
  const url = new URL(metaUrl(config, path));
  for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
  const response = await fetcher(url.toString(), {
    method: "GET",
    headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
  });
  return parseMetaResponse(response);
}

async function metaPost(fetcher: Fetcher, config: MetaConfig, path: string, fields: Record<string, string>): Promise<JsonRecord> {
  const response = await fetcher(metaUrl(config, path), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(fields).toString(),
  });
  return parseMetaResponse(response);
}

async function parseMetaResponse(response: Response): Promise<JsonRecord> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : "Meta social comment request failed.";
    throw new SocialCommentError(message, "social_comment_publish_failed", 502);
  }
  return isRecord(payload) ? payload : {};
}

function dataArray(payload: JsonRecord): JsonRecord[] {
  return Array.isArray(payload.data) ? payload.data.filter(isRecord) : [];
}

async function fetchRecentPosts(fetcher: Fetcher, config: MetaConfig): Promise<IncomingPost[]> {
  const [instagram, facebook] = await Promise.all([
    metaGet(fetcher, config, `${encodeURIComponent(config.instagramBusinessAccountId)}/media`, { fields: "id,caption,permalink", limit: "5" }),
    metaGet(fetcher, config, `${encodeURIComponent(config.facebookPageId)}/published_posts`, { fields: "id,message,permalink_url", limit: "5" }),
  ]);
  return [
    ...dataArray(instagram).map((post) => ({
      platform: "INSTAGRAM" as const,
      id: typeof post.id === "string" ? post.id : "",
      caption: typeof post.caption === "string" ? post.caption : "",
      permalink: typeof post.permalink === "string" ? post.permalink : null,
    })),
    ...dataArray(facebook).map((post) => ({
      platform: "FACEBOOK" as const,
      id: typeof post.id === "string" ? post.id : "",
      caption: typeof post.message === "string" ? post.message : "",
      permalink: typeof post.permalink_url === "string" ? post.permalink_url : null,
    })),
  ].filter((post) => post.id);
}

async function fetchPostComments(fetcher: Fetcher, config: MetaConfig, post: IncomingPost): Promise<IncomingComment[]> {
  const payload = await metaGet(fetcher, config, `${encodeURIComponent(post.id)}/comments`, {
    fields: post.platform === "INSTAGRAM" ? "id,text,username,timestamp" : "id,message,from,created_time",
    limit: "25",
  });
  return dataArray(payload).map((comment) => {
    const from = isRecord(comment.from) ? comment.from : {};
    return {
      platform: post.platform,
      providerCommentId: typeof comment.id === "string" ? comment.id : "",
      providerParentId: post.id,
      postCaption: post.caption,
      postPermalink: post.permalink,
      authorProviderId: typeof from.id === "string" ? from.id : null,
      authorUsername: typeof comment.username === "string" ? comment.username : null,
      authorName: typeof from.name === "string" ? from.name : (typeof comment.username === "string" ? comment.username : null),
      text: typeof comment.text === "string" ? comment.text : typeof comment.message === "string" ? comment.message : "",
      commentedAt: typeof comment.timestamp === "string" ? comment.timestamp : typeof comment.created_time === "string" ? comment.created_time : null,
    };
  }).filter((comment) => comment.providerCommentId && comment.text.trim());
}

export function shouldSkipSocialCommentLocally(comment: Pick<IncomingComment, "text" | "authorProviderId" | "authorUsername" | "authorName" | "platform">, config: Pick<MetaConfig, "facebookPageId" | "instagramBusinessAccountId">): string | null {
  const text = comment.text.trim();
  if (!text) return "empty";
  const authorId = clean(comment.authorProviderId);
  if (authorId && (authorId === config.facebookPageId || authorId === config.instagramBusinessAccountId)) return "own_account";
  const author = `${comment.authorUsername ?? ""} ${comment.authorName ?? ""}`.toLowerCase();
  if (author.includes("vanara")) return "own_account";
  if (/https?:\/\/|www\.|bit\.ly|t\.me\/|wa\.me\/|telegram|whatsapp/i.test(text)) return "spam_link";
  if (/\b(crypto|forex|investment|loan|casino|betting|followers|promotion|promo|dm us|earn money)\b/i.test(text)) return "spam";
  const lettersOrNumbers = text.match(/[\p{L}\p{N}]/gu) ?? [];
  if (lettersOrNumbers.length === 0 && text.length <= 16) return "emoji_only";
  return null;
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

function estimateCostUsd(usage: OpenAiUsage, selectedModel: string): number {
  const pricing = SOCIAL_MODEL_PRICING_USD_PER_MILLION[selectedModel] ?? SOCIAL_MODEL_PRICING_USD_PER_MILLION[DEFAULT_SOCIAL_COMMENT_MODEL];
  const uncached = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  return Number(((uncached * pricing.input + usage.cachedInputTokens * pricing.cachedInput + usage.outputTokens * pricing.output) / 1_000_000).toFixed(8));
}

function outputTextFrom(response: unknown): string {
  if (!isRecord(response)) return "";
  if (typeof response.output_text === "string") return response.output_text.trim();
  if (!Array.isArray(response.output)) return "";
  const parts: string[] = [];
  for (const outputItem of response.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (isRecord(contentItem) && contentItem.type === "output_text" && typeof contentItem.text === "string") parts.push(contentItem.text);
    }
  }
  return parts.join("").trim();
}

function responseId(payload: unknown, response: Response): string | null {
  return isRecord(payload) && typeof payload.id === "string"
    ? payload.id
    : response.headers.get("x-request-id") ?? response.headers.get("openai-request-id");
}

function normalizeAiJson(text: string): Omit<SocialCommentAiResult, "responseId" | "usage" | "elapsedMs" | "estimatedCostUsd"> {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) throw new Error("not_object");
    const shouldReply = parsed.should_reply === true;
    const replyText = typeof parsed.reply_text === "string" && parsed.reply_text.trim() ? parsed.reply_text.trim() : null;
    if (shouldReply && !replyText) throw new Error("reply_missing");
    const risk = parsed.risk_level === "medium" || parsed.risk_level === "high" ? parsed.risk_level : "low";
    return {
      shouldReply,
      replyText,
      language: typeof parsed.language === "string" && parsed.language.trim() ? parsed.language.trim().slice(0, 24) : "unknown",
      reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim().slice(0, 240) : "No reason supplied.",
      confidence: clampedConfidence(parsed.confidence),
      riskLevel: risk,
    };
  } catch {
    throw new SocialCommentError("OpenAI social comment response was not valid JSON.", "social_comment_invalid_ai_response", 502);
  }
}

async function recentThreadContext(env: Pick<SocialCommentBindings, "DB">, platform: SocialCommentPlatform, parentId: string): Promise<JsonRecord[]> {
  const result = await env.DB.prepare(`
    SELECT author_name, author_username, comment_text, status, reply_text, commented_at, replied_at
    FROM social_comments
    WHERE platform = ?
      AND provider_parent_id = ?
    ORDER BY COALESCE(commented_at, created_at) DESC, social_comment_id DESC
    LIMIT 8
  `).bind(platform, parentId).all<{
    author_name: string | null;
    author_username: string | null;
    comment_text: string;
    status: string;
    reply_text: string | null;
    commented_at: string | null;
    replied_at: string | null;
  }>();
  return (result.results ?? []).map((row) => ({
    author: row.author_name ?? row.author_username ?? "guest",
    comment: row.comment_text.slice(0, 220),
    status: row.status,
    vanara_reply: row.reply_text ? row.reply_text.slice(0, 220) : null,
    commented_at: row.commented_at,
    replied_at: row.replied_at,
  }));
}

export function buildSocialCommentReplyRequest(input: {
  comment: IncomingComment;
  threadContext: JsonRecord[];
  storeId: string;
  model: string;
  now: string;
}): JsonRecord {
  return {
    model: input.model,
    instructions: SOCIAL_COMMENT_REPLY_PROMPT,
    tools: [{
      type: "file_search",
      vector_store_ids: [input.storeId],
      max_num_results: SOCIAL_COMMENT_FILE_SEARCH_MAX_RESULTS,
    }],
    tool_choice: "auto",
    max_tool_calls: SOCIAL_COMMENT_MAX_TOOL_CALLS,
    reasoning: { effort: "low" },
    text: {
      verbosity: "low",
      format: { type: "json_object" },
    },
    prompt_cache_key: "vanara-social-comment-reply-v1",
    prompt_cache_retention: "24h",
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: JSON.stringify({
          job_date: input.now,
          platform: input.comment.platform,
          post: {
            provider_parent_id: input.comment.providerParentId,
            caption: input.comment.postCaption.slice(0, 1600),
            permalink: input.comment.postPermalink,
          },
          comment: {
            id: input.comment.providerCommentId,
            author_name: input.comment.authorName,
            author_username: input.comment.authorUsername,
            text: input.comment.text.slice(0, 1200),
            commented_at: input.comment.commentedAt,
          },
          compact_thread_context: input.threadContext,
        }),
      }],
    }],
  };
}

async function callOpenAiForComment(
  env: SocialCommentBindings,
  comment: IncomingComment,
  threadContext: JsonRecord[],
  options: SocialCommentRunOptions,
): Promise<SocialCommentAiResult> {
  const apiKey = clean(env.OPENAI_API_KEY);
  if (!apiKey) throw new SocialCommentError("OPENAI_API_KEY is missing.", "social_comment_openai_failed", 502);
  const selectedModel = model(env);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), SOCIAL_COMMENT_TIMEOUT_MS);
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
      body: JSON.stringify(buildSocialCommentReplyRequest({
        comment,
        threadContext,
        storeId: storeId(env),
        model: selectedModel,
        now: options.now ?? new Date().toISOString(),
      })),
    });
  } catch (error) {
    if (isAbortError(error)) throw new SocialCommentError("OpenAI social comment request timed out.", "social_comment_openai_timeout", 502);
    throw new SocialCommentError("OpenAI social comment request failed.", "social_comment_openai_failed", 502);
  } finally {
    clearTimeout(timeout);
  }
  const payload: unknown = await response.json().catch(() => null);
  const elapsedMs = Date.now() - started;
  if (!response.ok) throw new SocialCommentError("OpenAI social comment request failed.", "social_comment_openai_failed", 502);
  const usage = usageFrom(payload);
  return {
    ...normalizeAiJson(outputTextFrom(payload)),
    responseId: responseId(payload, response),
    usage,
    elapsedMs,
    estimatedCostUsd: estimateCostUsd(usage, selectedModel),
  };
}

async function insertCommentIfNew(env: Pick<SocialCommentBindings, "DB">, comment: IncomingComment, now: string): Promise<{ row: SocialCommentRow; created: boolean }> {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO social_comments (
      platform,
      provider_comment_id,
      provider_parent_id,
      post_caption,
      post_permalink,
      author_provider_id,
      author_username,
      author_name,
      comment_text,
      commented_at,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?)
  `).bind(
    comment.platform,
    comment.providerCommentId,
    comment.providerParentId,
    comment.postCaption,
    comment.postPermalink,
    comment.authorProviderId,
    comment.authorUsername,
    comment.authorName,
    comment.text,
    comment.commentedAt,
    now,
    now,
  ).run();
  const row = await env.DB.prepare(`
    SELECT social_comment_id, platform, provider_comment_id, provider_parent_id, post_caption, post_permalink, author_provider_id,
           author_username, author_name, comment_text, commented_at, status, reply_text, openai_request_count, failure_code, created_at
    FROM social_comments
    WHERE platform = ? AND provider_comment_id = ?
  `).bind(comment.platform, comment.providerCommentId).first<SocialCommentRow>();
  if (!row) throw new Error("Social comment could not be stored.");
  return { row, created: row.created_at === now };
}

async function markSkipped(env: Pick<SocialCommentBindings, "DB">, id: number, reason: string, now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_comments
    SET status = 'SKIPPED',
        skip_reason = ?,
        processed_at = ?,
        updated_at = ?
    WHERE social_comment_id = ?
  `).bind(reason.slice(0, 80), now, now, id).run();
}

async function markGenerating(env: Pick<SocialCommentBindings, "DB">, id: number, now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_comments
    SET status = 'GENERATING',
        updated_at = ?,
        failure_code = NULL,
        failure_message = NULL
    WHERE social_comment_id = ?
      AND openai_request_count = 0
  `).bind(now, id).run();
}

async function saveAiDecision(env: Pick<SocialCommentBindings, "DB">, id: number, result: SocialCommentAiResult, now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_comments
    SET status = ?,
        should_reply = ?,
        reply_text = ?,
        language = ?,
        risk_level = ?,
        ai_reason = ?,
        confidence = ?,
        openai_request_count = 1,
        openai_response_id = ?,
        openai_input_tokens = ?,
        openai_cached_input_tokens = ?,
        openai_output_tokens = ?,
        openai_reasoning_tokens = ?,
        openai_total_tokens = ?,
        openai_elapsed_ms = ?,
        estimated_cost_usd = ?,
        processed_at = ?,
        updated_at = ?
    WHERE social_comment_id = ?
  `).bind(
        result.shouldReply ? "PUBLISHING" : "NO_REPLY",
    result.shouldReply ? 1 : 0,
    result.replyText,
    result.language,
    result.riskLevel,
    result.reason,
    result.confidence,
    result.responseId,
    result.usage.inputTokens,
    result.usage.cachedInputTokens,
    result.usage.outputTokens,
    result.usage.reasoningTokens,
    result.usage.totalTokens,
    result.elapsedMs,
    result.estimatedCostUsd,
    now,
    now,
    id,
  ).run();
}

async function markFailed(env: Pick<SocialCommentBindings, "DB">, id: number, code: string, message: string, now: string, result?: SocialCommentAiResult | null): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_comments
    SET status = 'FAILED',
        failure_code = ?,
        failure_message = ?,
        openai_request_count = CASE WHEN ? IS NULL THEN openai_request_count ELSE 1 END,
        openai_response_id = COALESCE(?, openai_response_id),
        openai_input_tokens = CASE WHEN ? IS NULL THEN openai_input_tokens ELSE ? END,
        openai_cached_input_tokens = CASE WHEN ? IS NULL THEN openai_cached_input_tokens ELSE ? END,
        openai_output_tokens = CASE WHEN ? IS NULL THEN openai_output_tokens ELSE ? END,
        openai_reasoning_tokens = CASE WHEN ? IS NULL THEN openai_reasoning_tokens ELSE ? END,
        openai_total_tokens = CASE WHEN ? IS NULL THEN openai_total_tokens ELSE ? END,
        openai_elapsed_ms = CASE WHEN ? IS NULL THEN openai_elapsed_ms ELSE ? END,
        estimated_cost_usd = CASE WHEN ? IS NULL THEN estimated_cost_usd ELSE ? END,
        updated_at = ?
    WHERE social_comment_id = ?
  `).bind(
    code.slice(0, 80),
    message.slice(0, 240),
    result ? 1 : null,
    result?.responseId ?? null,
    result ? 1 : null,
    result?.usage.inputTokens ?? 0,
    result ? 1 : null,
    result?.usage.cachedInputTokens ?? 0,
    result ? 1 : null,
    result?.usage.outputTokens ?? 0,
    result ? 1 : null,
    result?.usage.reasoningTokens ?? 0,
    result ? 1 : null,
    result?.usage.totalTokens ?? 0,
    result ? 1 : null,
    result?.elapsedMs ?? 0,
    result ? 1 : null,
    result?.estimatedCostUsd ?? 0,
    now,
    id,
  ).run();
}

async function publishReply(env: SocialCommentBindings, config: MetaConfig, comment: Pick<IncomingComment, "platform" | "providerCommentId">, replyText: string, options: SocialCommentRunOptions): Promise<string> {
  const fetcher = options.fetcher ?? env.fetcher ?? fetch;
  const payload = await metaPost(
    fetcher,
    config,
    comment.platform === "INSTAGRAM" ? `${encodeURIComponent(comment.providerCommentId)}/replies` : `${encodeURIComponent(comment.providerCommentId)}/comments`,
    { message: replyText },
  );
  const id = typeof payload.id === "string" ? payload.id : typeof payload.comment_id === "string" ? payload.comment_id : null;
  if (!id) throw new SocialCommentError("Meta did not return a reply id.", "social_comment_publish_failed", 502);
  return id;
}

async function markReplied(env: Pick<SocialCommentBindings, "DB">, id: number, providerReplyId: string, now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_comments
    SET status = 'REPLIED',
        reply_provider_id = ?,
        replied_at = ?,
        updated_at = ?,
        failure_code = NULL,
        failure_message = NULL
    WHERE social_comment_id = ?
  `).bind(providerReplyId, now, now, id).run();
}

async function retrySavedReplyIfNeeded(env: SocialCommentBindings, config: MetaConfig, row: SocialCommentRow, options: SocialCommentRunOptions, now: string): Promise<boolean> {
  if (row.status !== "FAILED" || row.failure_code !== "social_comment_publish_failed" || !row.reply_text) return false;
  const replyId = await publishReply(env, config, { platform: row.platform, providerCommentId: row.provider_comment_id }, row.reply_text, options);
  await markReplied(env, row.social_comment_id, replyId, now);
  return true;
}

async function startRun(env: Pick<SocialCommentBindings, "DB">, now: string): Promise<number | null> {
  const result = await env.DB.prepare(`
    INSERT INTO social_comment_runs (started_at, status)
    VALUES (?, 'RUNNING')
  `).bind(now).run();
  return typeof result.meta.last_row_id === "number" ? result.meta.last_row_id : null;
}

async function finishRun(env: Pick<SocialCommentBindings, "DB">, runId: number | null, result: SocialCommentRunResult, now: string, error?: string): Promise<void> {
  if (runId === null) return;
  await env.DB.prepare(`
    UPDATE social_comment_runs
    SET finished_at = ?,
        status = ?,
        comments_checked = ?,
        comments_imported = ?,
        skipped_local = ?,
        ai_evaluated = ?,
        replies_published = ?,
        no_reply = ?,
        failed = ?,
        error_message = ?
    WHERE social_comment_run_id = ?
  `).bind(
    now,
    error ? "PARTIAL" : "SUCCESS",
    result.checked,
    result.imported,
    result.skippedLocal,
    result.aiEvaluated,
    result.repliesPublished,
    result.noReply,
    result.failed,
    error?.slice(0, 240) ?? null,
    runId,
  ).run();
}

export async function runSocialCommentAutomation(env: SocialCommentBindings, options: SocialCommentRunOptions = {}): Promise<SocialCommentRunResult> {
  const now = options.now ?? new Date().toISOString();
  const result: SocialCommentRunResult = { checked: 0, imported: 0, skippedLocal: 0, aiEvaluated: 0, repliesPublished: 0, noReply: 0, failed: 0 };
  const runId = await startRun(env, now);
  let errorMessage: string | undefined;
  try {
    const config = requireMetaConfig(env);
    const fetcher = options.fetcher ?? env.fetcher ?? fetch;
    const budget = aiBudget(env, options);
    const posts = await fetchRecentPosts(fetcher, config);

    for (const post of posts) {
      const comments = await fetchPostComments(fetcher, config, post);
      for (const comment of comments) {
        result.checked += 1;
        const { row, created } = await insertCommentIfNew(env, comment, now);
        if (created) result.imported += 1;

        if (!created && row.status !== "NEW") {
          if (await retrySavedReplyIfNeeded(env, config, row, options, now)) result.repliesPublished += 1;
          continue;
        }

        const localSkip = shouldSkipSocialCommentLocally(comment, config);
        if (localSkip) {
          await markSkipped(env, row.social_comment_id, localSkip, now);
          result.skippedLocal += 1;
          continue;
        }
        if (result.aiEvaluated >= budget) continue;

        let ai: SocialCommentAiResult | null = null;
        try {
          await markGenerating(env, row.social_comment_id, now);
          const threadContext = await recentThreadContext(env, comment.platform, comment.providerParentId);
          ai = await callOpenAiForComment(env, comment, threadContext, options);
          if (ai.riskLevel === "high" || ai.confidence < 0.35) {
            ai = {
              ...ai,
              shouldReply: false,
              replyText: null,
              reason: ai.reason || "Risk or confidence guardrail prevented an automatic public reply.",
            };
          }
          result.aiEvaluated += 1;
          await saveAiDecision(env, row.social_comment_id, ai, now);
          if (!ai.shouldReply || !ai.replyText) {
            result.noReply += 1;
            continue;
          }
          const replyId = await publishReply(env, config, comment, ai.replyText, options);
          await markReplied(env, row.social_comment_id, replyId, now);
          result.repliesPublished += 1;
        } catch (error) {
          result.failed += 1;
          await markFailed(
            env,
            row.social_comment_id,
            error instanceof SocialCommentError ? error.code : "social_comment_openai_failed",
            error instanceof Error ? error.message : "Social comment processing failed.",
            now,
            ai,
          );
        }
      }
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Social comment automation failed.";
    result.failed += 1;
  } finally {
    await finishRun(env, runId, result, now, errorMessage);
  }
  return result;
}
