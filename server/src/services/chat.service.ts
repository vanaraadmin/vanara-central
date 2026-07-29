import { resolveCurrentUser, type CurrentUser } from "./current-user.service.js";

export type ChatContextType = "general" | "room" | "maintenance" | "housekeeping" | "movement";
export type ChatLanguage = "en" | "th";

export interface ChatBindings {
  DB: D1Database;
}

export type CurrentChatUser = CurrentUser;

interface ChatConversationRow {
  conversation_id: string;
  context_type: ChatContextType;
  context_id: string | null;
  title: string;
  subtitle: string | null;
  status: string;
  priority: string | null;
  participant_count: number;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
  message_count?: number | null;
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
  created_at: string;
}

export interface ChatConversation {
  id: string;
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
  messageCount: number;
}

export interface ChatMessage {
  id: number;
  conversationId: string;
  author: {
    id: string;
    displayName: string;
    role: string;
  };
  body: string;
  bodyLanguage: ChatLanguage;
  translatedBody: string | null;
  translatedLanguage: ChatLanguage | null;
  createdAt: string;
}

export interface CreateChatMessageInput {
  body: string;
  bodyLanguage?: ChatLanguage;
  translatedBody?: string | null;
  translatedLanguage?: ChatLanguage | null;
}

export function resolveCurrentChatUser(c: Parameters<typeof resolveCurrentUser>[0]): CurrentChatUser {
  return resolveCurrentUser(c);
}

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

function mapConversation(row: ChatConversationRow): ChatConversation {
  return {
    id: row.conversation_id,
    contextType: row.context_type,
    contextId: row.context_id,
    title: row.title,
    subtitle: row.subtitle,
    status: row.status,
    priority: row.priority,
    participantCount: row.participant_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at ?? null,
    messageCount: row.message_count ?? 0,
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
    },
    body: row.body,
    bodyLanguage: row.body_language,
    translatedBody: row.translated_body,
    translatedLanguage: row.translated_language,
    createdAt: row.created_at,
  };
}

export async function listChatConversations(env: ChatBindings): Promise<ChatConversation[]> {
  const rows = await env.DB.prepare(`
    SELECT c.*, MAX(m.created_at) AS last_message_at, COUNT(m.message_id) AS message_count
    FROM chat_conversations c
    LEFT JOIN chat_messages m ON m.conversation_id = c.conversation_id
    GROUP BY c.conversation_id
    ORDER BY COALESCE(last_message_at, c.updated_at) DESC, c.title ASC
  `).all<ChatConversationRow>();

  return (rows.results ?? []).map(mapConversation);
}

export async function getChatConversation(env: ChatBindings, conversationId: string): Promise<ChatConversation | null> {
  const row = await env.DB.prepare(`
    SELECT c.*, MAX(m.created_at) AS last_message_at, COUNT(m.message_id) AS message_count
    FROM chat_conversations c
    LEFT JOIN chat_messages m ON m.conversation_id = c.conversation_id
    WHERE c.conversation_id = ?
    GROUP BY c.conversation_id
  `).bind(conversationId).first<ChatConversationRow>();

  return row ? mapConversation(row) : null;
}

export async function listChatMessages(env: ChatBindings, conversationId: string): Promise<ChatMessage[]> {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM chat_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC, message_id ASC
    LIMIT 200
  `).bind(conversationId).all<ChatMessageRow>();

  return (rows.results ?? []).map(mapMessage);
}

export async function createChatMessage(
  env: ChatBindings,
  conversationId: string,
  user: CurrentChatUser,
  input: CreateChatMessageInput,
): Promise<ChatMessage> {
  const conversation = await getChatConversation(env, conversationId);
  if (!conversation) {
    throw new Error("Conversation not found.");
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

  await env.DB.prepare(`
    UPDATE chat_conversations
    SET updated_at = ?
    WHERE conversation_id = ?
  `).bind(now, conversationId).run();

  const messageId = result.meta.last_row_id;
  const row = await env.DB.prepare("SELECT * FROM chat_messages WHERE message_id = ?")
    .bind(messageId)
    .first<ChatMessageRow>();

  if (!row) {
    throw new Error("Message was created but could not be loaded.");
  }

  return mapMessage(row);
}
