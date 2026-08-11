import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("release guard preserves the canonical chat, push, badge, realtime, subscription, and service-worker baseline", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-frozen-release-scope.mjs"], {
    cwd: new URL("../..", import.meta.url),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /FROZEN_RELEASE_GUARD=PASS/);
});
