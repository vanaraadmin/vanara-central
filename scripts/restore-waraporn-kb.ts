import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import {
  WARAPORN_KB_BUCKET_NAME,
  WARAPORN_KB_LATEST_KEY,
  assertSafeRelativePath,
  canonicalJson,
  manifestObjectKey,
  manifestChecksumObjectKey,
  validateManifest,
  verifyFileBytes,
  type WarapornKbLatestPointer,
  type WarapornKbManifest,
} from "./waraporn-kb-common.ts";

const execFileAsync = promisify(execFile);

interface RestoreArgs {
  latest: boolean;
  backupId: string | null;
  output: string;
  bucket: string;
  config: string;
}

function parseArgs(argv: string[]): RestoreArgs {
  const values = new Map<string, string>();
  let latest = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item === "--latest") {
      latest = true;
      continue;
    }
    if (!item.startsWith("--")) throw new Error(`Unsupported argument: ${item}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${item}`);
    values.set(item.slice(2), value);
    index += 1;
  }
  const output = values.get("output");
  if (!output) throw new Error("Usage: npm run kb:restore -- --latest --output \"./tmp/waraporn-kb-restore\"");
  const backupId = values.get("backup-id") ?? null;
  if (!latest && !backupId) throw new Error("Use --latest or --backup-id.");
  if (latest && backupId) throw new Error("Use either --latest or --backup-id, not both.");
  return {
    latest,
    backupId,
    output,
    bucket: values.get("bucket") ?? WARAPORN_KB_BUCKET_NAME,
    config: values.get("config") ?? "wrangler.jsonc",
  };
}

function wranglerInvocation(): { file: string; args: string[] } {
  const repoRoot = process.cwd();
  const wranglerJs = path.join(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  return { file: process.execPath, args: [wranglerJs] };
}

async function runWrangler(args: string[]): Promise<void> {
  const invocation = wranglerInvocation();
  try {
    await execFileAsync(invocation.file, [...invocation.args, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
    });
  } catch {
    throw new Error(`Wrangler command failed: ${args.slice(0, 3).join(" ")}`);
  }
}

async function downloadObject(bucket: string, config: string, objectKey: string, filePath: string): Promise<Uint8Array> {
  await runWrangler([
    "r2",
    "object",
    "get",
    `${bucket}/${objectKey}`,
    "--remote",
    "--config",
    config,
    "--file",
    filePath,
  ]);
  return readFile(filePath);
}

async function assertOutputReady(output: string): Promise<string> {
  const resolved = path.resolve(output);
  const repoRoot = process.cwd();
  const relative = path.relative(repoRoot, resolved).replaceAll("\\", "/");
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Restore output must stay inside the repository workspace.");
  }
  if (existsSync(resolved)) {
    const entries = await readdir(resolved);
    if (entries.length > 0) throw new Error("Restore output directory must be empty.");
  }
  await mkdir(resolved, { recursive: true });
  return resolved;
}

async function selectedManifestKey(args: RestoreArgs, tempDir: string): Promise<string> {
  if (args.backupId) return manifestObjectKey(args.backupId);
  const latestPath = path.join(tempDir, "latest.json");
  const latestBytes = await downloadObject(args.bucket, args.config, WARAPORN_KB_LATEST_KEY, latestPath);
  const latest = JSON.parse(new TextDecoder().decode(latestBytes)) as WarapornKbLatestPointer;
  if (latest.schemaVersion !== 1 || latest.status !== "COMPLETE") {
    throw new Error("KB latest pointer is invalid.");
  }
  return latest.manifestObjectKey;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputRoot = await assertOutputReady(args.output);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "vanara-kb-restore-"));

  try {
    const manifestKey = await selectedManifestKey(args, tempDir);
    const manifestPath = path.join(tempDir, "manifest.json");
    const manifestBytes = await downloadObject(args.bucket, args.config, manifestKey, manifestPath);
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as WarapornKbManifest;
    validateManifest(manifest);
    if (!manifest.manifestChecksum) throw new Error("KB manifest checksum is missing.");
    const manifestShaPath = path.join(tempDir, "manifest.sha256");
    const manifestShaBytes = await downloadObject(args.bucket, args.config, manifestChecksumObjectKey(manifest.backupId), manifestShaPath);
    const manifestShaText = new TextDecoder().decode(manifestShaBytes).trim();
    if (!manifestShaText.startsWith(manifest.manifestChecksum)) {
      throw new Error("KB manifest checksum pointer mismatch.");
    }

    for (const file of manifest.files) {
      const relativePath = assertSafeRelativePath(file.relativePath);
      const targetPath = path.resolve(outputRoot, relativePath);
      if (!targetPath.startsWith(`${outputRoot}${path.sep}`)) {
        throw new Error("KB restore target escaped output directory.");
      }
      await mkdir(path.dirname(targetPath), { recursive: true });
      const bytes = await downloadObject(args.bucket, args.config, file.objectKey, targetPath);
      verifyFileBytes(file, bytes);
    }

    await writeFile(path.join(outputRoot, "manifest.json"), canonicalJson(manifest), "utf8");
    await writeFile(path.join(outputRoot, "manifest.sha256"), `${manifest.manifestChecksum}  manifest.json\n`, "utf8");

    console.log(`KB_RESTORE_GREEN backupId=${manifest.backupId} files=${manifest.totalFileCount} markdown=${manifest.markdownFileCount} bytes=${manifest.totalBytes} manifestChecksum=${manifest.manifestChecksum}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "KB restore failed.");
  process.exit(1);
});
