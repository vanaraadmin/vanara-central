import { SOCIAL_IMAGE_PREPARE_PROMPT } from "../assets/prompts/social-image-prepare-v1.prompt.js";
import type { SocialAutomationBindings, SocialPostQueueItem } from "./social-automation.service.js";

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
  fetcher?: Fetcher;
}

export interface PrepareSocialImageResult {
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
  estimated_cost_usd: number;
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

export const SOCIAL_IMAGE_PREPARE_CRON = "0 20 * * *";
export const DEFAULT_SOCIAL_IMAGE_PREP_MODEL = "gpt-5.6-terra";
export const DEFAULT_SOCIAL_CAPTION_MODEL = "gpt-5.6-terra";
export const SOCIAL_IMAGE_PREP_SUPPORTED_FALLBACK_MODEL = "gpt-5.6";
export const DEFAULT_SOCIAL_VECTOR_STORE_ID = "vs_6a48c08b24a88191b45bc43c2579d37f";
export const SOCIAL_IMAGE_PREPARE_MAX_TOOL_CALLS = 2;
export const SOCIAL_IMAGE_PREPARE_TIMEOUT_MS = 90_000;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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
      estimated_cost_usd
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

function processedObjectKey(now: string): string {
  return `${SOCIAL_PROCESSED_PREFIX}/${now.slice(0, 10)}/${crypto.randomUUID()}.jpg`;
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

function openAiResponseId(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.id === "string" ? payload.id : null;
}

function openAiErrorMessage(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.message !== "string") {
    return "OpenAI social image preparation request failed.";
  }
  return payload.error.message;
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

function analysisJsonFrom(response: unknown, context: SocialImagePrepareContext): string {
  const text = outputTextFrom(response);
  if (!text) {
    throw new SocialImagePreparationError("OpenAI response did not include social image analysis.", "openai_invalid_response", 502);
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) throw new Error("not an object");
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
        output_format: "jpeg",
        quality: "high",
        background: "auto",
        moderation: "auto",
        output_compression: 86,
      },
    ],
    tool_choice: "auto",
    max_tool_calls: SOCIAL_IMAGE_PREPARE_MAX_TOOL_CALLS,
    reasoning: { effort: "low" },
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

async function acquireQueuedPost(env: Pick<SocialImagePreparationBindings, "DB">, socialPostId: number | null, now: string): Promise<SocialPostQueueRow | null> {
  const sql = socialPostId === null
    ? `
      UPDATE social_post_queue
      SET status = 'PREPARING_IMAGE',
          processing_started_at = ?,
          attempt_count = attempt_count + 1,
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = (
        SELECT social_post_id
        FROM social_post_queue
        WHERE status = 'QUEUED'
        ORDER BY queued_at ASC, social_post_id ASC
        LIMIT 1
      )
        AND status = 'QUEUED'
      RETURNING *
    `
    : `
      UPDATE social_post_queue
      SET status = 'PREPARING_IMAGE',
          processing_started_at = ?,
          attempt_count = attempt_count + 1,
          updated_at = ?,
          failure_code = NULL,
          failure_message = NULL
      WHERE social_post_id = ?
        AND status = 'QUEUED'
      RETURNING *
    `;
  const statement = env.DB.prepare(sql);
  const row = socialPostId === null
    ? await statement.bind(now, now).first<SocialPostQueueRow>()
    : await statement.bind(now, now, socialPostId).first<SocialPostQueueRow>();
  return row ?? null;
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
        estimated_cost_usd = CASE WHEN ? IS NULL THEN estimated_cost_usd ELSE ? END
    WHERE social_post_id = ?
  `).bind(
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
    socialPostId,
  ).run();
  const row = await env.DB.prepare(`${socialPostSelectSql()} WHERE social_post_id = ?`).bind(socialPostId).first<SocialPostQueueRow>();
  return row ? rowToItem(row) : null;
}

async function callOpenAiSocialImagePrepare(
  env: SocialImagePreparationBindings,
  imageDataUrl: string,
  storeId: string,
  context: SocialImagePrepareContext,
  options: PrepareSocialImageOptions,
): Promise<SocialOpenAiResult> {
  const apiKey = clean(env.OPENAI_API_KEY);
  if (!apiKey) throw new SocialImagePreparationError("OPENAI_API_KEY is missing.", "openai_request_failed", 502);

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), SOCIAL_IMAGE_PREPARE_TIMEOUT_MS);
  const fetcher = options.fetcher ?? env.fetcher ?? fetch;
  const model = socialImagePrepModel(env);
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
      body: JSON.stringify(buildSocialImagePrepareRequest(imageDataUrl, storeId, context, model)),
    });
  } catch (error) {
    if (isAbortError(error)) throw new SocialImagePreparationError("OpenAI social image preparation timed out.", "openai_timeout", 502);
    throw new SocialImagePreparationError(
      error instanceof Error ? error.message : "OpenAI social image preparation request failed.",
      "openai_request_failed",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);
  const elapsedMs = Date.now() - started;
  if (!response.ok) {
    throw new SocialImagePreparationError(openAiErrorMessage(payload), "openai_request_failed", 502);
  }

  const usage = usageFrom(payload);
  return {
    imageBase64: imageBase64From(payload),
    analysisJson: analysisJsonFrom(payload, context),
    responseId: openAiResponseId(payload) ?? response.headers.get("x-request-id") ?? response.headers.get("openai-request-id"),
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
  const leased = await acquireQueuedPost(env, socialPostId, now);
  if (!leased) {
    if (socialPostId === null) return { processed: false, item: null };
    throw new SocialImagePreparationError("Social post is not eligible for image preparation.", "social_post_not_eligible", 400);
  }

  const storeId = socialVectorStoreId(env);
  let openAiResult: SocialOpenAiResult | null = null;
  let processedKey: string | null = null;

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

    const original = await env.R2_STORAGE.get(leased.original_object_key);
    if (!original) {
      const item = await markFailed(env, leased.social_post_id, "original_image_missing", "Original uploaded image is missing.", now);
      return { processed: false, item };
    }

    const originalBytes = await original.arrayBuffer();
    const sourceMetadata = extractSocialImageMetadata(leased, originalBytes, now);
    const imageDataUrl = `data:${leased.content_type};base64,${arrayBufferToBase64(originalBytes)}`;
    openAiResult = await callOpenAiSocialImagePrepare(env, imageDataUrl, storeId, socialImagePrepareContextWithMetadata(leased, now, sourceMetadata), options);
    if (openAiResult.toolCallCount > SOCIAL_IMAGE_PREPARE_MAX_TOOL_CALLS) {
      throw new SocialImagePreparationError("OpenAI exceeded the social image preparation tool call limit.", "openai_tool_call_limit_exceeded", 502);
    }

    processedKey = processedObjectKey(now);
    await env.R2_STORAGE.put(processedKey, base64ToBytes(openAiResult.imageBase64), {
      httpMetadata: { contentType: "image/jpeg" },
      customMetadata: {
        socialPostId: String(leased.social_post_id),
        originalObjectKey: leased.original_object_key,
        purpose: "social-image-preparation",
      },
    });

    const updateResult = await env.DB.prepare(`
      UPDATE social_post_queue
      SET status = 'IMAGE_READY',
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
    if (processedKey) await env.R2_STORAGE.delete(processedKey);
    if (error instanceof SocialImagePreparationError && error.code !== "processed_image_persistence_failed") {
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
