import { ForbiddenError, isOwner, type CurrentUser } from "./current-user.service.js";

export type FreeTextEntityType = "procurement_request" | "chat_message";
export type FreeTextLanguage = "en" | "th";

export interface FreeTextTranslationBindings {
  DB: D1Database;
  GOOGLE_TRANSLATE_API_KEY?: string;
  fetcher?: (input: string, init: RequestInit) => Promise<Response>;
}

export interface FreeTextTranslationInput {
  entityType: FreeTextEntityType;
  entityId: string;
  fieldName: string;
  originalText: string;
  sourceLanguage: FreeTextLanguage | null;
  targetLanguage: FreeTextLanguage;
}

export interface FreeTextTranslationResult {
  entityType: FreeTextEntityType;
  entityId: string;
  fieldName: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: FreeTextLanguage;
  targetLanguage: FreeTextLanguage;
  provider: "google_cloud_translation" | "source";
  cached: boolean;
}

interface TranslationCacheRow {
  source_language: string | null;
  translated_text: string;
  provider: string;
}

interface GoogleTranslateResponse {
  data?: {
    translations?: Array<{
      translatedText?: string;
      detectedSourceLanguage?: string;
    }>;
  };
  error?: { message?: string };
}

interface CanonicalFreeText {
  entityType: FreeTextEntityType;
  entityId: string;
  fieldName: string;
  originalText: string;
  sourceLanguage: FreeTextLanguage | null;
}

const ENTITY_TYPES = new Set<FreeTextEntityType>(["procurement_request", "chat_message"]);
const LANGUAGES = new Set<FreeTextLanguage>(["en", "th"]);
const GOOGLE_PROVIDER = "google_cloud_translation" as const;

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeLanguage(value: unknown, fallback: FreeTextLanguage): FreeTextLanguage {
  return value === "th" ? "th" : value === "en" ? "en" : fallback;
}

function optionalLanguage(value: unknown): FreeTextLanguage | null {
  return value === "th" || value === "en" ? value : null;
}

function htmlDecodeMinimal(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeFreeTextTranslationInput(payload: unknown, user: CurrentUser): FreeTextTranslationInput {
  if (!payload || typeof payload !== "object") throw new Error("Translation payload is required.");
  const rawEntityType = "entityType" in payload ? payload.entityType : "entity_type" in payload ? payload.entity_type : null;
  if (rawEntityType !== "procurement_request" && rawEntityType !== "chat_message") {
    throw new Error("Translation entity is not supported.");
  }
  const entityId = cleanString("entityId" in payload ? payload.entityId : "entity_id" in payload ? payload.entity_id : null, 180);
  const fieldName = cleanString("fieldName" in payload ? payload.fieldName : "field_name" in payload ? payload.field_name : null, 80);
  const originalText = cleanString("originalText" in payload ? payload.originalText : "original_text" in payload ? payload.original_text : null, 4000);
  if (!entityId) throw new Error("Translation entity id is required.");
  if (!fieldName) throw new Error("Translation field is required.");
  if (!originalText) throw new Error("Original text is required.");
  return {
    entityType: rawEntityType,
    entityId,
    fieldName,
    originalText,
    sourceLanguage: optionalLanguage("sourceLanguage" in payload ? payload.sourceLanguage : "source_language" in payload ? payload.source_language : null),
    targetLanguage: normalizeLanguage("targetLanguage" in payload ? payload.targetLanguage : "target_language" in payload ? payload.target_language : null, user.preferredLanguage),
  };
}

async function canonicalProcurementText(env: FreeTextTranslationBindings, input: FreeTextTranslationInput, user: CurrentUser): Promise<CanonicalFreeText> {
  if (!["request_text_original", "requestTextOriginal", "request_text"].includes(input.fieldName)) {
    throw new Error("Translation field is not supported.");
  }
  const row = await env.DB.prepare(`
    SELECT request_id, requested_by, request_text_original, custom_item_text, note, original_language
    FROM procurement_requests
    WHERE request_id = ?
    LIMIT 1
  `).bind(Number(input.entityId)).first<{
    request_id: number;
    requested_by: string;
    request_text_original: string | null;
    custom_item_text: string | null;
    note: string | null;
    original_language: string | null;
  }>();
  if (!row) throw new Error("Text was not found.");
  if (!isOwner(user) && row.requested_by !== user.id) {
    throw new ForbiddenError("You do not have permission to translate this text.");
  }
  const originalText = row.request_text_original ?? row.custom_item_text ?? row.note ?? "";
  if (!originalText.trim()) throw new Error("Original text is empty.");
  if (input.originalText.trim() !== originalText.trim()) throw new Error("Original text no longer matches.");
  return {
    entityType: "procurement_request",
    entityId: String(row.request_id),
    fieldName: "request_text_original",
    originalText,
    sourceLanguage: optionalLanguage(row.original_language) ?? input.sourceLanguage,
  };
}

function parseChatEntityId(entityId: string): { conversationId: string; messageId: number } {
  const separator = entityId.lastIndexOf(":");
  if (separator <= 0) throw new Error("Chat translation target is invalid.");
  const conversationId = entityId.slice(0, separator);
  const messageId = Number(entityId.slice(separator + 1));
  if (!conversationId || !Number.isInteger(messageId) || messageId <= 0) {
    throw new Error("Chat translation target is invalid.");
  }
  return { conversationId, messageId };
}

async function canonicalChatText(env: FreeTextTranslationBindings, input: FreeTextTranslationInput, user: CurrentUser): Promise<CanonicalFreeText> {
  if (input.fieldName !== "body") throw new Error("Translation field is not supported.");
  const { conversationId, messageId } = parseChatEntityId(input.entityId);
  const row = await env.DB.prepare(`
    SELECT m.conversation_id, m.message_id, m.body, m.body_language, m.message_kind
    FROM chat_messages m
    INNER JOIN chat_conversation_participants p
      ON p.conversation_id = m.conversation_id
      AND p.user_id = ?
    WHERE m.conversation_id = ?
      AND m.message_id = ?
    LIMIT 1
  `).bind(user.id, conversationId, messageId).first<{
    conversation_id: string;
    message_id: number;
    body: string;
    body_language: string | null;
    message_kind?: string | null;
  }>();
  if (!row) throw new Error("Text was not found.");
  if ((row.message_kind ?? "TEXT") !== "TEXT") throw new Error("Only text messages can be translated.");
  if (input.originalText.trim() !== row.body.trim()) throw new Error("Original text no longer matches.");
  return {
    entityType: "chat_message",
    entityId: `${row.conversation_id}:${row.message_id}`,
    fieldName: "body",
    originalText: row.body,
    sourceLanguage: optionalLanguage(row.body_language) ?? input.sourceLanguage,
  };
}

async function canonicalFreeText(env: FreeTextTranslationBindings, input: FreeTextTranslationInput, user: CurrentUser): Promise<CanonicalFreeText> {
  if (!ENTITY_TYPES.has(input.entityType)) throw new Error("Translation entity is not supported.");
  if (!LANGUAGES.has(input.targetLanguage)) throw new Error("Target language is not supported.");
  if (input.entityType === "procurement_request") return canonicalProcurementText(env, input, user);
  return canonicalChatText(env, input, user);
}

async function loadCachedTranslation(
  env: FreeTextTranslationBindings,
  canonical: CanonicalFreeText,
  sourceTextHash: string,
  targetLanguage: FreeTextLanguage,
): Promise<FreeTextTranslationResult | null> {
  const row = await env.DB.prepare(`
    SELECT source_language, translated_text, provider
    FROM free_text_translations
    WHERE entity_type = ?
      AND entity_id = ?
      AND field_name = ?
      AND source_text_hash = ?
      AND target_language = ?
    LIMIT 1
  `).bind(canonical.entityType, canonical.entityId, canonical.fieldName, sourceTextHash, targetLanguage).first<TranslationCacheRow>();
  if (!row) return null;
  return {
    ...canonical,
    sourceLanguage: normalizeLanguage(row.source_language, canonical.sourceLanguage ?? "en"),
    targetLanguage,
    translatedText: row.translated_text,
    provider: row.provider === GOOGLE_PROVIDER ? GOOGLE_PROVIDER : "source",
    cached: true,
  };
}

async function callGoogleTranslate(
  env: FreeTextTranslationBindings,
  text: string,
  sourceLanguage: FreeTextLanguage | null,
  targetLanguage: FreeTextLanguage,
): Promise<{ translatedText: string; sourceLanguage: FreeTextLanguage }> {
  const apiKey = env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) throw new Error("translation_unavailable");
  const fetcher = env.fetcher ?? fetch;
  const payload: Record<string, unknown> = {
    q: text,
    target: targetLanguage,
    format: "text",
  };
  if (sourceLanguage) payload.source = sourceLanguage;
  const response = await fetcher(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let parsed: GoogleTranslateResponse;
  try {
    parsed = await response.json() as GoogleTranslateResponse;
  } catch {
    throw new Error("translation_unavailable");
  }
  if (!response.ok) throw new Error("translation_unavailable");
  const translatedText = parsed?.data?.translations?.[0]?.translatedText;
  if (typeof translatedText !== "string" || !translatedText.trim()) throw new Error("translation_unavailable");
  return {
    translatedText: htmlDecodeMinimal(translatedText.trim()),
    sourceLanguage: normalizeLanguage(parsed.data?.translations?.[0]?.detectedSourceLanguage, sourceLanguage ?? (targetLanguage === "en" ? "th" : "en")),
  };
}

async function storeCache(
  env: FreeTextTranslationBindings,
  canonical: CanonicalFreeText,
  sourceTextHash: string,
  sourceLanguage: FreeTextLanguage,
  targetLanguage: FreeTextLanguage,
  translatedText: string,
  now: string,
) {
  await env.DB.prepare(`
    INSERT INTO free_text_translations (
      entity_type,
      entity_id,
      field_name,
      source_text_hash,
      source_language,
      target_language,
      translated_text,
      provider,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entity_type, entity_id, field_name, source_text_hash, target_language)
    DO UPDATE SET
      source_language = excluded.source_language,
      translated_text = excluded.translated_text,
      provider = excluded.provider,
      updated_at = excluded.updated_at
  `).bind(
    canonical.entityType,
    canonical.entityId,
    canonical.fieldName,
    sourceTextHash,
    sourceLanguage,
    targetLanguage,
    translatedText,
    GOOGLE_PROVIDER,
    now,
    now,
  ).run();
}

async function updateDomainCache(
  env: FreeTextTranslationBindings,
  canonical: CanonicalFreeText,
  targetLanguage: FreeTextLanguage,
  translatedText: string,
  now: string,
) {
  if (canonical.entityType === "procurement_request") {
    await env.DB.prepare(`
      UPDATE procurement_requests
      SET translated_text = ?,
          translated_language = ?,
          translated_at = ?,
          translation_provider = ?
      WHERE request_id = ?
        AND COALESCE(request_text_original, custom_item_text, note, '') = ?
    `).bind(translatedText, targetLanguage, now, GOOGLE_PROVIDER, Number(canonical.entityId), canonical.originalText).run();
  } else if (canonical.entityType === "chat_message") {
    const { conversationId, messageId } = parseChatEntityId(canonical.entityId);
    await env.DB.prepare(`
      UPDATE chat_messages
      SET translated_body = ?,
          translated_language = ?
      WHERE conversation_id = ?
        AND message_id = ?
        AND body = ?
    `).bind(translatedText, targetLanguage, conversationId, messageId, canonical.originalText).run();
  }
}

export async function translateFreeText(
  env: FreeTextTranslationBindings,
  input: FreeTextTranslationInput,
  user: CurrentUser,
  now = new Date(),
): Promise<FreeTextTranslationResult> {
  const canonical = await canonicalFreeText(env, input, user);
  const targetLanguage = input.targetLanguage;
  const sourceLanguage = canonical.sourceLanguage;
  if (sourceLanguage && sourceLanguage === targetLanguage) {
    return {
      ...canonical,
      sourceLanguage,
      targetLanguage,
      translatedText: canonical.originalText,
      provider: "source",
      cached: true,
    };
  }
  const sourceTextHash = await sha256Hex(canonical.originalText);
  const cached = await loadCachedTranslation(env, canonical, sourceTextHash, targetLanguage);
  if (cached) return cached;
  const translated = await callGoogleTranslate(env, canonical.originalText, sourceLanguage, targetLanguage);
  const timestamp = now.toISOString();
  await storeCache(env, canonical, sourceTextHash, translated.sourceLanguage, targetLanguage, translated.translatedText, timestamp);
  await updateDomainCache(env, canonical, targetLanguage, translated.translatedText, timestamp);
  return {
    ...canonical,
    sourceLanguage: translated.sourceLanguage,
    targetLanguage,
    translatedText: translated.translatedText,
    provider: GOOGLE_PROVIDER,
    cached: false,
  };
}
