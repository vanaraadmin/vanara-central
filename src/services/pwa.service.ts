export type PwaUpdateStatus = "idle" | "unsupported" | "ready" | "update-available";
export type PushNotificationStatus = "idle" | "unsupported" | "ready" | "enabled" | "blocked" | "unconfigured" | "error";
export type PwaBuildInfo = {
  clientBuildId: string;
  serverBuildId: string | null;
  aligned: boolean | null;
};

type PwaBuildManifest = {
  buildId: string;
  entryAssets: Array<{ url: string; sha256: string }>;
};

type UpdateCallback = () => void;

const CLIENT_BUILD_ID = typeof __VANARA_BUILD_ID__ === "string" ? __VANARA_BUILD_ID__ : "development";
const UPDATE_THROTTLE_MS = 60_000;
const RELOAD_MARKER_KEY = "vanara:pwa-reload-target";
const VANARA_CACHE_PREFIX = "vanara-central-";
let automaticUpdatePromise: Promise<PwaUpdateStatus> | null = null;
let lastAutomaticUpdateAt = 0;
let lifecycleListenersBound = false;
const observedRegistrations = new WeakSet<ServiceWorkerRegistration>();

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

function currentEntryAssets(): string[] {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src^="/assets/"], link[rel="stylesheet"][href^="/assets/"]')]
    .map((element) => element instanceof HTMLScriptElement ? element.src : element.href)
    .map((value) => new URL(value, window.location.origin).pathname)
    .sort();
}

export function isVanaraBuildAligned(manifest: PwaBuildManifest, clientBuildId: string, clientEntries: string[]): boolean {
  if (!manifest.buildId || manifest.buildId !== clientBuildId) return false;
  const serverEntries = manifest.entryAssets.map((entry) => entry.url).sort();
  return serverEntries.length > 0 && JSON.stringify(serverEntries) === JSON.stringify([...clientEntries].sort());
}

async function fetchBuildManifest(): Promise<PwaBuildManifest> {
  const response = await fetch(`/app-version.json?check=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Build manifest returned HTTP ${response.status}`);
  const manifest = await response.json() as Partial<PwaBuildManifest>;
  if (typeof manifest.buildId !== "string" || !Array.isArray(manifest.entryAssets)) throw new Error("Build manifest is invalid");
  return manifest as PwaBuildManifest;
}

export async function getVanaraBuildInfo(): Promise<PwaBuildInfo> {
  try {
    const manifest = await fetchBuildManifest();
    return {
      clientBuildId: CLIENT_BUILD_ID,
      serverBuildId: manifest.buildId,
      aligned: isVanaraBuildAligned(manifest, CLIENT_BUILD_ID, currentEntryAssets()),
    };
  } catch {
    return { clientBuildId: CLIENT_BUILD_ID, serverBuildId: null, aligned: null };
  }
}

export function shortVanaraBuildId(value: string | null): string {
  if (!value) return "-";
  return value.length > 21 ? `${value.slice(0, 21)}...` : value;
}

function readReloadMarker(): string | null {
  try {
    return window.sessionStorage.getItem(RELOAD_MARKER_KEY);
  } catch {
    return null;
  }
}

function writeReloadMarker(buildId: string | null): void {
  try {
    if (buildId) window.sessionStorage.setItem(RELOAD_MARKER_KEY, buildId);
    else window.sessionStorage.removeItem(RELOAD_MARKER_KEY);
  } catch {
    // A storage restriction must not prevent an update check.
  }
}

async function clearLegacyVanaraCaches(currentBuildId: string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const currentCache = `${VANARA_CACHE_PREFIX}${currentBuildId}`;
  const keys = await window.caches.keys();
  await Promise.all(keys
    .filter((key) => key.startsWith(VANARA_CACHE_PREFIX) && key !== currentCache)
    .map((key) => window.caches.delete(key)));
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorkersAvailable()) return null;
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  await registration.update();
  return registration;
}

function observeRegistration(registration: ServiceWorkerRegistration, onUpdate?: UpdateCallback): void {
  if (observedRegistrations.has(registration)) return;
  observedRegistrations.add(registration);
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) onUpdate?.();
    });
  });
}

async function reconcileVanaraBuild(onUpdate?: UpdateCallback): Promise<PwaUpdateStatus> {
  if (!serviceWorkersAvailable()) return "unsupported";
  const registration = await ensureServiceWorkerRegistration();
  if (!registration) return "ready";
  observeRegistration(registration, onUpdate);

  const manifest = await fetchBuildManifest();
  if (isVanaraBuildAligned(manifest, CLIENT_BUILD_ID, currentEntryAssets())) {
    writeReloadMarker(null);
    return "ready";
  }

  onUpdate?.();
  await clearLegacyVanaraCaches(manifest.buildId);
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });

  if (readReloadMarker() === manifest.buildId) return "update-available";
  writeReloadMarker(manifest.buildId);
  window.setTimeout(() => window.location.reload(), 900);
  return "update-available";
}

function runAutomaticUpdate(onUpdate?: UpdateCallback, force = false): Promise<PwaUpdateStatus> {
  const now = Date.now();
  if (!force && now - lastAutomaticUpdateAt < UPDATE_THROTTLE_MS) return Promise.resolve("ready");
  if (automaticUpdatePromise) return automaticUpdatePromise;
  lastAutomaticUpdateAt = now;
  automaticUpdatePromise = reconcileVanaraBuild(onUpdate).finally(() => {
    automaticUpdatePromise = null;
  });
  return automaticUpdatePromise;
}

function bindLifecycleUpdateChecks(onUpdate?: UpdateCallback): void {
  if (lifecycleListenersBound) return;
  lifecycleListenersBound = true;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "VANARA_BUILD_ACTIVATED") return;
    event.ports[0]?.postMessage({ buildId: CLIENT_BUILD_ID });
  });
  window.addEventListener("pageshow", () => {
    void runAutomaticUpdate(onUpdate).catch(() => null);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void runAutomaticUpdate(onUpdate).catch(() => null);
  });
}

export function registerVanaraServiceWorker(onUpdate?: UpdateCallback): void {
  if (!serviceWorkersAvailable()) return;

  const register = () => {
    bindLifecycleUpdateChecks(onUpdate);
    runAutomaticUpdate(onUpdate, true)
      .then((registration) => {
        if (registration === "unsupported") return;
        void navigator.serviceWorker.getRegistration("/").then((current) => {
          if (!current) return;
          return refreshExistingPushSubscription(current);
        }).catch(() => {
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
  return reconcileVanaraBuild();
}

export async function applyVanaraUpdate(): Promise<PwaUpdateStatus> {
  writeReloadMarker(null);
  return reconcileVanaraBuild();
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
