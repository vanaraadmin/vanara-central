import { DurableObject } from "cloudflare:workers";
import { CHAT_SOCKET_PROTOCOL_VERSION, type ChatInboxRealtimeEvent, type ChatRealtimeBindings } from "./chat-realtime.service.js";

interface ChatInboxSocketAttachment {
  userId: string;
  displayName: string;
  connectedAt: string;
}

function sendSocketJson(socket: WebSocket, value: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(value));
}

function validInvalidationPayload(value: unknown): { userId: string; conversationId: string; eventId: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { userId?: unknown; conversationId?: unknown; eventId?: unknown };
  if (typeof record.userId !== "string" || typeof record.conversationId !== "string" || typeof record.eventId !== "string") return null;
  if (!record.userId.trim() || !record.conversationId.trim() || !record.eventId.trim()) return null;
  return {
    userId: record.userId,
    conversationId: record.conversationId,
    eventId: record.eventId,
  };
}

export class ChatUserInboxRoom extends DurableObject<ChatRealtimeBindings> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.connect(request);
    }

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/broadcast/summary-invalidated") {
      const payload = validInvalidationPayload(await request.json().catch(() => null));
      if (!payload) return Response.json({ success: false, error: "Invalid chat inbox payload" }, { status: 400 });
      this.broadcast({
        type: "summary.invalidated",
        version: CHAT_SOCKET_PROTOCOL_VERSION,
        userId: payload.userId,
        conversationId: payload.conversationId,
        eventId: payload.eventId,
      });
      return Response.json({ success: true });
    }

    return new Response("Not found", { status: 404 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    const attachment = socket.deserializeAttachment() as ChatInboxSocketAttachment | null;
    if (!attachment) return;
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (text === "ping") {
      sendSocketJson(socket, {
        type: "pong",
        version: CHAT_SOCKET_PROTOCOL_VERSION,
        userId: attachment.userId,
        sentAt: new Date().toISOString(),
      } satisfies ChatInboxRealtimeEvent);
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
    const userId = url.searchParams.get("userId")?.trim();
    const displayName = url.searchParams.get("displayName")?.trim() || "Vanara";
    if (!userId) return new Response("Chat inbox connection is incomplete", { status: 400 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const connectedAt = new Date().toISOString();
    server.serializeAttachment({ userId, displayName, connectedAt } satisfies ChatInboxSocketAttachment);
    this.ctx.acceptWebSocket(server, [`user:${userId}`]);
    sendSocketJson(server, {
      type: "ready",
      version: CHAT_SOCKET_PROTOCOL_VERSION,
      userId,
      connectedAt,
    } satisfies ChatInboxRealtimeEvent);

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(event: ChatInboxRealtimeEvent): void {
    for (const socket of this.ctx.getWebSockets(`user:${event.userId}`)) {
      sendSocketJson(socket, event);
    }
  }
}
