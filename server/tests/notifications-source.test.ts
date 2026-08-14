import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  notifyInternalChatMessage,
  sendPushWithTransport,
  shouldDisablePushSubscription,
  type NotificationBindings,
  type PushSubscriptionRow,
  type WebPushTransport,
} from "../src/services/notifications.service.ts";

const notificationService = readFileSync(new URL("../src/services/notifications.service.ts", import.meta.url), "utf8");
const notificationMigration = readFileSync(new URL("../migrations/0042_push_notifications.sql", import.meta.url), "utf8");
const notificationSoundMigration = readFileSync(new URL("../migrations/0044_notification_event_sound_type.sql", import.meta.url), "utf8");
const chatService = readFileSync(new URL("../src/services/chat.service.ts", import.meta.url), "utf8");
const bookingEventsService = readFileSync(new URL("../src/services/booking-events.service.ts", import.meta.url), "utf8");
const receptionService = readFileSync(new URL("../src/services/reception.service.ts", import.meta.url), "utf8");
const maintenanceService = readFileSync(new URL("../src/services/maintenance.service.ts", import.meta.url), "utf8");
const guestMessagesService = readFileSync(new URL("../src/services/guest-messages-workspace.service.ts", import.meta.url), "utf8");
const messagesSyncService = readFileSync(new URL("../src/services/messages-sync.service.ts", import.meta.url), "utf8");
const warapornDraftService = readFileSync(new URL("../src/services/waraporn-draft.service.ts", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const wranglerConfig = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
const teamChatSurface = readFileSync(new URL("../../src/components/chat/TeamChatSurface.tsx", import.meta.url), "utf8");
const serverPackage = readFileSync(new URL("../package.json", import.meta.url), "utf8");

function notificationFixture(participantIds: string[], authorId: string) {
  let eventCreatedAt = "";
  let eventPayloadJson = "";
  const loadedRecipientIds: string[] = [];
  const database = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...nextValues: unknown[]) {
          values = nextValues;
          return statement;
        },
        async run() {
          if (sql.includes("INSERT OR IGNORE INTO notification_events")) {
            eventPayloadJson = String(values[6]);
            eventCreatedAt = String(values[7]);
          }
          return { success: true, meta: { changes: 1 } };
        },
        async first<T>() {
          if (sql.includes("SELECT notification_event_id")) {
            return {
              notification_event_id: 1,
              dedupe_key: "chat:message:101",
              created_at: eventCreatedAt,
            } as T;
          }
          return null;
        },
        async all<T>() {
          if (sql.includes("FROM chat_conversation_participants")) {
            return { results: participantIds.filter((id) => id !== authorId).map((user_id) => ({ user_id })) as T[] };
          }
          if (sql.includes("FROM push_subscriptions")) {
            loadedRecipientIds.push(...values.map(String));
            return { results: [] as T[] };
          }
          return { results: [] as T[] };
        },
      };
      return statement;
    },
  };

  return {
    env: { DB: database } as unknown as NotificationBindings,
    loadedRecipientIds,
    payload: () => JSON.parse(eventPayloadJson) as {
      payload: { en: { title: string; body: string; url: string }; th: { title: string; body: string; url: string } };
    },
  };
}

const pushSubscription: PushSubscriptionRow = {
  push_subscription_id: 7,
  user_id: "recipient",
  endpoint: "https://web.push.apple.com/example",
  p256dh: "recipient-public-key",
  auth: "recipient-auth-secret",
  status: "active",
  failure_count: 0,
  preferred_language: "en",
};

const pushEnvironment = {
  DB: {} as D1Database,
  VAPID_PUBLIC_KEY: "BExamplePublicKey",
  VAPID_PRIVATE_KEY_JWK: JSON.stringify({ d: "example-private-key" }),
  VAPID_SUBJECT: "mailto:info@vanararetreat.com",
};

const chatPushPayload = {
  title: "New message received",
  body: "Ice: Hello",
  tag: "chat-private-example",
  url: "/chat",
};

test("push notifications use a central D1-backed service with subscription and delivery records", () => {
  assert.match(notificationMigration, /CREATE TABLE push_subscriptions/);
  assert.match(notificationMigration, /endpoint TEXT NOT NULL UNIQUE/);
  assert.match(notificationMigration, /CREATE TABLE notification_events/);
  assert.match(notificationMigration, /dedupe_key TEXT NOT NULL UNIQUE/);
  assert.match(notificationMigration, /CREATE TABLE notification_deliveries/);
  assert.match(notificationService, /export async function emitNotification/);
  assert.match(notificationService, /INSERT OR IGNORE INTO notification_events/);
  assert.match(notificationSoundMigration, /sound_type TEXT NOT NULL DEFAULT 'event'/);
  assert.match(notificationService, /from "web-push"/);
  assert.match(serverPackage, /"web-push": "\^3\.6\.7"/);
  assert.match(notificationService, /audience, sound_type, payload_json, created_at/);
  assert.match(notificationService, /const soundType = template\.soundType \?\? \(template\.type === "chat\.message\.created" \? "chat" : "event"\)/);
  assert.match(notificationService, /SELECT notification_event_id, dedupe_key, created_at FROM notification_events WHERE dedupe_key = \?/);
  assert.match(notificationService, /row\?\.created_at === now \? row : null/);
  assert.doesNotMatch(notificationService, /result\.meta\.changes[\s\S]*return null/);
  assert.match(notificationService, /JOIN users u ON u\.user_id = ps\.user_id[\s\S]*u\.status = 'active'/);
  assert.match(notificationService, /contentEncoding: "aes128gcm"/);
  assert.match(notificationService, /transport\.sendNotification\(standardSubscription, payloadJson, options\)/);
  assert.match(notificationService, /provider: pushProvider\(subscription\.endpoint\)/);
  assert.match(notificationService, /statusCode >= 500 && statusCode <= 599/);
  assert.match(notificationService, /const MAX_WEB_PUSH_ATTEMPTS = 2/);
  assert.doesNotMatch(notificationService, /encryptPushPayload|vapidAuthorization|crypto\.subtle|\bhkdf\b|AES-GCM|ECDH/);
  assert.match(notificationService, /result\.ok \? "sent" : "failed", result\.errorCode \?\? null/);
  assert.doesNotMatch(notificationService, /ACTIVE_PUSH_SUBSCRIPTION_FILTER/);
  assert.doesNotMatch(notificationService, /web_push: 8030/);
  assert.match(wranglerConfig, /"VAPID_PUBLIC_KEY":\s*"B[A-Za-z0-9_-]+"/);
  assert.doesNotMatch(wranglerConfig, /"VAPID_PRIVATE_KEY_JWK"/);
});

test("internal chat notifies participants except sender and never uses Guest Messages", () => {
  assert.match(chatService, /notifyInternalChatMessage/);
  assert.match(notificationService, /FROM chat_conversation_participants[\s\S]*AND user_id <> \?/);
  assert.match(notificationService, /dedupeKey: `chat:message:\$\{input\.messageId\}`/);
  assert.match(notificationService, /New message received/);
  assert.match(notificationService, /มีข้อความแชตใหม่/);
  assert.match(notificationService, /const conversationUrl = "\/chat"/);
  assert.doesNotMatch(notificationService, /`\/chat\/\$\{encodeURIComponent\(input\.conversationId\)\}`/);
  assert.doesNotMatch(notificationService, /\/chat\?conversation=/);
  assert.match(notificationService, /previewKind === "attachment" \? "Attachment"/);
  assert.match(notificationService, /previewKind === "sticker" \? "Sticker"/);
  assert.doesNotMatch(chatService, /Guest Messages|guest-message|Waraporn|WhatsApp/i);
  assert.doesNotMatch(chatService, /guest-messages|MessagesPage|\/api\/messages/i);
  assert.doesNotMatch(guestMessagesService + messagesSyncService + warapornDraftService, /notifyInternalChatMessage|push_subscriptions/);
});

test("internal chat notification targets every private or group recipient except the sender", async () => {
  const privateFixture = notificationFixture(["sender", "recipient"], "sender");
  await notifyInternalChatMessage(privateFixture.env, {
    conversationId: "private-example",
    messageId: 101,
    authorId: "sender",
    authorName: "Stefano",
    body: "Hello Ice",
  });
  assert.deepEqual(privateFixture.loadedRecipientIds, ["recipient"]);
  assert.equal(privateFixture.payload().payload.en.title, "New message received");
  assert.equal(privateFixture.payload().payload.en.url, "/chat");

  const groupFixture = notificationFixture(["sender", "staff-a", "staff-b", "owner-a"], "sender");
  await notifyInternalChatMessage(groupFixture.env, {
    conversationId: "group-example",
    messageId: 102,
    authorId: "sender",
    authorName: "Ice",
    body: "Team update",
  });
  assert.deepEqual(groupFixture.loadedRecipientIds, ["staff-a", "staff-b", "owner-a"]);
  assert.equal(groupFixture.loadedRecipientIds.includes("sender"), false);
  assert.equal(groupFixture.payload().payload.th.title, "มีข้อความแชตใหม่");
  assert.equal(groupFixture.payload().payload.th.url, "/chat");

  const attachmentFixture = notificationFixture(["sender", "recipient"], "sender");
  await notifyInternalChatMessage(attachmentFixture.env, {
    conversationId: "private-example",
    messageId: 103,
    authorId: "sender",
    authorName: "Ice",
    body: "Photo: private-passport-name.jpg",
    previewKind: "attachment",
  });
  assert.equal(attachmentFixture.payload().payload.en.body, "Ice: Attachment");
  assert.equal(attachmentFixture.payload().payload.en.body.includes("passport"), false);

  const stickerFixture = notificationFixture(["sender", "recipient"], "sender");
  await notifyInternalChatMessage(stickerFixture.env, {
    conversationId: "private-example",
    messageId: 104,
    authorId: "sender",
    authorName: "Stefano",
    body: "Sticker: celebration",
    previewKind: "sticker",
  });
  assert.equal(stickerFixture.payload().payload.en.body, "Stefano: Sticker");
  assert.equal(stickerFixture.payload().payload.th.body, "Stefano: สติกเกอร์");
});

test("standard Web Push retries one 5xx only and marks 404 or 410 subscriptions dead", async () => {
  let attempts = 0;
  const retryingTransport: WebPushTransport = {
    async sendNotification() {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("temporary upstream failure"), { statusCode: 503 });
      return { statusCode: 201, body: "", headers: {} };
    },
  };
  const recovered = await sendPushWithTransport(pushEnvironment, pushSubscription, chatPushPayload, retryingTransport);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.attempts, 2);
  assert.equal(attempts, 2);

  for (const statusCode of [404, 410]) {
    let deadAttempts = 0;
    const deadTransport: WebPushTransport = {
      async sendNotification() {
        deadAttempts += 1;
        throw Object.assign(new Error("subscription expired"), { statusCode });
      },
    };
    const dead = await sendPushWithTransport(pushEnvironment, pushSubscription, chatPushPayload, deadTransport);
    assert.equal(dead.ok, false);
    assert.equal(dead.attempts, 1);
    assert.equal(deadAttempts, 1);
    assert.equal(shouldDisablePushSubscription(dead, 0), true);
  }

  let permanentAttempts = 0;
  const permanentTransport: WebPushTransport = {
    async sendNotification() {
      permanentAttempts += 1;
      throw Object.assign(new Error("bad request"), { statusCode: 400 });
    },
  };
  const permanent = await sendPushWithTransport(pushEnvironment, pushSubscription, chatPushPayload, permanentTransport);
  assert.equal(permanent.attempts, 1);
  assert.equal(permanentAttempts, 1);
  assert.equal(shouldDisablePushSubscription(permanent, 0), false);
});

test("internal chat refreshes only the active open chat without blocking on push", () => {
  assert.match(teamChatSurface, /const ACTIVE_CHAT_REFRESH_MS = 5_000/);
  assert.match(teamChatSurface, /refetchInterval: ACTIVE_CHAT_REFRESH_MS/);
  assert.match(teamChatSurface, /refetchInterval: selectedConversationId && activeInList && !chatRealtime\.connected \? ACTIVE_CHAT_REFRESH_MS : false/);
  assert.match(teamChatSurface, /refetchIntervalInBackground: false/);
  assert.match(teamChatSurface, /refetchOnMount: "always"/);
  assert.match(teamChatSurface, /refetchOnWindowFocus: true/);
  assert.match(teamChatSurface, /staleTime: 0/);
  assert.doesNotMatch(teamChatSurface, /window\.setInterval\(refreshActiveChat/);
  assert.doesNotMatch(teamChatSurface, /window\.addEventListener\("focus", refreshActiveChat\)/);
  assert.doesNotMatch(teamChatSurface, /window\.addEventListener\("pageshow", refreshActiveChat\)/);
  assert.doesNotMatch(teamChatSurface, /document\.addEventListener\("visibilitychange", refreshActiveChat\)/);
  assert.match(teamChatSurface, /queryClient\.invalidateQueries\(\{ queryKey: \["chat", "messages", conversationId\] \}\)/);
  assert.match(teamChatSurface, /queryClient\.invalidateQueries\(\{ queryKey: \["chat", "conversation", conversationId\] \}\)/);
  assert.match(teamChatSurface, /function showSentMessage\(message: ChatMessage\)/);
  assert.match(teamChatSurface, /queryClient\.setQueryData<ChatMessage\[\]>\(\["chat", "messages", conversationId\]/);
  assert.match(chatService, /function dispatchChatNotification/);
  assert.match(chatService, /export type ChatSideEffectScheduler = \(promise: Promise<unknown>\) => void/);
  assert.match(chatService, /scheduleSideEffect\(notifyInternalChatMessage\(env, input\)\.catch/);
  assert.doesNotMatch(chatService, /void notifyInternalChatMessage/);
  assert.doesNotMatch(chatService, /await notifyInternalChatMessage/);
});

test("guest message notifications are owner-only and separated from internal chat", () => {
  assert.match(messagesSyncService, /notifyGuestMessageInbound/);
  assert.match(warapornDraftService, /notifyGuestMessageDraftReady/);
  assert.match(notificationService, /type: "guest_message\.inbound"/);
  assert.match(notificationService, /type: "guest_message\.draft_ready"/);
  assert.match(notificationService, /dedupeKey: `guest-message:inbound:\$\{input\.messageId\}`/);
  assert.match(notificationService, /dedupeKey: `guest-message:draft-ready:\$\{input\.messageId\}:\$\{input\.draftId\}`/);
  assert.match(notificationService, /audience: "owners"/);
  assert.match(notificationService, /New guest message/);
  assert.match(notificationService, /Waraporn reply ready for review/);
  assert.match(notificationService, /Guest message needs review/);
  assert.match(notificationService, /"\/messages"/);
  assert.doesNotMatch(notificationService, /guest-message[\s\S]{0,240}\/chat\?conversation/);
});

test("booking notifications are owner-only and cover new updated cancelled events", () => {
  assert.match(bookingEventsService, /notifyBookingEvent/);
  assert.match(notificationService, /audience: "owners"/);
  assert.match(notificationService, /type: `booking\.\$\{input\.eventType\}`/);
  assert.match(notificationService, /New booking received/);
  assert.match(notificationService, /Existing booking updated/);
  assert.match(notificationService, /Existing booking cancelled/);
  assert.match(notificationService, /\/staff#booking-pulse/);
  assert.match(notificationService, /Open Booking Pulse/);
  assert.match(notificationService, /มีการจองใหม่/);
  assert.doesNotMatch(bookingEventsService, /result\.meta\.changes[\s\S]*notifyBookingEvent/);
});

test("reception completion notifications go to all active users only after completion writes", () => {
  assert.match(receptionService, /notifyReceptionCompleted/);
  assert.match(notificationService, /reception\.check_in\.completed/);
  assert.match(notificationService, /reception\.check_out\.completed/);
  assert.match(notificationService, /audience: "all-active"/);
  assert.match(notificationService, /const room = locationText\(input\.roomName\)/);
  assert.match(notificationService, /\$\{englishStatus\} - \$\{room\}/);
  assert.match(notificationService, /Check-in completed/);
  assert.match(notificationService, /Check-out completed/);
  assert.match(notificationService, /notifyReceptionCompleted[\s\S]*"\/reception"/);
  assert.doesNotMatch(notificationService, /notifyReceptionCompleted[\s\S]*"\/movements"/);
  assert.match(notificationService, /เช็กอินแล้ว/);
  assert.match(notificationService, /เช็กเอาต์แล้ว/);
  assert.match(receptionService, /UPDATE reception_stays[\s\S]*recordEvent\(env, bookingId, "checkInCompleted"[\s\S]*notifyReceptionCompleted/);
  assert.match(receptionService, /UPDATE reception_stays[\s\S]*recordEvent\(env, bookingId, "checkOutCompleted"[\s\S]*notifyReceptionCompleted/);
});

test("maintenance notifications fire only for blocking creation or false-to-true blocking transition", () => {
  assert.match(maintenanceService, /notifyMaintenanceBlocking/);
  assert.match(maintenanceService, /if \(ticket\.outOfService\) \{/);
  assert.match(maintenanceService, /trigger: "created"/);
  assert.match(maintenanceService, /if \(!current\.outOfService && ticket\?\.outOfService\) \{/);
  assert.match(maintenanceService, /trigger: "enabled"/);
  assert.match(notificationService, /maintenance\.blocking\.created/);
  assert.match(notificationService, /maintenance\.blocking\.enabled/);
  assert.match(notificationService, /Severe maintenance issue opened - \$\{target\}/);
  assert.match(notificationService, /มีงานซ่อมที่ปิดห้อง - \$\{target\}/);
  assert.match(notificationService, /`\/maintenance\/\$\{input\.ticketId\}`/);
});

test("service worker always displays a speaking push notification and excludes API data", () => {
  assert.match(serviceWorker, /self\.addEventListener\("push"/);
  assert.match(serviceWorker, /const VANARA_BUILD_ID = "__VANARA_BUILD_ID__"/);
  assert.doesNotMatch(serviceWorker, /cache\.addAll\(SHELL_ASSETS\)/);
  assert.doesNotMatch(serviceWorker, /if \(!event\.data\) return;/);
  assert.match(serviceWorker, /event\.waitUntil\(\(async \(\) =>/);
  assert.match(serviceWorker, /title: "New message received"/);
  assert.match(serviceWorker, /await self\.registration\.showNotification/);
  assert.doesNotMatch(serviceWorker, /New app alert/);
  assert.match(serviceWorker, /self\.addEventListener\("notificationclick"/);
  assert.match(serviceWorker, /const exact = clients\.find\(\(client\) => client\.url === targetUrl\)/);
  assert.match(serviceWorker, /sameOrigin\.navigate\(targetUrl\)/);
  assert.match(serviceWorker, /self\.clients\.openWindow\(targetUrl\)/);
  assert.match(serviceWorker, /self\.addEventListener\("fetch"/);
  assert.match(serviceWorker, /if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/);
  assert.doesNotMatch(serviceWorker, /cache\.addAll\([^)]*\/api\//);
  assert.match(serviceWorker, /fetch\(new Request\(request, \{ cache: "no-store" \}\)\)/);
  assert.doesNotMatch(serviceWorker, /caches\.match\(request\)|caches\.match\("\/"\)/);
});

test("PWA versioning leaves push and notification click handlers byte-identical", () => {
  const normalized = serviceWorker.replace(/\r\n/g, "\n");
  const pushBlock = normalized.slice(normalized.indexOf('self.addEventListener("push"'), normalized.indexOf('self.addEventListener("notificationclick"'));
  const clickBlock = normalized.slice(normalized.indexOf('self.addEventListener("notificationclick"'), normalized.indexOf('self.addEventListener("fetch"'));
  assert.equal(createHash("sha256").update(pushBlock).digest("hex"), "6ae446328cb82f9075fff7190fd6a1e3e76902ae06b5be47896b050e1e631ee8");
  assert.equal(createHash("sha256").update(clickBlock).digest("hex"), "3d757a2db18e1d038ec40afbb148a0559c30026feba847975faf96d7c3721e21");
});

test("service worker shows a visible fallback for missing or invalid push data", async () => {
  type PushEventFixture = {
    data?: { json(): unknown } | null;
    waitUntil(promise: Promise<unknown>): void;
  };
  const listeners = new Map<string, (event: PushEventFixture) => void>();
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const selfFixture = {
    addEventListener(type: string, listener: (event: PushEventFixture) => void) {
      listeners.set(type, listener);
    },
    registration: {
      async showNotification(title: string, options: Record<string, unknown>) {
        shown.push({ title, options });
      },
    },
    location: { origin: "https://central.vanararetreat.com" },
    clients: {},
    skipWaiting() {},
  };
  runInNewContext(serviceWorker, { self: selfFixture, console, URL, Response, fetch });
  const pushListener = listeners.get("push");
  assert.ok(pushListener);

  let missingWait: Promise<unknown> | null = null;
  pushListener({ data: null, waitUntil: (promise) => { missingWait = promise; } });
  await missingWait;
  assert.equal(shown[0]?.title, "New message received");
  assert.equal(shown[0]?.options.body, "Open Vanara Central to view the message");

  let invalidWait: Promise<unknown> | null = null;
  pushListener({
    data: { json: () => { throw new Error("invalid payload"); } },
    waitUntil: (promise) => { invalidWait = promise; },
  });
  await invalidWait;
  assert.equal(shown[1]?.title, "New message received");

  let validWait: Promise<unknown> | null = null;
  pushListener({
    data: { json: () => chatPushPayload },
    waitUntil: (promise) => { validWait = promise; },
  });
  await validWait;
  assert.equal(shown[2]?.title, "New message received");
  assert.equal((shown[2]?.options.data as { url?: string } | undefined)?.url, "/chat");
});
