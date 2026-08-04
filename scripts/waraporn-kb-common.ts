import { createHash, randomBytes } from "node:crypto";
import { lstat, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const WARAPORN_KB_BUCKET_NAME = "vanara-waraporn-kb-archive";
export const WARAPORN_KB_ROOT_PREFIX = "waraporn-kb";
export const WARAPORN_KB_SCHEMA_VERSION = 1;
export const WARAPORN_KB_LATEST_KEY = `${WARAPORN_KB_ROOT_PREFIX}/latest.json`;

export type WarapornKbBackupStatus = "PREPARING" | "UPLOADING" | "VERIFYING" | "COMPLETE";

export interface WarapornKbInventoryFile {
  absolutePath: string;
  relativePath: string;
  size: number;
  sha256: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface WarapornKbInventory {
  sourceRoot: string;
  sourceRootLabel: string;
  files: WarapornKbInventoryFile[];
  topLevelCollections: string[];
  totalFileCount: number;
  markdownFileCount: number;
  totalBytes: number;
}

export interface WarapornKbManifestFile {
  relativePath: string;
  objectKey: string;
  size: number;
  sha256: string;
  contentType: string;
}

export interface WarapornKbManifest {
  schemaVersion: 1;
  backupId: string;
  status: WarapornKbBackupStatus;
  createdAt: string;
  completedAt: string | null;
  sourceRoot: string;
  objectPrefix: string;
  topLevelCollections: string[];
  totalFileCount: number;
  markdownFileCount: number;
  totalBytes: number;
  files: WarapornKbManifestFile[];
  manifestChecksum: string | null;
}

export interface WarapornKbLatestPointer {
  schemaVersion: 1;
  backupId: string;
  status: "COMPLETE";
  createdAt: string;
  completedAt: string;
  objectPrefix: string;
  manifestObjectKey: string;
  manifestChecksum: string;
  totalFileCount: number;
  markdownFileCount: number;
  totalBytes: number;
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function writeUtf8File(filePath: string, value: string): Promise<void> {
  await writeFile(filePath, value, "utf8");
}

export function contentTypeFor(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "text/markdown; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".sha256" || ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

export function isMarkdownPath(relativePath: string): boolean {
  const ext = path.extname(relativePath).toLowerCase();
  return ext === ".md" || ext === ".markdown";
}

export function assertSafeRelativePath(relativePath: string): string {
  if (!relativePath || relativePath.includes("\0")) {
    throw new Error("KB relative path is invalid.");
  }
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)) {
    throw new Error("KB relative path must not be absolute.");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("KB relative path must not contain traversal segments.");
  }
  return normalized;
}

export function objectKeyForFile(backupId: string, relativePath: string): string {
  return `${backupObjectPrefix(backupId)}/files/${assertSafeRelativePath(relativePath)}`;
}

export function backupObjectPrefix(backupId: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z_[a-f0-9]{6,24}$/.test(backupId)) {
    throw new Error("KB backup id is invalid.");
  }
  return `${WARAPORN_KB_ROOT_PREFIX}/backups/${backupId}`;
}

export function manifestObjectKey(backupId: string): string {
  return `${backupObjectPrefix(backupId)}/manifest.json`;
}

export function manifestChecksumObjectKey(backupId: string): string {
  return `${backupObjectPrefix(backupId)}/manifest.sha256`;
}

export function makeBackupId(date = new Date()): string {
  const timestamp = date.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-");
  return `${timestamp}_${randomBytes(4).toString("hex")}`;
}

export async function inventoryWarapornKbSource(source: string): Promise<WarapornKbInventory> {
  const sourceRoot = await realpath(path.resolve(source));
  const sourceStats = await lstat(sourceRoot);
  if (!sourceStats.isDirectory() || sourceStats.isSymbolicLink()) {
    throw new Error("KB source root must be a real directory.");
  }

  const files: WarapornKbInventoryFile[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const resolvedPath = await realpath(absolutePath);
      const info = await lstat(absolutePath);
      if (entry.isSymbolicLink() || info.isSymbolicLink()) {
        throw new Error("KB source contains a symlink or reparse point.");
      }
      if (!resolvedPath.startsWith(`${sourceRoot}${path.sep}`) && resolvedPath !== sourceRoot) {
        throw new Error("KB source contains a path outside the source root.");
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileStats = await stat(absolutePath);
      const relativePath = assertSafeRelativePath(path.relative(sourceRoot, absolutePath));
      const bytes = await readFile(absolutePath);
      files.push({
        absolutePath,
        relativePath,
        size: fileStats.size,
        sha256: sha256Hex(bytes),
        contentType: contentTypeFor(relativePath),
        bytes,
      });
    }
  }

  await visit(sourceRoot);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));

  const topLevelCollections = [...new Set(files.map((file) => file.relativePath.split("/")[0]!))]
    .sort((left, right) => left.localeCompare(right, "en"));
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  return {
    sourceRoot,
    sourceRootLabel: path.relative(process.cwd(), sourceRoot).replaceAll("\\", "/") || sourceRoot,
    files,
    topLevelCollections,
    totalFileCount: files.length,
    markdownFileCount: files.filter((file) => isMarkdownPath(file.relativePath)).length,
    totalBytes,
  };
}

export function createManifest(
  inventory: WarapornKbInventory,
  backupId: string,
  status: WarapornKbBackupStatus,
  createdAt: string,
  completedAt: string | null = null,
): WarapornKbManifest {
  return {
    schemaVersion: WARAPORN_KB_SCHEMA_VERSION,
    backupId,
    status,
    createdAt,
    completedAt,
    sourceRoot: inventory.sourceRootLabel,
    objectPrefix: backupObjectPrefix(backupId),
    topLevelCollections: inventory.topLevelCollections,
    totalFileCount: inventory.totalFileCount,
    markdownFileCount: inventory.markdownFileCount,
    totalBytes: inventory.totalBytes,
    files: inventory.files.map((file) => ({
      relativePath: file.relativePath,
      objectKey: objectKeyForFile(backupId, file.relativePath),
      size: file.size,
      sha256: file.sha256,
      contentType: file.contentType,
    })),
    manifestChecksum: null,
  };
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function manifestChecksum(manifest: WarapornKbManifest): string {
  return sha256Hex(canonicalJson({ ...manifest, manifestChecksum: null }));
}

export function finalizeManifest(manifest: WarapornKbManifest): WarapornKbManifest {
  const checksum = manifestChecksum(manifest);
  return { ...manifest, manifestChecksum: checksum };
}

export function validateManifest(manifest: WarapornKbManifest): void {
  if (manifest.schemaVersion !== WARAPORN_KB_SCHEMA_VERSION) throw new Error("KB manifest schema is unsupported.");
  backupObjectPrefix(manifest.backupId);
  if (manifest.status !== "COMPLETE") throw new Error("KB manifest is not complete.");
  if (!manifest.manifestChecksum || manifestChecksum(manifest) !== manifest.manifestChecksum) {
    throw new Error("KB manifest checksum mismatch.");
  }
  for (const file of manifest.files) {
    assertSafeRelativePath(file.relativePath);
    if (file.objectKey !== objectKeyForFile(manifest.backupId, file.relativePath)) {
      throw new Error("KB manifest object key is invalid.");
    }
    if (file.size < 0 || !Number.isInteger(file.size)) throw new Error("KB manifest file size is invalid.");
    if (!/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("KB manifest file checksum is invalid.");
  }
}

export function createLatestPointer(manifest: WarapornKbManifest): WarapornKbLatestPointer {
  validateManifest(manifest);
  if (!manifest.completedAt || !manifest.manifestChecksum) throw new Error("KB complete manifest is missing completion metadata.");
  return {
    schemaVersion: WARAPORN_KB_SCHEMA_VERSION,
    backupId: manifest.backupId,
    status: "COMPLETE",
    createdAt: manifest.createdAt,
    completedAt: manifest.completedAt,
    objectPrefix: manifest.objectPrefix,
    manifestObjectKey: manifestObjectKey(manifest.backupId),
    manifestChecksum: manifest.manifestChecksum,
    totalFileCount: manifest.totalFileCount,
    markdownFileCount: manifest.markdownFileCount,
    totalBytes: manifest.totalBytes,
  };
}

export function shouldUpdateLatest(status: WarapornKbBackupStatus): boolean {
  return status === "COMPLETE";
}

export function verifyFileBytes(expected: { relativePath: string; size: number; sha256: string }, bytes: Uint8Array): void {
  if (bytes.byteLength !== expected.size) {
    throw new Error(`KB backup verification failed for ${expected.relativePath}: size mismatch.`);
  }
  if (sha256Hex(bytes) !== expected.sha256) {
    throw new Error(`KB backup verification failed for ${expected.relativePath}: checksum mismatch.`);
  }
}
