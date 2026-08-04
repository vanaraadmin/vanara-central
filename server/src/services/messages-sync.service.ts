import { beds24Get, type Beds24Bindings, type Beds24RequestOptions } from "./beds24-client.service.js";
import { sanitizeLogMessage } from "./log-safety.service.js";
import { acquireSyncLock, recordSkippedSyncRun, releaseSyncLock, type SyncLockBindings } from "./sync-lock.service.js";
import { SyncMetrics } from "./sync-metrics.service.js";
import type { Channel, DraftState, ImportedMessage, MessageAssociationState, Provider } from "../types/messages.js";

export interface MessagesSyncBindings extends Beds24Bindings, SyncLockBindings {
  DB: D1Database;
}

export interface SyncMessagesOptions {
  provider?: Provider;
  cursor?: string | null;
  limit?: number;
  maxAge?: number;
  now?: string;
  requestOptions?: Beds24RequestOptions;
}

export interface SyncMessagesResult {
  ok: boolean;
  provider: Provider;
  endpoint: "/bookings/messages";
  cursorValue: string | null;
  recordsRead: number;
  recordsWritten: number;
  recordsDeduplicated: number;
  recordsLinked: number;
  recordsUnlinked: number;
  recordsFailed: number;
  deduplicatedCount: number;
  associatedCount: number;
  unlinkedCount: number;
  startedAt: string;
  finishedAt: string;
  skipped?: boolean;
  skippedReason?: string;
}

export interface Beds24GuestMessage {
  id?: unknown;
  messageId?: unknown;
  message_id?: unknown;
  bookingId?: unknown;
  booking_id?: unknown;
  message?: unknown;
  guestMessage?: unknown;
  text?: unknown;
  body?: unknown;
  time?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  receivedAt?: unknown;
  source?: unknown;
  language?: unknown;
  languageCode?: unknown;
  lang?: unknown;
  channel?: unknown;
  apiSource?: unknown;
  [key: string]: unknown;
}

type JsonRecord = Record<string, unknown>;

interface Beds24MessagesResponse {
  success?: boolean;
  error?: string;
  data?: Beds24GuestMessage[];
}

interface BookingAssociationRow {
  booking_id: number;
  beds24_booking_id: number;
  channel: string | null;
  api_source: string | null;
  language_code: string | null;
}

interface NormalizedGuestMessage {
  provider: Provider;
  providerMessageId: string;
  providerBookingId: number | null;
  beds24BookingId: number | null;
  guestMessage: string;
  receivedAt: string;
  language: string | null;
  channel: Channel;
  rawProviderPayload: Beds24GuestMessage;
  idempotencyKey: string;
}

interface MessageRow {
  message_id: number;
  message_conversation_id: number;
  provider: Provider;
  provider_message_id: string;
  provider_booking_id: number | null;
  booking_id: number | null;
  beds24_booking_id: number | null;
  direction: "INBOUND";
  author: "GUEST";
  received_at: string;
  guest_message: string;
  language: string | null;
  channel: Channel;
  state: "RECEIVED" | "ASSOCIATED" | "UNLINKED";
  association_state: MessageAssociationState;
  raw_provider_payload: string;
  idempotency_key: string;
  draft_id: number | null;
  draft_status: DraftState | null;
  created_at: string;
  updated_at: string;
}

export interface MessagesSyncService {
  syncMessages(bindings: MessagesSyncBindings, options: SyncMessagesOptions): Promise<SyncMessagesResult>;
}

export const MESSAGES_SYNC_TYPE = "messages";
export const MESSAGES_CURSOR_NAME = "messages_received_cursor";
export const BEDS24_MESSAGES_ENDPOINT = "/bookings/messages";
export const BEDS24_MESSAGES_SOURCE = "guest";
export const BEDS24_MESSAGES_MAX_AGE = 1;

const PROVIDER: Provider = "BEDS24";
const CHANNELS = new Set<Channel>(["AIRBNB", "AGODA", "BOOKING_COM", "DIRECT", "EXPEDIA", "VRBO", "UNKNOWN"]);
const MESSAGE_METADATA_KEYS = new Set([
  "authorownerid",
  "booking_id",
  "bookingid",
  "channel",
  "createdat",
  "created_at",
  "from",
  "id",
  "message_id",
  "messageid",
  "propertyid",
  "read",
  "roomid",
  "source",
  "time",
  "timestamp",
  "to",
  "type",
]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function identifierText(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function messageText(value: unknown, depth = 0): string | null {
  const direct = text(value);
  if (direct) return stripHtml(direct);
  if (depth > 5) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = messageText(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  for (const key of [
    "message",
    "messages",
    "guestMessage",
    "messageText",
    "text",
    "body",
    "plainText",
    "content",
    "html",
    "value",
  ]) {
    const found = messageText(value[key], depth + 1);
    if (found) return found;
  }

  let fallback: string | null = null;
  for (const [key, child] of Object.entries(value)) {
    if (MESSAGE_METADATA_KEYS.has(key.toLowerCase())) continue;
    const found = messageText(child, depth + 1);
    if (found && (!fallback || found.length > fallback.length)) fallback = found;
  }
  return fallback;
}

function payloadKeySummary(record: Beds24GuestMessage): string {
  const keys = Object.keys(record).sort().join(", ") || "none";
  return `${keys}; message shape: ${payloadShape(record.message)}`;
}

function payloadShape(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const first = value[0];
    const firstShape = first === undefined ? "empty" : payloadShape(first);
    return `array(length=${value.length}, first=${firstShape})`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort().join(", ") || "none";
    return `object(keys=${keys})`;
  }
  if (typeof value === "string") {
    return `string(length=${value.length}, strippedLength=${stripHtml(value).length})`;
  }
  return typeof value;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

function isoDate(value: unknown): string | null {
  const source = text(value);
  if (!source) return null;
  const timestamp = Date.parse(source);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeChannel(value: unknown): Channel {
  const source = text(value)?.toUpperCase().replace(/[^A-Z0-9]+/g, "_") ?? "UNKNOWN";
  if (source === "BOOKING" || source === "BOOKING_COM") return "BOOKING_COM";
  if (source === "AIRBNB") return "AIRBNB";
  if (source === "AGODA") return "AGODA";
  if (source === "DIRECT") return "DIRECT";
  if (source === "EXPEDIA") return "EXPEDIA";
  if (source === "VRBO") return "VRBO";
  return CHANNELS.has(source as Channel) ? source as Channel : "UNKNOWN";
}

function isGuestSource(value: unknown): boolean {
  const source = text(value);
  return !source || source.toLowerCase() === BEDS24_MESSAGES_SOURCE;
}

function oneDayAgo(now: string): number {
  return Date.parse(now) - 86_400_000;
}

function maxIso(current: string | null, candidate: string): string {
  return current === null || candidate > current ? candidate : current;
}

export function normalizeBeds24GuestMessage(
  record: Beds24GuestMessage,
  now: string,
): NormalizedGuestMessage | null {
  if (!isGuestSource(record.source)) return null;

  const receivedAt = isoDate(record.time ?? record.createdAt ?? record.created_at ?? record.receivedAt);
  if (!receivedAt || Date.parse(receivedAt) <= oneDayAgo(now)) return null;

  const providerMessageId = identifierText(record.id ?? record.messageId ?? record.message_id ?? record.messageID);
  const guestMessage = messageText(record.message ?? record.guestMessage ?? record.text ?? record.body ?? record);
  if (!providerMessageId || !guestMessage) {
    throw new Error(`Beds24 guest message payload is missing id or message. Keys: ${payloadKeySummary(record)}`);
  }

  const providerBookingId = numberValue(record.bookingId ?? record.booking_id ?? record.bookingID);

  return {
    provider: PROVIDER,
    providerMessageId,
    providerBookingId,
    beds24BookingId: providerBookingId,
    guestMessage,
    receivedAt,
    language: text(record.language ?? record.languageCode ?? record.lang),
    channel: normalizeChannel(record.channel ?? record.apiSource),
    rawProviderPayload: record,
    idempotencyKey: `${PROVIDER}:${providerMessageId}`,
  };
}

function providerConversationId(message: NormalizedGuestMessage): string {
  return message.providerBookingId !== null
    ? `beds24-booking:${message.providerBookingId}`
    : `beds24-message:${message.providerMessageId}`;
}

async function loadBookingAssociation(
  env: MessagesSyncBindings,
  beds24BookingId: number | null,
): Promise<BookingAssociationRow | null> {
  if (beds24BookingId === null) return null;
  return env.DB.prepare(`
    SELECT booking_id, beds24_booking_id, channel, api_source, language_code
    FROM bookings
    WHERE beds24_booking_id = ?
  `).bind(beds24BookingId).first<BookingAssociationRow>();
}

async function upsertConversation(
  env: MessagesSyncBindings,
  message: NormalizedGuestMessage,
  booking: BookingAssociationRow | null,
  now: string,
): Promise<number> {
  const conversationKey = providerConversationId(message);
  const channel = normalizeChannel(booking?.channel ?? message.channel);
  await env.DB.prepare(`
    INSERT INTO message_conversations (
      provider,
      provider_conversation_id,
      booking_id,
      beds24_booking_id,
      channel,
      state,
      last_message_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
    ON CONFLICT (provider, provider_conversation_id)
    DO UPDATE SET
      booking_id = COALESCE(excluded.booking_id, message_conversations.booking_id),
      beds24_booking_id = COALESCE(excluded.beds24_booking_id, message_conversations.beds24_booking_id),
      channel = CASE
        WHEN excluded.channel != 'UNKNOWN' THEN excluded.channel
        ELSE message_conversations.channel
      END,
      last_message_at = CASE
        WHEN message_conversations.last_message_at IS NULL OR excluded.last_message_at > message_conversations.last_message_at
          THEN excluded.last_message_at
        ELSE message_conversations.last_message_at
      END,
      updated_at = excluded.updated_at
  `).bind(
    PROVIDER,
    conversationKey,
    booking?.booking_id ?? null,
    booking?.beds24_booking_id ?? message.beds24BookingId,
    channel,
    message.receivedAt,
    now,
    now,
  ).run();

  const row = await env.DB.prepare(`
    SELECT message_conversation_id
    FROM message_conversations
    WHERE provider = ? AND provider_conversation_id = ?
  `).bind(PROVIDER, conversationKey).first<{ message_conversation_id: number }>();

  if (!row) {
    throw new Error("Unable to resolve message conversation after upsert.");
  }

  return row.message_conversation_id;
}

async function insertMessage(
  env: MessagesSyncBindings,
  conversationId: number,
  message: NormalizedGuestMessage,
  booking: BookingAssociationRow | null,
  now: string,
): Promise<"inserted" | "duplicate"> {
  const associationState: MessageAssociationState = booking ? "LINKED" : "UNLINKED";
  const channel = normalizeChannel(booking?.channel ?? booking?.api_source ?? message.channel);
  const language = message.language ?? text(booking?.language_code);
  const state = booking ? "ASSOCIATED" : "UNLINKED";
  const result = await env.DB.prepare(`
    INSERT INTO messages (
      message_conversation_id,
      provider,
      provider_message_id,
      provider_booking_id,
      booking_id,
      beds24_booking_id,
      direction,
      author,
      received_at,
      guest_message,
      language,
      channel,
      state,
      association_state,
      raw_provider_payload,
      idempotency_key,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'INBOUND', 'GUEST', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (provider, provider_message_id) DO NOTHING
  `).bind(
    conversationId,
    PROVIDER,
    message.providerMessageId,
    message.providerBookingId,
    booking?.booking_id ?? null,
    booking?.beds24_booking_id ?? message.beds24BookingId,
    message.receivedAt,
    message.guestMessage,
    language,
    channel,
    state,
    associationState,
    JSON.stringify(message.rawProviderPayload),
    message.idempotencyKey,
    now,
    now,
  ).run();

  return (result.meta?.changes ?? 0) > 0 ? "inserted" : "duplicate";
}

function toImportedMessage(row: MessageRow): ImportedMessage {
  return {
    numericMessageId: row.message_id,
    numericConversationId: row.message_conversation_id,
    messageId: String(row.message_id),
    conversationId: String(row.message_conversation_id),
    provider: row.provider,
    channel: row.channel,
    providerMessageId: row.provider_message_id,
    providerBookingId: row.provider_booking_id,
    direction: row.direction,
    author: row.author,
    body: row.guest_message,
    state: row.state,
    receivedAt: row.received_at,
    bookingId: row.booking_id,
    beds24BookingId: row.beds24_booking_id,
    associationState: row.association_state,
    idempotencyKey: row.idempotency_key,
    rawProviderPayload: JSON.parse(row.raw_provider_payload) as unknown,
    language: row.language,
    draftExists: row.draft_id !== null,
    draftStatus: row.draft_status ?? "NOT_STARTED",
    draftId: row.draft_id !== null ? String(row.draft_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function recordMessageIssue(
  env: MessagesSyncBindings,
  providerRecordId: string,
  error: unknown,
  occurredAt: string,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO sync_record_issues (
      sync_type,
      issue_type,
      provider_record_id,
      first_failure_at,
      latest_failure_at,
      attempt_count,
      error_category,
      error_message,
      status,
      resolved_at,
      created_at,
      updated_at
    )
    VALUES (?, 'failed', ?, ?, ?, 1, 'message_import_failed', ?, 'pending', NULL, ?, ?)
    ON CONFLICT (sync_type, provider_record_id, issue_type)
    DO UPDATE SET
      latest_failure_at = excluded.latest_failure_at,
      attempt_count = sync_record_issues.attempt_count + 1,
      error_category = excluded.error_category,
      error_message = excluded.error_message,
      status = 'pending',
      resolved_at = NULL,
      updated_at = excluded.updated_at
  `).bind(
    MESSAGES_SYNC_TYPE,
    providerRecordId,
    occurredAt,
    occurredAt,
    sanitizeLogMessage(error, "Unknown message import error"),
    occurredAt,
    occurredAt,
  ).run();
}

async function resolveMessageIssue(env: MessagesSyncBindings, providerRecordId: string, occurredAt: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE sync_record_issues
    SET status = 'resolved', resolved_at = ?, updated_at = ?
    WHERE sync_type = ? AND provider_record_id = ? AND status = 'pending'
  `).bind(occurredAt, occurredAt, MESSAGES_SYNC_TYPE, providerRecordId).run();
}

function skippedResult(startedAt: string, reason: string): SyncMessagesResult {
  const finishedAt = new Date().toISOString();
  return {
    ok: true,
    provider: PROVIDER,
    endpoint: BEDS24_MESSAGES_ENDPOINT,
    cursorValue: null,
    recordsRead: 0,
    recordsWritten: 0,
    recordsDeduplicated: 0,
    recordsLinked: 0,
    recordsUnlinked: 0,
    recordsFailed: 0,
    deduplicatedCount: 0,
    associatedCount: 0,
    unlinkedCount: 0,
    startedAt,
    finishedAt,
    skipped: true,
    skippedReason: reason,
  };
}

export async function syncMessages(
  env: MessagesSyncBindings,
  options: SyncMessagesOptions = {},
): Promise<SyncMessagesResult> {
  const startedAt = options.now ?? new Date().toISOString();
  const lock = await acquireSyncLock(env, MESSAGES_SYNC_TYPE, startedAt);
  if (!lock) {
    const reason = "Messages synchronization already running.";
    await recordSkippedSyncRun(env, MESSAGES_SYNC_TYPE, startedAt, reason);
    return skippedResult(startedAt, reason);
  }

  const metrics = new SyncMetrics();
  let deduplicated = 0;
  let linked = 0;
  let unlinked = 0;
  let latestReceivedAt: string | null = null;

  try {
    const response = await beds24Get<Beds24MessagesResponse>(
      env,
      BEDS24_MESSAGES_ENDPOINT,
      {
        source: BEDS24_MESSAGES_SOURCE,
        maxAge: options.maxAge ?? BEDS24_MESSAGES_MAX_AGE,
      },
      options.requestOptions,
    );

    if (response.success === false) {
      throw new Error(response.error ?? "Beds24 messages returned success=false");
    }

    for (const record of response.data ?? []) {
      metrics.read();
      const providerRecordId = String(record.id ?? record.messageId ?? record.message_id ?? crypto.randomUUID());
      try {
        const normalized = normalizeBeds24GuestMessage(record, startedAt);
        if (!normalized) {
          metrics.skipped();
          continue;
        }

        const booking = await loadBookingAssociation(env, normalized.beds24BookingId);
        const conversationId = await upsertConversation(env, normalized, booking, startedAt);
        const result = await insertMessage(env, conversationId, normalized, booking, startedAt);
        await resolveMessageIssue(env, normalized.providerMessageId, startedAt);

        if (result === "duplicate") {
          deduplicated += 1;
          continue;
        }

        metrics.written();
        if (booking) linked += 1;
        else unlinked += 1;
        latestReceivedAt = maxIso(latestReceivedAt, normalized.receivedAt);
      } catch (error) {
        metrics.failed();
        await recordMessageIssue(env, providerRecordId, error, startedAt);
      }
    }

    const finishedAt = new Date().toISOString();
    const snapshot = metrics.snapshot();
    const cursorValue = latestReceivedAt ?? startedAt;
    const status = snapshot.recordsFailed > 0 ? "partial_success" : "success";
    const errorMessage = snapshot.recordsFailed > 0
      ? "One or more messages remain pending for retry. See sync_record_issues for record-level details."
      : null;

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO sync_cursors (cursor_name, cursor_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(cursor_name) DO UPDATE SET
          cursor_value = excluded.cursor_value,
          updated_at = excluded.updated_at
      `).bind(MESSAGES_CURSOR_NAME, cursorValue, finishedAt),
      env.DB.prepare(`
        INSERT INTO sync_runs (
          sync_type,
          started_at,
          finished_at,
          status,
          records_read,
          records_written,
          records_failed,
          error_message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        MESSAGES_SYNC_TYPE,
        startedAt,
        finishedAt,
        status,
        snapshot.recordsRead,
        snapshot.recordsWritten,
        snapshot.recordsFailed,
        errorMessage,
      ),
    ]);

    return {
      ok: true,
      provider: PROVIDER,
      endpoint: BEDS24_MESSAGES_ENDPOINT,
      cursorValue,
      recordsRead: snapshot.recordsRead,
      recordsWritten: snapshot.recordsWritten,
      recordsDeduplicated: deduplicated,
      recordsLinked: linked,
      recordsUnlinked: unlinked,
      recordsFailed: snapshot.recordsFailed,
      deduplicatedCount: deduplicated,
      associatedCount: linked,
      unlinkedCount: unlinked,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    metrics.failed();
    const finishedAt = new Date().toISOString();
    const snapshot = metrics.snapshot();
    const message = sanitizeLogMessage(error, "Unknown messages sync error");
    try {
      await env.DB.prepare(`
        INSERT INTO sync_runs (
          sync_type,
          started_at,
          finished_at,
          status,
          records_read,
          records_written,
          records_failed,
          error_message
        )
        VALUES (?, ?, ?, 'failed', ?, ?, ?, ?)
      `).bind(
        MESSAGES_SYNC_TYPE,
        startedAt,
        finishedAt,
        snapshot.recordsRead,
        snapshot.recordsWritten,
        snapshot.recordsFailed,
        message,
      ).run();
    } catch (logError) {
      console.error("Unable to log messages sync failure", sanitizeLogMessage(logError, "Unknown D1 logging error"));
    }
    throw error;
  } finally {
    await releaseSyncLock(env, lock);
  }
}

export async function listImportedMessages(env: Pick<MessagesSyncBindings, "DB">, limit = 100): Promise<ImportedMessage[]> {
  const rows = await env.DB.prepare(`
    SELECT
      m.message_id,
      m.message_conversation_id,
      m.provider,
      m.provider_message_id,
      m.provider_booking_id,
      m.booking_id,
      m.beds24_booking_id,
      m.direction,
      m.author,
      m.received_at,
      m.guest_message,
      m.language,
      m.channel,
      m.state,
      m.association_state,
      m.raw_provider_payload,
      m.idempotency_key,
      d.message_draft_id AS draft_id,
      d.status AS draft_status,
      m.created_at,
      m.updated_at
    FROM messages m
    LEFT JOIN message_drafts d
      ON d.message_id = m.message_id
      AND d.status = 'READY'
    ORDER BY m.received_at DESC, m.message_id DESC
    LIMIT ?
  `).bind(Math.min(Math.max(Math.trunc(limit), 1), 500)).all<MessageRow>();

  return (rows.results ?? []).map(toImportedMessage);
}
