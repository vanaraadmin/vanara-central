import { useEffect, useRef, useState } from "react";
import { chatRealtimeUrl } from "../services/chat.service";
import type { ChatMessage } from "../types/chat";

type ChatRealtimeStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface UseChatRealtimeInput {
  conversationId: string;
  enabled: boolean;
  onMessageCreated: (message: ChatMessage) => void;
  onConversationUpdated: (conversationId: string) => void;
}

interface ChatRealtimeEvent {
  type?: string;
  conversationId?: string;
  message?: ChatMessage;
}

const RECONNECT_DELAYS_MS = [500, 1_500, 3_000, 5_000] as const;

function parseRealtimeEvent(data: MessageEvent["data"]): ChatRealtimeEvent | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as ChatRealtimeEvent;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function messageMatchesConversation(message: ChatMessage | undefined, conversationId: string): message is ChatMessage {
  return Boolean(message && message.conversationId === conversationId && Number.isFinite(message.id));
}

export function useChatRealtime({
  conversationId,
  enabled,
  onMessageCreated,
  onConversationUpdated,
}: UseChatRealtimeInput): { status: ChatRealtimeStatus; connected: boolean } {
  const [status, setStatus] = useState<ChatRealtimeStatus>("idle");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryRef = useRef(0);
  const callbacksRef = useRef({ onMessageCreated, onConversationUpdated });

  useEffect(() => {
    callbacksRef.current = { onMessageCreated, onConversationUpdated };
  }, [onMessageCreated, onConversationUpdated]);

  useEffect(() => {
    if (!enabled || !conversationId || typeof window === "undefined" || !("WebSocket" in window)) {
      return undefined;
    }

    let stopped = false;

    function clearReconnectTimer() {
      if (reconnectTimerRef.current === null) return;
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    function closeSocket() {
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close(1000, "chat conversation changed");
    }

    function scheduleReconnect() {
      if (stopped || document.visibilityState === "hidden") return;
      clearReconnectTimer();
      const delay = RECONNECT_DELAYS_MS[Math.min(retryRef.current, RECONNECT_DELAYS_MS.length - 1)];
      retryRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(connect, delay);
    }

    function connect() {
      if (stopped || document.visibilityState === "hidden") return;
      const existing = socketRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;

      clearReconnectTimer();
      setStatus("connecting");
      const socket = new WebSocket(chatRealtimeUrl(conversationId));
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setStatus("connected");
        socket.send("ping");
      };

      socket.onmessage = (event) => {
        const payload = parseRealtimeEvent(event.data);
        if (!payload || payload.conversationId !== conversationId) return;
        if (payload.type === "message.created" && messageMatchesConversation(payload.message, conversationId)) {
          callbacksRef.current.onMessageCreated(payload.message);
          return;
        }
        if (payload.type === "conversation.updated") {
          callbacksRef.current.onConversationUpdated(conversationId);
        }
      };

      socket.onerror = () => {
        setStatus("error");
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped) return;
        setStatus("disconnected");
        scheduleReconnect();
      };
    }

    function resumeRealtime() {
      if (document.visibilityState === "hidden") return;
      if (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED) connect();
    }

    connect();
    window.addEventListener("focus", resumeRealtime);
    window.addEventListener("pageshow", resumeRealtime);
    document.addEventListener("visibilitychange", resumeRealtime);

    return () => {
      stopped = true;
      clearReconnectTimer();
      window.removeEventListener("focus", resumeRealtime);
      window.removeEventListener("pageshow", resumeRealtime);
      document.removeEventListener("visibilitychange", resumeRealtime);
      closeSocket();
      setStatus("idle");
    };
  }, [conversationId, enabled]);

  return { status, connected: status === "connected" };
}
