import { DurableObject } from "cloudflare:workers";
import { CHAT_SOCKET_PROTOCOL_VERSION, type ChatRealtimeBindings, type ChatRealtimeEvent } from "./chat-realtime.service.js";
import type { ChatMessage } from "./chat.service.js";

interface ChatSocketAttachment {
  conversationId: string;
  userId: string;
  displayName: string;
  connectedAt: string;
}

function sendSocketJson(socket: WebSocket, value: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(value));
}

function validMessagePayload(value: unknown): { conversationId: string; message: ChatMessage } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { conversationId?: unknown; message?: unknown };
  if (typeof record.conversationId !== "string" || !record.message || typeof record.message !== "object") return null;
  const message = record.message as ChatMessage;
  if (message.conversationId !== record.conversationId || typeof message.id !== "number") return null;
  return { conversationId: record.conversationId, message };
}

export class ChatConversationRoom extends DurableObject<ChatRealtimeBindings> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.connect(request);
    }

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/broadcast/message-created") {
      const payload = validMessagePayload(await request.json().catch(() => null));
      if (!payload) return Response.json({ success: false, error: "Invalid chat realtime payload" }, { status: 400 });
      this.broadcastMessageCreated(payload.message);
      return Response.json({ success: true });
    }

    return new Response("Not found", { status: 404 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    const attachment = socket.deserializeAttachment() as ChatSocketAttachment | null;
    if (!attachment) return;
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (text === "ping") {
      sendSocketJson(socket, {
        type: "pong",
        version: CHAT_SOCKET_PROTOCOL_VERSION,
        conversationId: attachment.conversationId,
        sentAt: new Date().toISOString(),
      } satisfies ChatRealtimeEvent);
    }
  }

  webSocketClose(socket: WebSocket): void {
    socket.serializeAttachment(null);
  }

  webSocketError(socket: WebSocket): void {
    socket.serializeAttachment(null);
  }

  private connect(request: Request): Response {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId")?.trim();
    const userId = url.searchParams.get("userId")?.trim();
    const displayName = url.searchParams.get("displayName")?.trim() || "Vanara";
    if (!conversationId || !userId) {
      return new Response("Chat realtime connection is incomplete", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const connectedAt = new Date().toISOString();
    server.serializeAttachment({
      conversationId,
      userId,
      displayName,
      connectedAt,
    } satisfies ChatSocketAttachment);
    this.ctx.acceptWebSocket(server, [`conversation:${conversationId}`, `user:${userId}`]);
    sendSocketJson(server, {
      type: "ready",
      version: CHAT_SOCKET_PROTOCOL_VERSION,
      conversationId,
      connectedAt,
    } satisfies ChatRealtimeEvent);

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcastMessageCreated(message: ChatMessage): void {
    this.broadcast({
      type: "message.created",
      version: CHAT_SOCKET_PROTOCOL_VERSION,
      conversationId: message.conversationId,
      message,
    } satisfies ChatRealtimeEvent);
    this.broadcast({
      type: "conversation.updated",
      version: CHAT_SOCKET_PROTOCOL_VERSION,
      conversationId: message.conversationId,
    } satisfies ChatRealtimeEvent);
  }

  private broadcast(event: ChatRealtimeEvent): void {
    for (const socket of this.ctx.getWebSockets(`conversation:${event.conversationId}`)) {
      sendSocketJson(socket, event);
    }
  }
}
