import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  mentionedUsernames,
  normalizeAnnouncementInput,
  normalizeChatAttachmentInput,
  normalizeGroupChatInput,
  normalizeMessageInput,
  normalizeReactionInput,
} from "../src/services/chat.service.ts";
import { CHAT_STICKERS } from "../src/services/chat-stickers.service.ts";

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
    messageKind: "TEXT",
    body: "Room 5 is ready.",
    bodyLanguage: "en",
    translatedBody: "ห้อง 5 พร้อมแล้วค่ะ",
    translatedLanguage: "th",
    replyToMessageId: null,
    stickerId: null,
  });
});

test("chat message input accepts one reply target and validates message actions", () => {
  assert.deepEqual(normalizeMessageInput({ body: "On it", replyToMessageId: 42 }), {
    messageKind: "TEXT",
    body: "On it",
    bodyLanguage: "en",
    translatedBody: null,
    translatedLanguage: null,
    replyToMessageId: 42,
    stickerId: null,
  });
  assert.throws(() => normalizeMessageInput({ body: "On it", replyToMessageId: 0 }), /Reply target is invalid/);
  assert.deepEqual(normalizeReactionInput({ emoji: "🙏" }), { emoji: "🙏" });
  assert.throws(() => normalizeReactionInput({ emoji: "LINE" }), /Reaction is not supported/);
  assert.deepEqual(normalizeAnnouncementInput({ messageId: 9 }), { messageId: 9 });
  assert.throws(() => normalizeAnnouncementInput({ messageId: -1 }), /Announcement message is invalid/);
});

test("chat stickers and attachments normalize safely", () => {
  const sticker = CHAT_STICKERS[0]!;
  assert.ok(CHAT_STICKERS.length >= 50);
  assert.deepEqual(normalizeMessageInput({ messageKind: "STICKER", stickerId: sticker.id }), {
    messageKind: "STICKER",
    body: `Sticker: ${sticker.label}`,
    bodyLanguage: "en",
    translatedBody: null,
    translatedLanguage: null,
    replyToMessageId: null,
    stickerId: sticker.id,
  });
  assert.throws(() => normalizeMessageInput({ messageKind: "STICKER", stickerId: "line-logo" }), /Sticker is not supported/);

  const okForm = new FormData();
  okForm.set("file", new File(["hello"], "note.txt", { type: "text/plain" }));
  okForm.set("replyToMessageId", "42");
  const normalized = normalizeChatAttachmentInput(okForm);
  assert.equal(normalized.file.name, "note.txt");
  assert.equal(normalized.replyToMessageId, 42);

  const badForm = new FormData();
  badForm.set("file", new File(["alert"], "bad.js", { type: "text/javascript" }));
  assert.throws(() => normalizeChatAttachmentInput(badForm), /Attachment type is not supported/);
});

test("chat group input requires a name and at least two selected team members", () => {
  assert.deepEqual(normalizeGroupChatInput({
    title: " Chat Ristorante ",
    participantIds: ["u2", "u3", "u2"],
  }), {
    title: "Chat Ristorante",
    participantIds: ["u2", "u3"],
  });
  assert.throws(() => normalizeGroupChatInput({ title: "A", participantIds: ["u2", "u3"] }), /2 to 80/);
  assert.throws(() => normalizeGroupChatInput({ title: "Team", participantIds: ["u2"] }), /at least two/);
});

test("internal Chat stays separated from Guest Messages and remains the global bubble entrypoint", () => {
  const floatingTeamChat = readFileSync(new URL("../../src/components/FloatingTeamChat.tsx", import.meta.url), "utf8");
  const floatingTeamChatCss = readFileSync(new URL("../../src/styles/FloatingTeamChat.css", import.meta.url), "utf8");
  const workspaceShell = readFileSync(new URL("../../src/components/WorkspaceShell.tsx", import.meta.url), "utf8");
  const chatPage = readFileSync(new URL("../../src/pages/ChatPage.tsx", import.meta.url), "utf8");
  const teamChatSurface = readFileSync(new URL("../../src/components/chat/TeamChatSurface.tsx", import.meta.url), "utf8");
  const appRouter = readFileSync(new URL("../../src/router/AppRouter.tsx", import.meta.url), "utf8");
  const chatService = readFileSync(new URL("../../src/services/chat.service.ts", import.meta.url), "utf8");
  const messagesPage = readFileSync(new URL("../../src/pages/MessagesPage.tsx", import.meta.url), "utf8");

  assert.match(floatingTeamChat, /TeamChatSurface/);
  assert.match(floatingTeamChat, /staff-chat-overlay/);
  assert.doesNotMatch(floatingTeamChat, /Team chat is ready|Open chat|<Link/);
  assert.match(floatingTeamChat, /user\.data\.views\.includes\("staff"\)/);
  assert.match(floatingTeamChat, /module === "chat" && permission\.canAccess/);
  assert.match(floatingTeamChat, /loadChatUnreadSummary/);
  assert.match(chatService, /\/api\/chat\/conversations/);
  assert.match(chatService, /\/api\/chat\/private/);
  assert.match(chatService, /\/api\/chat\/groups/);
  assert.match(chatService, /\/api\/chat\/summary/);
  assert.match(appRouter, /<Route path="chat" element=\{<ChatPage \/>\}/);
  assert.match(appRouter, /<Route path="chat\/:conversationId" element=\{<ChatPage \/>\}/);
  assert.match(workspaceShell, /vc-floating-ui-suppressed/);
  assert.match(floatingTeamChatCss, /:root\.vc-floating-ui-suppressed \.staff-chat/);
  assert.doesNotMatch(floatingTeamChat + chatPage + teamChatSurface + chatService, /messages\.service|MessagesPage|\/api\/messages|\/sync\/messages|guest-messages/i);
  assert.match(messagesPage, /loadGuestMessageInbox/);
});

test("floating chat bubble opens direct app overlay with drag-down close", () => {
  const floatingTeamChat = readFileSync(new URL("../../src/components/FloatingTeamChat.tsx", import.meta.url), "utf8");
  const floatingTeamChatCss = readFileSync(new URL("../../src/styles/FloatingTeamChat.css", import.meta.url), "utf8");

  assert.match(floatingTeamChat, /className="staff-chat-overlay"/);
  assert.match(floatingTeamChat, /role="dialog"/);
  assert.match(floatingTeamChat, /aria-modal="true"/);
  assert.match(floatingTeamChat, /className="staff-chat-overlay__grab-zone"/);
  assert.match(floatingTeamChat, /onPointerDown=\{handleDragStart\}/);
  assert.match(floatingTeamChat, /onPointerMove=\{handleDragMove\}/);
  assert.match(floatingTeamChat, /onPointerUp=\{handleDragEnd\}/);
  assert.match(floatingTeamChat, /setPointerCapture/);
  assert.match(floatingTeamChat, /dragOffset > 92/);
  assert.match(floatingTeamChat, /window\.addEventListener\("keydown", closeOnEscape\)/);
  assert.match(floatingTeamChat, /vc-chat-overlay-open/);
  assert.match(floatingTeamChat, /overlayMobileView === "thread"/);
  assert.match(floatingTeamChat, /setOverlayMobileView\("list"\)/);
  assert.match(floatingTeamChat, /handleOverlayCloseIntent/);
  assert.match(floatingTeamChat, /body\.style\.position = "fixed"/);
  assert.match(floatingTeamChat, /\{!isOpen && \(/);
  assert.match(floatingTeamChat, /onMobileViewChange=\{setOverlayMobileView\}/);
  assert.match(floatingTeamChat, /mobileView=\{overlayMobileView\}/);
  assert.doesNotMatch(floatingTeamChat, /visualViewport|--vc-chat-viewport-height/);
  assert.doesNotMatch(floatingTeamChat, /to="\/chat"|Team chat is ready|Open chat/);
  assert.match(floatingTeamChatCss, /\.staff-chat-overlay__sheet\s*\{[^}]*--vc-chat-top-gap:\s*calc\(env\(safe-area-inset-top\) \+ 18px\)[^}]*top:\s*var\(--vc-chat-top-gap\)/);
  assert.match(floatingTeamChatCss, /\.staff-chat-overlay__sheet\s*\{[^}]*bottom:\s*max\(8px, env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(floatingTeamChatCss, /--vc-chat-viewport-height|visualViewport/);
  assert.match(floatingTeamChatCss, /\.staff-chat-overlay__grab-zone\s*\{[^}]*min-height:\s*58px/);
  assert.match(floatingTeamChatCss, /\.staff-chat-overlay \.chat-app\s*\{[^}]*height:\s*100%/);
  assert.match(floatingTeamChatCss, /:root\.vc-chat-overlay-open,\s*body\.vc-chat-overlay-open\s*\{[^}]*overflow:\s*hidden[^}]*overscroll-behavior:\s*none/);
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
  const interactionsMigration = readFileSync(new URL("../migrations/0033_internal_chat_message_interactions.sql", import.meta.url), "utf8");
  const attachmentsMigration = readFileSync(new URL("../migrations/0034_internal_chat_attachments.sql", import.meta.url), "utf8");

  assert.match(migration, /ALTER TABLE chat_conversations ADD COLUMN conversation_kind/);
  assert.match(migration, /CHECK \(conversation_kind IN \('GROUP', 'PRIVATE'\)\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS chat_conversation_participants/);
  assert.match(migration, /PRIMARY KEY \(conversation_id, user_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS chat_message_mentions/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_private_pair/);
  assert.match(migration, /WHERE conversation_kind = 'PRIVATE'/);
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b|\bDELETE\s+FROM\s+chat_messages\b|\bDELETE\s+FROM\s+chat_conversations\b/i);
  assert.match(interactionsMigration, /ALTER TABLE chat_messages ADD COLUMN reply_to_message_id/);
  assert.match(interactionsMigration, /ALTER TABLE chat_conversations ADD COLUMN announced_message_id/);
  assert.match(interactionsMigration, /CREATE TABLE IF NOT EXISTS chat_message_reactions/);
  assert.match(interactionsMigration, /PRIMARY KEY \(message_id, user_id\)/);
  assert.match(interactionsMigration, /CHECK \(emoji IN \('👍', '😂', '😍', '🙏', '👀', '🔥'\)\)/);
  assert.doesNotMatch(interactionsMigration, /\bDROP\s+TABLE\b|\bDELETE\s+FROM\s+chat_messages\b|\bDELETE\s+FROM\s+chat_conversations\b/i);
  assert.match(attachmentsMigration, /ALTER TABLE chat_messages ADD COLUMN message_kind TEXT NOT NULL DEFAULT 'TEXT'/);
  assert.match(attachmentsMigration, /CHECK \(message_kind IN \('TEXT', 'STICKER', 'ATTACHMENT'\)\)/);
  assert.match(attachmentsMigration, /ALTER TABLE chat_messages ADD COLUMN sticker_id TEXT/);
  assert.match(attachmentsMigration, /ALTER TABLE chat_messages ADD COLUMN attachment_object_key TEXT/);
  assert.match(attachmentsMigration, /CREATE INDEX IF NOT EXISTS idx_chat_messages_attachment_expiry/);
  assert.match(attachmentsMigration, /CREATE INDEX IF NOT EXISTS idx_chat_messages_attachment_object/);
  assert.doesNotMatch(attachmentsMigration, /\bDROP\s+TABLE\b|\bDELETE\s+FROM\s+chat_messages\b|\bDELETE\s+FROM\s+chat_conversations\b/i);
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
  assert.match(service, /createGroupChat\(env: ChatBindings, user: CurrentChatUser, input: CreateGroupChatInput\)/);
  assert.match(service, /INSERT INTO chat_conversations \([\s\S]*conversation_kind[\s\S]*\) VALUES \(\?, 'GROUP'/);
  assert.match(service, /INSERT OR IGNORE INTO chat_conversation_participants/);
  assert.match(service, /private_avatar_photo_url/);
  assert.match(service, /avatarPhotoUrl: kind === "PRIVATE" \? row\.private_avatar_photo_url \?\? null : null/);
  assert.match(service, /u\.profile_photo_url AS author_profile_photo_url/);
  assert.match(service, /reply_to_message_id/);
  assert.match(service, /requireMessageInConversation\(env, conversationId, input\.replyToMessageId\)/);
  assert.match(service, /toggleChatMessageReaction/);
  assert.match(service, /ON CONFLICT\(message_id, user_id\) DO UPDATE SET/);
  assert.match(service, /setChatAnnouncement/);
  assert.match(service, /clearChatAnnouncement/);
  assert.match(service, /translateChatMessage/);
  assert.match(service, /translation_unavailable/);
  assert.match(service, /createChatAttachmentMessage/);
  assert.match(service, /getChatAttachmentDownload/);
  assert.match(service, /cleanupExpiredChatAttachments/);
  assert.match(service, /requireParticipant\(env, conversationId, user\)/);
  assert.match(service, /env\.R2_STORAGE\.put/);
  assert.match(service, /env\.R2_STORAGE\.get/);
  assert.match(service, /env\.R2_STORAGE\.delete/);
  assert.match(service, /CHAT_ATTACHMENT_RETENTION_DAYS = 45/);
  assert.match(service, /MAX_CHAT_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/);
  assert.match(service, /BLOCKED_ATTACHMENT_EXTENSIONS/);
  assert.doesNotMatch(service, /isOwner|Owner access|requireOwner/i);
  assert.match(server, /const user = await chatMember\(c\)/);
  assert.match(server, /openPrivateChat\(c\.env, user, targetUserId\)/);
  assert.match(server, /app\.post\("\/api\/chat\/groups"/);
  assert.match(server, /createGroupChat\(c\.env, user, input\)/);
  assert.match(server, /\/api\/chat\/conversations\/:id\/messages\/:messageId\/reactions/);
  assert.match(server, /\/api\/chat\/conversations\/:id\/messages\/:messageId\/translate/);
  assert.match(server, /\/api\/chat\/conversations\/:id\/announcement/);
  assert.match(server, /\/api\/chat\/conversations\/:id\/attachments/);
  assert.match(server, /\/api\/chat\/conversations\/:id\/messages\/:messageId\/attachment/);
  assert.match(server, /normalizeChatAttachmentInput/);
  assert.match(server, /cleanupExpiredChatAttachments/);
  assert.match(server, /app\.delete\("\/api\/chat\/conversations\/:id\/announcement"/);
  assert.doesNotMatch(server, /authenticated\(c, "chat", "edit"\)/);
  assert.doesNotMatch(service + server, /translate\.googleapis|GOOGLE_TRANSLATE|DEEPL|Google Cloud Translation/i);
});

test("chat page renders LINE-like conversation list and private picker without corporate cards", () => {
  const page = readFileSync(new URL("../../src/components/chat/TeamChatSurface.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../src/styles/ChatPage.css", import.meta.url), "utf8");

  assert.match(page, /ConversationRow/);
  assert.match(page, /ConversationAvatar/);
  assert.match(page, /lastMessagePreview/);
  assert.match(page, /unreadCount/);
  assert.match(page, /mentionCount/);
  assert.match(page, /hasUnread/);
  assert.match(page, /chat-app--mobile-\$\{currentMobileView\}/);
  assert.match(page, /onMobileViewChange\("thread"\)/);
  assert.doesNotMatch(page, /Back to chat list|chat-thread__back|ChatToolIcon type="back"/);
  assert.match(page, />New Chat</);
  assert.match(page, />New Group Chat</);
  assert.match(page, /ChatToolIcon type="user"/);
  assert.match(page, /ChatToolIcon type="group"/);
  assert.match(page, /setPickerKind\("private"\)/);
  assert.match(page, /setPickerKind\("group"\)/);
  assert.match(page, /openGroupChat/);
  assert.match(page, /Create Group/);
  assert.match(page, /kind === "private"/);
  assert.match(page, /kind === "group"/);
  assert.match(page, /selectedUserIds\.length === 1/);
  assert.doesNotMatch(page, />Private<|>Group<\/h3>|chat-picker__section|chat-picker__people/);
  assert.match(page, /Vanara Group Chat/);
  assert.match(page, /vanaraLogo/);
  assert.match(page, /conversation\.isMainGroup/);
  assert.match(page, /photoUrl=\{conversation\.avatarPhotoUrl\}/);
  assert.match(page, /photoUrl=\{message\.author\.profilePhotoUrl\}/);
  assert.match(page, /draggable=\{false\}/);
  assert.match(page, /openPrivateChat/);
  assert.match(page, /markChatConversationRead/);
  assert.match(page, /conversation\.announcement/);
  assert.match(page, /chat-announcement/);
  assert.match(page, /clearAnnouncementMutation/);
  assert.doesNotMatch(page, /ContextCard|Operational context|Open context/);
  assert.match(css, /\.chat-list-row/);
  assert.match(css, /\.chat-list-row\.has-unread \.chat-list-row__main strong/);
  assert.match(css, /\.chat-avatar/);
  assert.match(css, /\.chat-avatar--vanara/);
  assert.match(css, /\.chat-avatar--group/);
  assert.match(css, /\.chat-thread-message\.is-outgoing/);
  assert.match(css, /\.chat-list-row__badge/);
  assert.match(css, /\.chat-app--mobile-list \.chat-thread,\s*\.chat-app--mobile-thread \.chat-list\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.chat-list__actions/);
  assert.doesNotMatch(css, /\.chat-thread__back|\.chat-tool-icon--back/);
});

test("chat thread and composer follow LINE-like message patterns without voice or guest-message coupling", () => {
  const page = readFileSync(new URL("../../src/components/chat/TeamChatSurface.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../src/styles/ChatPage.css", import.meta.url), "utf8");
  const service = readFileSync(new URL("../../src/services/chat.service.ts", import.meta.url), "utf8");
  const stickerCatalog = readFileSync(new URL("../../src/config/chatStickers.ts", import.meta.url), "utf8");
  const serverStickerCatalog = readFileSync(new URL("../src/services/chat-stickers.service.ts", import.meta.url), "utf8");

  assert.match(page, /conversation\.kind === "GROUP" \? "Vanara Group Chat" : conversation\.title/);
  assert.match(page, /ChatToolIcon type="plus"/);
  assert.match(page, /ChatToolIcon type="camera"/);
  assert.match(page, /ChatToolIcon type="gallery"/);
  assert.match(page, /ChatToolIcon type="sticker"/);
  assert.match(page, /ChatToolIcon type="send"/);
  assert.match(page, /uploadChatAttachment/);
  assert.match(page, /fileInputRef/);
  assert.match(page, /cameraInputRef/);
  assert.match(page, /galleryInputRef/);
  assert.match(page, /type="file"/);
  assert.match(page, /accept="image\/\*"/);
  assert.match(page, /capture="environment"/);
  assert.match(page, /CHAT_STICKERS\.map/);
  assert.match(page, /message\.messageKind === "STICKER"/);
  assert.match(page, /message\.messageKind === "ATTACHMENT"/);
  assert.match(page, /File no longer available/);
  assert.match(page, /message\.attachment\.downloadUrl/);
  assert.match(page, /message\.messageKind === "TEXT"/);
  assert.doesNotMatch(page, /aria-label="Attach file" disabled|aria-label="Open camera" disabled|aria-label="Choose image" disabled/);
  assert.match(page, /isFocused/);
  assert.match(page, /exitFocusMode/);
  assert.match(page, /aria-label="Exit writing mode"/);
  assert.match(page, /inputRef\.current\?\.blur\(\)/);
  assert.match(page, /placeholder="Aa"/);
  assert.match(page, /ChatContextMenuState/);
  assert.match(page, /ChatMessageContextMenu/);
  assert.match(page, /createPortal\(layer, document\.body\)/);
  assert.match(page, /onPointerDown=\{handlePointerDown\}/);
  assert.match(page, /window\.setTimeout\(\(\) => requestMenu\(element\), 520\)/);
  assert.match(page, /onContextMenu=\{handleContextMenu\}/);
  assert.match(page, /window\.getSelection\?\.\(\)\?\.removeAllRanges\(\)/);
  assert.match(page, /preventNativeChatContextMenu/);
  assert.match(page, /onContextMenu=\{preventNativeChatContextMenu\}/);
  assert.match(page, /const contextable = !outgoing && message\.messageKind === "TEXT"/);
  assert.match(page, /if \(!contextable\) return/);
  assert.match(page, /window\.visualViewport/);
  assert.match(page, /window\.innerWidth/);
  assert.match(page, /window\.innerHeight/);
  assert.match(page, /Math\.min\(Math\.max/);
  assert.match(page, /getBoundingClientRect\(\)/);
  assert.match(page, /const fallbackWidth = 286/);
  assert.match(page, /event\.target\.closest\("button, a, input, textarea, select, \[contenteditable='true'\]"\)/);
  assert.doesNotMatch(page, /fallbackWidth = 220|calc\(100vw - 232px\)|left:\s*`min\(max/);
  assert.match(page, />Copia</);
  assert.match(page, />Rispondi</);
  assert.match(page, />Translate</);
  assert.match(page, />Annuncia</);
  assert.match(page, /QUICK_REACTIONS/);
  assert.match(page, /navigator\.clipboard/);
  assert.match(page, /replyTarget/);
  assert.match(page, /replyToMessageId/);
  assert.match(page, /chat-composer__reply-preview/);
  assert.match(page, /chat-composer__focus-row/);
  assert.match(page, /data-chat-message-id/);
  assert.match(page, /scrollIntoView/);
  assert.match(page, /is-highlighted/);
  assert.match(page, /translateMutation/);
  assert.match(page, /Translation is not available yet/);
  assert.match(page, /chat-thread-message__reactions/);
  assert.doesNotMatch(page + css, /microphone|Voice|voice|mic|audio/i);
  assert.ok((stickerCatalog.match(/\bid:/g) ?? []).length >= 50);
  assert.doesNotMatch(stickerCatalog + serverStickerCatalog, /LINE_New_App_Icon|Doraemon|line-logo|wechat-logo|whatsapp-logo/i);
  assert.match(css, /\.chat-thread-message__bubble\s*\{[^}]*background:\s*#fffdf6/);
  assert.match(css, /\.chat-thread-message\.is-outgoing \.chat-thread-message__bubble\s*\{[^}]*color:\s*#fffdf6[^}]*background:\s*linear-gradient\([^;]*#1f6a4d[^;]*#0f3d2d/);
  assert.match(css, /\.chat-composer\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(css, /\.chat-composer\.is-focused\s*\{[^}]*grid-template-rows:\s*auto auto/);
  assert.match(css, /\.chat-composer__focus-row\s*\{[^}]*grid-column:\s*2 \/ -1/);
  assert.match(css, /\.chat-composer__field input\s*\{[^}]*-webkit-user-select:\s*text[^}]*user-select:\s*text/);
  assert.match(css, /\.chat-composer__tools button,\s*\.chat-composer__send\s*\{[^}]*width:\s*46px[^}]*height:\s*46px/);
  assert.match(css, /\.chat-tool-icon\s*\{[^}]*width:\s*26px[^}]*height:\s*26px/);
  assert.match(css, /\.chat-tool-icon--camera/);
  assert.match(css, /\.chat-tool-icon--gallery/);
  assert.match(css, /\.chat-tool-icon--sticker/);
  assert.match(css, /\.chat-tool-icon--send/);
  assert.match(css, /\.chat-sticker-drawer/);
  assert.match(css, /\.chat-sticker\s*\{[^}]*min-height:\s*76px/);
  assert.match(css, /\.chat-thread-message__bubble--sticker/);
  assert.match(css, /\.chat-thread-message__sticker/);
  assert.match(css, /\.chat-thread-message__attachment/);
  assert.match(css, /\.chat-thread-message__attachment--missing/);
  assert.match(css, /\.chat-composer__file-input\s*\{[^}]*display:\s*none/);
  assert.match(css, /\.chat-context-menu/);
  assert.match(css, /\.chat-context-menu\s*\{[^}]*box-sizing:\s*border-box[^}]*width:\s*min\(286px,\s*calc\(100vw - 24px\)\)[^}]*max-width:\s*calc\(100vw - 24px\)[^}]*overflow:\s*hidden/);
  assert.doesNotMatch(css, /width:\s*min\(220px,\s*calc\(100vw - 24px\)\)/);
  assert.match(css, /\.chat-context-menu \*,\s*\.chat-context-menu \*::before,\s*\.chat-context-menu \*::after\s*\{[^}]*box-sizing:\s*border-box/);
  assert.match(css, /\.chat-app\s*\{[^}]*-webkit-touch-callout:\s*none[^}]*-webkit-user-select:\s*none[^}]*user-select:\s*none/);
  assert.match(css, /\.chat-thread\s*\{[^}]*-webkit-touch-callout:\s*none[^}]*-webkit-user-select:\s*none[^}]*user-select:\s*none/);
  assert.match(css, /\.chat-avatar img\s*\{[^}]*-webkit-user-drag:\s*none/);
  assert.match(css, /\.chat-thread-message__bubble\s*\{[^}]*-webkit-touch-callout:\s*none[^}]*-webkit-user-select:\s*none[^}]*user-select:\s*none/);
  assert.match(css, /\.chat-context-menu__reactions\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0, 1fr\)\)[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*overflow:\s*hidden/);
  assert.match(css, /\.chat-context-menu__reactions button\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
  assert.match(css, /\.chat-context-menu__actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0, 1fr\)\)[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*overflow:\s*hidden/);
  assert.match(css, /\.chat-context-menu__actions button\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.chat-announcement/);
  assert.match(css, /\.chat-composer__reply-preview/);
  assert.match(css, /\.chat-thread-message__quote/);
  assert.match(css, /\.chat-thread-message__translation--error/);
  assert.match(css, /\.chat-thread-message__reactions/);
  assert.doesNotMatch(page + service, /\/api\/messages|messages\.service|MessagesPage|guest-messages/i);
  assert.match(service, /\/api\/chat\/conversations\/\$\{id\}\/attachments/);
  assert.doesNotMatch(service, /R2|public bucket|\/api\/messages/i);
});

test("mentions are normalized by username for unread mention badges", () => {
  assert.deepEqual(mentionedUsernames("Nun please check @Nun and @stefano."), ["nun", "stefano"]);
  assert.deepEqual(mentionedUsernames("email@example.com is not a chat mention"), []);
});
