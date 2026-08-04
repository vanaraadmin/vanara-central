import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import {
  WARAPORN_KB_BUCKET_NAME,
  WARAPORN_KB_LATEST_KEY,
  canonicalJson,
  createLatestPointer,
  createManifest,
  finalizeManifest,
  inventoryWarapornKbSource,
  makeBackupId,
  manifestChecksumObjectKey,
  manifestObjectKey,
  objectKeyForFile,
  sha256Hex,
  shouldUpdateLatest,
  validateManifest,
  verifyFileBytes,
  writeUtf8File,
  type WarapornKbManifest,
} from "./waraporn-kb-common.ts";

const execFileAsync = promisify(execFile);

interface BackupArgs {
  source: string;
  bucket: string;
  config: string;
  backupId: string;
}

function parseArgs(argv: string[]): BackupArgs {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (!item.startsWith("--")) throw new Error(`Unsupported argument: ${item}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${item}`);
    args.set(item.slice(2), value);
    index += 1;
  }
  const source = args.get("source");
  if (!source) throw new Error("Usage: npm run kb:backup -- --source \"./src/assets/waraporn_kb\"");
  return {
    source,
    bucket: args.get("bucket") ?? WARAPORN_KB_BUCKET_NAME,
    config: args.get("config") ?? "wrangler.jsonc",
    backupId: args.get("backup-id") ?? makeBackupId(),
  };
}

function wranglerInvocation(): { file: string; args: string[] } {
  const repoRoot = process.cwd();
  const wranglerJs = path.join(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  return { file: process.execPath, args: [wranglerJs] };
}

async function runWrangler(args: string[], options: { allowFailure?: boolean } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
  const invocation = wranglerInvocation();
  try {
    const result = await execFileAsync(invocation.file, [...invocation.args, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const maybe = error as { stdout?: string; stderr?: string; code?: number };
    if (options.allowFailure) {
      return { stdout: maybe.stdout ?? "", stderr: maybe.stderr ?? "", code: Number(maybe.code ?? 1) };
    }
    throw new Error(`Wrangler command failed: ${args.slice(0, 3).join(" ")}`, { cause: error });
  }
}

async function ensureBucket(bucket: string, config: string): Promise<void> {
  const info = await runWrangler(["r2", "bucket", "info", bucket, "--config", config, "--json"], { allowFailure: true });
  if (info.code === 0) return;
  await runWrangler(["r2", "bucket", "create", bucket, "--config", config]);
}

async function assertBackupVersionUnused(bucket: string, config: string, backupId: string): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "vanara-kb-version-"));
  try {
    const target = path.join(tempDir, "manifest.json");
    const result = await runWrangler([
      "r2",
      "object",
      "get",
      `${bucket}/${manifestObjectKey(backupId)}`,
      "--remote",
      "--config",
      config,
      "--file",
      target,
    ], { allowFailure: true });
    if (result.code === 0) throw new Error(`KB backup version already exists: ${backupId}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function uploadLocalFile(bucket: string, config: string, objectKey: string, filePath: string, contentType: string): Promise<void> {
  await runWrangler([
    "r2",
    "object",
    "put",
    `${bucket}/${objectKey}`,
    "--remote",
    "--config",
    config,
    "--file",
    filePath,
    "--content-type",
    contentType,
  ]);
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

async function uploadManifest(bucket: string, config: string, tempDir: string, manifest: WarapornKbManifest): Promise<void> {
  const filePath = path.join(tempDir, "manifest.json");
  await writeUtf8File(filePath, canonicalJson(manifest));
  await uploadLocalFile(bucket, config, manifestObjectKey(manifest.backupId), filePath, "application/json; charset=utf-8");
}

function sqlText(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replaceAll("'", "''")}'`;
}

async function insertD1Metadata(config: string, manifest: WarapornKbManifest): Promise<void> {
  if (!manifest.manifestChecksum || !manifest.completedAt) throw new Error("Complete KB manifest metadata is required.");
  const configJson = JSON.parse(await readFile(path.resolve(config), "utf8")) as {
    d1_databases?: Array<{ database_name?: string }>;
  };
  const databaseName = configJson.d1_databases?.[0]?.database_name;
  if (!databaseName) throw new Error("D1 database name is missing from wrangler config.");
  const sql = `
    INSERT INTO waraporn_kb_backups (
      backup_id,
      object_prefix,
      status,
      created_at,
      completed_at,
      file_count,
      markdown_file_count,
      total_bytes,
      top_level_collections,
      manifest_sha256,
      created_by_user_id,
      error_summary
    )
    VALUES (
      ${sqlText(manifest.backupId)},
      ${sqlText(manifest.objectPrefix)},
      'COMPLETE',
      ${sqlText(manifest.createdAt)},
      ${sqlText(manifest.completedAt)},
      ${manifest.totalFileCount},
      ${manifest.markdownFileCount},
      ${manifest.totalBytes},
      ${sqlText(JSON.stringify(manifest.topLevelCollections))},
      ${sqlText(manifest.manifestChecksum)},
      NULL,
      NULL
    );
  `;
  await runWrangler(["d1", "execute", databaseName, "--remote", "--config", config, "--command", sql]);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inventory = await inventoryWarapornKbSource(args.source);
  if (inventory.totalFileCount === 0) throw new Error("KB source folder contains no files.");
  if (inventory.files.length !== inventory.totalFileCount) throw new Error("KB inventory is inconsistent.");

  await ensureBucket(args.bucket, args.config);
  await assertBackupVersionUnused(args.bucket, args.config, args.backupId);

  const createdAt = new Date().toISOString();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "vanara-kb-backup-"));
  try {
    await uploadManifest(args.bucket, args.config, tempDir, createManifest(inventory, args.backupId, "PREPARING", createdAt));
    await uploadManifest(args.bucket, args.config, tempDir, createManifest(inventory, args.backupId, "UPLOADING", createdAt));

    for (const file of inventory.files) {
      await uploadLocalFile(
        args.bucket,
        args.config,
        objectKeyForFile(args.backupId, file.relativePath),
        file.absolutePath,
        file.contentType,
      );
    }

    await uploadManifest(args.bucket, args.config, tempDir, createManifest(inventory, args.backupId, "VERIFYING", createdAt));

    for (const file of inventory.files) {
      const restoredPath = path.join(tempDir, `verify-${file.sha256}`);
      const restored = await downloadObject(args.bucket, args.config, objectKeyForFile(args.backupId, file.relativePath), restoredPath);
      verifyFileBytes(file, restored);
    }

    const completedAt = new Date().toISOString();
    const completeManifest = finalizeManifest(createManifest(inventory, args.backupId, "COMPLETE", createdAt, completedAt));
    const manifestShaPath = path.join(tempDir, "manifest.sha256");
    await uploadManifest(args.bucket, args.config, tempDir, completeManifest);
    if (!completeManifest.manifestChecksum) throw new Error("KB manifest checksum was not calculated.");
    await writeUtf8File(manifestShaPath, `${completeManifest.manifestChecksum}  manifest.json\n`);
    await uploadLocalFile(args.bucket, args.config, manifestChecksumObjectKey(args.backupId), manifestShaPath, "text/plain; charset=utf-8");

    const downloadedManifestPath = path.join(tempDir, "downloaded-manifest.json");
    const downloadedManifest = await downloadObject(args.bucket, args.config, manifestObjectKey(args.backupId), downloadedManifestPath);
    validateManifest(JSON.parse(new TextDecoder().decode(downloadedManifest)) as WarapornKbManifest);

    if (!shouldUpdateLatest(completeManifest.status)) throw new Error("Only complete KB backups may update latest.");
    const latest = createLatestPointer(completeManifest);
    const latestPath = path.join(tempDir, "latest.json");
    await writeUtf8File(latestPath, canonicalJson(latest));
    await uploadLocalFile(args.bucket, args.config, WARAPORN_KB_LATEST_KEY, latestPath, "application/json; charset=utf-8");
    const downloadedLatestPath = path.join(tempDir, "downloaded-latest.json");
    const downloadedLatest = await downloadObject(args.bucket, args.config, WARAPORN_KB_LATEST_KEY, downloadedLatestPath);
    verifyFileBytes({
      relativePath: "latest.json",
      size: Buffer.byteLength(canonicalJson(latest)),
      sha256: sha256Hex(canonicalJson(latest)),
    }, downloadedLatest);

    await insertD1Metadata(args.config, completeManifest);

    console.log(`KB_BACKUP_GREEN bucket=${args.bucket} backupId=${args.backupId} files=${completeManifest.totalFileCount} markdown=${completeManifest.markdownFileCount} bytes=${completeManifest.totalBytes} manifestChecksum=${completeManifest.manifestChecksum}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "KB backup failed.");
  process.exit(1);
});
