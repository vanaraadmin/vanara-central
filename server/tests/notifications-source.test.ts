import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("push notifications use a central D1-backed service with subscription and delivery records", () => {
  assert.match(notificationMigration, /CREATE TABLE push_subscriptions/);
  assert.match(notificationMigration, /endpoint TEXT NOT NULL UNIQUE/);
  assert.match(notificationMigration, /CREATE TABLE notification_events/);
  assert.match(notificationMigration, /dedupe_key TEXT NOT NULL UNIQUE/);
  assert.match(notificationMigration, /CREATE TABLE notification_deliveries/);
  assert.match(notificationService, /export async function emitNotification/);
  assert.match(notificationService, /INSERT OR IGNORE INTO notification_events/);
  assert.match(notificationSoundMigration, /sound_type TEXT NOT NULL DEFAULT 'event'/);
  assert.match(notificationService, /interface WebPushMessage extends NotificationPayload/);
  assert.match(notificationService, /web_push: 8030/);
  assert.match(notificationService, /navigate: absoluteNotificationUrl\(env, payload\.url\)/);
  assert.match(notificationService, /silent: false/);
  assert.match(notificationService, /const message = webPushMessage\(env, payload\)/);
  assert.match(notificationService, /encryptPushPayload\(subscription, message\)/);
  assert.match(notificationService, /audience, sound_type, payload_json, created_at/);
  assert.match(notificationService, /const soundType = template\.soundType \?\? \(template\.type === "chat\.message\.created" \? "chat" : "event"\)/);
  assert.match(notificationService, /SELECT notification_event_id, dedupe_key, created_at FROM notification_events WHERE dedupe_key = \?/);
  assert.match(notificationService, /row\?\.created_at === now \? row : null/);
  assert.doesNotMatch(notificationService, /result\.meta\.changes[\s\S]*return null/);
  assert.match(notificationService, /JOIN users u ON u\.user_id = ps\.user_id[\s\S]*u\.status = 'active'/);
  assert.match(notificationService, /const WEB_PUSH_CONTENT_ENCODING = "aes128gcm"/);
  assert.match(notificationService, /const WEB_PUSH_RECORD_SIZE = 4096/);
  assert.match(notificationService, /new DataView\(header\.buffer\)\.setUint32\(16, WEB_PUSH_RECORD_SIZE, false\)/);
  assert.match(notificationService, /"content-encoding": WEB_PUSH_CONTENT_ENCODING/);
  assert.match(notificationService, /urgency: payload\.tag\.startsWith\("chat-"\) \? "high" : "normal"/);
  assert.match(notificationService, /const diagnostic = `http_\$\{response\.status\}:\$\{WEB_PUSH_CONTENT_ENCODING\}:bytes_\$\{body\.byteLength\}`/);
  assert.match(notificationService, /if \(response\.ok\) return \{ ok: true, errorCode: diagnostic \}/);
  assert.match(notificationService, /return \{ ok: false, errorCode: diagnostic \}/);
  assert.match(notificationService, /result\.ok \? "sent" : "failed", result\.errorCode \?\? null/);
  assert.match(notificationService, /const ACTIVE_PUSH_SUBSCRIPTION_FILTER = `/);
  assert.match(notificationService, /ps\.endpoint LIKE 'https:\/\/web\.push\.apple\.com\/%'/);
  assert.match(notificationService, /COALESCE\(newer\.last_seen_at, newer\.updated_at, newer\.created_at\) > COALESCE\(ps\.last_seen_at, ps\.updated_at, ps\.created_at\)/);
  assert.match(notificationService, /endpoint\.startsWith\("https:\/\/web\.push\.apple\.com\/"\)/);
  assert.match(notificationService, /AND user_agent = \?/);
  assert.match(wranglerConfig, /"VAPID_PUBLIC_KEY":\s*"B[A-Za-z0-9_-]+"/);
  assert.doesNotMatch(wranglerConfig, /"VAPID_PRIVATE_KEY_JWK"/);
});

test("internal chat notifies participants except sender and never uses Guest Messages", () => {
  assert.match(chatService, /notifyInternalChatMessage/);
  assert.match(notificationService, /FROM chat_conversation_participants[\s\S]*AND user_id <> \?/);
  assert.match(notificationService, /dedupeKey: `chat:message:\$\{input\.messageId\}`/);
  assert.match(notificationService, /New message received/);
  assert.match(notificationService, /มีข้อความแชตใหม่/);
  assert.match(notificationService, /`\/chat\/\$\{encodeURIComponent\(input\.conversationId\)\}`/);
  assert.doesNotMatch(notificationService, /\/chat\?conversation=/);
  assert.doesNotMatch(chatService, /Guest Messages|guest-message|Waraporn|WhatsApp/i);
  assert.doesNotMatch(chatService, /guest-messages|MessagesPage|\/api\/messages/i);
  assert.doesNotMatch(guestMessagesService + messagesSyncService + warapornDraftService, /notifyInternalChatMessage|push_subscriptions/);
});

test("open internal chat view refreshes active conversations without manual pull-to-refresh", () => {
  assert.match(teamChatSurface, /const ACTIVE_CHAT_REFRESH_MS = 2_500/);
  assert.match(teamChatSurface, /queryKey: \["chat", "conversations"\][\s\S]*refetchInterval: ACTIVE_CHAT_REFRESH_MS/);
  assert.match(teamChatSurface, /queryKey: \["chat", "conversation", selectedConversationId\][\s\S]*refetchInterval: ACTIVE_CHAT_REFRESH_MS/);
  assert.match(teamChatSurface, /queryKey: \["chat", "messages", selectedConversationId\][\s\S]*refetchInterval: ACTIVE_CHAT_REFRESH_MS/);
  assert.match(teamChatSurface, /refetchIntervalInBackground: false/);
  assert.match(teamChatSurface, /refetchOnMount: "always"/);
  assert.match(teamChatSurface, /refetchOnWindowFocus: true/);
  assert.match(teamChatSurface, /staleTime: 0/);
  assert.doesNotMatch(teamChatSurface, /window\.setInterval\(refreshActiveChat/);
  assert.match(teamChatSurface, /document\.visibilityState !== "visible"/);
  assert.match(teamChatSurface, /window\.addEventListener\("focus", refreshActiveChat\)/);
  assert.match(teamChatSurface, /window\.addEventListener\("pageshow", refreshActiveChat\)/);
  assert.match(teamChatSurface, /document\.addEventListener\("visibilitychange", refreshActiveChat\)/);
  assert.match(teamChatSurface, /queryClient\.invalidateQueries\(\{ queryKey: \["chat", "messages", conversationId\] \}\)/);
  assert.match(teamChatSurface, /queryClient\.invalidateQueries\(\{ queryKey: \["chat", "conversation", conversationId\] \}\)/);
  assert.match(teamChatSurface, /function showSentMessage\(message: ChatMessage\)/);
  assert.match(teamChatSurface, /queryClient\.setQueryData<ChatMessage\[\]>\(\["chat", "messages", conversationId\]/);
  assert.match(teamChatSurface, /onSuccess: async \(message\) => \{[\s\S]*showSentMessage\(message\)/);
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
  assert.match(notificationService, /"\/movements"/);
  assert.doesNotMatch(notificationService, /notifyReceptionCompleted[\s\S]*"\/reception"/);
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

test("service worker handles push without caching operational API data", () => {
  assert.match(serviceWorker, /self\.addEventListener\("push"/);
  assert.match(serviceWorker, /const VANARA_SW_VERSION = "2026-08-10-pwa-stability-v1"/);
  assert.doesNotMatch(serviceWorker, /if \(!event\.data\) return;/);
  assert.match(serviceWorker, /event\.waitUntil\(\(async \(\) => \{/);
  assert.match(serviceWorker, /let payload = \{ title: "Vanara Central", body: "New message received"/);
  assert.match(serviceWorker, /const notification = payload\.notification && typeof payload\.notification === "object" \? payload\.notification : \{\}/);
  assert.match(serviceWorker, /notification\.title/);
  assert.match(serviceWorker, /notification\.body/);
  assert.match(serviceWorker, /notification\.navigate/);
  assert.doesNotMatch(serviceWorker, /VANARA_PUSH_NOTIFICATION/);
  assert.match(serviceWorker, /console\.warn\("Vanara push payload fallback", error\)/);
  assert.match(serviceWorker, /console\.error\("Vanara push showNotification failed", error\)/);
  assert.match(serviceWorker, /tag: "vanara-central-fallback"/);
  assert.match(serviceWorker, /self\.registration\.showNotification/);
  assert.match(serviceWorker, /self\.addEventListener\("notificationclick"/);
  assert.match(serviceWorker, /const exact = clients\.find\(\(client\) => client\.url === targetUrl\)/);
  assert.match(serviceWorker, /sameOrigin\.navigate\(targetUrl\)/);
  assert.match(serviceWorker, /self\.clients\.openWindow\(targetUrl\)/);
  assert.match(serviceWorker, /if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/);
  assert.doesNotMatch(serviceWorker, /cache\.addAll\([^)]*\/api\//);
  assert.doesNotMatch(serviceWorker, /cache\.addAll/);
  assert.doesNotMatch(serviceWorker, /caches\.match\("\/"\)/);
  assert.doesNotMatch(serviceWorker, /caches\.match\(request\)/);
  assert.match(serviceWorker, /event\.respondWith\(fetch\(request\)\)/);
});
