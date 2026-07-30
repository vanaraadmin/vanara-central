import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMessageInput } from "../src/services/chat.service.ts";

test("chat message input requires non-empty body", () => {
  assert.throws(() => normalizeMessageInput({ body: "   " }), /Message body is required/);
});

test("chat message input keeps bilingual structure in one record", () => {
  const input = normalizeMessageInput({
    body: "Room 5 is ready.",
    bodyLanguage: "en",
    translatedBody: "ห้อง 5 พร้อมแล้วค่ะ",
    translatedLanguage: "th",
  });

  assert.deepEqual(input, {
    body: "Room 5 is ready.",
    bodyLanguage: "en",
    translatedBody: "ห้อง 5 พร้อมแล้วค่ะ",
    translatedLanguage: "th",
  });
});
