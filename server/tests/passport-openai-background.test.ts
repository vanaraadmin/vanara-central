import assert from "node:assert/strict";
import test from "node:test";
import { createAndPollPassportOpenAiResponse } from "../src/services/passport-openai-background.service.ts";

test("passport OpenAI background request submits once and recovers a late completed response by GET", async () => {
  let posts = 0;
  let gets = 0;
  const result = await createAndPollPassportOpenAiResponse({
    apiKey: "test-key",
    body: { model: "test-model", input: "passport" },
    pollIntervalMs: 1,
    timeoutMs: 1_000,
    fetcher: async (input, init) => {
      if (init.method === "POST") {
        posts += 1;
        const body = JSON.parse(String(init.body)) as { background?: boolean };
        assert.equal(body.background, true);
        assert.ok(new Headers(init.headers).get("x-client-request-id"));
        return new Response(JSON.stringify({ id: "resp_passport_1", status: "in_progress" }), {
          status: 200,
          headers: { "content-type": "application/json", "x-request-id": "req-passport" },
        });
      }
      gets += 1;
      assert.equal(input, "https://api.openai.com/v1/responses/resp_passport_1");
      return new Response(JSON.stringify({
        id: "resp_passport_1",
        status: "completed",
        output: [{ content: [{ type: "output_text", text: "{\"ok\":true}" }] }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(posts, 1);
  assert.equal(gets, 1);
  assert.equal(result.responseId, "resp_passport_1");
  assert.equal(result.openAiRequestId, "req-passport");
});

test("passport OpenAI polling failure never creates a second POST", async () => {
  let posts = 0;
  let gets = 0;
  await assert.rejects(createAndPollPassportOpenAiResponse({
    apiKey: "test-key",
    body: { model: "test-model", input: "passport" },
    pollIntervalMs: 1,
    timeoutMs: 20,
    fetcher: async (_input, init) => {
      if (init.method === "POST") {
        posts += 1;
        return new Response(JSON.stringify({ id: "resp_passport_2", status: "queued" }), { status: 200 });
      }
      gets += 1;
      throw new TypeError("network unavailable");
    },
  }));
  assert.equal(posts, 1);
  assert.ok(gets >= 1);
});
