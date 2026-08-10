const VANARA_SW_VERSION = "2026-08-10-pwa-stability-v1";
const VANARA_CACHE = `vanara-central-${VANARA_SW_VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
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
  event.waitUntil((async () => {
    let payload = { title: "Vanara Central", body: "New message received", tag: "vanara-central", url: "/" };
    try {
      if (event.data) {
        const parsed = event.data.json();
        if (parsed && typeof parsed === "object") payload = { ...payload, ...parsed };
      }
    } catch (error) {
      console.warn("Vanara push payload fallback", error);
    }

    const notification = payload.notification && typeof payload.notification === "object" ? payload.notification : {};
    const title = typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : typeof notification.title === "string" && notification.title.trim() ? notification.title.trim() : "Vanara Central";
    const body = typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : typeof notification.body === "string" && notification.body.trim() ? notification.body.trim() : "New message received";
    const tag = typeof payload.tag === "string" && payload.tag.trim()
      ? payload.tag.trim()
      : typeof notification.tag === "string" && notification.tag.trim() ? notification.tag.trim() : "vanara-central";
    const url = typeof payload.url === "string" && payload.url.trim()
      ? payload.url.trim()
      : typeof notification.navigate === "string" && notification.navigate.trim() ? notification.navigate.trim() : "/";
    try {
      await self.registration.showNotification(title, {
        body,
        tag,
        data: { url },
        icon: "/pwa/icon-192.png",
        badge: "/pwa/icon-192.png"
      });
    } catch (error) {
      console.error("Vanara push showNotification failed", error);
      await self.registration.showNotification("Vanara Central", {
        body: "New message received",
        tag: "vanara-central-fallback",
        data: { url: "/" }
      });
    }
  })());
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

  event.respondWith(fetch(request));
});
