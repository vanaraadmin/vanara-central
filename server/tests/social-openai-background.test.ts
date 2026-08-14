import assert from "node:assert/strict";
import test from "node:test";

import {
  runSocialOpenAiBackgroundResponse,
  SocialOpenAiBackgroundError,
  type SocialOpenAiBackgroundCheckpoint,
} from "../src/services/social-openai-background.service.ts";

type ProviderCall = { method: string; url: string; body: unknown; clientRequestId: string | null };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "req-provider-1" },
  });
}

test("background response submits once and completes through GET polling", async () => {
  const calls: ProviderCall[] = [];
  const checkpoints: SocialOpenAiBackgroundCheckpoint[] = [];
  const replies = [
    { id: "resp_social_1", status: "queued" },
    { id: "resp_social_1", status: "in_progress" },
    { id: "resp_social_1", status: "completed", output: [] },
  ];
  const fetcher = async (input: string, init: RequestInit) => {
    calls.push({
      method: init.method ?? "GET",
      url: input,
      body: init.body ? JSON.parse(String(init.body)) : null,
      clientRequestId: new Headers(init.headers).get("x-client-request-id"),
    });
    return jsonResponse(replies.shift());
  };

  const result = await runSocialOpenAiBackgroundResponse({
    apiKey: "test-key",
    body: { model: "test-model", input: "image" },
    clientRequestId: "social-image-1",
    fetcher,
    timeoutMs: 500,
    pollIntervalMs: 0,
    onCheckpoint: async (checkpoint) => { checkpoints.push(checkpoint); },
  });

  assert.equal(result.responseId, "resp_social_1");
  assert.deepEqual(calls.map((call) => call.method), ["POST", "GET", "GET"]);
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  assert.equal((calls[0]?.body as { background?: boolean }).background, true);
  assert.equal(calls.every((call) => call.clientRequestId === "social-image-1"), true);
  assert.deepEqual(checkpoints.map((item) => [item.submitted, item.status]), [
    [true, "queued"],
    [false, "in_progress"],
    [false, "completed"],
  ]);
});

test("restart with a persisted response id performs GET only", async () => {
  const methods: string[] = [];
  const result = await runSocialOpenAiBackgroundResponse({
    apiKey: "test-key",
    body: null,
    clientRequestId: "stable-client-request",
    responseId: "resp_existing",
    timeoutMs: 500,
    pollIntervalMs: 0,
    fetcher: async (_input, init) => {
      methods.push(init.method ?? "GET");
      return jsonResponse({ id: "resp_existing", status: "completed", output: [] });
    },
    onCheckpoint: async () => undefined,
  });

  assert.equal(result.responseId, "resp_existing");
  assert.deepEqual(methods, ["GET"]);
});

test("poll interruption never creates a second POST", async () => {
  const methods: string[] = [];
  await assert.rejects(
    runSocialOpenAiBackgroundResponse({
      apiKey: "test-key",
      body: { model: "test-model" },
      clientRequestId: "stable-client-request",
      timeoutMs: 20,
      pollIntervalMs: 0,
      fetcher: async (_input, init) => {
        const method = init.method ?? "GET";
        methods.push(method);
        if (method === "POST") return jsonResponse({ id: "resp_pending", status: "queued" });
        throw new Error("network interrupted");
      },
      onCheckpoint: async () => undefined,
    }),
    (error: unknown) => error instanceof SocialOpenAiBackgroundError
      && error.code === "timeout"
      && error.responseId === "resp_pending",
  );
  assert.equal(methods.filter((method) => method === "POST").length, 1);
  assert.equal(methods.every((method, index) => index === 0 ? method === "POST" : method === "GET"), true);
});

test("an ambiguous initial POST is terminal for automatic processing", async () => {
  let calls = 0;
  await assert.rejects(
    runSocialOpenAiBackgroundResponse({
      apiKey: "test-key",
      body: { model: "test-model" },
      clientRequestId: "stable-client-request",
      timeoutMs: 100,
      fetcher: async () => {
        calls += 1;
        throw new Error("connection closed after send");
      },
      onCheckpoint: async () => undefined,
    }),
    (error: unknown) => error instanceof SocialOpenAiBackgroundError
      && error.code === "ambiguous_submission"
      && error.responseId === null,
  );
  assert.equal(calls, 1);
});
