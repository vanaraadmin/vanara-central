import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CHAT_THREAD_BOOTSTRAP_TIMEOUT_MS,
  chatThreadUnavailableCopy,
  resolveChatThreadLoadPhase,
} from "../../src/components/chat/chatThreadLoading.ts";

test("chat thread bootstrap leaves loading after eight seconds and can recover", () => {
  const initial = {
    bootstrapState: "loading" as const,
    hasConversation: false,
    hasMessages: false,
    timedOut: false,
    retrying: false,
    failed: false,
  };

  assert.equal(CHAT_THREAD_BOOTSTRAP_TIMEOUT_MS, 8_000);
  assert.equal(resolveChatThreadLoadPhase(initial), "loading");
  assert.equal(resolveChatThreadLoadPhase({ ...initial, timedOut: true }), "unavailable");
  assert.equal(resolveChatThreadLoadPhase({ ...initial, timedOut: true, retrying: true }), "loading");
  assert.equal(resolveChatThreadLoadPhase({
    ...initial,
    bootstrapState: "ready",
    hasConversation: true,
    hasMessages: true,
  }), "ready");
});

test("cached chat history remains visible during refetch and background failure", () => {
  assert.equal(resolveChatThreadLoadPhase({
    bootstrapState: "ready",
    hasConversation: true,
    hasMessages: true,
    timedOut: false,
    retrying: true,
    failed: true,
  }), "ready");
});

test("chat unavailable copy is exact for English owner and Thai staff", () => {
  const owner = { role: "Owner", language: "en" as const };
  const staff = { role: "Operations", language: "th" as const };

  assert.deepEqual(chatThreadUnavailableCopy(owner.language), {
    title: "Chat could not be loaded",
    action: "Try again",
  });
  assert.deepEqual(chatThreadUnavailableCopy(staff.language), {
    title: "เปิดแชตไม่ได้",
    action: "ลองอีกครั้ง",
  });
});

test("chat surface retries only the selected thread without clearing cached history or reloading the PWA", () => {
  const surface = readFileSync(new URL("../../src/components/chat/TeamChatSurface.tsx", import.meta.url), "utf8");
  const retryBlock = surface.match(/const retryThread = \(\) => \{[\s\S]*?\n[ ]{2}\};/)?.[0] ?? "";

  assert.match(surface, /threadState === "loading"[\s\S]*<PageLoading \/>/);
  assert.match(surface, /threadState === "unavailable"[\s\S]*threadUnavailableCopy\.title[\s\S]*onClick=\{retryThread\}/);
  assert.match(surface, /window\.setTimeout\([\s\S]*CHAT_THREAD_BOOTSTRAP_TIMEOUT_MS/);
  assert.match(retryBlock, /cancelQueries\(\{ queryKey: \["chat", "conversation", conversationId\], exact: true \}\)/);
  assert.match(retryBlock, /cancelQueries\(\{ queryKey: \["chat", "messages", conversationId\], exact: true \}\)/);
  assert.match(retryBlock, /conversationQuery\.refetch\(\)/);
  assert.match(retryBlock, /messagesQuery\.refetch\(\)/);
  assert.doesNotMatch(retryBlock, /conversationsQuery|currentUserQuery|window\.location|location\.reload/);
  assert.match(surface, /const messages = useMemo\(\(\) => messagesQuery\.data \?\? \[\]/);
  assert.doesNotMatch(retryBlock, /removeQueries|resetQueries|setQueryData/);
});

test("all frozen chat, push, service-worker and realtime files except the approved surface stay immutable", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../scripts/release-frozen-baseline.json", import.meta.url), "utf8")) as {
    files: Record<string, string>;
    binaryExtensions: string[];
  };
  const approvedException = "src/components/chat/TeamChatSurface.tsx";
  assert.ok(Object.hasOwn(manifest.files, approvedException));

  for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
    if (relativePath === approvedException) continue;
    const bytes = readFileSync(new URL(`../../${relativePath}`, import.meta.url));
    const extension = relativePath.slice(relativePath.lastIndexOf(".")).toLowerCase();
    const content = manifest.binaryExtensions.includes(extension)
      ? bytes
      : Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
    const actualHash = createHash("sha256").update(content).digest("hex");
    assert.equal(actualHash, expectedHash, `${relativePath} changed outside the approved anti-limbo surface`);
  }
});
