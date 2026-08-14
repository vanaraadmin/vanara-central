import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { isVanaraBuildAligned, shortVanaraBuildId } from "../../src/services/pwa.service.ts";

const serviceWorker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const pwaService = readFileSync(new URL("../../src/services/pwa.service.ts", import.meta.url), "utf8");
const profilePanel = readFileSync(new URL("../../src/components/ProfilePanel.tsx", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
const buildVerifier = readFileSync(new URL("../../scripts/verify-pwa-build.mjs", import.meta.url), "utf8");

test("build handshake requires the same build ID and entry assets", () => {
  const manifest = {
    buildId: "build-2",
    entryAssets: [
      { url: "/assets/index-new.js", sha256: "js" },
      { url: "/assets/index-new.css", sha256: "css" },
    ],
  };
  assert.equal(isVanaraBuildAligned(manifest, "build-2", ["/assets/index-new.css", "/assets/index-new.js"]), true);
  assert.equal(isVanaraBuildAligned(manifest, "build-1", ["/assets/index-new.css", "/assets/index-new.js"]), false);
  assert.equal(isVanaraBuildAligned(manifest, "build-2", ["/assets/index-old.css", "/assets/index-new.js"]), false);
  assert.equal(shortVanaraBuildId("1234567890123456789012345"), "123456789012345678901...");
});

test("build output is stamped atomically and version endpoints are no-store", () => {
  assert.match(viteConfig, /__VANARA_BUILD_ID__:\s*JSON\.stringify\(releaseBuildId\)/);
  assert.match(viteConfig, /serviceWorker\.replaceAll\(buildIdPlaceholder, releaseBuildId\)/);
  assert.match(viteConfig, /app-version\.json/);
  assert.match(viteConfig, /entryAssets:\s*entries/);
  assert.match(buildVerifier, /PWA manifest entries do not match index\.html/);
  assert.match(buildVerifier, /sw\.js and app-version\.json build IDs differ/);
  assert.match(headers, /\/sw\.js[\s\S]*Cache-Control:\s*no-store, no-cache, must-revalidate/);
  assert.match(headers, /\/app-version\.json[\s\S]*Cache-Control:\s*no-store, no-cache, must-revalidate/);
});

test("legacy cache activation upgrades an old client once without caching API or assets", async () => {
  const listeners = new Map<string, (event: { request?: unknown; waitUntil?(promise: Promise<unknown>): void; respondWith?(promise: Promise<unknown>): void }) => void>();
  const deleted: string[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  let claimed = 0;
  const client = {
    url: "https://central.vanararetreat.com/staff",
    postMessage() {},
    async navigate(url: string) {
      navigated.push(url);
      return client;
    },
  };
  class FakeRequest {
    url: string;
    method: string;
    mode: string;
    cache?: string;
    constructor(input: FakeRequest, init?: { cache?: string }) {
      this.url = input.url;
      this.method = input.method;
      this.mode = input.mode;
      this.cache = init?.cache;
    }
  }
  const fetched: FakeRequest[] = [];
  const selfFixture = {
    addEventListener(type: string, listener: typeof listeners extends Map<string, infer T> ? T : never) {
      listeners.set(type, listener);
    },
    async skipWaiting() {},
    clients: {
      async claim() { claimed += 1; },
      async matchAll() { return [client]; },
    },
    registration: { async showNotification() {} },
    location: { origin: "https://central.vanararetreat.com" },
  };
  const cachesFixture = {
    async open(name: string) { opened.push(name); return {}; },
    async keys() { return ["vanara-central-2026-08-11-chat-push-v1", "vanara-central-cache-8", "other-app"]; },
    async delete(name: string) { deleted.push(name); return true; },
  };
  runInNewContext(serviceWorker, {
    self: selfFixture,
    caches: cachesFixture,
    console,
    URL,
    Response,
    Request: FakeRequest,
    MessageChannel: undefined,
    setTimeout,
    clearTimeout,
    fetch: async (request: FakeRequest) => { fetched.push(request); return new Response("ok"); },
  });

  let installWait: Promise<unknown> | null = null;
  listeners.get("install")?.({ waitUntil: (promise) => { installWait = promise; } });
  await installWait;
  assert.deepEqual(opened, ["vanara-central-__VANARA_BUILD_ID__"]);

  let activateWait: Promise<unknown> | null = null;
  listeners.get("activate")?.({ waitUntil: (promise) => { activateWait = promise; } });
  await activateWait;
  assert.equal(claimed, 1);
  assert.deepEqual(deleted, ["vanara-central-2026-08-11-chat-push-v1", "vanara-central-cache-8"]);
  assert.deepEqual(navigated, ["https://central.vanararetreat.com/staff"]);

  let apiIntercepted = false;
  listeners.get("fetch")?.({
    request: { method: "GET", mode: "cors", url: "https://central.vanararetreat.com/api/housekeeping" },
    respondWith: () => { apiIntercepted = true; },
  });
  assert.equal(apiIntercepted, false);

  let assetIntercepted = false;
  listeners.get("fetch")?.({
    request: { method: "GET", mode: "cors", url: "https://central.vanararetreat.com/assets/index-old.js" },
    respondWith: () => { assetIntercepted = true; },
  });
  assert.equal(assetIntercepted, false);

  let navigationWait: Promise<unknown> | null = null;
  listeners.get("fetch")?.({
    request: { method: "GET", mode: "navigate", url: "https://central.vanararetreat.com/staff" },
    respondWith: (promise) => { navigationWait = promise; },
  });
  await navigationWait;
  assert.equal(fetched[0]?.cache, "no-store");
});

test("boot and resume checks are bounded and preserve push subscriptions", () => {
  assert.match(pwaService, /updateViaCache:\s*"none"/);
  assert.match(pwaService, /await registration\.update\(\)/);
  assert.match(pwaService, /UPDATE_THROTTLE_MS = 60_000/);
  assert.match(pwaService, /window\.addEventListener\("pageshow"/);
  assert.match(pwaService, /document\.addEventListener\("visibilitychange"/);
  assert.match(pwaService, /RELOAD_MARKER_KEY/);
  assert.equal((pwaService.match(/window\.location\.reload\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(pwaService, /\.unregister\(|\.unsubscribe\(/);
  assert.match(pwaService, /refreshExistingPushSubscription/);
  assert.match(pwaService, /pushManager\.getSubscription\(\)/);
  assert.match(profilePanel, /getVanaraBuildInfo/);
  assert.match(profilePanel, /translate\("clientBuild"\)/);
  assert.match(profilePanel, /translate\("serverBuild"\)/);
});
