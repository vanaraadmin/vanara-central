export type PwaUpdateStatus = "idle" | "unsupported" | "ready" | "update-available";
export type PushNotificationStatus = "idle" | "unsupported" | "ready" | "enabled" | "blocked" | "unconfigured" | "error";

type UpdateCallback = () => void;

function serviceWorkersAvailable(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

function pushAvailable(): boolean {
  return serviceWorkersAvailable() && "PushManager" in window && "Notification" in window;
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function pushPublicKey(): Promise<{ publicKey: string | null; configured: boolean }> {
  const response = await fetch("/api/notifications/push/public-key", { credentials: "same-origin", headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null) as { success?: boolean; data?: { publicKey?: string | null; configured?: boolean }; error?: string } | null;
  if (!response.ok || !body?.success) throw new Error(body?.error ?? "Notifications are unavailable.");
  return { publicKey: body.data?.publicKey ?? null, configured: body.data?.configured === true };
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

export async function checkPushNotificationStatus(): Promise<PushNotificationStatus> {
  if (!pushAvailable()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const key = await pushPublicKey();
  if (!key.configured || !key.publicKey) return "unconfigured";
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return "ready";
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "enabled" : "ready";
}

export async function enablePushNotifications(): Promise<PushNotificationStatus> {
  if (!pushAvailable()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const key = await pushPublicKey();
  if (!key.configured || !key.publicKey) return "unconfigured";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return "blocked";
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToArrayBuffer(key.publicKey),
  });
  const response = await fetch("/api/notifications/push/subscriptions", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) return "error";
  return "enabled";
}
