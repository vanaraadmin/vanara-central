import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_WARAPORN_PROMPT_KEY,
  getPromptChecksum,
  getPromptVersion,
  listPromptVersions,
  shouldLoadPromptFromNodeFilesystem,
} from "../src/services/message-prompt.service.js";

const promptPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/assets/prompts/waraporn-general-requests-v4-rc3.prompt.txt",
);

const expectedChecksum = "1534c2d9654b2ccca292784110d31b7a6aa739fb498709913bd3278ca5e6848e";

test("frozen Waraporn prompt asset matches the approved checksum", () => {
  const prompt = readFileSync(promptPath, "utf8");
  const actualChecksum = createHash("sha256").update(prompt, "utf8").digest("hex");

  assert.equal(actualChecksum, expectedChecksum);
  assert.equal(getPromptChecksum(DEFAULT_WARAPORN_PROMPT_KEY), expectedChecksum);
  assert.equal(getPromptVersion(DEFAULT_WARAPORN_PROMPT_KEY), "SYSTEM_PROMPT_V4_RC3_HARD_EXECUTION_GATE");
  assert.match(prompt, /^# SYSTEM_PROMPT_V4_RC3_HARD_EXECUTION_GATE/);
});

test("prompt registry contains only the current frozen Make prompt", () => {
  const prompts = listPromptVersions();

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0]?.key, DEFAULT_WARAPORN_PROMPT_KEY);
  assert.equal(prompts[0]?.checksum, expectedChecksum);
});

test("prompt loader does not use Node filesystem inside Cloudflare Workers nodejs_compat", () => {
  assert.equal(shouldLoadPromptFromNodeFilesystem({
    process: { versions: { node: "24.0.0" } },
  }), true);

  assert.equal(shouldLoadPromptFromNodeFilesystem({
    process: { versions: { node: "24.0.0" } },
    WebSocketPair: function WebSocketPair() {},
  }), false);

  assert.equal(shouldLoadPromptFromNodeFilesystem({
    process: { versions: { node: "24.0.0" } },
    navigator: { userAgent: "Cloudflare-Workers" },
  }), false);
});
