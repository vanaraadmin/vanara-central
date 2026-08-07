import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notificationService = readFileSync(new URL("../src/services/notifications.service.ts", import.meta.url), "utf8");
const notificationMigration = readFileSync(new URL("../migrations/0042_push_notifications.sql", import.meta.url), "utf8");
const chatService = readFileSync(new URL("../src/services/chat.service.ts", import.meta.url), "utf8");
const bookingEventsService = readFileSync(new URL("../src/services/booking-events.service.ts", import.meta.url), "utf8");
const receptionService = readFileSync(new URL("../src/services/reception.service.ts", import.meta.url), "utf8");
const maintenanceService = readFileSync(new URL("../src/services/maintenance.service.ts", import.meta.url), "utf8");
const guestMessagesService = readFileSync(new URL("../src/services/guest-messages-workspace.service.ts", import.meta.url), "utf8");
const messagesSyncService = readFileSync(new URL("../src/services/messages-sync.service.ts", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const profilePanel = readFileSync(new URL("../../src/components/ProfilePanel.tsx", import.meta.url), "utf8");
const pwaService = readFileSync(new URL("../../src/services/pwa.service.ts", import.meta.url), "utf8");

test("push notifications use a central D1-backed service with subscriptions events and deliveries", () => {
  assert.match(notificationMigration, /CREATE TABLE push_subscriptions/);
  assert.match(notificationMigration, /endpoint TEXT NOT NULL UNIQUE/);
  assert.match(notificationMigration, /CREATE TABLE notification_events/);
  assert.match(notificationMigration, /dedupe_key TEXT NOT NULL UNIQUE/);
  assert.match(notificationMigration, /sound_type TEXT NOT NULL/);
  assert.match(notificationMigration, /CREATE TABLE notification_deliveries/);
  assert.match(notificationService, /export async function emitNotification/);
  assert.match(notificationService, /INSERT OR IGNORE INTO notification_events/);
  assert.match(notificationService, /result\.meta\.changes[\s\S]*return null/);
  assert.match(notificationService, /JOIN users u ON u\.user_id = ps\.user_id[\s\S]*u\.status = 'active'/);
});

test("internal chat notifies participants except sender and never uses Guest Messages or Wara", () => {
  assert.match(chatService, /notifyInternalChatMessage/);
  assert.match(notificationService, /FROM chat_conversation_participants[\s\S]*AND user_id <> \?/);
  assert.match(notificationService, /dedupeKey: `chat:message:\$\{input\.messageId\}`/);
  assert.match(notificationService, /soundType: "chat"/);
  assert.match(notificationService, /\/chat\/\$\{encodeURIComponent\(input\.conversationId\)\}/);
  assert.doesNotMatch(notificationService, /guest_messages|MessagesPage|Waraporn|WhatsApp/i);
  assert.doesNotMatch(chatService, /guest-messages|MessagesPage|\/api\/messages/i);
  assert.doesNotMatch(guestMessagesService + messagesSyncService, /notifyInternalChatMessage|emitNotification|push_subscriptions/);
});

test("booking notifications are owner-only and use exact approved base copy with home Booking Pulse target", () => {
  assert.match(bookingEventsService, /notifyBookingEvent/);
  assert.match(bookingEventsService, /if \(\(result\.meta\.changes \?\? 0\) !== 1\) return;/);
  assert.match(notificationService, /audience: "owners"/);
  assert.match(notificationService, /New booking received/);
  assert.match(notificationService, /Existing booking cancelled/);
  assert.match(notificationService, /Existing booking updated/);
  assert.match(notificationService, /\/staff#booking-pulse/);
  assert.doesNotMatch(notificationService, /\/booking\//);
});

test("reception completion notifications go to all active users only after completion writes", () => {
  assert.match(receptionService, /notifyReceptionCompleted/);
  assert.match(notificationService, /reception\.check_in\.completed/);
  assert.match(notificationService, /reception\.check_out\.completed/);
  assert.match(notificationService, /audience: "all-active"/);
  assert.match(notificationService, /Check-in completed/);
  assert.match(notificationService, /Check-out completed/);
  assert.match(receptionService, /UPDATE reception_stays[\s\S]*recordEvent\(env, bookingId, "checkInCompleted"[\s\S]*notifyReceptionCompleted/);
  assert.match(receptionService, /UPDATE reception_stays[\s\S]*recordEvent\(env, bookingId, "checkOutCompleted"[\s\S]*notifyReceptionCompleted/);
});

test("maintenance notifications fire only for newly created blocking issues", () => {
  assert.match(maintenanceService, /notifyMaintenanceBlocking/);
  assert.match(maintenanceService, /if \(ticket\.outOfService\) \{/);
  assert.match(notificationService, /maintenance\.blocking\.created/);
  assert.match(notificationService, /Severe maintenance issue opened/);
  assert.doesNotMatch(maintenanceService, /updateMaintenanceOutOfService[\s\S]*notifyMaintenanceBlocking/);
});

test("service worker handles push and clicks without caching operational API data", () => {
  assert.match(serviceWorker, /self\.addEventListener\("push"/);
  assert.match(serviceWorker, /self\.registration\.showNotification/);
  assert.match(serviceWorker, /postMessage\(\{ type: "VANARA_PUSH_NOTIFICATION"/);
  assert.match(serviceWorker, /self\.addEventListener\("notificationclick"/);
  assert.match(serviceWorker, /self\.clients\.openWindow\(target\)/);
  assert.match(serviceWorker, /if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/);
  assert.doesNotMatch(serviceWorker, /cache\.addAll\([^)]*\/api\//);
});

test("ProfilePanel exposes real user-action notification opt-in through PWA service", () => {
  assert.match(profilePanel, /enablePhoneNotifications/);
  assert.match(profilePanel, /checkPhoneNotificationStatus/);
  assert.match(profilePanel, /enablePhoneNotifications/);
  assert.match(pwaService, /Notification\.requestPermission\(\)/);
  assert.match(pwaService, /pushManager\.subscribe/);
  assert.match(pwaService, /\/api\/notifications\/subscriptions/);
  assert.match(pwaService, /applicationServerKey/);
});
