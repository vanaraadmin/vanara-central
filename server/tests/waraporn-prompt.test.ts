import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { shouldLoadPromptFromNodeFilesystem } from "../src/services/message-prompt.service.js";

const promptPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/assets/prompts/waraporn-general-requests-v4-rc3.prompt.txt",
);

const expectedChecksum = "1534c2d9654b2ccca292784110d31b7a6aa739fb498709913bd3278ca5e6848e";

test("frozen Waraporn prompt asset matches the approved checksum", () => {
  const prompt = readFileSync(promptPath, "utf8");
  const actualChecksum = createHash("sha256").update(prompt, "utf8").digest("hex");

  assert.equal(actualChecksum, expectedChecksum);
  assert.match(prompt, /^# SYSTEM_PROMPT_V4_RC3_HARD_EXECUTION_GATE/);
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
