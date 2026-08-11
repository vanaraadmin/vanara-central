import { useEffect, useRef, useState } from "react";
import { acceptChatInboxInvalidation, chatInboxRealtimeUrl } from "../services/chat.service";

type ChatInboxRealtimeStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface UseChatInboxRealtimeInput {
  enabled: boolean;
  onSummaryChanged: () => void;
}

interface ChatInboxRealtimeEvent {
  type?: string;
  userId?: string;
  eventId?: string;
}

const RECONNECT_DELAYS_MS = [500, 1_500, 3_000, 5_000] as const;

function parseInboxEvent(data: MessageEvent["data"]): ChatInboxRealtimeEvent | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as ChatInboxRealtimeEvent;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function useChatInboxRealtime({
  enabled,
  onSummaryChanged,
}: UseChatInboxRealtimeInput): { status: ChatInboxRealtimeStatus; connected: boolean } {
  const [status, setStatus] = useState<ChatInboxRealtimeStatus>("idle");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryRef = useRef(0);
  const callbackRef = useRef(onSummaryChanged);
  const seenEventIdsRef = useRef(new Set<string>());

  useEffect(() => {
    callbackRef.current = onSummaryChanged;
  }, [onSummaryChanged]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("WebSocket" in window)) return undefined;

    let stopped = false;

    function clearReconnectTimer() {
      if (reconnectTimerRef.current === null) return;
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    function closeSocket() {
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close(1000, "chat inbox stopped");
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
      let socket: WebSocket;
      try {
        socket = new WebSocket(chatInboxRealtimeUrl());
      } catch {
        setStatus("error");
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setStatus("connected");
        callbackRef.current();
        socket.send("ping");
      };

      socket.onmessage = (event) => {
        const payload = parseInboxEvent(event.data);
        if (!payload) return;
        if (payload.type === "ready") {
          callbackRef.current();
          return;
        }
        if (payload.type === "summary.invalidated" && payload.eventId && acceptChatInboxInvalidation(seenEventIdsRef.current, payload.eventId)) {
          callbackRef.current();
        }
      };

      socket.onerror = () => setStatus("error");
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped) return;
        setStatus("disconnected");
        scheduleReconnect();
      };
    }

    function resumeRealtime() {
      if (document.visibilityState === "hidden") return;
      callbackRef.current();
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
  }, [enabled]);

  return { status, connected: status === "connected" };
}
