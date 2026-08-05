import type { CurrentUser } from "./current-user.service.js";

export type ChatContextType = "general" | "room" | "maintenance" | "housekeeping" | "movement";
export type ChatConversationKind = "GROUP" | "PRIVATE";
export type ChatLanguage = "en" | "th";

export interface ChatBindings {
  DB: D1Database;
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
  author_profile_photo_url?: string | null;
  created_at: string;
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
}

export interface ChatMessage {
  id: number;
  conversationId: string;
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
  mentionUsernames: string[];
  createdAt: string;
}

export interface CreateChatMessageInput {
  body: string;
  bodyLanguage?: ChatLanguage;
  translatedBody?: string | null;
  translatedLanguage?: ChatLanguage | null;
}

export interface ChatUnreadSummary {
  unreadCount: number;
  mentionCount: number;
}

const MAIN_GROUP_CONVERSATION_ID = "general-operations";

function normalizeLanguage(value: unknown, fallback: ChatLanguage): ChatLanguage {
  return value === "th" || value === "en" ? value : fallback;
}

export function normalizeMessageInput(payload: unknown): CreateChatMessageInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Message body is required.");
  }

  const body = "body" in payload && typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) {
    throw new Error("Message body is required.");
  }
  if (body.length > 2000) {
    throw new Error("Message body must be 2000 characters or less.");
  }

  const translatedBody =
    "translatedBody" in payload && typeof payload.translatedBody === "string"
      ? payload.translatedBody.trim() || null
      : null;

  const bodyLanguage = normalizeLanguage("bodyLanguage" in payload ? payload.bodyLanguage : undefined, "en");
  const translatedLanguage = translatedBody
    ? normalizeLanguage("translatedLanguage" in payload ? payload.translatedLanguage : undefined, bodyLanguage === "en" ? "th" : "en")
    : null;

  return {
    body,
    bodyLanguage,
    translatedBody,
    translatedLanguage,
  };
}

export function normalizeChatUserId(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("userId" in payload) || typeof payload.userId !== "string") {
    throw new Error("User is required.");
  }
  const userId = payload.userId.trim();
  if (!userId || userId.length > 120) throw new Error("User is invalid.");
  return userId;
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
  };
}

function mapMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.message_id,
    conversationId: row.conversation_id,
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
    mentionUsernames: mentionedUsernames(row.body),
    createdAt: row.created_at,
  };
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
      ) AS private_avatar_photo_url
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
      u.profile_photo_url AS author_profile_photo_url
    FROM chat_messages m
    LEFT JOIN users u ON u.user_id = m.author_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC, m.message_id ASC
    LIMIT 200
  `).bind(conversationId).all<ChatMessageRow>();

  return (rows.results ?? []).map(mapMessage);
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
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    conversationId,
    user.id,
    user.displayName,
    user.role,
    input.body,
    input.bodyLanguage ?? "en",
    input.translatedBody ?? null,
    input.translatedLanguage ?? null,
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

  const row = await env.DB.prepare("SELECT * FROM chat_messages WHERE message_id = ?")
    .bind(messageId)
    .first<ChatMessageRow>();

  if (!row) {
    throw new Error("Message was created but could not be loaded.");
  }

  return mapMessage(row);
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
