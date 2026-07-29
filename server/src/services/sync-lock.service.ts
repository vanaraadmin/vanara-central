export interface SyncLockBindings {
  DB: D1Database;
}

export interface SyncLock {
  name: string;
  token: string;
}

const LOCK_PREFIX = "sync_lock:";
const IDLE = "idle";

function lockName(syncType: string): string {
  return `${LOCK_PREFIX}${syncType}`;
}

function lockToken(startedAt: string): string {
  return `${startedAt}:${crypto.randomUUID()}`;
}

export async function acquireSyncLock(
  env: SyncLockBindings,
  syncType: string,
  startedAt: string,
  ttlMs = 10 * 60 * 1_000,
): Promise<SyncLock | null> {
  const name = lockName(syncType);
  const token = lockToken(startedAt);
  const staleBefore = new Date(Date.parse(startedAt) - ttlMs).toISOString();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO sync_cursors (cursor_name, cursor_value, updated_at)
    VALUES (?, ?, ?)
  `).bind(name, IDLE, startedAt).run();

  const result = await env.DB.prepare(`
    UPDATE sync_cursors
    SET cursor_value = ?, updated_at = ?
    WHERE cursor_name = ?
      AND (cursor_value = ? OR updated_at < ?)
  `).bind(token, startedAt, name, IDLE, staleBefore).run();

  return (result.meta?.changes ?? 0) === 1 ? { name, token } : null;
}

export async function releaseSyncLock(
  env: SyncLockBindings,
  lock: SyncLock,
): Promise<void> {
  await env.DB.prepare(`
    UPDATE sync_cursors
    SET cursor_value = ?, updated_at = ?
    WHERE cursor_name = ? AND cursor_value = ?
  `).bind(IDLE, new Date().toISOString(), lock.name, lock.token).run();
}

export async function recordSkippedSyncRun(
  env: SyncLockBindings,
  syncType: string,
  startedAt: string,
  reason: string,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO sync_runs (
      sync_type, started_at, finished_at, status,
      records_read, records_written, records_failed, error_message
    ) VALUES (?, ?, ?, 'skipped', 0, 0, 0, ?)
  `).bind(syncType, startedAt, new Date().toISOString(), reason).run();
}
