import { writeStoredZip, type ZipEntry } from "./tm30-zip.service.js";

export interface WarapornKbBackupBindings {
  DB: D1Database;
  WARAPORN_KB_ARCHIVE: R2Bucket;
}

export type WarapornKbBackupStatus = "PREPARING" | "UPLOADING" | "VERIFYING" | "COMPLETE";

export interface WarapornKbBackupSummary {
  backupId: string;
  objectPrefix: string;
  status: WarapornKbBackupStatus;
  createdAt: string;
  completedAt: string | null;
  topLevelCollections: string[];
  totalFileCount: number;
  markdownFileCount: number;
  totalBytes: number;
  manifestChecksum: string;
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

interface BackupRow {
  backup_id: string;
  object_prefix: string;
  status: WarapornKbBackupStatus;
  created_at: string;
  completed_at: string | null;
  file_count: number;
  markdown_file_count: number;
  total_bytes: number;
  top_level_collections: string;
  manifest_sha256: string;
}

const MANIFEST_SUFFIX = "/manifest.json";
const MANIFEST_SHA_SUFFIX = "/manifest.sha256";
const TEXT_ENCODER = new TextEncoder();

export class WarapornKbBackupError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 500 = 500) {
    super(message);
    this.name = "WarapornKbBackupError";
  }
}

function toBytes(value: string): Uint8Array {
  return TEXT_ENCODER.encode(value);
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const payload = typeof bytes === "string" ? toBytes(bytes) : bytes;
  const buffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer;
  return bytesToHex(await crypto.subtle.digest("SHA-256", buffer));
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function manifestChecksum(manifest: WarapornKbManifest): Promise<string> {
  return sha256Hex(canonicalJson({ ...manifest, manifestChecksum: null }));
}

function parseCollections(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function backupIdParam(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z_[a-f0-9]{6,24}$/.test(trimmed)) {
    throw new WarapornKbBackupError("Backup ID is invalid.", 400);
  }
  return trimmed;
}

function safeRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.includes("\0")) {
    throw new WarapornKbBackupError("Backup manifest contains an invalid path.");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new WarapornKbBackupError("Backup manifest contains path traversal.");
  }
  return normalized;
}

function toSummary(row: BackupRow): WarapornKbBackupSummary {
  return {
    backupId: row.backup_id,
    objectPrefix: row.object_prefix,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    topLevelCollections: parseCollections(row.top_level_collections),
    totalFileCount: row.file_count,
    markdownFileCount: row.markdown_file_count,
    totalBytes: row.total_bytes,
    manifestChecksum: row.manifest_sha256,
  };
}

async function backupRow(env: Pick<WarapornKbBackupBindings, "DB">, backupId: string): Promise<BackupRow> {
  const row = await env.DB.prepare(`
    SELECT
      backup_id,
      object_prefix,
      status,
      created_at,
      completed_at,
      file_count,
      markdown_file_count,
      total_bytes,
      top_level_collections,
      manifest_sha256
    FROM waraporn_kb_backups
    WHERE backup_id = ?
  `).bind(backupIdParam(backupId)).first<BackupRow>();

  if (!row) throw new WarapornKbBackupError("Backup not found.", 404);
  return row;
}

async function requireObject(env: Pick<WarapornKbBackupBindings, "WARAPORN_KB_ARCHIVE">, key: string): Promise<Uint8Array> {
  const object = await env.WARAPORN_KB_ARCHIVE.get(key);
  if (!object) throw new WarapornKbBackupError("Backup object is missing.", 404);
  return new Uint8Array(await object.arrayBuffer());
}

async function loadManifest(env: WarapornKbBackupBindings, row: BackupRow): Promise<{ manifest: WarapornKbManifest; manifestBytes: Uint8Array; manifestShaBytes: Uint8Array }> {
  const manifestKey = `${row.object_prefix}${MANIFEST_SUFFIX}`;
  const manifestShaKey = `${row.object_prefix}${MANIFEST_SHA_SUFFIX}`;
  const [manifestBytes, manifestShaBytes] = await Promise.all([
    requireObject(env, manifestKey),
    requireObject(env, manifestShaKey),
  ]);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as WarapornKbManifest;
  if (manifest.schemaVersion !== 1 || manifest.status !== "COMPLETE") {
    throw new WarapornKbBackupError("Backup manifest is not complete.");
  }
  if (manifest.backupId !== row.backup_id || manifest.objectPrefix !== row.object_prefix) {
    throw new WarapornKbBackupError("Backup manifest does not match metadata.");
  }
  if (!manifest.manifestChecksum || manifest.manifestChecksum !== row.manifest_sha256) {
    throw new WarapornKbBackupError("Backup manifest checksum metadata mismatch.");
  }
  if ((await manifestChecksum(manifest)) !== manifest.manifestChecksum) {
    throw new WarapornKbBackupError("Backup manifest checksum mismatch.");
  }
  const manifestSha = new TextDecoder().decode(manifestShaBytes).trim();
  if (!manifestSha.startsWith(manifest.manifestChecksum)) {
    throw new WarapornKbBackupError("Backup manifest checksum pointer mismatch.");
  }
  return { manifest, manifestBytes, manifestShaBytes };
}

export async function listWarapornKbBackups(env: Pick<WarapornKbBackupBindings, "DB">): Promise<{ latest: WarapornKbBackupSummary | null; backups: WarapornKbBackupSummary[] }> {
  const rows = await env.DB.prepare(`
    SELECT
      backup_id,
      object_prefix,
      status,
      created_at,
      completed_at,
      file_count,
      markdown_file_count,
      total_bytes,
      top_level_collections,
      manifest_sha256
    FROM waraporn_kb_backups
    WHERE status = 'COMPLETE'
    ORDER BY completed_at DESC, created_at DESC
  `).all<BackupRow>();
  const backups = (rows.results ?? []).map(toSummary);
  return {
    latest: backups[0] ?? null,
    backups,
  };
}

export async function getWarapornKbBackupManifest(env: WarapornKbBackupBindings, backupId: string): Promise<WarapornKbManifest> {
  const row = await backupRow(env, backupId);
  const { manifest } = await loadManifest(env, row);
  return manifest;
}

export async function buildWarapornKbRecoveryZip(env: WarapornKbBackupBindings, backupId: string): Promise<{ backupId: string; zip: Uint8Array }> {
  const row = await backupRow(env, backupId);
  const { manifest, manifestBytes, manifestShaBytes } = await loadManifest(env, row);
  const entries: ZipEntry[] = [];

  for (const file of manifest.files) {
    const relativePath = safeRelativePath(file.relativePath);
    const object = await requireObject(env, file.objectKey);
    if (object.byteLength !== file.size || (await sha256Hex(object)) !== file.sha256) {
      throw new WarapornKbBackupError("Backup object checksum verification failed.");
    }
    entries.push({ name: `files/${relativePath}`, data: object });
  }

  entries.push({ name: "manifest.json", data: manifestBytes });
  entries.push({ name: "manifest.sha256", data: manifestShaBytes });

  return {
    backupId: manifest.backupId,
    zip: writeStoredZip(entries),
  };
}

export function warapornKbBackupErrorStatus(error: unknown): 400 | 404 | 500 {
  return error instanceof WarapornKbBackupError ? error.status : 500;
}

