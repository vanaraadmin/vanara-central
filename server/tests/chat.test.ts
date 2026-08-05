import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeMessageInput } from "../src/services/chat.service.ts";

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
  assert.match(chatService, /\/api\/chat\/conversations/);
  assert.match(workspaceShell, /vc-floating-ui-suppressed/);
  assert.match(floatingTeamChatCss, /:root\.vc-floating-ui-suppressed \.staff-chat/);
  assert.doesNotMatch(floatingTeamChat + chatPage + chatService, /messages\.service|MessagesPage|\/api\/messages|\/sync\/messages|guest-messages/i);
  assert.match(messagesPage, /loadGuestMessageInbox/);
});
