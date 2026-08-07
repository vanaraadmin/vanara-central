import type { CurrentUser } from "./current-user.service.js";

export interface NotificationBindings {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY_JWK?: string;
  VAPID_SUBJECT?: string;
}

export type NotificationLanguage = "en" | "th";
export type NotificationAudience = "all-active" | "owners" | "user-list";
export type NotificationSoundType = "chat" | "event";
export type NotificationType =
  | "chat.message.created"
  | "booking.new"
  | "booking.updated"
  | "booking.cancelled"
  | "reception.check_in.completed"
  | "reception.check_out.completed"
  | "maintenance.blocking.created";

interface PushSubscriptionRow {
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
  soundType: NotificationSoundType;
}

export interface NotificationTemplate {
  type: NotificationType;
  entityType: string;
  entityId: string | number;
  dedupeKey: string;
  audience: NotificationAudience;
  soundType: NotificationSoundType;
  userIds?: string[];
  data?: Record<string, string | number | boolean | null | undefined>;
  payload: Record<NotificationLanguage, NotificationPayload>;
}

const MAX_PUSH_FAILURES = 3;
const DEFAULT_VAPID_SUBJECT = "mailto:info@vanararetreat.com";

const COPY = {
  en: {
    chatTitle: "New chat message",
    chatBody: "New message received",
    newBooking: "New booking received",
    bookingCancelled: "Existing booking cancelled",
    bookingUpdated: "Existing booking updated",
    checkInCompleted: "Check-in completed",
    checkOutCompleted: "Check-out completed",
    blockingMaintenance: "Severe maintenance issue opened",
    tapToOpen: "Tap to open Vanara Central",
  },
  th: {
    chatTitle: "มีข้อความแชตใหม่",
    chatBody: "มีข้อความแชตใหม่",
    newBooking: "มีการจองใหม่",
    bookingCancelled: "การจองถูกยกเลิก",
    bookingUpdated: "การจองมีการเปลี่ยนแปลง",
    checkInCompleted: "เช็กอินแล้ว",
    checkOutCompleted: "เช็กเอาต์แล้ว",
    blockingMaintenance: "มีงานซ่อมที่ปิดห้อง",
    tapToOpen: "แตะเพื่อเปิด Vanara Central",
  },
} as const;

function cleanText(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function appendContext(base: string, context?: string | null): string {
  const suffix = cleanText(context, 80);
  return suffix ? `${base} - ${suffix}` : base;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function hmac(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(data)));
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const input = new Uint8Array(info.length + 1);
  input.set(info, 0);
  input[input.length - 1] = 1;
  return (await hmac(prk, input)).slice(0, length);
}

export async function deriveWebPushIkm(authSecret: Uint8Array, sharedSecret: Uint8Array, keyInfo: Uint8Array): Promise<Uint8Array> {
  const prkKey = await hmac(authSecret, sharedSecret);
  return hmac(prkKey, concatBytes(keyInfo, new Uint8Array([1])));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function vapidAuthorization(env: NotificationBindings, endpoint: string): Promise<string | null> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY_JWK) return null;
  const audience = new URL(endpoint).origin;
  const expires = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: expires,
    sub: env.VAPID_SUBJECT ?? DEFAULT_VAPID_SUBJECT,
  })));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_KEY_JWK) as JsonWebKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${bytesToBase64Url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

async function encryptPushPayload(subscription: PushSubscriptionRow, payload: NotificationPayload): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const serverKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));
  const clientPublic = await crypto.subtle.importKey("raw", toArrayBuffer(base64UrlToBytes(subscription.p256dh)), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientPublic }, serverKeys.privateKey, 256));
  const authSecret = base64UrlToBytes(subscription.auth);
  const keyInfo = concatBytes(new TextEncoder().encode("WebPush: info\0"), base64UrlToBytes(subscription.p256dh), serverPublic);
  const ikm = await deriveWebPushIkm(authSecret, sharedSecret, keyInfo);
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(cek), { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = concatBytes(new TextEncoder().encode(JSON.stringify(payload)), new Uint8Array([2]));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(nonce) }, key, toArrayBuffer(plaintext)));
  const header = new Uint8Array(21 + serverPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = serverPublic.length;
  header.set(serverPublic, 21);
  return concatBytes(header, encrypted);
}

async function sendPush(env: NotificationBindings, subscription: PushSubscriptionRow, payload: NotificationPayload): Promise<{ ok: boolean; errorCode?: string }> {
  const authorization = await vapidAuthorization(env, subscription.endpoint);
  if (!authorization) return { ok: false, errorCode: "vapid_not_configured" };
  const body = await encryptPushPayload(subscription, payload);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "86400",
    },
    body: toArrayBuffer(body),
  });
  if (response.ok) return { ok: true };
  return { ok: false, errorCode: String(response.status) };
}

export function publicVapidKey(env: NotificationBindings): string | null {
  return cleanText(env.VAPID_PUBLIC_KEY, 120) || null;
}

export async function countActivePushSubscriptions(env: Pick<NotificationBindings, "DB">, userId: string): Promise<number> {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM push_subscriptions
    WHERE user_id = ?
      AND status = 'active'
  `).bind(userId).first<{ count: number }>();
  return row?.count ?? 0;
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
  `).bind(new Date().toISOString(), new Date().toISOString(), user.id, cleanText(endpoint, 2048)).run();
}

async function createNotificationEvent(env: NotificationBindings, template: NotificationTemplate, now: string): Promise<NotificationEventRow | null> {
  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO notification_events (dedupe_key, notification_type, entity_type, entity_id, audience, sound_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    template.dedupeKey,
    template.type,
    template.entityType,
    String(template.entityId),
    template.audience,
    template.soundType,
    JSON.stringify({ data: template.data ?? {}, payload: template.payload }),
    now,
  ).run();
  if ((result.meta.changes ?? 0) !== 1) return null;
  return env.DB.prepare("SELECT notification_event_id, dedupe_key FROM notification_events WHERE dedupe_key = ?").bind(template.dedupeKey).first<NotificationEventRow>();
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
    const result = await sendPush(env, subscription, payload).catch((error: unknown) => ({ ok: false, errorCode: error instanceof Error ? error.name : "push_failed" }));
    await env.DB.prepare(`
      INSERT INTO notification_deliveries (notification_event_id, user_id, push_subscription_id, status, error_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(event.notification_event_id, subscription.user_id, subscription.push_subscription_id, result.ok ? "sent" : "failed", result.errorCode ?? null, now, new Date().toISOString()).run();
    if (!result.ok && result.errorCode && (result.errorCode === "404" || result.errorCode === "410" || subscription.failure_count + 1 >= MAX_PUSH_FAILURES)) {
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

export function notificationPayload(title: string, body: string, tag: string, url: string, soundType: NotificationSoundType): NotificationPayload {
  return { title, body, tag, url, soundType };
}

function locationText(value: string | null | undefined): string {
  return cleanText(value, 80) || "Vanara Central";
}

async function safeEmit(env: NotificationBindings, template: NotificationTemplate): Promise<void> {
  try {
    await emitNotification(env, template);
  } catch (error) {
    console.error(JSON.stringify({
      message: "Notification emission failed",
      notificationType: template.type,
      dedupeKey: template.dedupeKey,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

export async function notifyInternalChatMessage(env: NotificationBindings, input: {
  conversationId: string;
  messageId: number;
  authorId: string;
}): Promise<void> {
  const participants = await env.DB.prepare(`
    SELECT user_id
    FROM chat_conversation_participants
    WHERE conversation_id = ?
      AND user_id <> ?
  `).bind(input.conversationId, input.authorId).all<{ user_id: string }>();
  const userIds = (participants.results ?? []).map((row) => row.user_id);
  await safeEmit(env, {
    type: "chat.message.created",
    entityType: "chat_message",
    entityId: input.messageId,
    dedupeKey: `chat:message:${input.messageId}`,
    audience: "user-list",
    soundType: "chat",
    userIds,
    data: { conversationId: input.conversationId },
    payload: {
      en: notificationPayload(COPY.en.chatTitle, COPY.en.chatBody, `chat-${input.conversationId}`, `/chat/${encodeURIComponent(input.conversationId)}`, "chat"),
      th: notificationPayload(COPY.th.chatTitle, COPY.th.chatBody, `chat-${input.conversationId}`, `/chat/${encodeURIComponent(input.conversationId)}`, "chat"),
    },
  });
}

export async function notifyBookingEvent(env: NotificationBindings, input: {
  eventType: "new" | "updated" | "cancelled";
  bookingId: number | string;
  dedupeKey: string;
  context?: string | null;
}): Promise<void> {
  const english = input.eventType === "new"
    ? COPY.en.newBooking
    : input.eventType === "cancelled"
      ? COPY.en.bookingCancelled
      : COPY.en.bookingUpdated;
  const thai = input.eventType === "new"
    ? COPY.th.newBooking
    : input.eventType === "cancelled"
      ? COPY.th.bookingCancelled
      : COPY.th.bookingUpdated;
  await safeEmit(env, {
    type: `booking.${input.eventType}`,
    entityType: "booking",
    entityId: input.bookingId,
    dedupeKey: `booking:${input.dedupeKey}`,
    audience: "owners",
    soundType: "event",
    data: { eventType: input.eventType },
    payload: {
      en: notificationPayload(english, appendContext(english, input.context), `booking-${input.bookingId}`, "/staff#booking-pulse", "event"),
      th: notificationPayload(thai, appendContext(thai, input.context), `booking-${input.bookingId}`, "/staff#booking-pulse", "event"),
    },
  });
}

export async function notifyReceptionCompleted(env: NotificationBindings, input: {
  type: "check-in" | "check-out";
  bookingId: number | string;
  roomName?: string | null;
}): Promise<void> {
  const checkIn = input.type === "check-in";
  const enBase = checkIn ? COPY.en.checkInCompleted : COPY.en.checkOutCompleted;
  const thBase = checkIn ? COPY.th.checkInCompleted : COPY.th.checkOutCompleted;
  const room = locationText(input.roomName);
  await safeEmit(env, {
    type: checkIn ? "reception.check_in.completed" : "reception.check_out.completed",
    entityType: "booking",
    entityId: input.bookingId,
    dedupeKey: `reception:${input.type}:completed:${input.bookingId}`,
    audience: "all-active",
    soundType: "event",
    data: { eventType: input.type },
    payload: {
      en: notificationPayload(enBase, `${enBase} - ${room}`, `reception-${input.bookingId}`, "/reception", "event"),
      th: notificationPayload(thBase, `${thBase} - ${room}`, `reception-${input.bookingId}`, "/reception", "event"),
    },
  });
}

export async function notifyMaintenanceBlocking(env: NotificationBindings, input: {
  ticketId: number | string;
  title?: string | null;
  roomName?: string | null;
  locationArea?: string | null;
}): Promise<void> {
  const target = locationText(input.roomName ?? input.locationArea);
  await safeEmit(env, {
    type: "maintenance.blocking.created",
    entityType: "maintenance_ticket",
    entityId: input.ticketId,
    dedupeKey: `maintenance:blocking:created:${input.ticketId}`,
    audience: "all-active",
    soundType: "event",
    data: {},
    payload: {
      en: notificationPayload(COPY.en.blockingMaintenance, `${COPY.en.blockingMaintenance} - ${target}`, `maintenance-${input.ticketId}`, `/maintenance/${input.ticketId}`, "event"),
      th: notificationPayload(COPY.th.blockingMaintenance, `${COPY.th.blockingMaintenance} - ${target}`, `maintenance-${input.ticketId}`, `/maintenance/${input.ticketId}`, "event"),
    },
  });
}
