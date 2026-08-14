const VANARA_BUILD_ID = "__VANARA_BUILD_ID__";
const VANARA_CACHE = `vanara-central-${VANARA_BUILD_ID}`;
const CLIENT_BUILD_TIMEOUT_MS = 750;

function readClientBuild(client) {
  if (typeof MessageChannel !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => resolve(null), CLIENT_BUILD_TIMEOUT_MS);
    channel.port1.onmessage = (message) => {
      clearTimeout(timeout);
      resolve(typeof message.data?.buildId === "string" ? message.data.buildId : null);
    };
    client.postMessage({ type: "VANARA_BUILD_ACTIVATED", buildId: VANARA_BUILD_ID }, [channel.port2]);
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VANARA_CACHE)
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("vanara-central-") && key !== VANARA_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();

    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map(async (client) => {
      const clientBuild = await readClientBuild(client);
      if (clientBuild === VANARA_BUILD_ID || !("navigate" in client)) return;
      await client.navigate(client.url).catch(() => null);
    }));
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    const fallback = {
      title: "New message received",
      body: "Open Vanara Central to view the message",
      tag: "vanara-central-message",
      url: "/chat"
    };
    let payload = fallback;
    try {
      if (event.data) {
        const parsed = event.data.json();
        if (parsed && typeof parsed === "object") payload = { ...fallback, ...parsed };
      }
    } catch (error) {
      console.warn("Vanara push payload fallback", error);
    }

    const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : fallback.title;
    const body = typeof payload.body === "string" && payload.body.trim() ? payload.body.trim() : fallback.body;
    const tag = typeof payload.tag === "string" && payload.tag.trim() ? payload.tag.trim() : fallback.tag;
    const url = typeof payload.url === "string" && payload.url.trim() ? payload.url.trim() : fallback.url;

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
      await self.registration.showNotification(fallback.title, {
        body: fallback.body,
        tag: `${fallback.tag}-fallback`,
        data: { url: fallback.url }
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

  if (request.mode === "navigate") {
    event.respondWith(fetch(new Request(request, { cache: "no-store" })));
    return;
  }
});
