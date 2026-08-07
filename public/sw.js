const VANARA_SW_VERSION = "2026-08-06-pwa-v1";
const VANARA_CACHE = `vanara-central-${VANARA_SW_VERSION}`;
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/icon-maskable-192.png",
  "/pwa/icon-maskable-512.png",
  "/pwa/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VANARA_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("vanara-central-") && key !== VANARA_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function normalizeNotificationPayload(event) {
  const fallback = {
    title: "Vanara Central",
    body: "Tap to open Vanara Central",
    tag: "vanara-central",
    url: "/",
    soundType: "event",
  };
  if (!event.data) return fallback;
  try {
    return { ...fallback, ...event.data.json() };
  } catch {
    return { ...fallback, body: event.data.text() || fallback.body };
  }
}

function targetUrlFor(payload) {
  try {
    return new URL(payload.url || "/", self.location.origin).toString();
  } catch {
    return new URL("/", self.location.origin).toString();
  }
}

self.addEventListener("push", (event) => {
  const payload = normalizeNotificationPayload(event);
  const url = targetUrlFor(payload);
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: "VANARA_PUSH_NOTIFICATION", payload: { ...payload, url } });
    }
    await self.registration.showNotification(payload.title || "Vanara Central", {
      body: payload.body || "Tap to open Vanara Central",
      tag: payload.tag || "vanara-central",
      data: { url, soundType: payload.soundType === "chat" ? "chat" : "event" },
      badge: "/pwa/icon-192.png",
      icon: "/pwa/icon-192.png",
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = targetUrlFor(event.notification.data || {});
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if ("focus" in client) {
        client.postMessage({ type: "VANARA_NOTIFICATION_OPEN", url: target });
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/") || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
