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

async function syncPushSubscription(subscription: PushSubscription): Promise<boolean> {
  const response = await fetch("/api/notifications/push/subscriptions", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return response.ok;
}

async function refreshExistingPushSubscription(registration: ServiceWorkerRegistration): Promise<void> {
  if (!pushAvailable() || Notification.permission !== "granted") return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await syncPushSubscription(subscription);
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorkersAvailable()) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export function registerVanaraServiceWorker(onUpdate?: UpdateCallback): void {
  if (!serviceWorkersAvailable()) return;

  const register = () => {
    ensureServiceWorkerRegistration()
      .then((registration) => {
        if (!registration) return;
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) onUpdate?.();
          });
        });
        void refreshExistingPushSubscription(registration).catch(() => {
          // Push health refresh is best-effort and must never block app startup.
        });
      })
      .catch(() => {
        // PWA registration must never block the operational app.
      });
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
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
  const registration = await ensureServiceWorkerRegistration();
  if (!registration) return "ready";
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await syncPushSubscription(subscription);
  return subscription ? "enabled" : "ready";
}

export async function enablePushNotifications(): Promise<PushNotificationStatus> {
  if (!pushAvailable()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return "blocked";
  const key = await pushPublicKey();
  if (!key.configured || !key.publicKey) return "unconfigured";
  const ensuredRegistration = await ensureServiceWorkerRegistration();
  if (!ensuredRegistration) return "unsupported";
  const registration = await navigator.serviceWorker.ready.catch(() => ensuredRegistration);
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(key.publicKey),
    });
  const synced = await syncPushSubscription(subscription);
  if (!synced) return "error";
  return "enabled";
}
