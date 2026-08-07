export type PwaUpdateStatus = "idle" | "unsupported" | "ready" | "update-available";
export type VanaraNotificationSound = "chat" | "event";
export type VanaraNotificationStatus = "unsupported" | "not-configured" | "default" | "blocked" | "enabled";

export interface VanaraPushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  soundType: VanaraNotificationSound;
}

type UpdateCallback = () => void;
type NotificationCallback = (payload: VanaraPushPayload) => void;

function serviceWorkersAvailable(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

export function registerVanaraServiceWorker(onUpdate?: UpdateCallback): void {
  if (!serviceWorkersAvailable()) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) onUpdate?.();
          });
        });
      })
      .catch(() => {
        // PWA registration must never block the operational app.
      });
  });
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output.buffer;
}

async function notificationStatusResponse(): Promise<{ vapidPublicKey: string | null; subscriptionCount: number }> {
  const response = await fetch("/api/notifications/status", { credentials: "include", headers: { Accept: "application/json" } });
  const parsed = await response.json().catch(() => null) as { success?: boolean; data?: { vapidPublicKey?: string | null; subscriptionCount?: number }; error?: string } | null;
  if (!response.ok || !parsed?.success || !parsed.data) throw new Error(parsed?.error ?? "Notifications are unavailable.");
  return {
    vapidPublicKey: parsed.data.vapidPublicKey ?? null,
    subscriptionCount: parsed.data.subscriptionCount ?? 0,
  };
}

function notificationsAvailable(): boolean {
  return serviceWorkersAvailable() && "PushManager" in window && "Notification" in window;
}

export async function checkPhoneNotificationStatus(): Promise<VanaraNotificationStatus> {
  if (!notificationsAvailable()) return "unsupported";
  const status = await notificationStatusResponse();
  if (!status.vapidPublicKey) return "not-configured";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "default";
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "enabled" : "default";
}

export async function enablePhoneNotifications(): Promise<VanaraNotificationStatus> {
  if (!notificationsAvailable()) return "unsupported";
  const status = await notificationStatusResponse();
  if (!status.vapidPublicKey) return "not-configured";
  if (Notification.permission === "denied") return "blocked";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "default";
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToArrayBuffer(status.vapidPublicKey),
  });
  const response = await fetch("/api/notifications/subscriptions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  const parsed = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
  if (!response.ok || !parsed?.success) throw new Error(parsed?.error ?? "Notifications could not be enabled.");
  return "enabled";
}

export function listenForVanaraNotifications(callback: NotificationCallback): () => void {
  if (!serviceWorkersAvailable()) return () => undefined;
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === "VANARA_PUSH_NOTIFICATION" && event.data.payload) {
      callback(event.data.payload as VanaraPushPayload);
    }
    if (event.data?.type === "VANARA_NOTIFICATION_OPEN" && typeof event.data.url === "string") {
      window.location.assign(event.data.url);
    }
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
}

export async function checkVanaraUpdate(): Promise<PwaUpdateStatus> {
  if (!serviceWorkersAvailable()) return "unsupported";
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return "ready";
  await registration.update();
  return registration.waiting ? "update-available" : "ready";
}

export async function applyVanaraUpdate(): Promise<PwaUpdateStatus> {
  if (!serviceWorkersAvailable()) return "unsupported";
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.waiting) return checkVanaraUpdate();

  return new Promise((resolve) => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
      resolve("ready");
    });
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  });
}
