import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import worker from "../src/index.ts";
import { readZipEntries } from "../src/services/tm30-zip.service.ts";
import {
  buildWarapornKbRecoveryZip,
} from "../src/services/waraporn-kb-backup.service.ts";
import {
  WARAPORN_KB_LATEST_KEY,
  assertSafeRelativePath,
  canonicalJson,
  createLatestPointer,
  createManifest,
  finalizeManifest,
  inventoryWarapornKbSource,
  manifestChecksumObjectKey,
  manifestObjectKey,
  objectKeyForFile,
  sha256Hex,
  shouldUpdateLatest,
  verifyFileBytes,
  type WarapornKbManifest,
} from "../../scripts/waraporn-kb-common.ts";

const NOW = "2026-08-04T10:00:00.000Z";
const BACKUP_ID = "2026-08-04T10-00-00Z_a1b2c3";

type PermissionRow = { module_key: string; can_access: number; can_edit: number };
type BackupRow = {
  backup_id: string;
  object_prefix: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  file_count: number;
  markdown_file_count: number;
  total_bytes: number;
  top_level_collections: string;
  manifest_sha256: string;
};

const OWNER_ROW = {
  session_id: "session-1",
  expires_at: "2099-01-01T00:00:00.000Z",
  user_id: "owner-1",
  full_name: "Owner",
  profile_photo_url: null,
  role: "Owner",
  preferred_language: "en",
  username: "owner",
  email: null,
  password_hash: "not-used",
  status: "active",
  created_at: NOW,
  updated_at: NOW,
  last_login_at: null,
};

const STAFF_ROW = {
  ...OWNER_ROW,
  user_id: "staff-1",
  full_name: "Staff",
  role: "Housekeeping",
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeKbDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(); }
}

class FakeKbDB {
  authenticated = true;
  owner = true;
  rows: BackupRow[] = [];

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT s.session_id")) {
      if (!this.authenticated) return null;
      return (this.owner ? OWNER_ROW : STAFF_ROW) as T;
    }
    if (sql.includes("FROM waraporn_kb_backups") && sql.includes("WHERE backup_id = ?")) {
      return (this.rows.find((row) => row.backup_id === params[0]) ?? null) as T | null;
    }
    return null;
  }

  async all<T>(sql: string) {
    if (sql.includes("SELECT view_key FROM user_views")) {
      return { results: (this.owner ? [{ view_key: "owner" }, { view_key: "staff" }] : [{ view_key: "staff" }]) as T[] };
    }
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) {
      return { results: [{ module_key: "settings", can_access: this.owner ? 1 : 0, can_edit: this.owner ? 1 : 0 }] as PermissionRow[] as T[] };
    }
    if (sql.includes("SELECT action_key, allowed FROM user_action_permissions")) {
      return { results: [] as T[] };
    }
    if (sql.includes("FROM waraporn_kb_backups")) {
      return { results: [...this.rows] as T[] };
    }
    return { results: [] as T[] };
  }

  async run() {
    return { meta: { changes: 0, last_row_id: 0 } };
  }
}

class FakeR2 {
  objects = new Map<string, Uint8Array>();
  keysRead: string[] = [];

  async get(key: string) {
    this.keysRead.push(key);
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    };
  }

  putText(key: string, value: string) {
    this.objects.set(key, new TextEncoder().encode(value));
  }

  putBytes(key: string, value: Uint8Array) {
    this.objects.set(key, value);
  }
}

async function makeInventory(): Promise<{ tempDir: string; manifest: WarapornKbManifest; r2: FakeR2; row: BackupRow }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "vanara-kb-test-"));
  await writeFile(path.join(tempDir, "alpha.md"), "Alpha\n", "utf8");
  await mkdir(path.join(tempDir, "Nested"));
  await writeFile(path.join(tempDir, "Nested", "beta.md"), new Uint8Array([0, 1, 2, 3, 255]));
  const inventory = await inventoryWarapornKbSource(tempDir);
  const manifest = finalizeManifest(createManifest(inventory, BACKUP_ID, "COMPLETE", NOW, NOW));
  const r2 = new FakeR2();
  for (const file of inventory.files) r2.putBytes(objectKeyForFile(BACKUP_ID, file.relativePath), file.bytes);
  r2.putText(manifestObjectKey(BACKUP_ID), canonicalJson(manifest));
  r2.putText(manifestChecksumObjectKey(BACKUP_ID), `${manifest.manifestChecksum}  manifest.json\n`);
  r2.putText(WARAPORN_KB_LATEST_KEY, canonicalJson(createLatestPointer(manifest)));
  const row: BackupRow = {
    backup_id: manifest.backupId,
    object_prefix: manifest.objectPrefix,
    status: manifest.status,
    created_at: manifest.createdAt,
    completed_at: manifest.completedAt,
    file_count: manifest.totalFileCount,
    markdown_file_count: manifest.markdownFileCount,
    total_bytes: manifest.totalBytes,
    top_level_collections: JSON.stringify(manifest.topLevelCollections),
    manifest_sha256: manifest.manifestChecksum ?? "",
  };
  return { tempDir, manifest, r2, row };
}

function env(db: FakeKbDB, r2: FakeR2) {
  return {
    DB: db,
    WARAPORN_KB_ARCHIVE: r2,
  };
}

test("recursive source inventory preserves paths bytes sizes and checksums", async () => {
  const { tempDir } = await makeInventory();
  try {
    const inventory = await inventoryWarapornKbSource(tempDir);
    assert.equal(inventory.totalFileCount, 2);
    assert.equal(inventory.markdownFileCount, 2);
    assert.deepEqual(
      inventory.files.map((file) => file.relativePath),
      ["alpha.md", "Nested/beta.md"].sort((a, b) => a.localeCompare(b, "en")),
    );
    for (const file of inventory.files) {
      assert.equal(file.sha256, sha256Hex(file.bytes));
      assert.equal(file.size, file.bytes.byteLength);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("manifest contains every file and complete backups are the only latest candidates", async () => {
  const { tempDir, manifest } = await makeInventory();
  try {
    assert.equal(manifest.status, "COMPLETE");
    assert.equal(manifest.files.length, manifest.totalFileCount);
    assert.equal(shouldUpdateLatest("PREPARING"), false);
    assert.equal(shouldUpdateLatest("UPLOADING"), false);
    assert.equal(shouldUpdateLatest("VERIFYING"), false);
    assert.equal(shouldUpdateLatest("COMPLETE"), true);
    assert.throws(() => createLatestPointer({ ...manifest, status: "VERIFYING" }), /not complete/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("path traversal and checksum mismatches are blocked", async () => {
  assert.throws(() => assertSafeRelativePath("../secret.md"), /traversal|absolute|invalid/i);
  assert.throws(() => assertSafeRelativePath("/secret.md"), /absolute/i);
  assert.throws(() => verifyFileBytes({ relativePath: "safe.md", size: 4, sha256: "0".repeat(64) }, new TextEncoder().encode("safe")), /checksum/i);
});

test("restore zip recreates all files and fails corrupted R2 objects", async () => {
  const { tempDir, manifest, r2, row } = await makeInventory();
  const db = new FakeKbDB();
  db.rows = [row];
  try {
    const result = await buildWarapornKbRecoveryZip(env(db, r2) as never, manifest.backupId);
    const entries = await readZipEntries(result.zip.buffer.slice(result.zip.byteOffset, result.zip.byteOffset + result.zip.byteLength) as ArrayBuffer);
    assert.deepEqual(entries.map((entry) => entry.name).sort(), ["files/Nested/beta.md", "files/alpha.md", "manifest.json", "manifest.sha256"].sort());

    r2.putBytes(objectKeyForFile(BACKUP_ID, "alpha.md"), new TextEncoder().encode("changed"));
    await assert.rejects(buildWarapornKbRecoveryZip(env(db, r2) as never, manifest.backupId), /checksum/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Owner-only KB APIs list manifest and download while Staff is rejected", async () => {
  const { tempDir, manifest, r2, row } = await makeInventory();
  const db = new FakeKbDB();
  db.rows = [row];
  try {
    const list = await worker.fetch(new Request("https://vanara.test/api/management/waraporn-kb-backups", {
      headers: { cookie: "vanara_session=x" },
    }), env(db, r2) as never);
    assert.equal(list.status, 200);
    const listBody = await list.json() as { success: boolean; data: { latest: { backupId: string } } };
    assert.equal(listBody.success, true);
    assert.equal(listBody.data.latest.backupId, manifest.backupId);

    const detail = await worker.fetch(new Request(`https://vanara.test/api/management/waraporn-kb-backups/${manifest.backupId}`, {
      headers: { cookie: "vanara_session=x" },
    }), env(db, r2) as never);
    assert.equal(detail.status, 200);
    const detailBody = await detail.json() as { data: WarapornKbManifest };
    assert.equal(detailBody.data.files.length, manifest.totalFileCount);
    assert.equal(JSON.stringify(detailBody).includes("Alpha"), false);

    const download = await worker.fetch(new Request(`https://vanara.test/api/management/waraporn-kb-backups/${manifest.backupId}/download`, {
      headers: { cookie: "vanara_session=x" },
    }), env(db, r2) as never);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "application/zip");
    assert.match(download.headers.get("content-disposition") ?? "", /attachment/);

    const staffDb = new FakeKbDB();
    staffDb.owner = false;
    staffDb.rows = [row];
    const deniedList = await worker.fetch(new Request("https://vanara.test/api/management/waraporn-kb-backups", {
      headers: { cookie: "vanara_session=x" },
    }), env(staffDb, r2) as never);
    assert.equal(deniedList.status, 403);

    const deniedDownload = await worker.fetch(new Request(`https://vanara.test/api/management/waraporn-kb-backups/${manifest.backupId}/download`, {
      headers: { cookie: "vanara_session=x" },
    }), env(staffDb, r2) as never);
    assert.equal(deniedDownload.status, 403);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("unknown backup ids fail safely and arbitrary R2 object access is impossible", async () => {
  const { tempDir, manifest, r2, row } = await makeInventory();
  const db = new FakeKbDB();
  db.rows = [row];
  try {
    const unknown = await worker.fetch(new Request("https://vanara.test/api/management/waraporn-kb-backups/2026-08-04T10-00-00Z_badbad/download", {
      headers: { cookie: "vanara_session=x" },
    }), env(db, r2) as never);
    assert.equal(unknown.status, 404);

    r2.keysRead = [];
    const download = await worker.fetch(new Request(`https://vanara.test/api/management/waraporn-kb-backups/${manifest.backupId}/download?objectKey=passports/secret`, {
      headers: { cookie: "vanara_session=x" },
    }), env(db, r2) as never);
    assert.equal(download.status, 200);
    assert.equal(r2.keysRead.some((key) => key.includes("passports/secret")), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("backup and restore scripts do not log document bodies or delete source implicitly", async () => {
  const backupScript = await readFile(path.join(process.cwd(), "..", "scripts", "backup-waraporn-kb.ts"), "utf8");
  const restoreScript = await readFile(path.join(process.cwd(), "..", "scripts", "restore-waraporn-kb.ts"), "utf8");
  assert.equal(backupScript.includes("guest_message"), false);
  assert.equal(backupScript.includes("console.log(file"), false);
  assert.equal(restoreScript.includes("console.log(file"), false);
  assert.equal(backupScript.includes("rm(args.source"), false);
});
