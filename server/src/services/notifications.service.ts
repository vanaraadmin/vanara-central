import type { CurrentUser } from "./current-user.service.js";
import webpush, {
  type PushSubscription as StandardPushSubscription,
  type RequestOptions as WebPushRequestOptions,
  type SendResult as WebPushSendResult,
} from "web-push";

export interface NotificationBindings {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY_JWK?: string;
  VAPID_SUBJECT?: string;
}

export type NotificationLanguage = "en" | "th";
export type NotificationAudience = "all-active" | "owners" | "user-list";
export type NotificationType =
  | "chat.message.created"
  | "guest_message.inbound"
  | "guest_message.draft_ready"
  | "booking.new"
  | "booking.updated"
  | "booking.cancelled"
  | "reception.check_in.completed"
  | "reception.check_out.completed"
  | "maintenance.blocking.created"
  | "maintenance.blocking.enabled";

export interface PushSubscriptionRow {
  push_subscription_id: number;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  status: string;
  failure_count: number;
  preferred_language: NotificationLanguage;
}

interface NotificationEventRow {
  notification_event_id: number;
  dedupe_key: string;
  created_at: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
}

export interface NotificationTemplate {
  type: NotificationType;
  entityType: string;
  entityId: string | number;
  dedupeKey: string;
  audience: NotificationAudience;
  soundType?: "chat" | "event";
  userIds?: string[];
  data?: Record<string, string | number | boolean | null | undefined>;
  payload: Record<NotificationLanguage, NotificationPayload>;
}

const MAX_PUSH_FAILURES = 3;
const DEFAULT_VAPID_SUBJECT = "mailto:info@vanararetreat.com";
const MAX_WEB_PUSH_ATTEMPTS = 2;

export interface WebPushTransport {
  sendNotification(
    subscription: StandardPushSubscription,
    payload: string,
    options: WebPushRequestOptions,
  ): Promise<WebPushSendResult>;
}

export interface PushSendResult {
  ok: boolean;
  statusCode: number | null;
  payloadBytes: number;
  attempts: number;
  errorCode?: string;
}

function cleanText(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function vapidPrivateKey(env: NotificationBindings): string | null {
  if (!env.VAPID_PRIVATE_KEY_JWK) return null;
  try {
    const key = JSON.parse(env.VAPID_PRIVATE_KEY_JWK) as { d?: unknown };
    return cleanText(key.d, 256) || null;
  } catch {
    return null;
  }
}

function pushProvider(endpoint: string): "apple" | "google" | "other" {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    if (host === "push.apple.com" || host.endsWith(".push.apple.com")) return "apple";
    if (host === "fcm.googleapis.com" || host.endsWith(".fcm.googleapis.com")) return "google";
  } catch {
    return "other";
  }
  return "other";
}

function statusFromWebPushError(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const statusCode = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isInteger(statusCode) ? statusCode : null;
}

function deliveryDiagnostic(statusCode: number | null, payloadBytes: number, attempts: number): string {
  const status = statusCode === null ? "transport_error" : `http_${statusCode}`;
  return `${status}:web-push:bytes_${payloadBytes}:attempt_${attempts}`;
}

function logPushAttempt(subscription: PushSubscriptionRow, statusCode: number | null, payloadBytes: number, attempt: number, ok: boolean): void {
  console.info(JSON.stringify({
    message: "web_push_delivery",
    provider: pushProvider(subscription.endpoint),
    statusCode,
    payloadBytes,
    attempt,
    ok,
  }));
}

const defaultWebPushTransport: WebPushTransport = {
  sendNotification: (subscription, payload, options) => webpush.sendNotification(subscription, payload, options),
};

export async function sendPushWithTransport(
  env: NotificationBindings,
  subscription: PushSubscriptionRow,
  payload: NotificationPayload,
  transport: WebPushTransport = defaultWebPushTransport,
): Promise<PushSendResult> {
  const publicKey = cleanText(env.VAPID_PUBLIC_KEY, 256);
  const privateKey = vapidPrivateKey(env);
  const payloadJson = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadJson).byteLength;
  if (!publicKey || !privateKey) {
    return { ok: false, statusCode: null, payloadBytes, attempts: 0, errorCode: "vapid_not_configured" };
  }

  const standardSubscription: StandardPushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  const options: WebPushRequestOptions = {
    TTL: 86_400,
    contentEncoding: "aes128gcm",
    urgency: payload.tag.startsWith("chat-") ? "high" : "normal",
    vapidDetails: {
      subject: cleanText(env.VAPID_SUBJECT, 256) || DEFAULT_VAPID_SUBJECT,
      publicKey,
      privateKey,
    },
  };

  for (let attempt = 1; attempt <= MAX_WEB_PUSH_ATTEMPTS; attempt += 1) {
    try {
      const result = await transport.sendNotification(standardSubscription, payloadJson, options);
      logPushAttempt(subscription, result.statusCode, payloadBytes, attempt, true);
      return {
        ok: true,
        statusCode: result.statusCode,
        payloadBytes,
        attempts: attempt,
        errorCode: deliveryDiagnostic(result.statusCode, payloadBytes, attempt),
      };
    } catch (error) {
      const statusCode = statusFromWebPushError(error);
      logPushAttempt(subscription, statusCode, payloadBytes, attempt, false);
      const retryable = statusCode !== null && statusCode >= 500 && statusCode <= 599;
      if (retryable && attempt < MAX_WEB_PUSH_ATTEMPTS) continue;
      return {
        ok: false,
        statusCode,
        payloadBytes,
        attempts: attempt,
        errorCode: deliveryDiagnostic(statusCode, payloadBytes, attempt),
      };
    }
  }

  return { ok: false, statusCode: null, payloadBytes, attempts: MAX_WEB_PUSH_ATTEMPTS, errorCode: "push_failed" };
}

export function shouldDisablePushSubscription(result: PushSendResult, currentFailureCount: number): boolean {
  return !result.ok && (
    result.statusCode === 404
    || result.statusCode === 410
    || currentFailureCount + 1 >= MAX_PUSH_FAILURES
  );
}

export function publicVapidKey(env: NotificationBindings): string | null {
  return cleanText(env.VAPID_PUBLIC_KEY, 120) || null;
}

export async function registerPushSubscription(env: NotificationBindings, user: CurrentUser, input: PushSubscriptionInput, userAgent?: string | null): Promise<void> {
  const endpoint = cleanText(input.endpoint, 2048);
  const p256dh = cleanText(input.keys?.p256dh, 512);
  const auth = cleanText(input.keys?.auth, 256);
  if (!endpoint || !p256dh || !auth) throw new Error("Push subscription is incomplete.");
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, status, failure_count, created_at, updated_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      status = 'active',
      failure_count = 0,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at,
      disabled_at = NULL
  `).bind(user.id, endpoint, p256dh, auth, cleanText(userAgent, 512) || null, now, now, now).run();
}

export async function unregisterPushSubscription(env: NotificationBindings, user: CurrentUser, endpoint: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE push_subscriptions
    SET status = 'disabled', disabled_at = ?, updated_at = ?
    WHERE user_id = ? AND endpoint = ?
  `).bind(new Date().toISOString(), new Date().toISOString(), user.id, endpoint).run();
}

async function createNotificationEvent(env: NotificationBindings, template: NotificationTemplate, now: string): Promise<NotificationEventRow | null> {
  const soundType = template.soundType ?? (template.type === "chat.message.created" ? "chat" : "event");
  await env.DB.prepare(`
    INSERT OR IGNORE INTO notification_events (dedupe_key, notification_type, entity_type, entity_id, audience, sound_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    template.dedupeKey,
    template.type,
    template.entityType,
    String(template.entityId),
    template.audience,
    soundType,
    JSON.stringify({ data: template.data ?? {}, payload: template.payload }),
    now,
  ).run();
  const row = await env.DB.prepare("SELECT notification_event_id, dedupe_key, created_at FROM notification_events WHERE dedupe_key = ?").bind(template.dedupeKey).first<NotificationEventRow>();
  return row?.created_at === now ? row : null;
}

async function loadSubscriptions(env: NotificationBindings, template: NotificationTemplate): Promise<PushSubscriptionRow[]> {
  if (template.audience === "user-list") {
    const ids = [...new Set(template.userIds ?? [])].filter(Boolean);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await env.DB.prepare(`
      SELECT ps.*, u.preferred_language
      FROM push_subscriptions ps
      JOIN users u ON u.user_id = ps.user_id
      WHERE ps.status = 'active'
        AND u.status = 'active'
        AND ps.user_id IN (${placeholders})
    `).bind(...ids).all<PushSubscriptionRow>();
    return rows.results ?? [];
  }

  const ownerWhere = template.audience === "owners" ? "AND u.role = 'Owner'" : "";
  const rows = await env.DB.prepare(`
    SELECT ps.*, u.preferred_language
    FROM push_subscriptions ps
    JOIN users u ON u.user_id = ps.user_id
    WHERE ps.status = 'active'
      AND u.status = 'active'
      ${ownerWhere}
  `).all<PushSubscriptionRow>();
  return rows.results ?? [];
}

export async function emitNotification(env: NotificationBindings, template: NotificationTemplate): Promise<void> {
  const now = new Date().toISOString();
  const event = await createNotificationEvent(env, template, now);
  if (!event) return;
  const subscriptions = await loadSubscriptions(env, template);
  for (const subscription of subscriptions) {
    const payload = template.payload[subscription.preferred_language] ?? template.payload.en;
    const result = await sendPushWithTransport(env, subscription, payload).catch((error: unknown): PushSendResult => ({
      ok: false,
      statusCode: null,
      payloadBytes: 0,
      attempts: 0,
      errorCode: error instanceof Error ? error.name : "push_failed",
    }));
    await env.DB.prepare(`
      INSERT INTO notification_deliveries (notification_event_id, user_id, push_subscription_id, status, error_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(event.notification_event_id, subscription.user_id, subscription.push_subscription_id, result.ok ? "sent" : "failed", result.errorCode ?? null, now, new Date().toISOString()).run();
    if (shouldDisablePushSubscription(result, subscription.failure_count)) {
      await env.DB.prepare(`
        UPDATE push_subscriptions
        SET status = 'disabled', failure_count = failure_count + 1, disabled_at = ?, updated_at = ?
        WHERE push_subscription_id = ?
      `).bind(new Date().toISOString(), new Date().toISOString(), subscription.push_subscription_id).run();
    } else if (!result.ok) {
      await env.DB.prepare("UPDATE push_subscriptions SET failure_count = failure_count + 1, updated_at = ? WHERE push_subscription_id = ?").bind(new Date().toISOString(), subscription.push_subscription_id).run();
    }
  }
}

export function notificationPayload(title: string, body: string, tag: string, url: string): NotificationPayload {
  return { title, body, tag, url };
}

function previewText(value: string | null | undefined): string {
  const text = cleanText(value, 160).replace(/\s+/g, " ").slice(0, 80);
  return text || "New update";
}

function locationText(value: string | null | undefined): string {
  return cleanText(value, 80) || "Vanara";
}

export async function notifyInternalChatMessage(env: NotificationBindings, input: {
  conversationId: string;
  messageId: number;
  authorId: string;
  authorName: string;
  body: string;
  previewKind?: "text" | "sticker" | "attachment";
}): Promise<void> {
  const participants = await env.DB.prepare(`
    SELECT user_id
    FROM chat_conversation_participants
    WHERE conversation_id = ?
      AND user_id <> ?
  `).bind(input.conversationId, input.authorId).all<{ user_id: string }>();
  const userIds = (participants.results ?? []).map((row) => row.user_id);
  const previewKind = input.previewKind ?? "text";
  const englishPreview = previewKind === "attachment" ? "Attachment" : previewKind === "sticker" ? "Sticker" : previewText(input.body);
  const thaiPreview = previewKind === "attachment" ? "ไฟล์แนบ" : previewKind === "sticker" ? "สติกเกอร์" : previewText(input.body);
  const conversationUrl = `/chat/${encodeURIComponent(input.conversationId)}`;
  await emitNotification(env, {
    type: "chat.message.created",
    entityType: "chat_message",
    entityId: input.messageId,
    dedupeKey: `chat:message:${input.messageId}`,
    audience: "user-list",
    userIds,
    data: { conversationId: input.conversationId },
    payload: {
      en: notificationPayload("New message received", `${input.authorName}: ${englishPreview}`, `chat-${input.conversationId}`, conversationUrl),
      th: notificationPayload("มีข้อความแชตใหม่", `${input.authorName}: ${thaiPreview}`, `chat-${input.conversationId}`, conversationUrl),
    },
  });
}

export async function notifyBookingEvent(env: NotificationBindings, input: {
  eventType: "new" | "updated" | "cancelled";
  bookingId: number | string;
  dedupeKey: string;
  accommodation?: string | null;
  source?: string | null;
  arrivalDate?: string | null;
}): Promise<void> {
  const titles = {
    new: "New booking received",
    updated: "Existing booking updated",
    cancelled: "Existing booking cancelled",
  } as const;
  const thaiTitles = {
    new: "มีการจองใหม่",
    updated: "การจองมีการเปลี่ยนแปลง",
    cancelled: "การจองถูกยกเลิก",
  } as const;
  const details = [input.accommodation, input.source, input.arrivalDate].map((item) => cleanText(item, 80)).filter(Boolean).join(" / ");
  const englishTitle = details ? `${titles[input.eventType]} - ${details}` : titles[input.eventType];
  await emitNotification(env, {
    type: `booking.${input.eventType}`,
    entityType: "booking",
    entityId: input.bookingId,
    dedupeKey: `booking:${input.dedupeKey}`,
    audience: "owners",
    data: { eventType: input.eventType },
    payload: {
      en: notificationPayload(englishTitle, "Open Booking Pulse", `booking-${input.bookingId}`, "/staff#booking-pulse"),
      th: notificationPayload(thaiTitles[input.eventType], "แตะเพื่อเปิด Vanara Central", `booking-${input.bookingId}`, "/staff#booking-pulse"),
    },
  });
}

export async function notifyGuestMessageInbound(env: NotificationBindings, input: {
  messageId: number | string;
  conversationId: number | string;
}): Promise<void> {
  await emitNotification(env, {
    type: "guest_message.inbound",
    entityType: "guest_message",
    entityId: input.messageId,
    dedupeKey: `guest-message:inbound:${input.messageId}`,
    audience: "owners",
    data: { conversationId: input.conversationId },
    payload: {
      en: notificationPayload("New guest message", "Guest message needs review", `guest-message-${input.messageId}`, "/messages"),
      th: notificationPayload("New guest message", "Guest message needs review", `guest-message-${input.messageId}`, "/messages"),
    },
  });
}

export async function notifyGuestMessageDraftReady(env: NotificationBindings, input: {
  messageId: number | string;
  draftId: number | string;
  conversationId: number | string;
}): Promise<void> {
  await emitNotification(env, {
    type: "guest_message.draft_ready",
    entityType: "message_draft",
    entityId: input.draftId,
    dedupeKey: `guest-message:draft-ready:${input.messageId}:${input.draftId}`,
    audience: "owners",
    data: { messageId: input.messageId, conversationId: input.conversationId },
    payload: {
      en: notificationPayload("New guest message", "Waraporn reply ready for review", `guest-message-draft-${input.draftId}`, "/messages"),
      th: notificationPayload("New guest message", "Waraporn reply ready for review", `guest-message-draft-${input.draftId}`, "/messages"),
    },
  });
}

export async function notifyReceptionCompleted(env: NotificationBindings, input: {
  type: "check-in" | "check-out";
  bookingId: number | string;
  roomName?: string | null;
}): Promise<void> {
  const checkIn = input.type === "check-in";
  const room = locationText(input.roomName);
  const englishStatus = checkIn ? "Check-in completed" : "Check-out completed";
  const thaiStatus = checkIn ? "เช็กอินแล้ว" : "เช็กเอาต์แล้ว";
  await emitNotification(env, {
    type: checkIn ? "reception.check_in.completed" : "reception.check_out.completed",
    entityType: "booking",
    entityId: input.bookingId,
    dedupeKey: `reception:${input.type}:completed:${input.bookingId}`,
    audience: "all-active",
    data: { eventType: input.type },
    payload: {
      en: notificationPayload(`${englishStatus} - ${room}`, "Tap to open Arrivals / Departures", `reception-${input.bookingId}`, "/movements"),
      th: notificationPayload(`${thaiStatus} - ${room}`, "แตะเพื่อเปิด Vanara Central", `reception-${input.bookingId}`, "/movements"),
    },
  });
}

export async function notifyMaintenanceBlocking(env: NotificationBindings, input: {
  ticketId: number | string;
  trigger: "created" | "enabled";
  title?: string | null;
  roomName?: string | null;
  locationArea?: string | null;
}): Promise<void> {
  const target = locationText(input.roomName ?? input.locationArea);
  const englishTitle = `Severe maintenance issue opened - ${target}`;
  await emitNotification(env, {
    type: input.trigger === "created" ? "maintenance.blocking.created" : "maintenance.blocking.enabled",
    entityType: "maintenance_ticket",
    entityId: input.ticketId,
    dedupeKey: `maintenance:blocking:${input.trigger}:${input.ticketId}`,
    audience: "all-active",
    data: { trigger: input.trigger },
    payload: {
      en: notificationPayload(englishTitle, previewText(input.title), `maintenance-${input.ticketId}`, `/maintenance/${input.ticketId}`),
      th: notificationPayload(`มีงานซ่อมที่ปิดห้อง - ${target}`, previewText(input.title), `maintenance-${input.ticketId}`, `/maintenance/${input.ticketId}`),
    },
  });
}
