import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CurrentUser } from "../src/services/current-user.service.ts";
import { normalizeFreeTextTranslationInput, translateFreeText } from "../src/services/free-text-translation.service.ts";

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "owner",
    firstName: "",
    lastName: "",
    displayName: "Owner",
    fullName: "Owner",
    profilePhotoUrl: null,
    role: "Owner",
    preferredLanguage: "en",
    username: "owner",
    email: null,
    status: "active",
    views: ["owner", "staff"],
    permissions: [],
    actionPermissions: [],
    lastLoginAt: null,
    ...overrides,
  };
}

interface CacheRecord {
  entity_type: string;
  entity_id: string;
  field_name: string;
  source_text_hash: string;
  source_language: string | null;
  target_language: string;
  translated_text: string;
  provider: string;
  created_at: string;
  updated_at: string;
}

class FakeStmt {
  constructor(private db: FakeDB, private sql: string) {}
  bind(...params: unknown[]) {
    return {
      first: () => this.db.first(this.sql, params),
      run: () => this.db.run(this.sql, params),
    };
  }
}

class FakeDB {
  procurement = {
    request_id: 7,
    requested_by: "nun",
    request_text_original: "à¸‹à¸·à¹‰à¸­à¸ªà¸šà¸¹à¹ˆ",
    custom_item_text: null,
    note: null,
    original_language: "th",
    translated_text: null as string | null,
    translated_language: null as string | null,
    translated_at: null as string | null,
    translation_provider: null as string | null,
  };
  chat = {
    conversation_id: "general-operations",
    message_id: 11,
    body: "à¸‹à¸·à¹‰à¸­à¸ªà¸šà¸¹à¹ˆ",
    body_language: "th",
    message_kind: "TEXT",
    translated_body: null as string | null,
    translated_language: null as string | null,
  };
  chatParticipants = new Set(["owner"]);
  cache: CacheRecord[] = [];

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async first(sql: string, params: unknown[]) {
    if (sql.includes("FROM procurement_requests")) {
      return Number(params[0]) === this.procurement.request_id ? this.procurement : null;
    }
    if (sql.includes("FROM chat_messages") && sql.includes("chat_conversation_participants")) {
      const [userId, conversationId, messageId] = params;
      if (this.chatParticipants.has(String(userId)) && conversationId === this.chat.conversation_id && Number(messageId) === this.chat.message_id) {
        return this.chat;
      }
      return null;
    }
    if (sql.includes("FROM free_text_translations")) {
      const [entityType, entityId, fieldName, sourceTextHash, targetLanguage] = params.map(String);
      return this.cache.find((row) =>
        row.entity_type === entityType &&
        row.entity_id === entityId &&
        row.field_name === fieldName &&
        row.source_text_hash === sourceTextHash &&
        row.target_language === targetLanguage
      ) ?? null;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO free_text_translations")) {
      const record: CacheRecord = {
        entity_type: String(params[0]),
        entity_id: String(params[1]),
        field_name: String(params[2]),
        source_text_hash: String(params[3]),
        source_language: params[4] === null ? null : String(params[4]),
        target_language: String(params[5]),
        translated_text: String(params[6]),
        provider: String(params[7]),
        created_at: String(params[8]),
        updated_at: String(params[9]),
      };
      const existing = this.cache.findIndex((row) =>
        row.entity_type === record.entity_type &&
        row.entity_id === record.entity_id &&
        row.field_name === record.field_name &&
        row.source_text_hash === record.source_text_hash &&
        row.target_language === record.target_language
      );
      if (existing >= 0) this.cache[existing] = record;
      else this.cache.push(record);
    }
    if (sql.includes("UPDATE procurement_requests")) {
      this.procurement.translated_text = String(params[0]);
      this.procurement.translated_language = String(params[1]);
      this.procurement.translated_at = String(params[2]);
      this.procurement.translation_provider = String(params[3]);
    }
    if (sql.includes("UPDATE chat_messages")) {
      this.chat.translated_body = String(params[0]);
      this.chat.translated_language = String(params[1]);
    }
    return { meta: { changes: 1 } };
  }
}

function env(db: FakeDB, fetcher: typeof fetch) {
  return {
    DB: db as unknown as D1Database,
    GOOGLE_TRANSLATE_API_KEY: "test-secret",
    fetcher,
  };
}

function googleFetcher(calls: Array<{ url: string; body: string }>, translatedText = "Buy soap"): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response(JSON.stringify({
      data: {
        translations: [
          { translatedText, detectedSourceLanguage: "th" },
        ],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("free-text translation uses Google once then reuses long-lived D1 cache for repeated clicks", async () => {
  const db = new FakeDB();
  const calls: Array<{ url: string; body: string }> = [];
  const input = normalizeFreeTextTranslationInput({
    entityType: "procurement_request",
    entityId: "7",
    fieldName: "request_text_original",
    originalText: db.procurement.request_text_original,
    sourceLanguage: "th",
    targetLanguage: "en",
  }, user());

  const first = await translateFreeText(env(db, googleFetcher(calls)), input, user());
  assert.equal(first.cached, false);
  assert.equal(first.translatedText, "Buy soap");

  for (let index = 0; index < 9; index += 1) {
    const cached = await translateFreeText(env(db, googleFetcher(calls)), input, user());
    assert.equal(cached.cached, true);
    assert.equal(cached.translatedText, "Buy soap");
  }

  assert.equal(calls.length, 1);
  assert.equal(db.cache.length, 1);
  assert.match(calls[0]!.url, /translation\.googleapis\.com\/language\/translate\/v2/);
  assert.doesNotMatch(calls[0]!.body, /OPENAI|openai/i);
});

test("free-text translation creates a new cache entry when the source text changes", async () => {
  const db = new FakeDB();
  const calls: Array<{ url: string; body: string }> = [];
  const actor = user();
  await translateFreeText(env(db, googleFetcher(calls, "Buy soap")), normalizeFreeTextTranslationInput({
    entityType: "procurement_request",
    entityId: "7",
    fieldName: "request_text_original",
    originalText: db.procurement.request_text_original,
    targetLanguage: "en",
  }, actor), actor);

  db.procurement.request_text_original = "à¸‹à¸·à¹‰à¸­à¸–à¸¸à¸‡à¸‚à¸¢à¸°";
  await translateFreeText(env(db, googleFetcher(calls, "Buy bin bags")), normalizeFreeTextTranslationInput({
    entityType: "procurement_request",
    entityId: "7",
    fieldName: "request_text_original",
    originalText: db.procurement.request_text_original,
    targetLanguage: "en",
  }, actor), actor);

  assert.equal(calls.length, 2);
  assert.equal(db.cache.length, 2);
});

test("chat message translation checks participant access and updates the message without creating a new chat message", async () => {
  const db = new FakeDB();
  const calls: Array<{ url: string; body: string }> = [];
  const participant = user({ id: "owner", preferredLanguage: "en" });

  const translated = await translateFreeText(env(db, googleFetcher(calls, "Buy soap")), normalizeFreeTextTranslationInput({
    entityType: "chat_message",
    entityId: "general-operations:11",
    fieldName: "body",
    originalText: db.chat.body,
    targetLanguage: "en",
  }, participant), participant);

  assert.equal(translated.translatedText, "Buy soap");
  assert.equal(db.chat.translated_body, "Buy soap");
  assert.equal(db.chat.message_id, 11);

  await assert.rejects(
    translateFreeText(env(db, googleFetcher(calls)), normalizeFreeTextTranslationInput({
      entityType: "chat_message",
      entityId: "general-operations:11",
      fieldName: "body",
      originalText: db.chat.body,
      targetLanguage: "en",
    }, user({ id: "outsider" })), user({ id: "outsider" })),
    /Text was not found/,
  );
});

test("free-text translation source guardrails keep Google centralized and prevent OpenAI or automatic render translation", () => {
  const service = readFileSync(new URL("../src/services/free-text-translation.service.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../../src/components/TranslatableText.tsx", import.meta.url), "utf8");
  const clientService = readFileSync(new URL("../../src/services/translation.service.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../migrations/0040_free_text_translation_cache.sql", import.meta.url), "utf8");

  assert.match(index, /app\.post\("\/api\/translations\/free-text"/);
  assert.match(index, /resolveCurrentUser\(c\)/);
  assert.match(service, /GOOGLE_TRANSLATE_API_KEY/);
  assert.match(service, /translation\.googleapis\.com\/language\/translate\/v2/);
  assert.match(service, /source_text_hash/);
  assert.match(service, /entity_type = \?[\s\S]*entity_id = \?[\s\S]*field_name = \?[\s\S]*source_text_hash = \?[\s\S]*target_language = \?/);
  assert.match(migration, /UNIQUE \(entity_type, entity_id, field_name, source_text_hash, target_language\)/);
  assert.match(component, /onClick=\{\(\) => mutation\.mutate\(\)\}/);
  assert.match(component, /"Translate"/);
  assert.match(clientService, /\/api\/translations\/free-text/);
  assert.doesNotMatch(service + component + clientService, /openai|OPENAI|fake translation|placeholder translation/i);
  assert.doesNotMatch(component, /useEffect\([\s\S]*translateFreeText/);
});
