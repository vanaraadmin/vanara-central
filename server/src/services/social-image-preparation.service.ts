import { SOCIAL_IMAGE_PREPARE_PROMPT } from "../assets/prompts/social-image-prepare-v1.prompt.js";
import type { SocialAutomationBindings, SocialPostQueueItem } from "./social-automation.service.js";
import {
  runSocialOpenAiBackgroundResponse,
  SocialOpenAiBackgroundError,
  type SocialOpenAiBackgroundCheckpoint,
} from "./social-openai-background.service.js";
import { socialBangkokDayBounds, socialPublishSlotForBangkokDate } from "./social-schedule.service.js";

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

export interface SocialImagePreparationBindings extends SocialAutomationBindings {
  OPENAI_API_KEY: string;
  SOCIAL_IMAGE_PREP_MODEL?: string;
  SOCIAL_CAPTION_MODEL?: string;
  SOCIAL_VECTOR_STORE_ID?: string;
  WARAPORN_VECTOR_STORE_ID?: string;
  fetcher?: Fetcher;
}

export interface PrepareSocialImageOptions {
  now?: string;
  dueBy?: string;
  fetcher?: Fetcher;
  backgroundTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface PrepareSocialImageResult {
  processed: boolean;
  item: SocialPostQueueItem | null;
}

export interface SocialImageWatchdogResult {
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
  estimated_cost_usd: number;
  image_phase: string | null;
  image_leased_at: string | null;
  image_source_ready_at: string | null;
  image_request_started_at: string | null;
  image_response_received_at: string | null;
  image_finalized_at: string | null;
  image_watchdog_at: string | null;
  image_recovery_state: string | null;
  image_client_request_id: string | null;
  image_provider_request_id: string | null;
  image_provider_status: string | null;
  image_submitted_at: string | null;
  image_last_polled_at: string | null;
  image_provider_terminal_at: string | null;
  image_provider_error_code: string | null;
  image_provider_error_message: string | null;
  image_poll_lease_token: string | null;
  image_poll_lease_at: string | null;
  image_openai_response_id: string | null;
  vector_store_id: string | null;
  source_metadata_json: string | null;
}

interface OpenAiUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

interface SocialOpenAiResult {
  imageBase64: string;
  analysisJson: string;
  responseId: string | null;
  usage: OpenAiUsage;
  elapsedMs: number;
  estimatedCostUsd: number;
  toolCallCount: number;
}

interface SocialImagePrepareContext {
  imageCaptureDate: string | null;
  captureOrUploadDate: string;
  uploadDate: string;
  processingDate: string;
  scheduledPublishAt: string | null;
  gps: { lat: number; lng: number; source: "exif"; confidence: "high" } | null;
  camera: { make: string | null; model: string | null } | null;
  locationContext: {
    resort: "Vanara";
    island: "Koh Chang";
    country: "Thailand";
    source: "app_default";
  };
  seasonalContextSeed: {
    date: string;
    likelySeason: "green_season" | "dry_season";
    confidence: "calendar_context_only";
    kbInstruction: string;
  };
}

interface SourceImageMetadata {
  image_capture_date: string | null;
  upload_date: string;
  job_date: string;
  gps: { lat: number; lng: number; source: "exif"; confidence: "high" } | null;
  camera: { make: string | null; model: string | null } | null;
  source: {
    image_capture_date: "exif" | "unavailable";
    gps: "exif" | "unavailable";
    location_context: "app_default";
  };
}

export class SocialImagePreparationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "social_post_not_found"
      | "social_post_not_eligible"
      | "unsupported_image_type"
      | "original_image_missing"
      | "openai_request_failed"
      | "openai_timeout"
      | "openai_invalid_response"
      | "openai_tool_call_limit_exceeded"
      | "processed_image_persistence_failed",
    public readonly status: 400 | 404 | 500 | 502 = 400,
  ) {
    super(message);
    this.name = "SocialImagePreparationError";
  }
}

export const SOCIAL_IMAGE_PREPARE_CRON = "*/10 21 * * *";
export const DEFAULT_SOCIAL_IMAGE_PREP_MODEL = "gpt-5.6-terra";
export const DEFAULT_SOCIAL_CAPTION_MODEL = "gpt-5.6-terra";
export const SOCIAL_IMAGE_PREP_SUPPORTED_FALLBACK_MODEL = "gpt-5.6";
export const DEFAULT_SOCIAL_VECTOR_STORE_ID = "vs_6a48c08b24a88191b45bc43c2579d37f";
export const SOCIAL_IMAGE_PREPARE_MAX_TOOL_CALLS = 2;
export const SOCIAL_IMAGE_PREPARE_TIMEOUT_MS = 90_000;
export const SOCIAL_IMAGE_STALE_LEASE_MS = 15 * 60_000;
export const SOCIAL_IMAGE_MAX_ATTEMPTS = 2;
// If OpenAI has already completed the image, retrying only the final R2/D1
// hand-off is safe: it cannot create a second AI image or incur another AI call.
export const SOCIAL_IMAGE_FINALIZATION_MAX_ATTEMPTS = 3;

const SOCIAL_PROCESSED_PREFIX = "social/processed";
const SOCIAL_FILE_SEARCH_MAX_RESULTS = 6;
const SUPPORTED_SOCIAL_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
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
    imagePhase: row.image_phase,
    imageLeasedAt: row.image_leased_at,
    imageSourceReadyAt: row.image_source_ready_at,
    imageRequestStartedAt: row.image_request_started_at,
    imageResponseReceivedAt: row.image_response_received_at,
    imageFinalizedAt: row.image_finalized_at,
    imageWatchdogAt: row.image_watchdog_at,
    imageRecoveryState: row.image_recovery_state,
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
      estimated_cost_usd,
      image_phase,
      image_leased_at,
      image_source_ready_at,
      image_request_started_at,
      image_response_received_at,
      image_finalized_at,
      image_watchdog_at,
      image_recovery_state,
      image_client_request_id,
      image_provider_request_id,
      image_provider_status,
      image_submitted_at,
      image_last_polled_at,
      image_provider_terminal_at,
      image_provider_error_code,
      image_provider_error_message,
      image_poll_lease_token,
      image_poll_lease_at,
      image_openai_response_id,
      vector_store_id,
      source_metadata_json
    FROM social_post_queue
  `;
}

function socialVectorStoreId(env: Pick<SocialImagePreparationBindings, "SOCIAL_VECTOR_STORE_ID" | "WARAPORN_VECTOR_STORE_ID">): string {
  return clean(env.SOCIAL_VECTOR_STORE_ID) ?? clean(env.WARAPORN_VECTOR_STORE_ID) ?? DEFAULT_SOCIAL_VECTOR_STORE_ID;
}

function socialImagePrepModel(env: Pick<SocialImagePreparationBindings, "SOCIAL_IMAGE_PREP_MODEL">): string {
  return clean(env.SOCIAL_IMAGE_PREP_MODEL) ?? DEFAULT_SOCIAL_IMAGE_PREP_MODEL;
}

function bangkokDateFrom(isoDate: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoDate));
}

function likelyKohChangSeason(date: string): SocialImagePrepareContext["seasonalContextSeed"]["likelySeason"] {
  const month = Number(date.slice(5, 7));
  return month >= 5 && month <= 10 ? "green_season" : "dry_season";
}

function socialImagePrepareContext(row: SocialPostQueueRow, now: string): SocialImagePrepareContext {
  const processingDate = bangkokDateFrom(now);
  const uploadDate = bangkokDateFrom(row.queued_at);
  return {
    imageCaptureDate: null,
    captureOrUploadDate: row.queued_at,
    uploadDate,
    processingDate,
    scheduledPublishAt: row.scheduled_publish_at,
    gps: null,
    camera: null,
    locationContext: {
      resort: "Vanara",
      island: "Koh Chang",
      country: "Thailand",
      source: "app_default",
    },
    seasonalContextSeed: {
      date: row.scheduled_publish_at ?? now,
      likelySeason: likelyKohChangSeason(row.scheduled_publish_at ? bangkokDateFrom(row.scheduled_publish_at) : processingDate),
      confidence: "calendar_context_only",
      kbInstruction: "Use file_search for Vanara/Koh Chang seasonal advice, but keep visible image evidence separate from KB context and never infer visible weather from KB.",
    },
  };
}

function asciiFrom(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length)).replace(/\0+$/, "").trim();
}

function readExifMetadata(buffer: ArrayBuffer): Partial<Pick<SourceImageMetadata, "image_capture_date" | "gps" | "camera">> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return {};

  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const segmentLength = (bytes[offset + 2] << 8) + bytes[offset + 3];
    const segmentStart = offset + 4;
    if (marker === 0xe1 && asciiFrom(bytes, segmentStart, 6) === "Exif") {
      return parseTiffExif(bytes, segmentStart + 6, segmentLength - 8);
    }
    offset += 2 + segmentLength;
  }
  return {};
}

function parseTiffExif(bytes: Uint8Array, tiffStart: number, length: number): Partial<Pick<SourceImageMetadata, "image_capture_date" | "gps" | "camera">> {
  const littleEndian = asciiFrom(bytes, tiffStart, 2) === "II";
  const bigEndian = asciiFrom(bytes, tiffStart, 2) === "MM";
  if (!littleEndian && !bigEndian) return {};

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read16 = (position: number) => view.getUint16(position, littleEndian);
  const read32 = (position: number) => view.getUint32(position, littleEndian);
  const readRational = (position: number): number => {
    const numerator = read32(position);
    const denominator = read32(position + 4);
    return denominator === 0 ? 0 : numerator / denominator;
  };
  const inTiff = (position: number, byteLength: number) => position >= tiffStart && position + byteLength <= tiffStart + length;

  const valueOffset = (entryOffset: number) => tiffStart + read32(entryOffset + 8);
  const readAsciiValue = (entryOffset: number, count: number): string | null => {
    const position = count <= 4 ? entryOffset + 8 : valueOffset(entryOffset);
    return inTiff(position, count) ? asciiFrom(bytes, position, count) : null;
  };
  const readLongValue = (entryOffset: number): number => read32(entryOffset + 8);

  const readIfd = (ifdOffset: number): Map<number, { type: number; count: number; entryOffset: number }> => {
    const absolute = tiffStart + ifdOffset;
    const entries = new Map<number, { type: number; count: number; entryOffset: number }>();
    if (!inTiff(absolute, 2)) return entries;
    const entryCount = read16(absolute);
    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = absolute + 2 + index * 12;
      if (!inTiff(entryOffset, 12)) break;
      entries.set(read16(entryOffset), {
        type: read16(entryOffset + 2),
        count: read32(entryOffset + 4),
        entryOffset,
      });
    }
    return entries;
  };

  if (read16(tiffStart + 2) !== 42) return {};
  const ifd0 = readIfd(read32(tiffStart + 4));
  const camera = {
    make: ifd0.get(0x010f)?.type === 2 ? readAsciiValue(ifd0.get(0x010f)!.entryOffset, ifd0.get(0x010f)!.count) : null,
    model: ifd0.get(0x0110)?.type === 2 ? readAsciiValue(ifd0.get(0x0110)!.entryOffset, ifd0.get(0x0110)!.count) : null,
  };
  let imageCaptureDate: string | null = ifd0.get(0x0132)?.type === 2 ? readAsciiValue(ifd0.get(0x0132)!.entryOffset, ifd0.get(0x0132)!.count) : null;

  const exifPointer = ifd0.get(0x8769);
  if (exifPointer?.type === 4) {
    const exifIfd = readIfd(readLongValue(exifPointer.entryOffset));
    imageCaptureDate = (exifIfd.get(0x9003)?.type === 2 ? readAsciiValue(exifIfd.get(0x9003)!.entryOffset, exifIfd.get(0x9003)!.count) : null)
      ?? (exifIfd.get(0x9004)?.type === 2 ? readAsciiValue(exifIfd.get(0x9004)!.entryOffset, exifIfd.get(0x9004)!.count) : null)
      ?? imageCaptureDate;
  }

  let gps: SourceImageMetadata["gps"] = null;
  const gpsPointer = ifd0.get(0x8825);
  if (gpsPointer?.type === 4) {
    const gpsIfd = readIfd(readLongValue(gpsPointer.entryOffset));
    const latRefEntry = gpsIfd.get(0x0001);
    const latEntry = gpsIfd.get(0x0002);
    const lngRefEntry = gpsIfd.get(0x0003);
    const lngEntry = gpsIfd.get(0x0004);
    if (latRefEntry?.type === 2 && latEntry?.type === 5 && lngRefEntry?.type === 2 && lngEntry?.type === 5) {
      const latPosition = valueOffset(latEntry.entryOffset);
      const lngPosition = valueOffset(lngEntry.entryOffset);
      if (inTiff(latPosition, 24) && inTiff(lngPosition, 24)) {
        const latitude = readRational(latPosition) + readRational(latPosition + 8) / 60 + readRational(latPosition + 16) / 3600;
        const longitude = readRational(lngPosition) + readRational(lngPosition + 8) / 60 + readRational(lngPosition + 16) / 3600;
        const latRef = readAsciiValue(latRefEntry.entryOffset, latRefEntry.count);
        const lngRef = readAsciiValue(lngRefEntry.entryOffset, lngRefEntry.count);
        gps = {
          lat: latRef === "S" ? -latitude : latitude,
          lng: lngRef === "W" ? -longitude : longitude,
          source: "exif",
          confidence: "high",
        };
      }
    }
  }

  return {
    image_capture_date: imageCaptureDate,
    gps,
    camera: camera.make || camera.model ? camera : null,
  };
}

function extractSocialImageMetadata(row: SocialPostQueueRow, buffer: ArrayBuffer, now: string): SourceImageMetadata {
  const exif = row.content_type === "image/jpeg" ? readExifMetadata(buffer) : {};
  return {
    image_capture_date: exif.image_capture_date ?? null,
    upload_date: bangkokDateFrom(row.queued_at),
    job_date: bangkokDateFrom(now),
    gps: exif.gps ?? null,
    camera: exif.camera ?? null,
    source: {
      image_capture_date: exif.image_capture_date ? "exif" : "unavailable",
      gps: exif.gps ? "exif" : "unavailable",
      location_context: "app_default",
    },
  };
}

function socialImagePrepareContextWithMetadata(row: SocialPostQueueRow, now: string, metadata: SourceImageMetadata): SocialImagePrepareContext {
  return {
    ...socialImagePrepareContext(row, now),
    imageCaptureDate: metadata.image_capture_date,
    uploadDate: metadata.upload_date,
    gps: metadata.gps,
    camera: metadata.camera,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function processedObjectKey(row: SocialPostQueueRow): string {
  const stableAttemptId = row.image_client_request_id ?? `job-${row.social_post_id}`;
  return `${SOCIAL_PROCESSED_PREFIX}/${row.queued_at.slice(0, 10)}/${row.social_post_id}-${stableAttemptId}.jpg`;
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

function estimateSocialModelCostUsd(usage: OpenAiUsage, model: string): number {
  const pricing = SOCIAL_MODEL_PRICING_USD_PER_MILLION[model] ?? SOCIAL_MODEL_PRICING_USD_PER_MILLION[DEFAULT_SOCIAL_IMAGE_PREP_MODEL];
  const uncachedInputTokens = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  const cost = (
    uncachedInputTokens * pricing.input
    + usage.cachedInputTokens * pricing.cachedInput
    + usage.outputTokens * pricing.output
  ) / 1_000_000;
  return Number(cost.toFixed(8));
}

function toolCallCountFrom(response: unknown): number {
  if (!isRecord(response) || !Array.isArray(response.output)) return 0;
  return response.output.filter((item) => isRecord(item) && (item.type === "file_search_call" || item.type === "image_generation_call")).length;
}

function imageBase64From(response: unknown): string {
  if (!isRecord(response) || !Array.isArray(response.output)) {
    throw new SocialImagePreparationError("OpenAI returned an invalid response.", "openai_invalid_response", 502);
  }
  for (const outputItem of response.output) {
    if (isRecord(outputItem) && outputItem.type === "image_generation_call" && typeof outputItem.result === "string" && outputItem.result.trim()) {
      return outputItem.result.trim();
    }
  }
  throw new SocialImagePreparationError("OpenAI response did not include a generated image.", "openai_invalid_response", 502);
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

export function parseSocialImageAnalysisText(text: string): JsonRecord {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed)?.[1];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const candidates = [trimmed, fenced, firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : null]
    .filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      // Try the next format the provider may have wrapped around the JSON object.
    }
  }
  throw new Error("Social image analysis was not a JSON object.");
}

function analysisJsonFrom(response: unknown, context: SocialImagePrepareContext): string {
  const text = outputTextFrom(response);
  if (!text) {
    throw new SocialImagePreparationError("OpenAI response did not include social image analysis.", "openai_invalid_response", 502);
  }
  try {
    const parsed = parseSocialImageAnalysisText(text);
    return JSON.stringify({
      visual_subject: typeof parsed.visual_subject === "string" ? parsed.visual_subject : "unknown",
      visible_details: Array.isArray(parsed.visible_details)
        ? parsed.visible_details.filter((item): item is string => typeof item === "string").slice(0, 12)
        : [],
      visual_evidence: Array.isArray(parsed.visual_evidence)
        ? parsed.visual_evidence.filter((item): item is string => typeof item === "string").slice(0, 7)
        : [],
      caption_anchors: Array.isArray(parsed.caption_anchors)
        ? parsed.caption_anchors.filter((item): item is string => typeof item === "string").slice(0, 4)
        : [],
      story_angles: Array.isArray(parsed.story_angles)
        ? parsed.story_angles.filter((item): item is string => typeof item === "string").slice(0, 4)
        : [],
      guest_experience_link: typeof parsed.guest_experience_link === "string" ? parsed.guest_experience_link : "",
      do_not_claim: Array.isArray(parsed.do_not_claim)
        ? parsed.do_not_claim.filter((item): item is string => typeof item === "string").slice(0, 8)
        : [],
      avoid_claims: Array.isArray(parsed.avoid_claims)
        ? parsed.avoid_claims.filter((item): item is string => typeof item === "string").slice(0, 8)
        : Array.isArray(parsed.do_not_claim)
          ? parsed.do_not_claim.filter((item): item is string => typeof item === "string").slice(0, 8)
          : [],
      confidence_by_detail: isRecord(parsed.confidence_by_detail) ? parsed.confidence_by_detail : {},
      location_context: isRecord(parsed.location_context) ? parsed.location_context : context.locationContext,
      local_context: isRecord(parsed.local_context)
        ? parsed.local_context
        : {
            resort: "Vanara",
            island: "Koh Chang",
            country: "Thailand",
            source: "app_default",
            confidence: "declared_context",
          },
      seasonal_context: isRecord(parsed.seasonal_context)
        ? parsed.seasonal_context
        : {
            date: context.seasonalContextSeed.date,
            likely_season: context.seasonalContextSeed.likelySeason,
            kb_notes: [],
            confidence: context.seasonalContextSeed.confidence,
          },
      caption_context_notes: Array.isArray(parsed.caption_context_notes)
        ? parsed.caption_context_notes.filter((item): item is string => typeof item === "string").slice(0, 6)
        : [
            "Use visible evidence as the primary caption anchor.",
            "Use Vanara / Koh Chang / Thailand as declared context, not as invented visual evidence.",
          ],
      location_guess: typeof parsed.location_guess === "string" ? parsed.location_guess : "unknown",
      image_capture_date: typeof parsed.image_capture_date === "string" ? parsed.image_capture_date : context.imageCaptureDate,
      upload_date: typeof parsed.upload_date === "string" ? parsed.upload_date : context.uploadDate,
      gps_source: typeof parsed.gps_source === "string" ? parsed.gps_source : (context.gps ? "exif" : "unavailable"),
      location_source_breakdown: isRecord(parsed.location_source_breakdown)
        ? parsed.location_source_breakdown
        : {
            primary_location: "app_default",
            visual_details: "visual_guess",
            seasonal_notes: "kb",
          },
      location_source: typeof parsed.location_source === "string" ? parsed.location_source : "owner_upload",
      location_confidence: typeof parsed.location_confidence === "number" ? parsed.location_confidence : null,
      mood: typeof parsed.mood === "string" ? parsed.mood : "unknown",
      colors: Array.isArray(parsed.colors) ? parsed.colors.filter((item): item is string => typeof item === "string").slice(0, 8) : [],
      natural_elements: Array.isArray(parsed.natural_elements)
        ? parsed.natural_elements.filter((item): item is string => typeof item === "string").slice(0, 10)
        : [],
      architectural_or_material_details: Array.isArray(parsed.architectural_or_material_details)
        ? parsed.architectural_or_material_details.filter((item): item is string => typeof item === "string").slice(0, 10)
        : [],
      time_of_day_guess: typeof parsed.time_of_day_guess === "string" ? parsed.time_of_day_guess : "unknown",
      detected_entities: Array.isArray(parsed.detected_entities)
        ? parsed.detected_entities.filter((item): item is string => typeof item === "string").slice(0, 12)
        : [],
      editing_summary: typeof parsed.editing_summary === "string" ? parsed.editing_summary : "Prepared with conservative natural enhancement.",
      risk_notes: typeof parsed.risk_notes === "string" ? parsed.risk_notes : "",
      conservative_enhancement_note: typeof parsed.conservative_enhancement_note === "string" ? parsed.conservative_enhancement_note : "",
      tone_hints: Array.isArray(parsed.tone_hints)
        ? parsed.tone_hints.filter((item): item is string => typeof item === "string").slice(0, 8)
        : ["calm", "grounded", "observant", "human"],
      instagram_hint: typeof parsed.instagram_hint === "string" ? parsed.instagram_hint : "",
      facebook_hint: typeof parsed.facebook_hint === "string" ? parsed.facebook_hint : "",
      recommended_hashtag_categories: Array.isArray(parsed.recommended_hashtag_categories)
        ? parsed.recommended_hashtag_categories.filter((item): item is string => typeof item === "string").slice(0, 6)
        : [],
    });
  } catch {
    throw new SocialImagePreparationError("OpenAI social image analysis was not valid JSON.", "openai_invalid_response", 502);
  }
}

export function buildSocialImagePrepareRequest(
  imageDataUrl: string,
  storeId: string,
  context: SocialImagePrepareContext,
  model = DEFAULT_SOCIAL_IMAGE_PREP_MODEL,
): JsonRecord {
  return {
    model,
    instructions: SOCIAL_IMAGE_PREPARE_PROMPT,
    tools: [
      {
        type: "file_search",
        vector_store_ids: [storeId],
        max_num_results: SOCIAL_FILE_SEARCH_MAX_RESULTS,
      },
      {
        type: "image_generation",
        // Image generation accepts a fixed medium complexity. Do not send a
        // response-level `reasoning.effort` below: for this model it is
        // inherited by the image tool as its complexity and OpenAI rejects
        // the resulting `low` value before it can create the image.
        complexity: "medium",
        output_format: "jpeg",
        quality: "high",
        background: "auto",
        moderation: "auto",
        output_compression: 86,
      },
    ],
    tool_choice: "auto",
    max_tool_calls: SOCIAL_IMAGE_PREPARE_MAX_TOOL_CALLS,
    text: {
      verbosity: "low",
      format: { type: "json_object" },
    },
    include: ["file_search_call.results"],
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "Prepare this owner-uploaded Vanara Retreat photo for the future daily social post.",
            "Return only the transformed JPEG and the compact analysis JSON.",
            "Runtime context:",
            JSON.stringify({
              capture_or_upload_date: context.captureOrUploadDate,
              processing_date: context.processingDate,
              scheduled_publish_at: context.scheduledPublishAt,
              image_capture_date: context.imageCaptureDate,
              upload_date: context.uploadDate,
              gps: context.gps,
              camera: context.camera,
              location_context: context.locationContext,
              seasonal_context_seed: context.seasonalContextSeed,
            }),
          ].join("\n"),
        },
        {
          type: "input_image",
          image_url: imageDataUrl,
          detail: "auto",
        },
      ],
    }],
  };
}

async function acquireImagePost(
  env: Pick<SocialImagePreparationBindings, "DB">,
  socialPostId: number | null,
  now: string,
  dueBy: string,
): Promise<SocialPostQueueRow | null> {
  const leaseToken = crypto.randomUUID();
  const clientRequestId = crypto.randomUUID();
  const staleLeaseCutoff = new Date(new Date(now).getTime() - SOCIAL_IMAGE_STALE_LEASE_MS).toISOString();

  const recoverySql = socialPostId === null
    ? `
      UPDATE social_post_queue
      SET image_poll_lease_token = ?,
          image_poll_lease_at = ?,
          image_client_request_id = COALESCE(image_client_request_id, ?),
          image_phase = 'POLLING',
          updated_at = ?
      WHERE social_post_id = (
        SELECT social_post_id
        FROM social_post_queue
        WHERE status = 'PREPARING_IMAGE'
          AND image_openai_response_id IS NOT NULL
          AND scheduled_publish_at IS NOT NULL
          AND scheduled_publish_at <= ?
          AND (image_poll_lease_at IS NULL OR image_poll_lease_at <= ?)
        ORDER BY scheduled_publish_at ASC, queued_at ASC, social_post_id ASC
        LIMIT 1
      )
        AND status = 'PREPARING_IMAGE'
        AND image_openai_response_id IS NOT NULL
        AND (image_poll_lease_at IS NULL OR image_poll_lease_at <= ?)
      RETURNING *
    `
    : `
      UPDATE social_post_queue
      SET image_poll_lease_token = ?,
          image_poll_lease_at = ?,
          image_client_request_id = COALESCE(image_client_request_id, ?),
          image_phase = 'POLLING',
          updated_at = ?
      WHERE social_post_id = ?
        AND status = 'PREPARING_IMAGE'
        AND image_openai_response_id IS NOT NULL
        AND (image_poll_lease_at IS NULL OR image_poll_lease_at <= ?)
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

  // A completed OpenAI response can occasionally reach R2 but lose the D1
  // finalization checkpoint (or vice versa). Resume that exact response once,
  // rather than marooning the post in FAILED or generating another image.
  const finalizationRecoverySql = socialPostId === null
    ? `
      UPDATE social_post_queue
      SET status = 'PREPARING_IMAGE',
          image_phase = 'POLLING',
          image_poll_lease_token = ?,
          image_poll_lease_at = ?,
          image_recovery_state = NULL,
          attempt_count = attempt_count + 1,
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = (
        SELECT social_post_id
        FROM social_post_queue
        WHERE status = 'FAILED'
          AND image_recovery_state = 'RETRY_FINALIZATION'
          AND image_openai_response_id IS NOT NULL
          AND attempt_count < ${SOCIAL_IMAGE_FINALIZATION_MAX_ATTEMPTS}
          AND scheduled_publish_at IS NOT NULL
          AND scheduled_publish_at <= ?
        ORDER BY scheduled_publish_at ASC, queued_at ASC, social_post_id ASC
        LIMIT 1
      )
        AND status = 'FAILED'
        AND image_recovery_state = 'RETRY_FINALIZATION'
        AND image_openai_response_id IS NOT NULL
        AND attempt_count < ${SOCIAL_IMAGE_FINALIZATION_MAX_ATTEMPTS}
      RETURNING *
    `
    : `
      UPDATE social_post_queue
      SET status = 'PREPARING_IMAGE',
          image_phase = 'POLLING',
          image_poll_lease_token = ?,
          image_poll_lease_at = ?,
          image_recovery_state = NULL,
          attempt_count = attempt_count + 1,
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = ?
        AND status = 'FAILED'
        AND image_recovery_state = 'RETRY_FINALIZATION'
        AND image_openai_response_id IS NOT NULL
        AND attempt_count < ${SOCIAL_IMAGE_FINALIZATION_MAX_ATTEMPTS}
      RETURNING *
    `;
  const finalizationRecovery = socialPostId === null
    ? await env.DB.prepare(finalizationRecoverySql).bind(leaseToken, now, now, dueBy).first<SocialPostQueueRow>()
    : await env.DB.prepare(finalizationRecoverySql).bind(leaseToken, now, now, socialPostId).first<SocialPostQueueRow>();
  if (finalizationRecovery) return finalizationRecovery;

  const bounds = socialBangkokDayBounds(now);
  const sql = socialPostId === null
    ? `
      UPDATE social_post_queue
      SET status = 'PREPARING_IMAGE',
          processing_started_at = ?,
          image_phase = 'LEASED',
          image_leased_at = ?,
          image_source_ready_at = NULL,
          image_request_started_at = NULL,
          image_response_received_at = NULL,
          image_finalized_at = NULL,
          image_recovery_state = NULL,
          image_client_request_id = COALESCE(image_client_request_id, ?),
          image_provider_status = 'created',
          image_provider_error_code = NULL,
          image_provider_error_message = NULL,
          image_poll_lease_token = ?,
          image_poll_lease_at = ?,
          attempt_count = attempt_count + 1,
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = (
        SELECT candidate.social_post_id
        FROM social_post_queue candidate
        WHERE (
            candidate.status = 'QUEUED'
            OR (
              candidate.status = 'FAILED'
              AND candidate.image_recovery_state = 'RETRY_SAFE'
              AND candidate.image_request_started_at IS NULL
              AND candidate.image_openai_response_id IS NULL
              AND candidate.openai_request_count = 0
              AND candidate.attempt_count < ${SOCIAL_IMAGE_MAX_ATTEMPTS}
            )
          )
          AND candidate.scheduled_publish_at IS NOT NULL
          AND candidate.scheduled_publish_at <= ?
          AND NOT EXISTS (
            SELECT 1
            FROM social_post_queue active
            WHERE active.social_post_id <> candidate.social_post_id
              AND active.status IN ('PREPARING_IMAGE','IMAGE_READY','CAPTIONING','READY_TO_POST','POSTING')
              AND active.scheduled_publish_at IS NOT NULL
              AND active.scheduled_publish_at <= ?
          )
          AND NOT EXISTS (
            SELECT 1
            FROM social_post_queue started
            WHERE started.processing_started_at >= ?
              AND started.processing_started_at < ?
              AND started.social_post_id <> candidate.social_post_id
          )
        ORDER BY candidate.scheduled_publish_at ASC, candidate.queued_at ASC, candidate.social_post_id ASC
        LIMIT 1
      )
        AND (
          status = 'QUEUED'
          OR (
            status = 'FAILED'
            AND image_recovery_state = 'RETRY_SAFE'
            AND image_request_started_at IS NULL
            AND image_openai_response_id IS NULL
            AND openai_request_count = 0
            AND attempt_count < ${SOCIAL_IMAGE_MAX_ATTEMPTS}
          )
        )
      RETURNING *
    `
    : `
      UPDATE social_post_queue
      SET status = 'PREPARING_IMAGE',
          processing_started_at = ?,
          image_phase = 'LEASED',
          image_leased_at = ?,
          image_source_ready_at = NULL,
          image_request_started_at = NULL,
          image_response_received_at = NULL,
          image_finalized_at = NULL,
          image_recovery_state = NULL,
          image_client_request_id = COALESCE(image_client_request_id, ?),
          image_provider_status = 'created',
          image_provider_error_code = NULL,
          image_provider_error_message = NULL,
          image_poll_lease_token = ?,
          image_poll_lease_at = ?,
          attempt_count = attempt_count + 1,
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = ?
        AND (
          status = 'QUEUED'
          OR (
            status = 'FAILED'
            AND image_recovery_state = 'RETRY_SAFE'
            AND image_request_started_at IS NULL
            AND image_openai_response_id IS NULL
            AND openai_request_count = 0
            AND attempt_count < ${SOCIAL_IMAGE_MAX_ATTEMPTS}
          )
        )
      RETURNING *
    `;
  const row = socialPostId === null
    ? await env.DB.prepare(sql).bind(
      now,
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
    : await env.DB.prepare(sql).bind(
      now,
      now,
      clientRequestId,
      leaseToken,
      now,
      now,
      socialPostId,
    ).first<SocialPostQueueRow>();
  return row ?? null;
}

function storedSocialImageMetadata(row: SocialPostQueueRow, now: string): SourceImageMetadata {
  if (row.source_metadata_json) {
    try {
      const parsed = JSON.parse(row.source_metadata_json) as unknown;
      if (isRecord(parsed)) return parsed as unknown as SourceImageMetadata;
    } catch {
      // Fall through to deterministic metadata with no EXIF claims.
    }
  }
  return {
    image_capture_date: null,
    upload_date: bangkokDateFrom(row.queued_at),
    job_date: bangkokDateFrom(now),
    gps: null,
    camera: null,
    source: {
      image_capture_date: "unavailable",
      gps: "unavailable",
      location_context: "app_default",
    },
  };
}

async function markFailed(
  env: Pick<SocialImagePreparationBindings, "DB">,
  socialPostId: number,
  code: SocialImagePreparationError["code"],
  message: string,
  now: string,
  result?: SocialOpenAiResult | null,
): Promise<SocialPostQueueItem | null> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET status = 'FAILED',
        image_phase = 'FAILED',
        image_finalized_at = ?,
        failed_at = ?,
        updated_at = ?,
        failure_code = ?,
        failure_message = ?,
        image_openai_response_id = COALESCE(?, image_openai_response_id),
        openai_request_count = CASE WHEN ? IS NULL THEN openai_request_count ELSE 1 END,
        openai_input_tokens = CASE WHEN ? IS NULL THEN openai_input_tokens ELSE ? END,
        openai_cached_input_tokens = CASE WHEN ? IS NULL THEN openai_cached_input_tokens ELSE ? END,
        openai_output_tokens = CASE WHEN ? IS NULL THEN openai_output_tokens ELSE ? END,
        openai_reasoning_tokens = CASE WHEN ? IS NULL THEN openai_reasoning_tokens ELSE ? END,
        openai_total_tokens = CASE WHEN ? IS NULL THEN openai_total_tokens ELSE ? END,
        openai_elapsed_ms = CASE WHEN ? IS NULL THEN openai_elapsed_ms ELSE ? END,
        estimated_cost_usd = CASE WHEN ? IS NULL THEN estimated_cost_usd ELSE ? END,
        image_recovery_state = CASE
          WHEN ? = 1 AND image_openai_response_id IS NOT NULL AND attempt_count < ? THEN 'RETRY_FINALIZATION'
          WHEN ? = 1 AND image_request_started_at IS NULL AND image_openai_response_id IS NULL AND openai_request_count = 0 THEN 'RETRY_SAFE'
          ELSE 'MANUAL_REVIEW'
        END
    WHERE social_post_id = ?
  `).bind(
    now,
    now,
    now,
    code,
    message.slice(0, 240),
    result?.responseId ?? null,
    result ? 1 : null,
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
    code === "processed_image_persistence_failed" ? 1 : 0,
    SOCIAL_IMAGE_FINALIZATION_MAX_ATTEMPTS,
    code === "processed_image_persistence_failed" ? 1 : 0,
    socialPostId,
  ).run();
  const row = await env.DB.prepare(`${socialPostSelectSql()} WHERE social_post_id = ?`).bind(socialPostId).first<SocialPostQueueRow>();
  return row ? rowToItem(row) : null;
}

async function markImageSourceReady(
  env: Pick<SocialImagePreparationBindings, "DB">,
  socialPostId: number,
  sourceMetadata: SourceImageMetadata,
  storeId: string,
  now: string,
): Promise<void> {
  const result = await env.DB.prepare(`
    UPDATE social_post_queue
    SET image_phase = 'SOURCE_READY',
        image_source_ready_at = ?,
        source_metadata_json = ?,
        vector_store_id = ?,
        updated_at = ?
    WHERE social_post_id = ? AND status = 'PREPARING_IMAGE' AND image_request_started_at IS NULL
  `).bind(now, JSON.stringify(sourceMetadata), storeId, now, socialPostId).run();
  if (numeric(result.meta.changes) !== 1) {
    throw new SocialImagePreparationError("Social image source checkpoint could not be saved.", "processed_image_persistence_failed", 500);
  }
}

async function markImageRequestStarted(env: Pick<SocialImagePreparationBindings, "DB">, socialPostId: number, now: string): Promise<void> {
  const result = await env.DB.prepare(`
    UPDATE social_post_queue
    SET image_phase = 'REQUEST_STARTED',
        image_request_started_at = ?,
        image_submitted_at = ?,
        image_provider_status = 'submitting',
        openai_request_count = openai_request_count + 1,
        updated_at = ?
    WHERE social_post_id = ?
      AND status = 'PREPARING_IMAGE'
      AND image_request_started_at IS NULL
      AND image_client_request_id IS NOT NULL
      AND openai_request_count = 0
  `).bind(now, now, now, socialPostId).run();
  if (numeric(result.meta.changes) !== 1) {
    throw new SocialImagePreparationError("Social image request checkpoint could not be saved.", "processed_image_persistence_failed", 500);
  }
}

async function checkpointImageResponse(
  env: Pick<SocialImagePreparationBindings, "DB">,
  socialPostId: number,
  checkpoint: SocialOpenAiBackgroundCheckpoint,
  now: string,
): Promise<void> {
  const update = await env.DB.prepare(`
    UPDATE social_post_queue
    SET image_phase = CASE WHEN ? = 'completed' THEN 'RESPONSE_RECEIVED' ELSE 'POLLING' END,
        image_response_received_at = ?,
        image_openai_response_id = ?,
        image_provider_request_id = COALESCE(?, image_provider_request_id),
        image_provider_status = ?,
        image_last_polled_at = ?,
        image_poll_lease_at = ?,
        image_provider_terminal_at = CASE WHEN ? IN ('completed','failed','cancelled','incomplete') THEN ? ELSE image_provider_terminal_at END,
        -- A response can arrive after the initial request checkpoint has been
        -- interrupted.  Treat this as the same one OpenAI request rather than
        -- rejecting the response and repeatedly retrying its finalization.
        openai_request_count = CASE WHEN openai_request_count < 1 THEN 1 ELSE openai_request_count END,
        updated_at = ?
    WHERE social_post_id = ?
      AND status = 'PREPARING_IMAGE'
      AND image_client_request_id IS NOT NULL
      AND (image_openai_response_id IS NULL OR image_openai_response_id = ?)
  `).bind(
    checkpoint.status,
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
    checkpoint.responseId,
  ).run();
  if (numeric(update.meta.changes) !== 1) {
    throw new SocialImagePreparationError("Social image response checkpoint could not be saved.", "processed_image_persistence_failed", 500);
  }
}

async function releaseImagePollLease(
  env: Pick<SocialImagePreparationBindings, "DB">,
  socialPostId: number,
  providerStatus: string,
  now: string,
): Promise<SocialPostQueueItem | null> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET image_phase = 'POLLING',
        image_provider_status = ?,
        image_last_polled_at = ?,
        image_poll_lease_token = NULL,
        image_poll_lease_at = NULL,
        updated_at = ?
    WHERE social_post_id = ?
      AND status = 'PREPARING_IMAGE'
      AND image_openai_response_id IS NOT NULL
  `).bind(providerStatus, now, now, socialPostId).run();
  const row = await env.DB.prepare(`${socialPostSelectSql()} WHERE social_post_id = ?`).bind(socialPostId).first<SocialPostQueueRow>();
  return row ? rowToItem(row) : null;
}

async function markImageProviderFailure(
  env: Pick<SocialImagePreparationBindings, "DB">,
  socialPostId: number,
  error: SocialOpenAiBackgroundError,
  now: string,
): Promise<SocialPostQueueItem | null> {
  await env.DB.prepare(`
    UPDATE social_post_queue
    SET status = 'FAILED',
        image_phase = 'FAILED',
        image_recovery_state = 'MANUAL_REVIEW',
        image_provider_status = 'failed',
        image_provider_error_code = ?,
        image_provider_error_message = ?,
        image_provider_terminal_at = ?,
        image_poll_lease_token = NULL,
        image_poll_lease_at = NULL,
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
    `image_${error.code}_manual_review`,
    error.message.slice(0, 240),
    socialPostId,
  ).run();
  const row = await env.DB.prepare(`${socialPostSelectSql()} WHERE social_post_id = ?`).bind(socialPostId).first<SocialPostQueueRow>();
  return row ? rowToItem(row) : null;
}

export async function reconcileStaleSocialImagePreparations(
  env: Pick<SocialImagePreparationBindings, "DB">,
  now = new Date().toISOString(),
): Promise<SocialImageWatchdogResult> {
  const cutoff = new Date(new Date(now).getTime() - SOCIAL_IMAGE_STALE_LEASE_MS).toISOString();
  const retrySafe = await env.DB.prepare(`
    UPDATE social_post_queue
    SET status = 'FAILED',
        image_phase = 'FAILED',
        image_watchdog_at = ?,
        image_finalized_at = ?,
        image_recovery_state = 'RETRY_SAFE',
        failed_at = ?,
        updated_at = ?,
        failure_code = 'image_preparation_interrupted_retry_safe',
        failure_message = 'Image preparation stopped before any AI request. The original is preserved and one explicit retry is available.'
    WHERE status = 'PREPARING_IMAGE'
      AND COALESCE(image_leased_at, processing_started_at) <= ?
      AND image_request_started_at IS NULL
      AND image_response_received_at IS NULL
      AND image_openai_response_id IS NULL
      AND openai_request_count = 0
  `).bind(now, now, now, now, cutoff).run();

  const manualReview = await env.DB.prepare(`
    UPDATE social_post_queue
    SET status = 'FAILED',
        image_phase = 'FAILED',
        image_watchdog_at = ?,
        image_finalized_at = ?,
        image_recovery_state = 'MANUAL_REVIEW',
        failed_at = ?,
        updated_at = ?,
        failure_code = 'image_preparation_outcome_unknown_manual_review',
        failure_message = 'Image preparation stopped after an AI request may have started. The original is preserved; automatic retry is blocked.'
    WHERE status = 'PREPARING_IMAGE'
      AND COALESCE(image_leased_at, processing_started_at) <= ?
      AND image_openai_response_id IS NULL
      AND (image_request_started_at IS NOT NULL OR image_response_received_at IS NOT NULL OR openai_request_count > 0)
  `).bind(now, now, now, now, cutoff).run();

  return { retrySafe: numeric(retrySafe.meta.changes), manualReview: numeric(manualReview.meta.changes) };
}

async function callOpenAiSocialImagePrepare(
  env: SocialImagePreparationBindings,
  row: SocialPostQueueRow,
  imageDataUrl: string | null,
  storeId: string,
  context: SocialImagePrepareContext,
  options: PrepareSocialImageOptions,
): Promise<SocialOpenAiResult> {
  const apiKey = clean(env.OPENAI_API_KEY);
  if (!apiKey) throw new SocialImagePreparationError("OPENAI_API_KEY is missing.", "openai_request_failed", 502);
  if (!row.image_client_request_id) {
    throw new SocialImagePreparationError("Social image request id is missing.", "processed_image_persistence_failed", 500);
  }

  const fetcher = options.fetcher ?? env.fetcher ?? fetch;
  const model = socialImagePrepModel(env);
  const started = Date.now();
  const backgroundResult = await runSocialOpenAiBackgroundResponse({
    apiKey,
    body: imageDataUrl ? buildSocialImagePrepareRequest(imageDataUrl, storeId, context, model) : null,
    clientRequestId: row.image_client_request_id,
    fetcher,
    responseId: row.image_openai_response_id,
    timeoutMs: options.backgroundTimeoutMs ?? SOCIAL_IMAGE_PREPARE_TIMEOUT_MS,
    pollIntervalMs: options.pollIntervalMs,
    onCheckpoint: (checkpoint) => checkpointImageResponse(
      env,
      row.social_post_id,
      checkpoint,
      options.now ?? new Date().toISOString(),
    ),
  });
  const payload = backgroundResult.payload;
  const elapsedMs = Date.now() - started;
  const usage = usageFrom(payload);
  return {
    imageBase64: imageBase64From(payload),
    analysisJson: analysisJsonFrom(payload, context),
    responseId: backgroundResult.responseId,
    usage,
    elapsedMs,
    estimatedCostUsd: estimateSocialModelCostUsd(usage, model),
    toolCallCount: toolCallCountFrom(payload),
  };
}

export async function prepareSocialImage(
  env: SocialImagePreparationBindings,
  socialPostId: number | null = null,
  options: PrepareSocialImageOptions = {},
): Promise<PrepareSocialImageResult> {
  const now = options.now ?? new Date().toISOString();
  if (socialPostId === null) await reconcileStaleSocialImagePreparations(env, now);
  const dueBy = options.dueBy ?? socialPublishSlotForBangkokDate(now);
  const leased = await acquireImagePost(env, socialPostId, now, dueBy);
  if (!leased) {
    if (socialPostId === null) return { processed: false, item: null };
    throw new SocialImagePreparationError("Social post is not eligible for image preparation.", "social_post_not_eligible", 400);
  }

  const storeId = socialVectorStoreId(env);
  let openAiResult: SocialOpenAiResult | null = null;

  try {
    if (!SUPPORTED_SOCIAL_IMAGE_TYPES.has(leased.content_type)) {
      const item = await markFailed(
        env,
        leased.social_post_id,
        "unsupported_image_type",
        "Unsupported image type. Please upload JPG, PNG or WebP.",
        now,
      );
      return { processed: false, item };
    }

    let sourceMetadata = storedSocialImageMetadata(leased, now);
    let imageDataUrl: string | null = null;
    if (!leased.image_openai_response_id) {
      const original = await env.R2_STORAGE.get(leased.original_object_key);
      if (!original) {
        const item = await markFailed(env, leased.social_post_id, "original_image_missing", "Original uploaded image is missing.", now);
        return { processed: false, item };
      }
      const originalBytes = await original.arrayBuffer();
      sourceMetadata = extractSocialImageMetadata(leased, originalBytes, now);
      imageDataUrl = `data:${leased.content_type};base64,${arrayBufferToBase64(originalBytes)}`;
      await markImageSourceReady(env, leased.social_post_id, sourceMetadata, storeId, options.now ?? new Date().toISOString());
      await markImageRequestStarted(env, leased.social_post_id, options.now ?? new Date().toISOString());
    }

    openAiResult = await callOpenAiSocialImagePrepare(
      env,
      leased,
      imageDataUrl,
      leased.vector_store_id ?? storeId,
      socialImagePrepareContextWithMetadata(leased, now, sourceMetadata),
      options,
    );
    if (openAiResult.toolCallCount > SOCIAL_IMAGE_PREPARE_MAX_TOOL_CALLS) {
      throw new SocialImagePreparationError("OpenAI exceeded the social image preparation tool call limit.", "openai_tool_call_limit_exceeded", 502);
    }

    const processedKey = processedObjectKey(leased);
    try {
      await env.R2_STORAGE.put(processedKey, base64ToBytes(openAiResult.imageBase64), {
        httpMetadata: { contentType: "image/jpeg" },
        customMetadata: {
          socialPostId: String(leased.social_post_id),
          originalObjectKey: leased.original_object_key,
          purpose: "social-image-preparation",
        },
      });
    } catch (error) {
      const detail = error instanceof Error && error.message.trim() ? `: ${error.message.trim().slice(0, 160)}` : "";
      throw new SocialImagePreparationError(`Processed social image could not be stored${detail}`, "processed_image_persistence_failed", 500);
    }

    const updateResult = await env.DB.prepare(`
      UPDATE social_post_queue
      SET status = 'IMAGE_READY',
          image_phase = 'FINALIZED',
          image_finalized_at = ?,
          image_recovery_state = NULL,
          image_provider_status = 'completed',
          image_provider_terminal_at = ?,
          image_provider_error_code = NULL,
          image_provider_error_message = NULL,
          image_poll_lease_token = NULL,
          image_poll_lease_at = NULL,
          processed_object_key = ?,
          image_prepared_at = ?,
          updated_at = ?,
          analysis_json = ?,
          image_openai_response_id = ?,
          vector_store_id = ?,
          source_metadata_json = ?,
          openai_request_count = 1,
          openai_input_tokens = ?,
          openai_cached_input_tokens = ?,
          openai_output_tokens = ?,
          openai_reasoning_tokens = ?,
          openai_total_tokens = ?,
          openai_elapsed_ms = ?,
          estimated_cost_usd = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = ?
        AND status = 'PREPARING_IMAGE'
    `).bind(
      options.now ?? new Date().toISOString(),
      options.now ?? new Date().toISOString(),
      processedKey,
      now,
      now,
      openAiResult.analysisJson,
      openAiResult.responseId,
      storeId,
      JSON.stringify(sourceMetadata),
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
      throw new SocialImagePreparationError("Social image preparation could not be saved.", "processed_image_persistence_failed", 500);
    }

    const row = await env.DB.prepare(`${socialPostSelectSql()} WHERE social_post_id = ?`).bind(leased.social_post_id).first<SocialPostQueueRow>();
    return { processed: true, item: row ? rowToItem(row) : null };
  } catch (error) {
    if (error instanceof SocialOpenAiBackgroundError) {
      if (error.code === "timeout" && error.responseId) {
        const item = await releaseImagePollLease(env, leased.social_post_id, "in_progress", now);
        return { processed: false, item };
      }
      const item = await markImageProviderFailure(env, leased.social_post_id, error, now);
      return { processed: false, item };
    }
    if (error instanceof SocialImagePreparationError) {
      const item = await markFailed(env, leased.social_post_id, error.code, error.message, now, openAiResult);
      return { processed: false, item };
    }
    const item = await markFailed(env, leased.social_post_id, "processed_image_persistence_failed", "Social image preparation could not be saved.", now, openAiResult);
    if (error instanceof SocialImagePreparationError) return { processed: false, item };
    throw error;
  }
}

export async function prepareNextQueuedSocialImage(
  env: SocialImagePreparationBindings,
  options: PrepareSocialImageOptions = {},
): Promise<PrepareSocialImageResult> {
  return prepareSocialImage(env, null, options);
}
