import type { CurrentUser } from "./current-user.service.js";

export type SocialPostStatus =
  | "QUEUED"
  | "PREPARING_IMAGE"
  | "IMAGE_READY"
  | "CAPTIONING"
  | "READY_TO_POST"
  | "POSTING"
  | "POSTED"
  | "FAILED"
  | "CANCELLED";

export interface SocialAutomationBindings {
  DB: D1Database;
  R2_STORAGE: R2Bucket;
}

export interface SocialPostQueueItem {
  id: number;
  originalObjectKey: string;
  processedObjectKey: string | null;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  uploadedBy: string;
  uploadedByName: string;
  status: SocialPostStatus;
  queuedAt: string;
  processingStartedAt: string | null;
  imagePreparedAt: string | null;
  captionPreparedAt: string | null;
  scheduledPublishAt: string | null;
  postedAt: string | null;
  failedAt: string | null;
  updatedAt: string;
  attemptCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  openaiRequestCount: number;
  estimatedCostUsd: number;
}

export interface SocialAutomationOverview {
  summary: Record<SocialPostStatus, number>;
  latest: SocialPostQueueItem[];
}

export interface SocialPhotoUploadInput {
  file: File;
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
  status: SocialPostStatus;
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
}

interface StatusCountRow {
  status: SocialPostStatus;
  count: number;
}

const SOCIAL_UPLOAD_PREFIX = "social/uploads";
const MAX_SOCIAL_IMAGE_BYTES = 10 * 1024 * 1024;
const SOCIAL_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const SOCIAL_STATUSES: SocialPostStatus[] = [
  "QUEUED",
  "PREPARING_IMAGE",
  "IMAGE_READY",
  "CAPTIONING",
  "READY_TO_POST",
  "POSTING",
  "POSTED",
  "FAILED",
  "CANCELLED",
];

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

function cleanFileName(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
  return (cleaned || "social-photo").slice(0, 180);
}

function objectKey(contentType: string, now: string): string {
  const date = now.slice(0, 10);
  const extension = SOCIAL_IMAGE_EXTENSIONS[contentType] ?? "bin";
  return `${SOCIAL_UPLOAD_PREFIX}/${date}/${crypto.randomUUID()}.${extension}`;
}

export function normalizeSocialPhotoUploadFormData(formData: FormData): SocialPhotoUploadInput {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Photo is required.");
  if (file.type === "image/heic" || file.type === "image/heif") {
    throw new Error("HEIC is not supported. Please upload JPG, PNG or WebP.");
  }
  if (!SOCIAL_IMAGE_EXTENSIONS[file.type]) throw new Error("Please upload JPG, PNG or WebP.");
  if (file.size <= 0) throw new Error("Photo is empty.");
  if (file.size > MAX_SOCIAL_IMAGE_BYTES) throw new Error("Photo must be 10 MB or smaller.");
  return { file };
}

export async function listSocialAutomationOverview(env: SocialAutomationBindings, limit = 20): Promise<SocialAutomationOverview> {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 20;
  const [counts, latest] = await Promise.all([
    env.DB.prepare(`
      SELECT status, COUNT(*) AS count
      FROM social_post_queue
      GROUP BY status
    `).all<StatusCountRow>(),
    env.DB.prepare(`
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
        estimated_cost_usd
      FROM social_post_queue
      ORDER BY queued_at DESC, social_post_id DESC
      LIMIT ?
    `).bind(safeLimit).all<SocialPostQueueRow>(),
  ]);

  const summary = Object.fromEntries(SOCIAL_STATUSES.map((status) => [status, 0])) as Record<SocialPostStatus, number>;
  for (const row of counts.results ?? []) {
    if (SOCIAL_STATUSES.includes(row.status)) summary[row.status] = row.count;
  }

  return {
    summary,
    latest: (latest.results ?? []).map(rowToItem),
  };
}

export async function queueSocialPhoto(
  env: SocialAutomationBindings,
  input: SocialPhotoUploadInput,
  user: CurrentUser,
  now = new Date().toISOString(),
): Promise<SocialPostQueueItem> {
  const fileName = cleanFileName(input.file.name);
  const key = objectKey(input.file.type, now);
  const bytes = await input.file.arrayBuffer();

  await env.R2_STORAGE.put(key, bytes, {
    httpMetadata: { contentType: input.file.type },
    customMetadata: {
      originalFileName: fileName,
      uploadedBy: user.id,
      purpose: "social-automation",
    },
  });

  try {
    await env.DB.prepare(`
      INSERT INTO social_post_queue (
        original_object_key,
        original_file_name,
        content_type,
        byte_size,
        uploaded_by,
        uploaded_by_name,
        status,
        queued_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?)
    `).bind(
      key,
      fileName,
      input.file.type,
      input.file.size,
      user.id,
      user.displayName,
      now,
      now,
    ).run();
  } catch (error) {
    await env.R2_STORAGE.delete(key);
    throw error;
  }

  const row = await env.DB.prepare(`
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
      estimated_cost_usd
    FROM social_post_queue
    WHERE original_object_key = ?
  `).bind(key).first<SocialPostQueueRow>();

  if (!row) {
    await env.R2_STORAGE.delete(key);
    throw new Error("Social photo was uploaded but could not be queued.");
  }

  return rowToItem(row);
}
