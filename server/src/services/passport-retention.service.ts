import { deletePassport, type PassportStorageBindings } from "./passport-storage.service.js";

export interface PassportRetentionBindings extends PassportStorageBindings {
  DB: D1Database;
  PASSPORT_RETENTION_DAYS?: string;
}

export interface PassportRetentionCandidate {
  id: number;
  booking_id: number;
  object_key: string;
  created_at: string;
}

export interface PassportRetentionSummary {
  checked: number;
  deleted: number;
  skipped: number;
  failed: number;
  retentionDays: number;
  cutoff: string;
}

export const PASSPORT_RETENTION_CRON = "17 20 * * *";
const DEFAULT_RETENTION_DAYS = 45;
const PASSPORTS_PREFIX = "passports/";
const CLEANUP_BATCH_LIMIT = 200;

function logInfo(event: string, payload: object): void {
  console.log(JSON.stringify({ event, ...payload }));
}

function logWarning(event: string, payload: object): void {
  console.warn(JSON.stringify({ event, level: "warning", ...payload }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function passportRetentionDays(env: { PASSPORT_RETENTION_DAYS?: string }): number {
  const configured = Number(env.PASSPORT_RETENTION_DAYS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_RETENTION_DAYS;
}

export function passportRetentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export function isPassportRetentionEligible(createdAt: string, now: Date, retentionDays: number): boolean {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  return created.getTime() < passportRetentionCutoff(now, retentionDays).getTime();
}

async function listExpiredPassports(env: PassportRetentionBindings, cutoffIso: string): Promise<PassportRetentionCandidate[]> {
  const rows = await env.DB.prepare(`
    SELECT id, booking_id, object_key, created_at
    FROM booking_passports
    WHERE created_at < ?
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).bind(cutoffIso, CLEANUP_BATCH_LIMIT).all<PassportRetentionCandidate>();

  return rows.results ?? [];
}

async function removePassportRecord(env: PassportRetentionBindings, id: number): Promise<void> {
  await env.DB.prepare("DELETE FROM booking_passports WHERE id = ?").bind(id).run();
}

export async function cleanupExpiredPassports(env: PassportRetentionBindings, now = new Date()): Promise<PassportRetentionSummary> {
  const retentionDays = passportRetentionDays(env);
  const cutoff = passportRetentionCutoff(now, retentionDays).toISOString();
  const candidates = await listExpiredPassports(env, cutoff);
  const summary: PassportRetentionSummary = {
    checked: candidates.length,
    deleted: 0,
    skipped: 0,
    failed: 0,
    retentionDays,
    cutoff,
  };

  for (const candidate of candidates) {
    if (!candidate.object_key.startsWith(PASSPORTS_PREFIX)) {
      summary.skipped += 1;
      logInfo("passport_retention_skipped", {
        id: candidate.id,
        bookingId: candidate.booking_id,
        objectKey: candidate.object_key,
        reason: "non_passport_prefix",
      });
      continue;
    }

    if (!isPassportRetentionEligible(candidate.created_at, now, retentionDays)) {
      summary.skipped += 1;
      logInfo("passport_retention_skipped", {
        id: candidate.id,
        bookingId: candidate.booking_id,
        objectKey: candidate.object_key,
        reason: "not_expired",
      });
      continue;
    }

    try {
      await deletePassport(env, candidate.object_key);
      await removePassportRecord(env, candidate.id);
      summary.deleted += 1;
      logInfo("passport_retention_deleted", {
        id: candidate.id,
        bookingId: candidate.booking_id,
        objectKey: candidate.object_key,
        createdAt: candidate.created_at,
      });
    } catch (error) {
      summary.failed += 1;
      logWarning("passport_retention_delete_failed", {
        id: candidate.id,
        bookingId: candidate.booking_id,
        objectKey: candidate.object_key,
        error: errorMessage(error),
      });
    }
  }

  logInfo("passport_retention_summary", summary);
  return summary;
}
