const VANARA_SW_VERSION = "2026-08-08-pwa-v2";
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

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Vanara Central", body: "New app alert" };
  }
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title : "Vanara Central";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    tag: typeof payload.tag === "string" ? payload.tag : "vanara-central",
    data: { url: typeof payload.url === "string" ? payload.url : "/" },
    icon: "/pwa/icon-192.png",
    badge: "/pwa/icon-192.png"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const exact = clients.find((client) => client.url === targetUrl);
    if (exact) {
      await exact.focus();
      return;
    }

    const sameOrigin = clients.find((client) => client.url.startsWith(self.location.origin));
    if (sameOrigin && "navigate" in sameOrigin) {
      const navigated = await sameOrigin.navigate(targetUrl);
      if (navigated && "focus" in navigated) {
        await navigated.focus();
        return;
      }
    }

    await self.clients.openWindow(targetUrl);
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
