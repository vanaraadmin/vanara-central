import type { SocialAutomationBindings, SocialPostQueueItem } from "./social-automation.service.js";
import { socialBangkokDayBounds } from "./social-schedule.service.js";

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type Sleeper = (milliseconds: number) => Promise<void>;
type JsonRecord = Record<string, unknown>;

export interface SocialPublishBindings extends SocialAutomationBindings {
  META_PAGE_ACCESS_TOKEN?: string;
  META_FACEBOOK_PAGE_ID?: string;
  META_INSTAGRAM_BUSINESS_ACCOUNT_ID?: string;
  META_GRAPH_API_VERSION?: string;
  SOCIAL_PUBLIC_BASE_URL?: string;
  fetcher?: Fetcher;
}

export interface PublishSocialPostOptions {
  now?: string;
  baseUrl?: string;
  fetcher?: Fetcher;
  sleep?: Sleeper;
  maxContainerPolls?: number;
}

export interface PublishSocialPostResult {
  published: boolean;
  cleaned: boolean;
  pending: boolean;
  manualReview: boolean;
  facebookPostId: string | null;
  instagramPostId: string | null;
}

interface SocialPostQueueRow {
  social_post_id: number;
  original_object_key: string;
  processed_object_key: string | null;
  status: SocialPostQueueItem["status"];
  queued_at: string;
  processing_started_at: string | null;
  scheduled_publish_at: string | null;
  caption_json: string | null;
  published_image_object_key: string | null;
  facebook_post_id: string | null;
  instagram_post_id: string | null;
  pipeline_stage: string | null;
  pipeline_acquired_at: string | null;
  pipeline_lease_token: string | null;
  instagram_container_id: string | null;
  instagram_container_status: string | null;
  instagram_container_request_started_at: string | null;
  instagram_container_created_at: string | null;
  instagram_container_last_polled_at: string | null;
  instagram_publish_request_started_at: string | null;
  instagram_publish_response_received_at: string | null;
  facebook_request_started_at: string | null;
  facebook_response_received_at: string | null;
}

interface MetaConfig {
  token: string;
  facebookPageId: string;
  instagramBusinessAccountId: string;
  graphVersion: string;
  baseUrl: string;
}

interface Captions {
  instagramCaption: string;
  facebookCaption: string;
}

type FailureCode =
  | "social_publish_config_missing"
  | "social_post_not_eligible"
  | "caption_json_invalid"
  | "processed_image_missing"
  | "public_image_unavailable"
  | "meta_instagram_create_failed"
  | "meta_instagram_container_failed"
  | "meta_instagram_publish_failed"
  | "meta_facebook_publish_failed"
  | "social_publish_outcome_unknown"
  | "publish_cleanup_failed"
  | "publish_row_delete_failed";

export class SocialPublishError extends Error {
  constructor(
    message: string,
    public readonly code: FailureCode,
    public readonly status: 400 | 404 | 500 | 502 = 400,
    public readonly providerStatus: number | null = null,
  ) {
    super(message);
    this.name = "SocialPublishError";
  }
}

export const SOCIAL_PUBLISH_CRON = "*/10 23 * * *";
export const SOCIAL_PUBLISH_RECOVERY_CRON = "*/10 * * * *";
export const SOCIAL_PUBLIC_PUBLISH_PREFIX = "social/public-publish";
const DEFAULT_META_GRAPH_API_VERSION = "v25.0";
const SOCIAL_PUBLISH_LEASE_MS = 15 * 60_000;
const DEFAULT_CONTAINER_POLLS = 4;
const CONTAINER_POLL_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

const idleResult = (): PublishSocialPostResult => ({
  published: false,
  cleaned: false,
  pending: false,
  manualReview: false,
  facebookPostId: null,
  instagramPostId: null,
});

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

function requireConfig(env: SocialPublishBindings, baseUrl: string | undefined): MetaConfig {
  const token = clean(env.META_PAGE_ACCESS_TOKEN);
  const facebookPageId = clean(env.META_FACEBOOK_PAGE_ID);
  const instagramBusinessAccountId = clean(env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID);
  const resolvedBaseUrl = clean(baseUrl) ?? clean(env.SOCIAL_PUBLIC_BASE_URL);
  if (!token || !facebookPageId || !instagramBusinessAccountId || !resolvedBaseUrl) {
    throw new SocialPublishError("Social publish configuration is missing.", "social_publish_config_missing", 500);
  }
  return {
    token,
    facebookPageId,
    instagramBusinessAccountId,
    graphVersion: clean(env.META_GRAPH_API_VERSION) ?? DEFAULT_META_GRAPH_API_VERSION,
    baseUrl: resolvedBaseUrl.replace(/\/+$/, ""),
  };
}

function parseCaptions(captionJson: string | null): Captions {
  if (!captionJson) throw new SocialPublishError("Social captions are missing.", "caption_json_invalid", 400);
  try {
    const parsed = JSON.parse(captionJson) as unknown;
    if (!isRecord(parsed)) throw new Error("caption_json_not_object");
    const instagramCaption = typeof parsed.instagram_caption === "string" ? parsed.instagram_caption.trim() : "";
    const facebookCaption = typeof parsed.facebook_caption === "string" ? parsed.facebook_caption.trim() : "";
    if (!instagramCaption || !facebookCaption) throw new Error("captions_missing");
    return { instagramCaption, facebookCaption };
  } catch {
    throw new SocialPublishError("Social captions are not valid for publishing.", "caption_json_invalid", 400);
  }
}

export function socialPublishAssetTokenFromKey(key: string): string {
  return btoa(key).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function socialPublishAssetKeyFromToken(token: string): string | null {
  const normalized = token.replace(/\.jpg$/i, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const key = atob(padded);
    return key.startsWith(`${SOCIAL_PUBLIC_PUBLISH_PREFIX}/`) ? key : null;
  } catch {
    return null;
  }
}

function publicImageUrl(baseUrl: string, key: string): string {
  return `${baseUrl}/api/social/publish-assets/${socialPublishAssetTokenFromKey(key)}.jpg`;
}

function publicObjectKey(now: string): string {
  return `${SOCIAL_PUBLIC_PUBLISH_PREFIX}/${now.slice(0, 10)}/${crypto.randomUUID()}.jpg`;
}

function metaUrl(config: MetaConfig, path: string): string {
  return `https://graph.facebook.com/${config.graphVersion}/${path.replace(/^\/+/, "")}`;
}

async function metaRequest(
  fetcher: Fetcher,
  method: "GET" | "POST",
  url: string,
  token: string,
  failureCode: FailureCode,
  fields?: Record<string, string>,
): Promise<JsonRecord> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(method === "POST" ? { body: new URLSearchParams(fields ?? {}).toString() } : {}),
    });
  } catch {
    throw new SocialPublishError("Meta request could not be completed.", failureCode, 502, null);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : "Meta request failed.";
    throw new SocialPublishError(message, failureCode, 502, response.status);
  }
  return isRecord(payload) ? payload : {};
}

function idFrom(payload: JsonRecord, label: string, code: FailureCode): string {
  const value = typeof payload.id === "string" ? payload.id : typeof payload.post_id === "string" ? payload.post_id : null;
  if (!value) throw new SocialPublishError(`${label} did not return a provider id.`, code, 502);
  return value;
}

async function recordEvent(
  env: Pick<SocialPublishBindings, "DB">,
  socialPostId: number,
  eventType: string,
  stage: string,
  dedupeKey: string,
  now: string,
  detailCode: string | null = null,
  providerId: string | null = null,
): Promise<void> {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO social_post_events (
      social_post_id, event_type, stage, detail_code, provider_id, dedupe_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(socialPostId, eventType, stage, detailCode, providerId, dedupeKey, now).run();
}

async function acquireReadyPost(
  env: Pick<SocialPublishBindings, "DB">,
  socialPostId: number | null,
  now: string,
): Promise<SocialPostQueueRow | null> {
  const leaseToken = crypto.randomUUID();
  const sql = socialPostId === null
    ? `
      UPDATE social_post_queue
      SET status = 'POSTING',
          pipeline_stage = 'META_LEASED',
          pipeline_acquired_at = ?,
          pipeline_lease_token = ?,
          processing_started_at = COALESCE(processing_started_at, ?),
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = (
        SELECT social_post_id FROM social_post_queue
        WHERE status = 'READY_TO_POST'
          AND processed_object_key IS NOT NULL
          AND caption_json IS NOT NULL
          AND scheduled_publish_at IS NOT NULL
          AND scheduled_publish_at <= ?
        ORDER BY scheduled_publish_at ASC, queued_at ASC, social_post_id ASC
        LIMIT 1
      ) AND status = 'READY_TO_POST'
      RETURNING *
    `
    : `
      UPDATE social_post_queue
      SET status = 'POSTING',
          pipeline_stage = 'META_LEASED',
          pipeline_acquired_at = ?,
          pipeline_lease_token = ?,
          processing_started_at = COALESCE(processing_started_at, ?),
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = ?
        AND status = 'READY_TO_POST'
        AND processed_object_key IS NOT NULL
        AND caption_json IS NOT NULL
      RETURNING *
    `;
  const statement = env.DB.prepare(sql);
  const row = socialPostId === null
    ? await statement.bind(now, leaseToken, now, now, now).first<SocialPostQueueRow>()
    : await statement.bind(now, leaseToken, now, now, socialPostId).first<SocialPostQueueRow>();
  if (row) await recordEvent(env, row.social_post_id, "LEASE_ACQUIRED", "META_LEASED", `lease:${leaseToken}`, now);
  return row ?? null;
}

async function acquirePendingPost(
  env: Pick<SocialPublishBindings, "DB">,
  socialPostId: number | null,
  now: string,
): Promise<SocialPostQueueRow | null> {
  const leaseToken = crypto.randomUUID();
  const cutoff = new Date(new Date(now).getTime() - SOCIAL_PUBLISH_LEASE_MS).toISOString();
  const targetClause = socialPostId === null
    ? `social_post_id = (
        SELECT social_post_id FROM social_post_queue
        WHERE status = 'POSTING'
          AND scheduled_publish_at IS NOT NULL
          AND scheduled_publish_at <= ?
          AND (pipeline_acquired_at IS NULL OR pipeline_acquired_at <= ?)
        ORDER BY scheduled_publish_at ASC, social_post_id ASC LIMIT 1
      )`
    : "social_post_id = ?";
  const statement = env.DB.prepare(`
    UPDATE social_post_queue
    SET pipeline_acquired_at = ?, pipeline_lease_token = ?, updated_at = ?
    WHERE ${targetClause}
      AND status = 'POSTING'
      AND (pipeline_acquired_at IS NULL OR pipeline_acquired_at <= ?)
    RETURNING *
  `);
  const row = socialPostId === null
    ? await statement.bind(now, leaseToken, now, now, cutoff, cutoff).first<SocialPostQueueRow>()
    : await statement.bind(now, leaseToken, now, socialPostId, cutoff).first<SocialPostQueueRow>();
  if (row) await recordEvent(env, row.social_post_id, "LEASE_ACQUIRED", row.pipeline_stage ?? "POSTING", `lease:${leaseToken}`, now);
  return row ?? null;
}

async function updateStage(
  env: Pick<SocialPublishBindings, "DB">,
  socialPostId: number,
  stage: string,
  now: string,
  releaseLease = false,
): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET pipeline_stage = ?,
        pipeline_acquired_at = CASE WHEN ? = 1 THEN NULL ELSE pipeline_acquired_at END,
        pipeline_lease_token = CASE WHEN ? = 1 THEN NULL ELSE pipeline_lease_token END,
        updated_at = ?
    WHERE social_post_id = ? AND status = 'POSTING'
  `).bind(stage, releaseLease ? 1 : 0, releaseLease ? 1 : 0, now, socialPostId).run();
}

async function markManualReview(
  env: Pick<SocialPublishBindings, "DB">,
  row: SocialPostQueueRow,
  code: FailureCode,
  message: string,
  now: string,
): Promise<PublishSocialPostResult> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET status = 'FAILED',
        pipeline_stage = 'MANUAL_REVIEW',
        image_recovery_state = 'MANUAL_REVIEW',
        failed_at = ?,
        failure_code = ?,
        failure_message = ?,
        pipeline_acquired_at = NULL,
        pipeline_lease_token = NULL,
        updated_at = ?
    WHERE social_post_id = ?
  `).bind(now, code, message.slice(0, 240), now, row.social_post_id).run();
  await recordEvent(env, row.social_post_id, "MANUAL_REVIEW", "MANUAL_REVIEW", `manual:${code}:${now}`, now, code);
  return {
    published: false,
    cleaned: false,
    pending: false,
    manualReview: true,
    facebookPostId: row.facebook_post_id,
    instagramPostId: row.instagram_post_id,
  };
}

async function ensurePublicAsset(
  env: Pick<SocialPublishBindings, "DB" | "R2_STORAGE">,
  row: SocialPostQueueRow,
  now: string,
): Promise<string> {
  if (!row.processed_object_key) throw new SocialPublishError("Processed social image is missing.", "processed_image_missing", 400);
  const processed = await env.R2_STORAGE.get(row.processed_object_key);
  if (!processed) throw new SocialPublishError("Processed social image is missing.", "processed_image_missing", 400);
  const key = row.published_image_object_key ?? publicObjectKey(now);
  const publicObject = row.published_image_object_key ? await env.R2_STORAGE.get(key) : null;
  if (!publicObject) {
    await env.R2_STORAGE.put(key, await processed.arrayBuffer(), {
      httpMetadata: { contentType: "image/jpeg" },
      customMetadata: { purpose: "social-meta-publish", socialPostId: String(row.social_post_id) },
    });
  }
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET published_image_object_key = ?, publish_r2_completed_at = ?, pipeline_stage = 'PUBLIC_ASSET_READY', updated_at = ?
    WHERE social_post_id = ? AND status = 'POSTING'
  `).bind(key, now, now, row.social_post_id).run();
  await recordEvent(env, row.social_post_id, "PUBLIC_ASSET_READY", "PUBLIC_ASSET_READY", `public:${key}`, now);
  row.published_image_object_key = key;
  return key;
}

async function createInstagramContainer(
  env: SocialPublishBindings,
  row: SocialPostQueueRow,
  config: MetaConfig,
  fetcher: Fetcher,
  imageUrl: string,
  caption: string,
  now: string,
): Promise<string> {
  if (row.instagram_container_id) return row.instagram_container_id;
  if (row.instagram_container_request_started_at) {
    throw new SocialPublishError("Instagram container creation outcome is unknown.", "social_publish_outcome_unknown", 502);
  }
  const checkpoint = await env.DB.prepare(`
    UPDATE social_post_queue
    SET instagram_container_request_started_at = ?, pipeline_stage = 'IG_CONTAINER_CREATE_STARTED', updated_at = ?
    WHERE social_post_id = ? AND status = 'POSTING'
      AND instagram_container_request_started_at IS NULL
      AND instagram_container_id IS NULL
  `).bind(now, now, row.social_post_id).run();
  if (numeric(checkpoint.meta.changes) !== 1) {
    throw new SocialPublishError("Instagram container creation was already started.", "social_publish_outcome_unknown", 502);
  }
  await recordEvent(env, row.social_post_id, "IG_CONTAINER_CREATE_STARTED", "IG_CONTAINER_CREATE_STARTED", "ig-container-create", now);
  const payload = await metaRequest(
    fetcher,
    "POST",
    metaUrl(config, `${encodeURIComponent(config.instagramBusinessAccountId)}/media`),
    config.token,
    "meta_instagram_create_failed",
    { image_url: imageUrl, caption },
  );
  const containerId = idFrom(payload, "Instagram media container", "meta_instagram_create_failed");
  const saved = await env.DB.prepare(`
    UPDATE social_post_queue
    SET instagram_container_id = ?, instagram_container_status = 'IN_PROGRESS', instagram_container_created_at = ?,
        pipeline_stage = 'IG_CONTAINER_CREATED', updated_at = ?
    WHERE social_post_id = ? AND status = 'POSTING' AND instagram_container_id IS NULL
  `).bind(containerId, now, now, row.social_post_id).run();
  if (numeric(saved.meta.changes) !== 1) {
    throw new SocialPublishError("Instagram container ID could not be persisted.", "social_publish_outcome_unknown", 502);
  }
  await recordEvent(env, row.social_post_id, "IG_CONTAINER_CREATED", "IG_CONTAINER_CREATED", `ig-container:${containerId}`, now, null, containerId);
  row.instagram_container_id = containerId;
  row.instagram_container_status = "IN_PROGRESS";
  return containerId;
}

async function pollInstagramContainer(
  env: Pick<SocialPublishBindings, "DB">,
  row: SocialPostQueueRow,
  config: MetaConfig,
  fetcher: Fetcher,
  sleep: Sleeper,
  maxPolls: number,
  now: string,
): Promise<"FINISHED" | "PENDING" | "TERMINAL"> {
  const containerId = row.instagram_container_id;
  if (!containerId) throw new SocialPublishError("Instagram container ID is missing.", "social_publish_outcome_unknown", 502);
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) await sleep(CONTAINER_POLL_DELAYS_MS[Math.min(attempt - 1, CONTAINER_POLL_DELAYS_MS.length - 1)]!);
    let payload: JsonRecord;
    try {
      payload = await metaRequest(
        fetcher,
        "GET",
        `${metaUrl(config, encodeURIComponent(containerId))}?fields=status_code,status`,
        config.token,
        "meta_instagram_container_failed",
      );
    } catch (error) {
      if (
        error instanceof SocialPublishError
        && error.code === "meta_instagram_container_failed"
        && (error.providerStatus === null || error.providerStatus === 429 || error.providerStatus >= 500)
      ) {
        await env.DB.prepare(`
          UPDATE social_post_queue SET instagram_container_last_polled_at = ?, failure_code = ?, failure_message = ?, updated_at = ?
          WHERE social_post_id = ? AND status = 'POSTING'
        `).bind(now, error.code, error.message.slice(0, 240), now, row.social_post_id).run();
        await updateStage(env, row.social_post_id, "IG_CONTAINER_POLL_DEFERRED", now, true);
        await recordEvent(env, row.social_post_id, "IG_CONTAINER_POLL_DEFERRED", "IG_CONTAINER_POLL_DEFERRED", `ig-poll-deferred:${now}`, now, error.code, containerId);
        return "PENDING";
      }
      throw error;
    }
    const status = typeof payload.status_code === "string" ? payload.status_code.toUpperCase() : "UNKNOWN";
    await env.DB.prepare(`
      UPDATE social_post_queue SET instagram_container_status = ?, instagram_container_last_polled_at = ?,
        pipeline_stage = 'IG_CONTAINER_POLLED', failure_code = NULL, failure_message = NULL, updated_at = ?
      WHERE social_post_id = ? AND status = 'POSTING'
    `).bind(status, now, now, row.social_post_id).run();
    await recordEvent(env, row.social_post_id, "IG_CONTAINER_POLLED", "IG_CONTAINER_POLLED", `ig-poll:${status}:${now}:${attempt}`, now, status, containerId);
    row.instagram_container_status = status;
    if (status === "FINISHED") return "FINISHED";
    if (status === "ERROR" || status === "EXPIRED") return "TERMINAL";
    if (status !== "IN_PROGRESS") return "TERMINAL";
  }
  await updateStage(env, row.social_post_id, "IG_CONTAINER_WAITING", now, true);
  return "PENDING";
}

async function publishInstagram(
  env: Pick<SocialPublishBindings, "DB">,
  row: SocialPostQueueRow,
  config: MetaConfig,
  fetcher: Fetcher,
  now: string,
): Promise<string> {
  if (row.instagram_post_id) return row.instagram_post_id;
  if (row.instagram_publish_request_started_at) {
    throw new SocialPublishError("Instagram publish outcome is unknown.", "social_publish_outcome_unknown", 502);
  }
  const checkpoint = await env.DB.prepare(`
    UPDATE social_post_queue
    SET instagram_publish_request_started_at = ?, instagram_request_started_at = COALESCE(instagram_request_started_at, ?),
        pipeline_stage = 'IG_PUBLISH_STARTED', updated_at = ?
    WHERE social_post_id = ? AND status = 'POSTING'
      AND instagram_container_status = 'FINISHED'
      AND instagram_publish_request_started_at IS NULL
      AND instagram_post_id IS NULL
  `).bind(now, now, now, row.social_post_id).run();
  if (numeric(checkpoint.meta.changes) !== 1) {
    throw new SocialPublishError("Instagram publish checkpoint could not be saved.", "social_publish_outcome_unknown", 502);
  }
  await recordEvent(env, row.social_post_id, "IG_PUBLISH_STARTED", "IG_PUBLISH_STARTED", "ig-publish", now, null, row.instagram_container_id);
  const payload = await metaRequest(
    fetcher,
    "POST",
    metaUrl(config, `${encodeURIComponent(config.instagramBusinessAccountId)}/media_publish`),
    config.token,
    "meta_instagram_publish_failed",
    { creation_id: row.instagram_container_id! },
  );
  const postId = idFrom(payload, "Instagram publish", "meta_instagram_publish_failed");
  await env.DB.prepare(`
    UPDATE social_post_queue SET instagram_post_id = ?, instagram_publish_response_received_at = ?,
      instagram_response_received_at = ?, pipeline_stage = 'IG_PUBLISHED', updated_at = ?
    WHERE social_post_id = ? AND status = 'POSTING'
  `).bind(postId, now, now, now, row.social_post_id).run();
  await recordEvent(env, row.social_post_id, "IG_PUBLISHED", "IG_PUBLISHED", `ig-post:${postId}`, now, null, postId);
  row.instagram_post_id = postId;
  return postId;
}

async function publishFacebook(
  env: Pick<SocialPublishBindings, "DB">,
  row: SocialPostQueueRow,
  config: MetaConfig,
  fetcher: Fetcher,
  imageUrl: string,
  caption: string,
  now: string,
): Promise<string> {
  if (row.facebook_post_id) return row.facebook_post_id;
  if (row.facebook_request_started_at) {
    throw new SocialPublishError("Facebook publish outcome is unknown.", "social_publish_outcome_unknown", 502);
  }
  const checkpoint = await env.DB.prepare(`
    UPDATE social_post_queue SET facebook_request_started_at = ?, pipeline_stage = 'FB_PUBLISH_STARTED', updated_at = ?
    WHERE social_post_id = ? AND status = 'POSTING'
      AND instagram_post_id IS NOT NULL
      AND facebook_request_started_at IS NULL
      AND facebook_post_id IS NULL
  `).bind(now, now, row.social_post_id).run();
  if (numeric(checkpoint.meta.changes) !== 1) {
    throw new SocialPublishError("Facebook publish checkpoint could not be saved.", "social_publish_outcome_unknown", 502);
  }
  await recordEvent(env, row.social_post_id, "FB_PUBLISH_STARTED", "FB_PUBLISH_STARTED", "fb-publish", now, null, row.instagram_post_id);
  const payload = await metaRequest(
    fetcher,
    "POST",
    metaUrl(config, `${encodeURIComponent(config.facebookPageId)}/photos`),
    config.token,
    "meta_facebook_publish_failed",
    { url: imageUrl, caption, published: "true" },
  );
  const postId = idFrom(payload, "Facebook publish", "meta_facebook_publish_failed");
  await env.DB.prepare(`
    UPDATE social_post_queue SET facebook_post_id = ?, facebook_response_received_at = ?,
      pipeline_stage = 'FB_PUBLISHED', updated_at = ?
    WHERE social_post_id = ? AND status = 'POSTING'
  `).bind(postId, now, now, row.social_post_id).run();
  await recordEvent(env, row.social_post_id, "FB_PUBLISHED", "FB_PUBLISHED", `fb-post:${postId}`, now, null, postId);
  row.facebook_post_id = postId;
  return postId;
}

async function cleanupPublished(
  env: Pick<SocialPublishBindings, "DB" | "R2_STORAGE">,
  row: SocialPostQueueRow,
  now: string,
): Promise<PublishSocialPostResult> {
  if (!row.instagram_post_id || !row.facebook_post_id) {
    throw new SocialPublishError("Both Meta confirmations are required before cleanup.", "social_publish_outcome_unknown", 502);
  }
  await recordEvent(env, row.social_post_id, "CLEANUP_STARTED", "CLEANUP_STARTED", "cleanup-start", now);
  const keys = [row.original_object_key, row.processed_object_key, row.published_image_object_key]
    .filter((key): key is string => Boolean(key));
  try {
    await Promise.all(keys.map((key) => env.R2_STORAGE.delete(key)));
  } catch {
    const result = await markManualReview(env, row, "publish_cleanup_failed", "Published post cleanup failed.", now);
    return { ...result, published: true };
  }
  await recordEvent(env, row.social_post_id, "CLEANUP_COMPLETED", "CLEANUP_COMPLETED", "cleanup-complete", now);
  const deleted = await env.DB.prepare("DELETE FROM social_post_queue WHERE social_post_id = ? AND instagram_post_id IS NOT NULL AND facebook_post_id IS NOT NULL")
    .bind(row.social_post_id).run();
  if (numeric(deleted.meta.changes) !== 1) {
    const result = await markManualReview(env, row, "publish_row_delete_failed", "Published post row could not be deleted after cleanup.", now);
    return { ...result, published: true };
  }
  return {
    published: true,
    cleaned: true,
    pending: false,
    manualReview: false,
    facebookPostId: row.facebook_post_id,
    instagramPostId: row.instagram_post_id,
  };
}

export async function getSocialPublishAsset(env: Pick<SocialPublishBindings, "R2_STORAGE">, assetId: string): Promise<Response> {
  const key = socialPublishAssetKeyFromToken(assetId);
  if (!key) return new Response("Not found", { status: 404 });
  const object = await env.R2_STORAGE.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}

async function runLeasedPost(
  env: SocialPublishBindings,
  row: SocialPostQueueRow,
  config: MetaConfig,
  options: PublishSocialPostOptions,
): Promise<PublishSocialPostResult> {
  const now = options.now ?? new Date().toISOString();
  const fetcher = options.fetcher ?? env.fetcher ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let captions: Captions;
  try {
    captions = parseCaptions(row.caption_json);
    const publicKey = await ensurePublicAsset(env, row, now);
    const imageUrl = publicImageUrl(config.baseUrl, publicKey);

    if (!row.instagram_post_id) {
      const containerId = await createInstagramContainer(env, row, config, fetcher, imageUrl, captions.instagramCaption, now);
      row.instagram_container_id = containerId;
      const container = await pollInstagramContainer(
        env,
        row,
        config,
        fetcher,
        sleep,
        Math.max(1, options.maxContainerPolls ?? DEFAULT_CONTAINER_POLLS),
        now,
      );
      if (container === "PENDING") {
        return { ...idleResult(), pending: true };
      }
      if (container === "TERMINAL") {
        return markManualReview(env, row, "meta_instagram_container_failed", `Instagram container ended with ${row.instagram_container_status ?? "UNKNOWN"}.`, now);
      }
      row.instagram_post_id = await publishInstagram(env, row, config, fetcher, now);
    }

    if (!row.facebook_post_id) {
      row.facebook_post_id = await publishFacebook(env, row, config, fetcher, imageUrl, captions.facebookCaption, now);
    }
    return cleanupPublished(env, row, now);
  } catch (error) {
    if (error instanceof SocialPublishError) return markManualReview(env, row, error.code, error.message, now);
    return markManualReview(env, row, "social_publish_outcome_unknown", "Meta publish outcome is unknown. Automatic retry is blocked.", now);
  }
}

export async function publishSocialPost(
  env: SocialPublishBindings,
  socialPostId: number | null = null,
  options: PublishSocialPostOptions = {},
): Promise<PublishSocialPostResult> {
  const now = options.now ?? new Date().toISOString();
  let config: MetaConfig;
  try {
    config = requireConfig(env, options.baseUrl);
  } catch (error) {
    if (socialPostId === null && error instanceof SocialPublishError) return idleResult();
    throw error;
  }
  const row = await acquireReadyPost(env, socialPostId, now) ?? await acquirePendingPost(env, socialPostId, now);
  if (!row) {
    if (socialPostId === null) return idleResult();
    throw new SocialPublishError("Social post is not eligible for publishing.", "social_post_not_eligible", 400);
  }
  return runLeasedPost(env, row, config, options);
}

export async function publishNextSocialPost(
  env: SocialPublishBindings,
  options: PublishSocialPostOptions = {},
): Promise<PublishSocialPostResult> {
  const now = options.now ?? new Date().toISOString();
  const bounds = socialBangkokDayBounds(now);
  const alreadyPublished = await env.DB.prepare(`
    SELECT social_post_event_id
    FROM social_post_events
    WHERE event_type = 'FB_PUBLISHED'
      AND created_at >= ?
      AND created_at < ?
    LIMIT 1
  `).bind(bounds.start, bounds.end).first<{ social_post_event_id: number }>();
  if (alreadyPublished) return idleResult();

  const result = await publishSocialPost(env, null, options);
  if (!result.published && !result.pending && !result.manualReview) {
    await env.DB.prepare(`
      UPDATE social_post_queue
      SET pipeline_stage = 'PUBLISH_WAITING_FOR_CAPTION', updated_at = ?
      WHERE social_post_id = (
        SELECT social_post_id
        FROM social_post_queue
        WHERE status IN ('QUEUED','PREPARING_IMAGE','IMAGE_READY','CAPTIONING')
          AND scheduled_publish_at IS NOT NULL
          AND scheduled_publish_at <= ?
        ORDER BY scheduled_publish_at ASC, queued_at ASC, social_post_id ASC
        LIMIT 1
      )
    `).bind(now, now).run();
  }
  return result;
}

export async function resumePendingSocialPost(
  env: SocialPublishBindings,
  options: PublishSocialPostOptions = {},
): Promise<PublishSocialPostResult> {
  const now = options.now ?? new Date().toISOString();
  let config: MetaConfig;
  try {
    config = requireConfig(env, options.baseUrl);
  } catch {
    return idleResult();
  }
  const row = await acquirePendingPost(env, null, now);
  if (!row) return idleResult();
  return runLeasedPost(env, row, config, options);
}
