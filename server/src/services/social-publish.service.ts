import type { SocialAutomationBindings, SocialPostQueueItem } from "./social-automation.service.js";

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
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
}

export interface PublishSocialPostResult {
  published: boolean;
  cleaned: boolean;
  facebookPostId: string | null;
  instagramPostId: string | null;
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
  estimated_cost_usd: number;
  caption_json: string | null;
  published_image_object_key: string | null;
  facebook_post_id: string | null;
  instagram_post_id: string | null;
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

export class SocialPublishError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "social_publish_config_missing"
      | "social_post_not_found"
      | "social_post_not_eligible"
      | "caption_json_invalid"
      | "processed_image_missing"
      | "meta_instagram_create_failed"
      | "meta_instagram_publish_failed"
      | "meta_facebook_publish_failed"
      | "publish_cleanup_failed"
      | "publish_row_delete_failed",
    public readonly status: 400 | 404 | 500 | 502 = 400,
  ) {
    super(message);
    this.name = "SocialPublishError";
  }
}

export const SOCIAL_PUBLISH_CRON = "0 0 * * *";
export const SOCIAL_PUBLIC_PUBLISH_PREFIX = "social/public-publish";
const DEFAULT_META_GRAPH_API_VERSION = "v25.0";

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
    throw new SocialPublishError(
      "Social publish configuration is missing.",
      "social_publish_config_missing",
      500,
    );
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
  if (!captionJson) {
    throw new SocialPublishError("Social captions are missing.", "caption_json_invalid", 400);
  }
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
  const cleaned = token.replace(/\.jpg$/i, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, "=");
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

async function metaPost(fetcher: Fetcher, url: string, fields: Record<string, string>, token: string, failureCode: SocialPublishError["code"]): Promise<JsonRecord> {
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(fields).toString(),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : "Meta publish request failed.";
    throw new SocialPublishError(message, failureCode, 502);
  }
  return isRecord(payload) ? payload : {};
}

function idFrom(payload: JsonRecord, label: string, code: SocialPublishError["code"]): string {
  const value = typeof payload.id === "string" ? payload.id : typeof payload.post_id === "string" ? payload.post_id : null;
  if (!value) throw new SocialPublishError(`${label} did not return a provider id.`, code, 502);
  return value;
}

async function acquireReadyPost(env: Pick<SocialPublishBindings, "DB">, socialPostId: number | null, now: string): Promise<SocialPostQueueRow | null> {
  const sql = socialPostId === null
    ? `
      UPDATE social_post_queue
      SET status = 'POSTING',
          processing_started_at = COALESCE(processing_started_at, ?),
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = (
        SELECT social_post_id
        FROM social_post_queue
        WHERE status = 'READY_TO_POST'
          AND processed_object_key IS NOT NULL
          AND caption_json IS NOT NULL
        ORDER BY queued_at ASC, social_post_id ASC
        LIMIT 1
      )
        AND status = 'READY_TO_POST'
      RETURNING *
    `
    : `
      UPDATE social_post_queue
      SET status = 'POSTING',
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
    ? await statement.bind(now, now).first<SocialPostQueueRow>()
    : await statement.bind(now, now, socialPostId).first<SocialPostQueueRow>();
  return row ?? null;
}

async function markFailed(
  env: Pick<SocialPublishBindings, "DB">,
  socialPostId: number,
  code: SocialPublishError["code"],
  message: string,
  now: string,
  ids: { instagramPostId?: string | null; facebookPostId?: string | null; publishedImageObjectKey?: string | null } = {},
): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET status = 'FAILED',
        failed_at = ?,
        updated_at = ?,
        failure_code = ?,
        failure_message = ?,
        instagram_post_id = COALESCE(?, instagram_post_id),
        facebook_post_id = COALESCE(?, facebook_post_id),
        published_image_object_key = COALESCE(?, published_image_object_key)
    WHERE social_post_id = ?
  `).bind(
    now,
    now,
    code,
    message.slice(0, 240),
    ids.instagramPostId ?? null,
    ids.facebookPostId ?? null,
    ids.publishedImageObjectKey ?? null,
    socialPostId,
  ).run();
}

async function savePublicKey(env: Pick<SocialPublishBindings, "DB">, socialPostId: number, key: string, now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET published_image_object_key = ?,
        updated_at = ?
    WHERE social_post_id = ?
      AND status = 'POSTING'
  `).bind(key, now, socialPostId).run();
}

async function saveInstagramId(env: Pick<SocialPublishBindings, "DB">, socialPostId: number, id: string, now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET instagram_post_id = ?,
        updated_at = ?
    WHERE social_post_id = ?
      AND status = 'POSTING'
  `).bind(id, now, socialPostId).run();
}

async function saveFacebookId(env: Pick<SocialPublishBindings, "DB">, socialPostId: number, id: string, now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET facebook_post_id = ?,
        updated_at = ?
    WHERE social_post_id = ?
      AND status = 'POSTING'
  `).bind(id, now, socialPostId).run();
}

async function deleteQueueRow(env: Pick<SocialPublishBindings, "DB">, socialPostId: number): Promise<boolean> {
  const result = await env.DB.prepare("DELETE FROM social_post_queue WHERE social_post_id = ?").bind(socialPostId).run();
  return numeric(result.meta.changes) === 1;
}

async function publishInstagram(config: MetaConfig, fetcher: Fetcher, imageUrl: string, caption: string): Promise<string> {
  const media = await metaPost(
    fetcher,
    metaUrl(config, `${encodeURIComponent(config.instagramBusinessAccountId)}/media`),
    { image_url: imageUrl, caption },
    config.token,
    "meta_instagram_create_failed",
  );
  const creationId = idFrom(media, "Instagram media container", "meta_instagram_create_failed");
  const published = await metaPost(
    fetcher,
    metaUrl(config, `${encodeURIComponent(config.instagramBusinessAccountId)}/media_publish`),
    { creation_id: creationId },
    config.token,
    "meta_instagram_publish_failed",
  );
  return idFrom(published, "Instagram publish", "meta_instagram_publish_failed");
}

async function publishFacebook(config: MetaConfig, fetcher: Fetcher, imageUrl: string, caption: string): Promise<string> {
  const payload = await metaPost(
    fetcher,
    metaUrl(config, `${encodeURIComponent(config.facebookPageId)}/photos`),
    { url: imageUrl, caption, published: "true" },
    config.token,
    "meta_facebook_publish_failed",
  );
  return idFrom(payload, "Facebook photo publish", "meta_facebook_publish_failed");
}

export async function getSocialPublishAsset(env: Pick<SocialPublishBindings, "R2_STORAGE">, assetId: string): Promise<Response> {
  const key = socialPublishAssetKeyFromToken(assetId);
  if (!key) return new Response("Not found", { status: 404 });
  const object = await env.R2_STORAGE.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
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
    if (socialPostId === null && error instanceof SocialPublishError) {
      return { published: false, cleaned: false, facebookPostId: null, instagramPostId: null };
    }
    throw error;
  }

  const leased = await acquireReadyPost(env, socialPostId, now);
  if (!leased) {
    if (socialPostId === null) return { published: false, cleaned: false, facebookPostId: null, instagramPostId: null };
    throw new SocialPublishError("Social post is not eligible for publishing.", "social_post_not_eligible", 400);
  }

  let captions: Captions;
  try {
    captions = parseCaptions(leased.caption_json);
  } catch (error) {
    if (error instanceof SocialPublishError) {
      await markFailed(env, leased.social_post_id, error.code, error.message, now);
      return { published: false, cleaned: false, facebookPostId: null, instagramPostId: null };
    }
    throw error;
  }
  if (!leased.processed_object_key) {
    await markFailed(env, leased.social_post_id, "processed_image_missing", "Processed social image is missing.", now);
    return { published: false, cleaned: false, facebookPostId: null, instagramPostId: null };
  }

  const processed = await env.R2_STORAGE.get(leased.processed_object_key);
  if (!processed) {
    await markFailed(env, leased.social_post_id, "processed_image_missing", "Processed social image is missing.", now);
    return { published: false, cleaned: false, facebookPostId: null, instagramPostId: null };
  }

  const fetcher = options.fetcher ?? env.fetcher ?? fetch;
  const publicKey = publicObjectKey(now);
  let instagramPostId: string | null = leased.instagram_post_id;
  let facebookPostId: string | null = leased.facebook_post_id;

  await env.R2_STORAGE.put(publicKey, await processed.arrayBuffer(), {
    httpMetadata: { contentType: "image/jpeg" },
    customMetadata: {
      purpose: "social-meta-publish",
      socialPostId: String(leased.social_post_id),
    },
  });
  await savePublicKey(env, leased.social_post_id, publicKey, now);

  try {
    const imageUrl = publicImageUrl(config.baseUrl, publicKey);
    instagramPostId = instagramPostId ?? await publishInstagram(config, fetcher, imageUrl, captions.instagramCaption);
    await saveInstagramId(env, leased.social_post_id, instagramPostId, now);
    facebookPostId = facebookPostId ?? await publishFacebook(config, fetcher, imageUrl, captions.facebookCaption);
    await saveFacebookId(env, leased.social_post_id, facebookPostId, now);
  } catch (error) {
    await env.R2_STORAGE.delete(publicKey).catch(() => undefined);
    if (error instanceof SocialPublishError) {
      await markFailed(env, leased.social_post_id, error.code, error.message, now, { instagramPostId, facebookPostId, publishedImageObjectKey: publicKey });
      return { published: false, cleaned: false, facebookPostId, instagramPostId };
    }
    await markFailed(env, leased.social_post_id, "meta_facebook_publish_failed", "Meta publish failed.", now, { instagramPostId, facebookPostId, publishedImageObjectKey: publicKey });
    return { published: false, cleaned: false, facebookPostId, instagramPostId };
  }

  const cleanupKeys = [leased.original_object_key, leased.processed_object_key, publicKey].filter((key): key is string => Boolean(key));
  try {
    await Promise.all(cleanupKeys.map((key) => env.R2_STORAGE.delete(key)));
  } catch {
    await markFailed(env, leased.social_post_id, "publish_cleanup_failed", "Published post cleanup failed.", now, { instagramPostId, facebookPostId, publishedImageObjectKey: publicKey });
    return { published: true, cleaned: false, facebookPostId, instagramPostId };
  }

  const deleted = await deleteQueueRow(env, leased.social_post_id);
  if (!deleted) {
    await markFailed(env, leased.social_post_id, "publish_row_delete_failed", "Published post row could not be deleted after cleanup.", now, { instagramPostId, facebookPostId, publishedImageObjectKey: publicKey });
    return { published: true, cleaned: false, facebookPostId, instagramPostId };
  }

  return { published: true, cleaned: true, facebookPostId, instagramPostId };
}

export async function publishNextSocialPost(
  env: SocialPublishBindings,
  options: PublishSocialPostOptions = {},
): Promise<PublishSocialPostResult> {
  return publishSocialPost(env, null, options);
}
