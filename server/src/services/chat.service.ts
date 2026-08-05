import type { CurrentUser } from "./current-user.service.js";
import { chatStickerById } from "./chat-stickers.service.js";

export type ChatContextType = "general" | "room" | "maintenance" | "housekeeping" | "movement";
export type ChatConversationKind = "GROUP" | "PRIVATE";
export type ChatLanguage = "en" | "th";

export interface ChatBindings {
  DB: D1Database;
  R2_STORAGE: R2Bucket;
}

export type CurrentChatUser = CurrentUser;

interface ChatConversationRow {
  conversation_id: string;
  conversation_kind?: ChatConversationKind | null;
  context_type: ChatContextType;
  context_id: string | null;
  title: string;
  subtitle: string | null;
  status: string;
  priority: string | null;
  participant_count: number;
  created_at: string;
  updated_at: string;
  private_pair_key?: string | null;
  last_message_at?: string | null;
  message_count?: number | null;
  last_message_body?: string | null;
  last_message_author_id?: string | null;
  private_title?: string | null;
  private_username?: string | null;
  private_avatar_photo_url?: string | null;
  unread_count?: number | null;
  mention_count?: number | null;
  announced_message_id?: number | null;
  announced_by_user_id?: string | null;
  announced_at?: string | null;
  announced_author_display_name?: string | null;
  announced_body?: string | null;
}

interface ChatMessageRow {
  message_id: number;
  conversation_id: string;
  author_id: string;
  author_display_name: string;
  author_role: string;
  body: string;
  body_language: ChatLanguage;
  translated_body: string | null;
  translated_language: ChatLanguage | null;
  reply_to_message_id?: number | null;
  reply_author_display_name?: string | null;
  reply_body?: string | null;
  message_kind?: ChatMessageKind | null;
  sticker_id?: string | null;
  attachment_object_key?: string | null;
  attachment_file_name?: string | null;
  attachment_content_type?: string | null;
  attachment_byte_size?: number | null;
  attachment_expires_at?: string | null;
  attachment_unavailable_at?: string | null;
  author_profile_photo_url?: string | null;
  created_at: string;
}

interface ChatReactionRow {
  message_id: number;
  emoji: ChatReactionEmoji;
  total: number;
  reacted_by_me: number;
}

interface ChatUserRow {
  user_id: string;
  display_name?: string;
  full_name?: string;
  username: string;
  role: string;
  profile_photo_url: string | null;
}

export interface ChatUser {
  id: string;
  displayName: string;
  username: string;
  role: string;
  profilePhotoUrl: string | null;
}

export interface ChatConversation {
  id: string;
  kind: ChatConversationKind;
  isMainGroup: boolean;
  contextType: ChatContextType;
  contextId: string | null;
  title: string;
  subtitle: string | null;
  status: string;
  priority: string | null;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageAuthorId: string | null;
  messageCount: number;
  unreadCount: number;
  mentionCount: number;
  avatarLabel: string;
  avatarPhotoUrl: string | null;
  announcement: ChatAnnouncement | null;
}

export interface ChatAnnouncement {
  messageId: number;
  authorDisplayName: string;
  bodyPreview: string;
  announcedByUserId: string | null;
  announcedAt: string;
}

export type ChatReactionEmoji = "👍" | "😂" | "😍" | "🙏" | "👀" | "🔥";

export type ChatMessageKind = "TEXT" | "STICKER" | "ATTACHMENT";

export interface ChatMessageReaction {
  emoji: ChatReactionEmoji;
  count: number;
  reactedByMe: boolean;
}

export interface ChatMessageReply {
  messageId: number;
  authorDisplayName: string;
  bodyPreview: string;
}

export interface ChatMessage {
  id: number;
  conversationId: string;
  messageKind: ChatMessageKind;
  author: {
    id: string;
    displayName: string;
    role: string;
    profilePhotoUrl: string | null;
  };
  body: string;
  bodyLanguage: ChatLanguage;
  translatedBody: string | null;
  translatedLanguage: ChatLanguage | null;
  stickerId: string | null;
  attachment: ChatAttachment | null;
  replyTo: ChatMessageReply | null;
  reactions: ChatMessageReaction[];
  mentionUsernames: string[];
  createdAt: string;
}

export interface CreateChatMessageInput {
  messageKind: ChatMessageKind;
  body: string;
  bodyLanguage?: ChatLanguage;
  translatedBody?: string | null;
  translatedLanguage?: ChatLanguage | null;
  replyToMessageId?: number | null;
  stickerId?: string | null;
}

export interface ChatAttachment {
  fileName: string;
  contentType: string;
  byteSize: number;
  expiresAt: string;
  unavailableAt: string | null;
  downloadUrl: string;
  isImage: boolean;
}

export interface CreateChatAttachmentInput {
  file: File;
  replyToMessageId: number | null;
}

export interface ChatAttachmentDownload {
  object: R2ObjectBody;
  fileName: string;
  contentType: string;
}

export interface CreateGroupChatInput {
  title: string;
  participantIds: string[];
}

export interface ChatReactionInput {
  emoji: ChatReactionEmoji;
}

export interface ChatAnnouncementInput {
  messageId: number;
}

export interface ChatUnreadSummary {
  unreadCount: number;
  mentionCount: number;
}

const MAIN_GROUP_CONVERSATION_ID = "general-operations";
const CHAT_ATTACHMENT_RETENTION_DAYS = 45;
const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const BLOCKED_ATTACHMENT_EXTENSIONS = new Set(["exe", "bat", "cmd", "com", "js", "mjs", "vbs", "ps1", "sh", "html", "htm", "svg"]);

function normalizeLanguage(value: unknown, fallback: ChatLanguage): ChatLanguage {
  return value === "th" || value === "en" ? value : fallback;
}

export function normalizeMessageInput(payload: unknown): CreateChatMessageInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Message body is required.");
  }

  const messageKind: ChatMessageKind = "messageKind" in payload && payload.messageKind === "STICKER" ? "STICKER" : "TEXT";
  const stickerId = "stickerId" in payload && typeof payload.stickerId === "string" ? payload.stickerId.trim() : null;
  const sticker = messageKind === "STICKER" && stickerId ? chatStickerById(stickerId) : null;
  if (messageKind === "STICKER" && !sticker) {
    throw new Error("Sticker is not supported.");
  }

  const rawBody = "body" in payload && typeof payload.body === "string" ? payload.body.trim() : "";
  const body = messageKind === "STICKER" ? `Sticker: ${sticker!.label}` : rawBody;
  if (!body) throw new Error("Message body is required.");
  if (body.length > 2000) throw new Error("Message body must be 2000 characters or less.");

  const translatedBody =
    "translatedBody" in payload && typeof payload.translatedBody === "string"
      ? payload.translatedBody.trim() || null
      : null;

  const bodyLanguage = normalizeLanguage("bodyLanguage" in payload ? payload.bodyLanguage : undefined, "en");
  const translatedLanguage = translatedBody
    ? normalizeLanguage("translatedLanguage" in payload ? payload.translatedLanguage : undefined, bodyLanguage === "en" ? "th" : "en")
    : null;
  const replyToMessageId = "replyToMessageId" in payload && payload.replyToMessageId !== null && payload.replyToMessageId !== undefined
    ? Number(payload.replyToMessageId)
    : null;
  if (replyToMessageId !== null && (!Number.isInteger(replyToMessageId) || replyToMessageId <= 0)) {
    throw new Error("Reply target is invalid.");
  }

  return {
    messageKind,
    body,
    bodyLanguage,
    translatedBody,
    translatedLanguage,
    replyToMessageId,
    stickerId: messageKind === "STICKER" ? stickerId : null,
  };
}

export function normalizeAttachmentReplyTarget(value: FormDataEntryValue | null): number | null {
  if (value === null || typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("Reply target is invalid.");
  return parsed;
}

export function normalizeChatAttachmentInput(formData: FormData): CreateChatAttachmentInput {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Attachment file is required.");
  validateChatAttachmentFile(file);
  return {
    file,
    replyToMessageId: normalizeAttachmentReplyTarget(formData.get("replyToMessageId")),
  };
}

export function normalizeReactionInput(payload: unknown): ChatReactionInput {
  if (!payload || typeof payload !== "object" || !("emoji" in payload) || typeof payload.emoji !== "string") {
    throw new Error("Reaction is required.");
  }
  if (!["👍", "😂", "😍", "🙏", "👀", "🔥"].includes(payload.emoji)) {
    throw new Error("Reaction is not supported.");
  }
  return { emoji: payload.emoji as ChatReactionEmoji };
}

export function normalizeAnnouncementInput(payload: unknown): ChatAnnouncementInput {
  if (!payload || typeof payload !== "object" || !("messageId" in payload)) {
    throw new Error("Announcement message is required.");
  }
  const messageId = Number(payload.messageId);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    throw new Error("Announcement message is invalid.");
  }
  return { messageId };
}

export function normalizeChatUserId(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("userId" in payload) || typeof payload.userId !== "string") {
    throw new Error("User is required.");
  }
  const userId = payload.userId.trim();
  if (!userId || userId.length > 120) throw new Error("User is invalid.");
  return userId;
}

export function normalizeGroupChatInput(payload: unknown): CreateGroupChatInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Group chat details are required.");
  }

  const title = "title" in payload && typeof payload.title === "string" ? payload.title.trim() : "";
  if (title.length < 2 || title.length > 80) {
    throw new Error("Group chat name must be 2 to 80 characters.");
  }

  const rawParticipantIds = "participantIds" in payload && Array.isArray(payload.participantIds)
    ? payload.participantIds
    : [];
  const participantIds = [...new Set(rawParticipantIds
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))];

  if (participantIds.length < 2) {
    throw new Error("Choose at least two team members.");
  }
  if (participantIds.length > 30 || participantIds.some((value) => value.length > 120)) {
    throw new Error("Group chat participants are invalid.");
  }

  return { title, participantIds };
}

export function mentionedUsernames(body: string): string[] {
  const usernames = new Set<string>();
  for (const match of body.matchAll(/(^|[\s([{@])@([a-z0-9._-]{2,40})/gi)) {
    const username = match[2]!.toLowerCase().replace(/[.,!?;:]+$/g, "");
    if (username.length >= 2) usernames.add(username);
  }
  return [...usernames];
}

function avatarLabel(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || cleaned[0]!.toUpperCase();
}

function privatePairKey(userA: string, userB: string): string {
  return [userA, userB].sort((a, b) => a.localeCompare(b)).join("::");
}

function mapUser(row: ChatUserRow): ChatUser {
  return {
    id: row.user_id,
    displayName: row.display_name ?? row.full_name ?? row.username,
    username: row.username,
    role: row.role,
    profilePhotoUrl: row.profile_photo_url,
  };
}

function mapConversation(row: ChatConversationRow): ChatConversation {
  const kind = row.conversation_kind ?? "GROUP";
  const title = kind === "PRIVATE" && row.private_title ? row.private_title : row.title;
  const preview = row.last_message_body?.trim() || "No messages yet";
  return {
    id: row.conversation_id,
    kind,
    isMainGroup: row.conversation_id === MAIN_GROUP_CONVERSATION_ID,
    contextType: row.context_type,
    contextId: row.context_id,
    title,
    subtitle: row.subtitle,
    status: row.status,
    priority: row.priority,
    participantCount: row.participant_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at ?? null,
    lastMessagePreview: preview,
    lastMessageAuthorId: row.last_message_author_id ?? null,
    messageCount: row.message_count ?? 0,
    unreadCount: row.unread_count ?? 0,
    mentionCount: row.mention_count ?? 0,
    avatarLabel: avatarLabel(title),
    avatarPhotoUrl: kind === "PRIVATE" ? row.private_avatar_photo_url ?? null : null,
    announcement: row.announced_message_id && row.announced_at
      ? {
        messageId: row.announced_message_id,
        authorDisplayName: row.announced_author_display_name ?? "Team",
        bodyPreview: previewText(row.announced_body ?? ""),
        announcedByUserId: row.announced_by_user_id ?? null,
        announcedAt: row.announced_at,
      }
      : null,
  };
}

function previewText(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > 96 ? `${compact.slice(0, 93)}...` : compact;
}

function isImageContentType(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith("image/"));
}

function mapAttachment(row: ChatMessageRow): ChatAttachment | null {
  if (!row.attachment_file_name || !row.attachment_content_type || !row.attachment_byte_size || !row.attachment_expires_at) {
    return null;
  }
  return {
    fileName: row.attachment_file_name,
    contentType: row.attachment_content_type,
    byteSize: row.attachment_byte_size,
    expiresAt: row.attachment_expires_at,
    unavailableAt: row.attachment_unavailable_at ?? null,
    downloadUrl: `/api/chat/conversations/${row.conversation_id}/messages/${row.message_id}/attachment`,
    isImage: isImageContentType(row.attachment_content_type),
  };
}

function mapMessage(row: ChatMessageRow, reactions: ChatMessageReaction[] = []): ChatMessage {
  return {
    id: row.message_id,
    conversationId: row.conversation_id,
    messageKind: row.message_kind ?? "TEXT",
    author: {
      id: row.author_id,
      displayName: row.author_display_name,
      role: row.author_role,
      profilePhotoUrl: row.author_profile_photo_url ?? null,
    },
    body: row.body,
    bodyLanguage: row.body_language,
    translatedBody: row.translated_body,
    translatedLanguage: row.translated_language,
    stickerId: row.sticker_id ?? null,
    attachment: mapAttachment(row),
    replyTo: row.reply_to_message_id
      ? {
        messageId: row.reply_to_message_id,
        authorDisplayName: row.reply_author_display_name ?? "Team",
        bodyPreview: previewText(row.reply_body ?? ""),
      }
      : null,
    reactions,
    mentionUsernames: mentionedUsernames(row.body),
    createdAt: row.created_at,
  };
}

function fileExtension(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match?.[1] ?? "";
}

function safeFileName(fileName: string): string {
  return fileName.trim().replace(/[^\w .()[\]-]+/g, "_").replace(/\s+/g, " ").slice(0, 120) || "attachment";
}

function validateChatAttachmentFile(file: File): void {
  if (file.size <= 0) throw new Error("Attachment file is empty.");
  if (file.size > MAX_CHAT_ATTACHMENT_BYTES) throw new Error("Attachment file is too large.");
  const extension = fileExtension(file.name);
  if (BLOCKED_ATTACHMENT_EXTENSIONS.has(extension)) throw new Error("Attachment type is not supported.");
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) throw new Error("Attachment type is not supported.");
}

function attachmentBody(file: File): string {
  return `${isImageContentType(file.type) ? "Photo" : "File"}: ${safeFileName(file.name)}`;
}

function attachmentObjectKey(conversationId: string, file: File, now: Date): string {
  const date = now.toISOString().slice(0, 10);
  const extension = fileExtension(file.name);
  const suffix = extension ? `.${extension}` : "";
  return `chat/${date}/${conversationId}/${crypto.randomUUID()}${suffix}`;
}

function plusDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

async function requireMessageInConversation(env: ChatBindings, conversationId: string, messageId: number): Promise<ChatMessageRow> {
  const row = await env.DB.prepare(`
    SELECT *
    FROM chat_messages
    WHERE conversation_id = ?
      AND message_id = ?
    LIMIT 1
  `).bind(conversationId, messageId).first<ChatMessageRow>();
  if (!row) throw new Error("Message not found.");
  return row;
}

async function hydrateMessages(env: ChatBindings, rows: ChatMessageRow[], user: CurrentChatUser): Promise<ChatMessage[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.message_id);
  const placeholders = ids.map(() => "?").join(", ");
  const reactions = await env.DB.prepare(`
    SELECT
      message_id,
      emoji,
      COUNT(*) AS total,
      MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS reacted_by_me
    FROM chat_message_reactions
    WHERE message_id IN (${placeholders})
    GROUP BY message_id, emoji
    ORDER BY message_id ASC, emoji ASC
  `).bind(user.id, ...ids).all<ChatReactionRow>();
  const reactionMap = new Map<number, ChatMessageReaction[]>();
  for (const reaction of reactions.results ?? []) {
    const list = reactionMap.get(reaction.message_id) ?? [];
    list.push({
      emoji: reaction.emoji,
      count: reaction.total,
      reactedByMe: reaction.reacted_by_me > 0,
    });
    reactionMap.set(reaction.message_id, list);
  }
  return rows.map((row) => mapMessage(row, reactionMap.get(row.message_id) ?? []));
}

async function ensureMainGroupChat(env: ChatBindings, now = new Date().toISOString()): Promise<void> {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO chat_conversations (
      conversation_id,
      conversation_kind,
      context_type,
      context_id,
      title,
      subtitle,
      status,
      priority,
      participant_count,
      created_at,
      updated_at
    ) VALUES (?, 'GROUP', 'general', NULL, 'Vanara Group Chat', 'Team conversation', 'open', 'normal', 0, ?, ?)
  `).bind(MAIN_GROUP_CONVERSATION_ID, now, now).run();

  await env.DB.prepare(`
    UPDATE chat_conversations
    SET conversation_kind = 'GROUP',
        title = 'Vanara Group Chat',
        subtitle = 'Team conversation'
    WHERE conversation_id = ?
  `).bind(MAIN_GROUP_CONVERSATION_ID).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO chat_conversation_participants (
      conversation_id,
      user_id,
      display_name,
      username,
      role,
      joined_at
    )
    SELECT
      ?,
      u.user_id,
      u.full_name,
      u.username,
      u.role,
      ?
    FROM users u
    WHERE u.status = 'active'
      AND (
        EXISTS (
          SELECT 1
          FROM user_views v
          WHERE v.user_id = u.user_id
            AND v.view_key IN ('staff', 'owner')
        )
        OR EXISTS (
          SELECT 1
          FROM user_module_permissions p
          WHERE p.user_id = u.user_id
            AND p.module_key = 'chat'
            AND p.can_access = 1
        )
      )
  `).bind(MAIN_GROUP_CONVERSATION_ID, now).run();

  await env.DB.prepare(`
    UPDATE chat_conversations
    SET participant_count = (
      SELECT COUNT(*)
      FROM chat_conversation_participants
      WHERE conversation_id = ?
    )
    WHERE conversation_id = ?
  `).bind(MAIN_GROUP_CONVERSATION_ID, MAIN_GROUP_CONVERSATION_ID).run();
}

async function participantExists(env: ChatBindings, conversationId: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT 1
    FROM chat_conversation_participants
    WHERE conversation_id = ?
      AND user_id = ?
    LIMIT 1
  `).bind(conversationId, userId).first<{ 1: number }>();
  return Boolean(row);
}

async function requireParticipant(env: ChatBindings, conversationId: string, user: CurrentChatUser): Promise<void> {
  if (conversationId === MAIN_GROUP_CONVERSATION_ID) {
    await ensureMainGroupChat(env);
  }
  if (!await participantExists(env, conversationId, user.id)) {
    throw new Error("Chat conversation not found.");
  }
}

export async function listChatUsers(env: ChatBindings, user: CurrentChatUser): Promise<ChatUser[]> {
  await ensureMainGroupChat(env);
  const rows = await env.DB.prepare(`
    SELECT DISTINCT
      u.user_id,
      u.full_name AS display_name,
      u.username,
      u.role,
      u.profile_photo_url
    FROM users u
    WHERE u.status = 'active'
      AND u.user_id <> ?
      AND (
        EXISTS (
          SELECT 1
          FROM user_views v
          WHERE v.user_id = u.user_id
            AND v.view_key IN ('staff', 'owner')
        )
        OR EXISTS (
          SELECT 1
          FROM user_module_permissions p
          WHERE p.user_id = u.user_id
            AND p.module_key = 'chat'
            AND p.can_access = 1
        )
      )
    ORDER BY u.full_name ASC, u.username ASC
  `).bind(user.id).all<ChatUserRow>();

  return (rows.results ?? []).map(mapUser);
}

export async function listChatConversations(env: ChatBindings, user: CurrentChatUser): Promise<ChatConversation[]> {
  await ensureMainGroupChat(env);
  const rows = await env.DB.prepare(`
    SELECT
      c.*,
      (
        SELECT COUNT(*)
        FROM chat_conversation_participants cp
        WHERE cp.conversation_id = c.conversation_id
      ) AS participant_count,
      (
        SELECT m.created_at
        FROM chat_messages m
        WHERE m.conversation_id = c.conversation_id
        ORDER BY m.created_at DESC, m.message_id DESC
        LIMIT 1
      ) AS last_message_at,
      (
        SELECT m.body
        FROM chat_messages m
        WHERE m.conversation_id = c.conversation_id
        ORDER BY m.created_at DESC, m.message_id DESC
        LIMIT 1
      ) AS last_message_body,
      (
        SELECT m.author_id
        FROM chat_messages m
        WHERE m.conversation_id = c.conversation_id
        ORDER BY m.created_at DESC, m.message_id DESC
        LIMIT 1
      ) AS last_message_author_id,
      (
        SELECT COUNT(*)
        FROM chat_messages m
        WHERE m.conversation_id = c.conversation_id
      ) AS message_count,
      (
        SELECT COUNT(*)
        FROM chat_messages m
        WHERE m.conversation_id = c.conversation_id
          AND m.message_id > COALESCE(p.last_read_message_id, 0)
          AND m.author_id <> ?
      ) AS unread_count,
      (
        SELECT COUNT(*)
        FROM chat_message_mentions mm
        INNER JOIN chat_messages m ON m.message_id = mm.message_id
        WHERE mm.conversation_id = c.conversation_id
          AND mm.mentioned_user_id = ?
          AND m.message_id > COALESCE(p.last_read_message_id, 0)
      ) AS mention_count,
      (
        SELECT cp.display_name
        FROM chat_conversation_participants cp
        WHERE cp.conversation_id = c.conversation_id
          AND cp.user_id <> ?
        ORDER BY cp.display_name ASC
        LIMIT 1
      ) AS private_title,
      (
        SELECT cp.username
        FROM chat_conversation_participants cp
        WHERE cp.conversation_id = c.conversation_id
          AND cp.user_id <> ?
        ORDER BY cp.username ASC
        LIMIT 1
      ) AS private_username,
      (
        SELECT u.profile_photo_url
        FROM chat_conversation_participants cp
        LEFT JOIN users u ON u.user_id = cp.user_id
        WHERE cp.conversation_id = c.conversation_id
          AND cp.user_id <> ?
        ORDER BY cp.display_name ASC
        LIMIT 1
      ) AS private_avatar_photo_url,
      (
        SELECT m.author_display_name
        FROM chat_messages m
        WHERE m.message_id = c.announced_message_id
          AND m.conversation_id = c.conversation_id
        LIMIT 1
      ) AS announced_author_display_name,
      (
        SELECT m.body
        FROM chat_messages m
        WHERE m.message_id = c.announced_message_id
          AND m.conversation_id = c.conversation_id
        LIMIT 1
      ) AS announced_body
    FROM chat_conversation_participants p
    INNER JOIN chat_conversations c ON c.conversation_id = p.conversation_id
    WHERE p.user_id = ?
    ORDER BY COALESCE(last_message_at, c.updated_at) DESC, c.conversation_kind ASC, c.title ASC
  `).bind(user.id, user.id, user.id, user.id, user.id, user.id).all<ChatConversationRow>();

  return (rows.results ?? []).map(mapConversation);
}

export async function getChatConversation(env: ChatBindings, conversationId: string, user: CurrentChatUser): Promise<ChatConversation | null> {
  await requireParticipant(env, conversationId, user);
  const conversations = await listChatConversations(env, user);
  return conversations.find((conversation) => conversation.id === conversationId) ?? null;
}

export async function listChatMessages(env: ChatBindings, conversationId: string, user: CurrentChatUser): Promise<ChatMessage[]> {
  await requireParticipant(env, conversationId, user);
  const rows = await env.DB.prepare(`
    SELECT
      m.*,
      u.profile_photo_url AS author_profile_photo_url,
      reply.author_display_name AS reply_author_display_name,
      reply.body AS reply_body
    FROM chat_messages m
    LEFT JOIN users u ON u.user_id = m.author_id
    LEFT JOIN chat_messages reply
      ON reply.message_id = m.reply_to_message_id
      AND reply.conversation_id = m.conversation_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC, m.message_id ASC
    LIMIT 200
  `).bind(conversationId).all<ChatMessageRow>();

  return hydrateMessages(env, rows.results ?? [], user);
}

async function persistMentions(env: ChatBindings, conversationId: string, messageId: number, authorId: string, body: string, now: string): Promise<void> {
  const names = mentionedUsernames(body);
  if (names.length === 0) return;

  const participants = await env.DB.prepare(`
    SELECT user_id, username
    FROM chat_conversation_participants
    WHERE conversation_id = ?
  `).bind(conversationId).all<{ user_id: string; username: string }>();
  const wanted = new Set(names);
  const mentioned = (participants.results ?? [])
    .filter((participant) => participant.user_id !== authorId && wanted.has(participant.username.toLowerCase()));

  for (const participant of mentioned) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO chat_message_mentions (
        message_id,
        conversation_id,
        mentioned_user_id,
        mentioned_username,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(messageId, conversationId, participant.user_id, participant.username.toLowerCase(), now).run();
  }
}

export async function createChatMessage(
  env: ChatBindings,
  conversationId: string,
  user: CurrentChatUser,
  input: CreateChatMessageInput,
): Promise<ChatMessage> {
  await requireParticipant(env, conversationId, user);
  if (input.replyToMessageId) {
    await requireMessageInConversation(env, conversationId, input.replyToMessageId);
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO chat_messages (
      conversation_id,
      author_id,
      author_display_name,
      author_role,
      body,
      body_language,
      translated_body,
      translated_language,
      reply_to_message_id,
      message_kind,
      sticker_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    conversationId,
    user.id,
    user.displayName,
    user.role,
    input.body,
    input.bodyLanguage ?? "en",
    input.translatedBody ?? null,
    input.translatedLanguage ?? null,
    input.replyToMessageId ?? null,
    input.messageKind,
    input.stickerId ?? null,
    now,
  ).run();

  const messageId = Number(result.meta.last_row_id);
  await persistMentions(env, conversationId, messageId, user.id, input.body, now);

  await env.DB.prepare(`
    UPDATE chat_conversations
    SET updated_at = ?
    WHERE conversation_id = ?
  `).bind(now, conversationId).run();

  await env.DB.prepare(`
    UPDATE chat_conversation_participants
    SET last_read_message_id = MAX(last_read_message_id, ?),
        last_read_at = ?
    WHERE conversation_id = ?
      AND user_id = ?
  `).bind(messageId, now, conversationId, user.id).run();

  const row = await env.DB.prepare(`
    SELECT
      m.*,
      u.profile_photo_url AS author_profile_photo_url,
      reply.author_display_name AS reply_author_display_name,
      reply.body AS reply_body
    FROM chat_messages m
    LEFT JOIN users u ON u.user_id = m.author_id
    LEFT JOIN chat_messages reply
      ON reply.message_id = m.reply_to_message_id
      AND reply.conversation_id = m.conversation_id
    WHERE m.message_id = ?
  `)
    .bind(messageId)
    .first<ChatMessageRow>();

  if (!row) {
    throw new Error("Message was created but could not be loaded.");
  }

  return (await hydrateMessages(env, [row], user))[0]!;
}

export async function createChatAttachmentMessage(
  env: ChatBindings,
  conversationId: string,
  user: CurrentChatUser,
  input: CreateChatAttachmentInput,
): Promise<ChatMessage> {
  await requireParticipant(env, conversationId, user);
  if (input.replyToMessageId) {
    await requireMessageInConversation(env, conversationId, input.replyToMessageId);
  }

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const expiresAt = plusDays(nowDate, CHAT_ATTACHMENT_RETENTION_DAYS);
  const objectKey = attachmentObjectKey(conversationId, input.file, nowDate);
  const fileName = safeFileName(input.file.name);
  const body = attachmentBody(input.file);
  const bytes = await input.file.arrayBuffer();

  await env.R2_STORAGE.put(objectKey, bytes, {
    httpMetadata: {
      contentType: input.file.type,
      contentDisposition: `inline; filename="${fileName.replace(/"/g, "")}"`,
    },
    customMetadata: {
      conversationId,
      retentionDays: String(CHAT_ATTACHMENT_RETENTION_DAYS),
      expiresAt,
    },
  });

  const result = await env.DB.prepare(`
    INSERT INTO chat_messages (
      conversation_id,
      author_id,
      author_display_name,
      author_role,
      body,
      body_language,
      translated_body,
      translated_language,
      reply_to_message_id,
      message_kind,
      sticker_id,
      attachment_object_key,
      attachment_file_name,
      attachment_content_type,
      attachment_byte_size,
      attachment_expires_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, 'en', NULL, NULL, ?, 'ATTACHMENT', NULL, ?, ?, ?, ?, ?, ?)
  `).bind(
    conversationId,
    user.id,
    user.displayName,
    user.role,
    body,
    input.replyToMessageId ?? null,
    objectKey,
    fileName,
    input.file.type,
    input.file.size,
    expiresAt,
    now,
  ).run();

  const messageId = Number(result.meta.last_row_id);

  await env.DB.prepare(`
    UPDATE chat_conversations
    SET updated_at = ?
    WHERE conversation_id = ?
  `).bind(now, conversationId).run();

  await env.DB.prepare(`
    UPDATE chat_conversation_participants
    SET last_read_message_id = MAX(last_read_message_id, ?),
        last_read_at = ?
    WHERE conversation_id = ?
      AND user_id = ?
  `).bind(messageId, now, conversationId, user.id).run();

  const row = await env.DB.prepare(`
    SELECT
      m.*,
      u.profile_photo_url AS author_profile_photo_url,
      reply.author_display_name AS reply_author_display_name,
      reply.body AS reply_body
    FROM chat_messages m
    LEFT JOIN users u ON u.user_id = m.author_id
    LEFT JOIN chat_messages reply
      ON reply.message_id = m.reply_to_message_id
      AND reply.conversation_id = m.conversation_id
    WHERE m.message_id = ?
  `).bind(messageId).first<ChatMessageRow>();

  if (!row) throw new Error("Message was created but could not be loaded.");
  return (await hydrateMessages(env, [row], user))[0]!;
}

export async function getChatAttachmentDownload(
  env: ChatBindings,
  conversationId: string,
  messageId: number,
  user: CurrentChatUser,
): Promise<ChatAttachmentDownload> {
  await requireParticipant(env, conversationId, user);
  const row = await requireMessageInConversation(env, conversationId, messageId);
  if (row.message_kind !== "ATTACHMENT" || !row.attachment_object_key || !row.attachment_file_name || !row.attachment_content_type || !row.attachment_expires_at) {
    throw new Error("Attachment not found.");
  }
  const now = new Date().toISOString();
  if (row.attachment_unavailable_at || row.attachment_expires_at <= now) {
    throw new Error("attachment_unavailable");
  }
  const object = await env.R2_STORAGE.get(row.attachment_object_key);
  if (!object) {
    await env.DB.prepare(`
      UPDATE chat_messages
      SET attachment_unavailable_at = ?
      WHERE conversation_id = ?
        AND message_id = ?
        AND attachment_unavailable_at IS NULL
    `).bind(now, conversationId, messageId).run();
    throw new Error("attachment_unavailable");
  }
  return {
    object,
    fileName: row.attachment_file_name,
    contentType: row.attachment_content_type,
  };
}

export async function cleanupExpiredChatAttachments(env: ChatBindings, now = new Date().toISOString()): Promise<number> {
  const rows = await env.DB.prepare(`
    SELECT message_id, attachment_object_key
    FROM chat_messages
    WHERE attachment_object_key IS NOT NULL
      AND attachment_expires_at IS NOT NULL
      AND attachment_expires_at <= ?
      AND attachment_unavailable_at IS NULL
    LIMIT 100
  `).bind(now).all<{ message_id: number; attachment_object_key: string }>();

  let cleaned = 0;
  for (const row of rows.results ?? []) {
    await env.R2_STORAGE.delete(row.attachment_object_key);
    await env.DB.prepare(`
      UPDATE chat_messages
      SET attachment_unavailable_at = ?
      WHERE message_id = ?
    `).bind(now, row.message_id).run();
    cleaned += 1;
  }
  return cleaned;
}

export async function toggleChatMessageReaction(
  env: ChatBindings,
  conversationId: string,
  messageId: number,
  user: CurrentChatUser,
  input: ChatReactionInput,
): Promise<ChatMessage> {
  await requireParticipant(env, conversationId, user);
  await requireMessageInConversation(env, conversationId, messageId);

  const existing = await env.DB.prepare(`
    SELECT emoji
    FROM chat_message_reactions
    WHERE message_id = ?
      AND user_id = ?
    LIMIT 1
  `).bind(messageId, user.id).first<{ emoji: ChatReactionEmoji }>();
  const now = new Date().toISOString();

  if (existing?.emoji === input.emoji) {
    await env.DB.prepare(`
      DELETE FROM chat_message_reactions
      WHERE message_id = ?
        AND user_id = ?
    `).bind(messageId, user.id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO chat_message_reactions (
        message_id,
        conversation_id,
        user_id,
        emoji,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(message_id, user_id) DO UPDATE SET
        emoji = excluded.emoji,
        updated_at = excluded.updated_at
    `).bind(messageId, conversationId, user.id, input.emoji, now, now).run();
  }

  const row = await env.DB.prepare(`
    SELECT
      m.*,
      u.profile_photo_url AS author_profile_photo_url,
      reply.author_display_name AS reply_author_display_name,
      reply.body AS reply_body
    FROM chat_messages m
    LEFT JOIN users u ON u.user_id = m.author_id
    LEFT JOIN chat_messages reply
      ON reply.message_id = m.reply_to_message_id
      AND reply.conversation_id = m.conversation_id
    WHERE m.conversation_id = ?
      AND m.message_id = ?
  `).bind(conversationId, messageId).first<ChatMessageRow>();
  if (!row) throw new Error("Message not found.");
  return (await hydrateMessages(env, [row], user))[0]!;
}

export async function setChatAnnouncement(
  env: ChatBindings,
  conversationId: string,
  user: CurrentChatUser,
  input: ChatAnnouncementInput,
): Promise<ChatConversation> {
  await requireParticipant(env, conversationId, user);
  await requireMessageInConversation(env, conversationId, input.messageId);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE chat_conversations
    SET announced_message_id = ?,
        announced_by_user_id = ?,
        announced_at = ?,
        updated_at = ?
    WHERE conversation_id = ?
  `).bind(input.messageId, user.id, now, now, conversationId).run();
  const conversation = await getChatConversation(env, conversationId, user);
  if (!conversation) throw new Error("Chat conversation not found.");
  return conversation;
}

export async function clearChatAnnouncement(
  env: ChatBindings,
  conversationId: string,
  user: CurrentChatUser,
): Promise<ChatConversation> {
  await requireParticipant(env, conversationId, user);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE chat_conversations
    SET announced_message_id = NULL,
        announced_by_user_id = NULL,
        announced_at = NULL,
        updated_at = ?
    WHERE conversation_id = ?
  `).bind(now, conversationId).run();
  const conversation = await getChatConversation(env, conversationId, user);
  if (!conversation) throw new Error("Chat conversation not found.");
  return conversation;
}

export async function translateChatMessage(
  env: ChatBindings,
  conversationId: string,
  messageId: number,
  user: CurrentChatUser,
): Promise<ChatMessage> {
  await requireParticipant(env, conversationId, user);
  const row = await env.DB.prepare(`
    SELECT
      m.*,
      u.profile_photo_url AS author_profile_photo_url,
      reply.author_display_name AS reply_author_display_name,
      reply.body AS reply_body
    FROM chat_messages m
    LEFT JOIN users u ON u.user_id = m.author_id
    LEFT JOIN chat_messages reply
      ON reply.message_id = m.reply_to_message_id
      AND reply.conversation_id = m.conversation_id
    WHERE m.conversation_id = ?
      AND m.message_id = ?
    LIMIT 1
  `).bind(conversationId, messageId).first<ChatMessageRow>();
  if (!row) throw new Error("Message not found.");
  if (!row.translated_body || !row.translated_language) {
    throw new Error("translation_unavailable");
  }
  return (await hydrateMessages(env, [row], user))[0]!;
}

export async function openPrivateChat(env: ChatBindings, user: CurrentChatUser, targetUserId: string): Promise<ChatConversation> {
  await ensureMainGroupChat(env);
  if (targetUserId === user.id) throw new Error("Choose another team member.");

  const target = await env.DB.prepare(`
    SELECT
      u.user_id,
      u.full_name AS display_name,
      u.username,
      u.role,
      u.profile_photo_url
    FROM users u
    WHERE u.user_id = ?
      AND u.status = 'active'
      AND (
        EXISTS (
          SELECT 1
          FROM user_views v
          WHERE v.user_id = u.user_id
            AND v.view_key IN ('staff', 'owner')
        )
        OR EXISTS (
          SELECT 1
          FROM user_module_permissions p
          WHERE p.user_id = u.user_id
            AND p.module_key = 'chat'
            AND p.can_access = 1
        )
      )
    LIMIT 1
  `).bind(targetUserId).first<ChatUserRow>();
  if (!target) throw new Error("Team member not found.");

  const now = new Date().toISOString();
  const pairKey = privatePairKey(user.id, target.user_id);
  const conversationId = `private-${crypto.randomUUID()}`;

  await env.DB.prepare(`
    INSERT OR IGNORE INTO chat_conversations (
      conversation_id,
      conversation_kind,
      private_pair_key,
      context_type,
      context_id,
      title,
      subtitle,
      status,
      priority,
      participant_count,
      created_at,
      updated_at
    ) VALUES (?, 'PRIVATE', ?, 'general', NULL, 'Private chat', NULL, 'open', 'normal', 2, ?, ?)
  `).bind(conversationId, pairKey, now, now).run();

  const stored = await env.DB.prepare(`
    SELECT conversation_id
    FROM chat_conversations
    WHERE conversation_kind = 'PRIVATE'
      AND private_pair_key = ?
    LIMIT 1
  `).bind(pairKey).first<{ conversation_id: string }>();
  if (!stored) throw new Error("Private chat could not be opened.");

  const participants = [
    { id: user.id, displayName: user.displayName, username: user.username, role: user.role },
    { id: target.user_id, displayName: target.display_name ?? target.username, username: target.username, role: target.role },
  ];

  for (const participant of participants) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO chat_conversation_participants (
        conversation_id,
        user_id,
        display_name,
        username,
        role,
        joined_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(stored.conversation_id, participant.id, participant.displayName, participant.username, participant.role, now).run();
  }

  const conversation = await getChatConversation(env, stored.conversation_id, user);
  if (!conversation) throw new Error("Private chat could not be loaded.");
  return conversation;
}

export async function createGroupChat(env: ChatBindings, user: CurrentChatUser, input: CreateGroupChatInput): Promise<ChatConversation> {
  await ensureMainGroupChat(env);

  const otherParticipantIds = input.participantIds.filter((participantId) => participantId !== user.id);
  if (otherParticipantIds.length < 2) {
    throw new Error("Choose at least two team members.");
  }

  const placeholders = otherParticipantIds.map(() => "?").join(", ");
  const targets = await env.DB.prepare(`
    SELECT
      u.user_id,
      u.full_name AS display_name,
      u.username,
      u.role,
      u.profile_photo_url
    FROM users u
    WHERE u.user_id IN (${placeholders})
      AND u.status = 'active'
      AND (
        EXISTS (
          SELECT 1
          FROM user_views v
          WHERE v.user_id = u.user_id
            AND v.view_key IN ('staff', 'owner')
        )
        OR EXISTS (
          SELECT 1
          FROM user_module_permissions p
          WHERE p.user_id = u.user_id
            AND p.module_key = 'chat'
            AND p.can_access = 1
        )
      )
    ORDER BY u.full_name ASC, u.username ASC
  `).bind(...otherParticipantIds).all<ChatUserRow>();
  const targetRows = targets.results ?? [];
  if (targetRows.length !== otherParticipantIds.length) {
    throw new Error("One or more team members are unavailable.");
  }

  const now = new Date().toISOString();
  const conversationId = `group-${crypto.randomUUID()}`;
  const participants = [
    { id: user.id, displayName: user.displayName, username: user.username, role: user.role },
    ...targetRows.map((target) => ({
      id: target.user_id,
      displayName: target.display_name ?? target.username,
      username: target.username,
      role: target.role,
    })),
  ];

  await env.DB.prepare(`
    INSERT INTO chat_conversations (
      conversation_id,
      conversation_kind,
      context_type,
      context_id,
      title,
      subtitle,
      status,
      priority,
      participant_count,
      created_at,
      updated_at
    ) VALUES (?, 'GROUP', 'general', NULL, ?, 'Group chat', 'open', 'normal', ?, ?, ?)
  `).bind(conversationId, input.title, participants.length, now, now).run();

  for (const participant of participants) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO chat_conversation_participants (
        conversation_id,
        user_id,
        display_name,
        username,
        role,
        joined_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(conversationId, participant.id, participant.displayName, participant.username, participant.role, now).run();
  }

  const conversation = await getChatConversation(env, conversationId, user);
  if (!conversation) throw new Error("Group chat could not be loaded.");
  return conversation;
}

export async function markChatConversationRead(env: ChatBindings, conversationId: string, user: CurrentChatUser): Promise<ChatConversation> {
  await requireParticipant(env, conversationId, user);
  const latest = await env.DB.prepare(`
    SELECT COALESCE(MAX(message_id), 0) AS latest_message_id
    FROM chat_messages
    WHERE conversation_id = ?
  `).bind(conversationId).first<{ latest_message_id: number }>();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE chat_conversation_participants
    SET last_read_message_id = ?,
        last_read_at = ?
    WHERE conversation_id = ?
      AND user_id = ?
  `).bind(latest?.latest_message_id ?? 0, now, conversationId, user.id).run();

  const conversation = await getChatConversation(env, conversationId, user);
  if (!conversation) throw new Error("Chat conversation not found.");
  return conversation;
}

export async function getChatUnreadSummary(env: ChatBindings, user: CurrentChatUser): Promise<ChatUnreadSummary> {
  const conversations = await listChatConversations(env, user);
  return conversations.reduce<ChatUnreadSummary>((summary, conversation) => ({
    unreadCount: summary.unreadCount + conversation.unreadCount,
    mentionCount: summary.mentionCount + conversation.mentionCount,
  }), { unreadCount: 0, mentionCount: 0 });
}
