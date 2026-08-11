import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const serverRoot = join(repoRoot, "server");
const tscPath = join(serverRoot, "node_modules", "typescript", "bin", "tsc");
const frozenBaseline = "b98ce98076106ad449c81343bba7f381f32ce672";
const frozenFiles = [
  "server/src/services/chat-conversation-room.do.ts",
  "server/src/services/chat-user-inbox-room.do.ts",
];

const unchanged = spawnSync("git", ["diff", "--quiet", frozenBaseline, "--", ...frozenFiles], {
  cwd: repoRoot,
});
if (unchanged.status !== 0) {
  console.error("SERVER_TYPECHECK=FAIL frozen Durable Object source differs from the canonical baseline");
  process.exit(1);
}

const result = spawnSync(process.execPath, [tscPath, "-p", join(serverRoot, "tsconfig.json"), "--pretty", "false"], {
  cwd: serverRoot,
  encoding: "utf8",
});
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(/\r\n/g, "\n");

if (result.status === 0) {
  process.stdout.write(output);
  console.log("SERVER_TYPECHECK=PASS");
  process.exit(0);
}

const diagnostics = output.split("\n").filter((line) => /error TS\d+:/.test(line));
const expected = [
  /^src\/services\/chat-conversation-room\.do\.ts\(65,11\): error TS2416: Property 'connect'/,
  /^src\/services\/chat-user-inbox-room\.do\.ts\(72,11\): error TS2416: Property 'connect'/,
];
const onlyFrozenBaselineDiagnostics = diagnostics.length === expected.length
  && expected.every((pattern) => diagnostics.some((line) => pattern.test(line)));

if (!onlyFrozenBaselineDiagnostics) {
  process.stdout.write(output);
  console.error("SERVER_TYPECHECK=FAIL diagnostics exceed the two frozen baseline collisions");
  process.exit(result.status ?? 1);
}

console.log("SERVER_TYPECHECK=PASS_WITH_FROZEN_BASELINE_EXCEPTION diagnostics=2 code=TS2416");
