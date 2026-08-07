import { useEffect, useRef, useState } from "react";

import chatSoundUrl from "../assets/sounds/notification_chat_message.mp3";
import eventSoundUrl from "../assets/sounds/event_alert_notification.mp3";
import { listenForVanaraNotifications, type VanaraPushPayload } from "../services/pwa.service";
import "../styles/AppNotificationToaster.css";

const TOAST_MS = 6000;

export default function AppNotificationToaster() {
  const [payload, setPayload] = useState<VanaraPushPayload | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => listenForVanaraNotifications((nextPayload) => {
    setPayload(nextPayload);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setPayload(null), TOAST_MS);
    const audio = new Audio(nextPayload.soundType === "chat" ? chatSoundUrl : eventSoundUrl);
    audio.volume = 0.72;
    void audio.play().catch(() => {
      // Browsers may block foreground audio until the user interacts with the app.
    });
  }), []);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  if (!payload) return null;

  return (
    <button
      className="vanara-notification-toast"
      onClick={() => window.location.assign(payload.url || "/")}
      type="button"
    >
      <strong>{payload.title}</strong>
      <span>{payload.body}</span>
    </button>
  );
}
