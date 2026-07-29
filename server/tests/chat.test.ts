import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMessageInput, resolveCurrentChatUser } from "../src/services/chat.service.ts";

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

test("chat temporary current user is resolved server-side from future auth-compatible headers", () => {
  const user = resolveCurrentChatUser({
    req: {
      header(name: string) {
        const headers: Record<string, string> = {
          "x-vanara-user-id": "reception-1",
          "x-vanara-user-name": "Mint",
          "x-vanara-user-role": "Reception",
        };
        return headers[name];
      },
    },
  } as never);

  assert.deepEqual(user, {
    id: "reception-1",
    displayName: "Mint",
    role: "Reception",
  });
});
