import type { ChatMessage } from "./chat.service.js";

export const CHAT_SOCKET_PROTOCOL_VERSION = 1;

export interface ChatRealtimeBindings {
  CHAT_CONVERSATION_ROOM?: DurableObjectNamespace;
  CHAT_USER_INBOX_ROOM?: DurableObjectNamespace;
}

export type ChatRealtimeEvent =
  | {
      type: "ready";
      version: number;
      conversationId: string;
      connectedAt: string;
    }
  | {
      type: "message.created";
      version: number;
      conversationId: string;
      message: ChatMessage;
    }
  | {
      type: "conversation.updated";
      version: number;
      conversationId: string;
    }
  | {
      type: "pong";
      version: number;
      conversationId: string;
      sentAt: string;
    };

export type ChatInboxRealtimeEvent =
  | {
      type: "ready";
      version: number;
      userId: string;
      connectedAt: string;
    }
  | {
      type: "summary.invalidated";
      version: number;
      userId: string;
      conversationId: string;
      eventId: string;
    }
  | {
      type: "pong";
      version: number;
      userId: string;
      sentAt: string;
    };

function realtimeSocketRequest(conversationId: string, userId: string, displayName: string): Request {
  const url = new URL("https://chat-realtime.internal/connect");
  url.searchParams.set("conversationId", conversationId);
  url.searchParams.set("userId", userId);
  url.searchParams.set("displayName", displayName);
  return new Request(url, { headers: { upgrade: "websocket" } });
}

function realtimeBroadcastRequest(conversationId: string, message: ChatMessage): Request {
  return new Request("https://chat-realtime.internal/broadcast/message-created", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ conversationId, message }),
  });
}

function inboxSocketRequest(userId: string, displayName: string): Request {
  const url = new URL("https://chat-realtime.internal/connect");
  url.searchParams.set("userId", userId);
  url.searchParams.set("displayName", displayName);
  return new Request(url, { headers: { upgrade: "websocket" } });
}

function inboxInvalidationRequest(userId: string, conversationId: string, eventId: string): Request {
  return new Request("https://chat-realtime.internal/broadcast/summary-invalidated", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ userId, conversationId, eventId }),
  });
}

export function chatRoomStub(env: ChatRealtimeBindings, conversationId: string): DurableObjectStub | null {
  return env.CHAT_CONVERSATION_ROOM?.getByName(conversationId) ?? null;
}

export async function connectChatRoomSocket(
  env: ChatRealtimeBindings,
  conversationId: string,
  user: { id: string; displayName: string },
): Promise<Response> {
  const stub = chatRoomStub(env, conversationId);
  if (!stub) return Response.json({ success: false, error: "Chat realtime is unavailable" }, { status: 503 });
  return stub.fetch(realtimeSocketRequest(conversationId, user.id, user.displayName));
}

export async function broadcastChatMessageCreated(
  env: ChatRealtimeBindings,
  conversationId: string,
  message: ChatMessage,
): Promise<void> {
  const stub = chatRoomStub(env, conversationId);
  if (!stub) return;
  const response = await stub.fetch(realtimeBroadcastRequest(conversationId, message));
  if (!response.ok) throw new Error(`Chat realtime broadcast failed: ${response.status}`);
}

export async function connectChatInboxSocket(
  env: ChatRealtimeBindings,
  user: { id: string; displayName: string },
): Promise<Response> {
  const stub = env.CHAT_USER_INBOX_ROOM?.getByName(user.id);
  if (!stub) return Response.json({ success: false, error: "Chat inbox realtime is unavailable" }, { status: 503 });
  return stub.fetch(inboxSocketRequest(user.id, user.displayName));
}

export async function broadcastChatSummaryInvalidated(
  env: ChatRealtimeBindings,
  userIds: string[],
  input: { conversationId: string; eventId: string },
): Promise<void> {
  const namespace = env.CHAT_USER_INBOX_ROOM;
  if (!namespace) return;
  const recipients = [...new Set(userIds.filter(Boolean))];
  await Promise.all(recipients.map(async (userId) => {
    const response = await namespace.getByName(userId).fetch(inboxInvalidationRequest(
      userId,
      input.conversationId,
      input.eventId,
    ));
    if (!response.ok) throw new Error(`Chat inbox realtime broadcast failed: ${response.status}`);
  }));
}
