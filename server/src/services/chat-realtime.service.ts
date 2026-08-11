import type { ChatMessage } from "./chat.service.js";

export const CHAT_SOCKET_PROTOCOL_VERSION = 1;

export interface ChatRealtimeBindings {
  CHAT_CONVERSATION_ROOM?: DurableObjectNamespace;
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
