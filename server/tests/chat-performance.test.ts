import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { listChatMessagePage } from "../src/services/chat.service.ts";
import {
  CHAT_STICKER_COLLECTION_IDS,
  chatStickerCollectionIdForStickerId,
} from "../../src/config/chatStickerCatalog.ts";

interface TestMessageRow {
  message_id: number;
  conversation_id: string;
  author_id: string;
  author_display_name: string;
  author_role: string;
  body: string;
  body_language: "en";
  translated_body: null;
  translated_language: null;
  reply_to_message_id: null;
  message_kind: "TEXT";
  sticker_id: null;
  attachment_object_key: null;
  attachment_file_name: null;
  attachment_content_type: null;
  attachment_byte_size: null;
  attachment_expires_at: null;
  attachment_unavailable_at: null;
  author_profile_photo_url: null;
  created_at: string;
}

class PagedChatStatement {
  private values: unknown[] = [];

  constructor(private readonly db: PagedChatDatabase, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    if (this.sql.includes("FROM chat_conversation_participants") && this.sql.includes("SELECT 1")) {
      return { 1: 1 } as T;
    }
    return null as T | null;
  }

  async all<T>() {
    if (this.sql.includes("FROM chat_messages m") && this.sql.includes("ORDER BY m.created_at DESC")) {
      const conversationId = this.values[0] as string;
      const hasCursor = this.sql.includes("m.message_id < ?");
      const beforeMessageId = hasCursor ? this.values[1] as number : Number.POSITIVE_INFINITY;
      const limit = this.values[hasCursor ? 2 : 1] as number;
      const rows = this.db.messages
        .filter((message) => message.conversation_id === conversationId && message.message_id < beforeMessageId)
        .sort((a, b) => b.message_id - a.message_id)
        .slice(0, limit);
      return { results: rows as T[] };
    }
    if (this.sql.includes("FROM chat_message_reactions")) return { results: [] as T[] };
    return { results: [] as T[] };
  }
}

class PagedChatDatabase {
  readonly messages: TestMessageRow[];

  constructor(conversationId: string, count: number) {
    this.messages = Array.from({ length: count }, (_, index) => {
      const id = index + 1;
      return {
        message_id: id,
        conversation_id: conversationId,
        author_id: id % 2 ? "owner" : "staff",
        author_display_name: id % 2 ? "Stefano" : "Ice",
        author_role: id % 2 ? "Owner" : "Operations",
        body: `Message ${id}`,
        body_language: "en",
        translated_body: null,
        translated_language: null,
        reply_to_message_id: null,
        message_kind: "TEXT",
        sticker_id: null,
        attachment_object_key: null,
        attachment_file_name: null,
        attachment_content_type: null,
        attachment_byte_size: null,
        attachment_expires_at: null,
        attachment_unavailable_at: null,
        author_profile_photo_url: null,
        created_at: new Date(Date.UTC(2026, 7, 11, 0, 0, id)).toISOString(),
      };
    });
  }

  prepare(sql: string) {
    return new PagedChatStatement(this, sql);
  }
}

const owner = {
  id: "owner",
  username: "stefano",
  displayName: "Stefano",
  role: "Owner",
  preferredLanguage: "en",
  views: ["owner", "staff"],
} as never;

const staff = {
  id: "staff",
  username: "ice",
  displayName: "Ice",
  role: "Operations",
  preferredLanguage: "th",
  views: ["staff"],
} as never;

test("chat history starts with the newest page and loads older pages in stable ascending order", async () => {
  const db = new PagedChatDatabase("private-performance", 75);
  const env = { DB: db as unknown as D1Database } as never;

  const firstPage = await listChatMessagePage(env, "private-performance", owner, null, 20);
  assert.deepEqual(firstPage.messages.map((message) => message.id), Array.from({ length: 20 }, (_, index) => index + 56));
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextBeforeMessageId, 56);

  const olderPage = await listChatMessagePage(env, "private-performance", owner, firstPage.nextBeforeMessageId, 20);
  assert.deepEqual(olderPage.messages.map((message) => message.id), Array.from({ length: 20 }, (_, index) => index + 36));
  assert.equal(olderPage.hasMore, true);
  assert.equal(olderPage.nextBeforeMessageId, 36);
});

test("group chat history uses the same bounded cursor contract for staff", async () => {
  const db = new PagedChatDatabase("group-performance", 61);
  const env = { DB: db as unknown as D1Database } as never;

  const firstPage = await listChatMessagePage(env, "group-performance", staff, null, 50);
  assert.deepEqual(firstPage.messages.map((message) => message.id), Array.from({ length: 50 }, (_, index) => index + 12));
  assert.equal(firstPage.hasMore, true);

  const finalPage = await listChatMessagePage(env, "group-performance", staff, firstPage.nextBeforeMessageId, 50);
  assert.deepEqual(finalPage.messages.map((message) => message.id), Array.from({ length: 11 }, (_, index) => index + 1));
  assert.equal(finalPage.hasMore, false);
  assert.equal(finalPage.nextBeforeMessageId, null);
});

test("sticker catalog keeps all historic IDs while splitting eight real collections", () => {
  const collectionDirectory = new URL("../../src/config/chat-sticker-collections/", import.meta.url);
  const fileNames = readdirSync(collectionDirectory).filter((fileName) => fileName.endsWith(".ts")).sort();
  assert.equal(fileNames.length, 8);
  assert.deepEqual(CHAT_STICKER_COLLECTION_IDS.length, 8);

  const definitions = fileNames.flatMap((fileName) => {
    const source = readFileSync(new URL(fileName, collectionDirectory), "utf8");
    assert.match(source, /thumbnailSrc:/);
    return [...source.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]);
  });

  assert.equal(definitions.length, 296);
  assert.equal(new Set(definitions).size, 296);
  for (const stickerId of definitions) assert.ok(chatStickerCollectionIdForStickerId(stickerId));
  assert.deepEqual(definitions.slice(0, 3), ["001", "002", "003"]);
  assert.deepEqual(definitions.slice(-3), ["875570206", "875570207", "875570208"]);
});

test("chat sticker drawer and historic messages load only the selected collection", () => {
  const catalog = readFileSync(new URL("../../src/config/chatStickers.ts", import.meta.url), "utf8");
  const surface = readFileSync(new URL("../../src/components/chat/TeamChatSurface.tsx", import.meta.url), "utf8");
  const clientService = readFileSync(new URL("../../src/services/chat.service.ts", import.meta.url), "utf8");
  const serverService = readFileSync(new URL("../src/services/chat.service.ts", import.meta.url), "utf8");
  const serverRoutes = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

  assert.equal((catalog.match(/=> import\("\.\/chat-sticker-collections\//g) ?? []).length, 8);
  assert.equal((catalog.match(/\.\.\/assets\/stickers\//g) ?? []).length, 8);
  assert.doesNotMatch(catalog, /assets\/stickers\/001\.png/);
  assert.match(surface, /CHAT_STICKER_COLLECTIONS\.map/);
  assert.match(surface, /loadChatStickerCollection\(selectedCollectionId\)/);
  assert.match(surface, /loadChatStickerById\(stickerId\)/);
  assert.match(surface, /src=\{sticker\.thumbnailSrc\}[^>]*loading="lazy"[^>]*decoding="async"/);
  assert.match(surface, /src=\{sticker\.imageSrc\}[^>]*loading="lazy"[^>]*decoding="async"/);

  assert.match(serverService, /ORDER BY m\.created_at DESC, m\.message_id DESC/);
  assert.match(serverService, /safePageSize \+ 1/);
  assert.match(serverService, /descendingRows\.slice\(0, safePageSize\)\.reverse\(\)/);
  assert.match(serverRoutes, /beforeMessageId/);
  const historyRoute = serverRoutes.slice(
    serverRoutes.indexOf('app.get("/api/chat/conversations/:id/messages"'),
    serverRoutes.indexOf('app.post("/api/chat/conversations/:id/messages"'),
  );
  assert.doesNotMatch(historyRoute, /getChatConversation/);
  assert.match(historyRoute, /Chat conversation not found\./);
  assert.match(clientService, /loadChatMessagePage/);
  assert.match(surface, /mergeChatMessagePages/);
  assert.match(surface, /chat-thread__load-older/);
  assert.match(surface, /previousScrollTop \+ viewport\.scrollHeight - previousScrollHeight/);
});
