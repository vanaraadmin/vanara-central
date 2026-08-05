import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mentionedUsernames, normalizeMessageInput } from "../src/services/chat.service.ts";

test("chat message input requires non-empty body", () => {
  assert.throws(() => normalizeMessageInput({ body: "   " }), /Message body is required/);
});

test("chat message input keeps bilingual structure in one record", () => {
  const input = normalizeMessageInput({
    body: "Room 5 is ready.",
    bodyLanguage: "en",
    translatedBody: "ห้อง 5 พร้อมแล้วค่ะ",
    translatedLanguage: "th",
  });

  assert.deepEqual(input, {
    body: "Room 5 is ready.",
    bodyLanguage: "en",
    translatedBody: "ห้อง 5 พร้อมแล้วค่ะ",
    translatedLanguage: "th",
  });
});

test("internal Chat stays separated from Guest Messages and remains the global bubble entrypoint", () => {
  const floatingTeamChat = readFileSync(new URL("../../src/components/FloatingTeamChat.tsx", import.meta.url), "utf8");
  const floatingTeamChatCss = readFileSync(new URL("../../src/styles/FloatingTeamChat.css", import.meta.url), "utf8");
  const workspaceShell = readFileSync(new URL("../../src/components/WorkspaceShell.tsx", import.meta.url), "utf8");
  const chatPage = readFileSync(new URL("../../src/pages/ChatPage.tsx", import.meta.url), "utf8");
  const chatService = readFileSync(new URL("../../src/services/chat.service.ts", import.meta.url), "utf8");
  const messagesPage = readFileSync(new URL("../../src/pages/MessagesPage.tsx", import.meta.url), "utf8");

  assert.match(floatingTeamChat, /to="\/chat"/);
  assert.match(floatingTeamChat, /user\.data\.views\.includes\("staff"\)/);
  assert.match(floatingTeamChat, /module === "chat" && permission\.canAccess/);
  assert.match(floatingTeamChat, /loadChatUnreadSummary/);
  assert.match(chatService, /\/api\/chat\/conversations/);
  assert.match(chatService, /\/api\/chat\/private/);
  assert.match(chatService, /\/api\/chat\/summary/);
  assert.match(workspaceShell, /vc-floating-ui-suppressed/);
  assert.match(floatingTeamChatCss, /:root\.vc-floating-ui-suppressed \.staff-chat/);
  assert.doesNotMatch(floatingTeamChat + chatPage + chatService, /messages\.service|MessagesPage|\/api\/messages|\/sync\/messages|guest-messages/i);
  assert.match(messagesPage, /loadGuestMessageInbox/);
});

test("persistent chat bubble reads as a Vanara-owned LINE-like app icon", () => {
  const floatingTeamChat = readFileSync(new URL("../../src/components/FloatingTeamChat.tsx", import.meta.url), "utf8");
  const floatingTeamChatCss = readFileSync(new URL("../../src/styles/FloatingTeamChat.css", import.meta.url), "utf8");

  assert.doesNotMatch(floatingTeamChat, /staff-chat__orb-label|aria-hidden="true">Team</);
  assert.match(floatingTeamChatCss, /\.staff-chat__orb\s*\{[^}]*border-radius:\s*19px/);
  assert.doesNotMatch(floatingTeamChatCss, /\.staff-chat__orb\s*\{[^}]*border-radius:\s*50%/);
  assert.match(floatingTeamChatCss, /\.staff-chat__orb\s*\{[^}]*background:\s*linear-gradient\([^;]*#24805c[^;]*#176044[^;]*#0e3d2d/);
  assert.match(floatingTeamChatCss, /\.staff-chat__orb \.staff-chat-icon__bubble\s*\{[^}]*width:\s*48px[^}]*height:\s*34px/);
  assert.match(floatingTeamChatCss, /\.staff-chat-icon__bubble\s*\{[^}]*background:\s*#fffdf6/);
  assert.match(floatingTeamChatCss, /\.staff-chat__orb \.staff-chat-icon__bubble span\s*\{[^}]*background:\s*#176044/);
  assert.doesNotMatch(floatingTeamChat + floatingTeamChatCss, />\s*LINE\s*<|line-logo|LINE_New_App_Icon|wechat-logo|whatsapp-logo/i);
});

test("chat foundation is additive and separates group/private participants", () => {
  const migration = readFileSync(new URL("../migrations/0032_internal_chat_conversations.sql", import.meta.url), "utf8");

  assert.match(migration, /ALTER TABLE chat_conversations ADD COLUMN conversation_kind/);
  assert.match(migration, /CHECK \(conversation_kind IN \('GROUP', 'PRIVATE'\)\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS chat_conversation_participants/);
  assert.match(migration, /PRIMARY KEY \(conversation_id, user_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS chat_message_mentions/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_private_pair/);
  assert.match(migration, /WHERE conversation_kind = 'PRIVATE'/);
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b|\bDELETE\s+FROM\s+chat_messages\b|\bDELETE\s+FROM\s+chat_conversations\b/i);
});

test("chat service enforces participant privacy and no owner private bypass", () => {
  const service = readFileSync(new URL("../src/services/chat.service.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

  assert.match(service, /function privatePairKey/);
  assert.match(service, /async function requireParticipant/);
  assert.match(service, /participantExists\(env, conversationId, user\.id\)/);
  assert.match(service, /throw new Error\("Chat conversation not found\."\)/);
  assert.match(service, /chat_conversation_participants p/);
  assert.match(service, /WHERE p\.user_id = \?/);
  assert.match(service, /openPrivateChat\(env: ChatBindings, user: CurrentChatUser, targetUserId: string\)/);
  assert.match(service, /INSERT OR IGNORE INTO chat_conversation_participants/);
  assert.doesNotMatch(service, /isOwner|Owner access|requireOwner/i);
  assert.match(server, /const user = await chatMember\(c\)/);
  assert.match(server, /openPrivateChat\(c\.env, user, targetUserId\)/);
  assert.doesNotMatch(server, /authenticated\(c, "chat", "edit"\)/);
});

test("chat page renders LINE-like conversation list and private picker without corporate cards", () => {
  const page = readFileSync(new URL("../../src/pages/ChatPage.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../src/styles/ChatPage.css", import.meta.url), "utf8");

  assert.match(page, /ConversationRow/);
  assert.match(page, /ConversationAvatar/);
  assert.match(page, /lastMessagePreview/);
  assert.match(page, /unreadCount/);
  assert.match(page, /mentionCount/);
  assert.match(page, /Vanara Group Chat/);
  assert.match(page, /openPrivateChat/);
  assert.match(page, /markChatConversationRead/);
  assert.doesNotMatch(page, /ContextCard|Operational context|Open context/);
  assert.match(css, /\.chat-list-row/);
  assert.match(css, /\.chat-avatar/);
  assert.match(css, /\.chat-thread-message\.is-outgoing/);
  assert.match(css, /\.chat-list-row__badge/);
});

test("mentions are normalized by username for unread mention badges", () => {
  assert.deepEqual(mentionedUsernames("Nun please check @Nun and @stefano."), ["nun", "stefano"]);
  assert.deepEqual(mentionedUsernames("email@example.com is not a chat mention"), []);
});
