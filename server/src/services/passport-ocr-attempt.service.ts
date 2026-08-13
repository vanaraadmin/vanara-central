import {
  createAndPollPassportOpenAiResponse,
  PassportOpenAiBackgroundError,
  type PassportOpenAiBackgroundResult,
} from "./passport-openai-background.service.js";

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export type PassportOcrStage = "CLASSIFICATION" | "VISUAL_BIODATA" | "MRZ" | "VERIFICATION";
export type PassportOcrAttemptState = "ACTIVE" | "CLASSIFIED" | "OCR_COMPLETED" | "PASSPORT_SAVED" | "FAILED" | "MANUAL_REVIEW" | "DISCARDED";
type PassportOcrResponseState = "PENDING" | "SUBMITTING" | "POLLING" | "COMPLETED" | "FAILED" | "MANUAL_REVIEW";

export interface PassportOcrAttemptBindings {
  DB: D1Database;
  OPENAI_API_KEY: string;
}

export interface PassportOcrAttemptHandle {
  id: string;
  bookingId: number;
  slotKey: string;
  imageSha256: string;
  objectKey: string | null;
  state: PassportOcrAttemptState;
}

interface AttemptRow {
  id: string;
  booking_id: number;
  slot_key: string;
  image_sha256: string;
  object_key: string | null;
  state: PassportOcrAttemptState;
}

interface ResponseAttemptRow {
  id: string;
  attempt_id: string;
  stage: PassportOcrStage;
  client_request_id: string;
  response_id: string | null;
  provider_status: string | null;
  state: PassportOcrResponseState;
  result_json: string | null;
  openai_request_id: string | null;
  http_status: number | null;
  submitted_at: string | null;
  updated_at: string;
}

const ACTIVE_ATTEMPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MANUAL_REVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SUBMISSION_STALE_MS = 30_000;
const SUBMISSION_WAIT_MS = 16_000;
const SUBMISSION_WAIT_INTERVAL_MS = 100;

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function expiryIso(now: Date, ttlMs: number): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}

function attemptFromRow(row: AttemptRow): PassportOcrAttemptHandle {
  return {
    id: row.id,
    bookingId: row.booking_id,
    slotKey: row.slot_key,
    imageSha256: row.image_sha256,
    objectKey: row.object_key,
    state: row.state,
  };
}

function parseStoredResult(row: ResponseAttemptRow): PassportOpenAiBackgroundResult {
  if (!row.result_json) throw new PassportOpenAiBackgroundError("Stored OpenAI response is unavailable.", "invalid_response", row.response_id);
  const parsed = JSON.parse(row.result_json) as PassportOpenAiBackgroundResult;
  return parsed;
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function responseAttempt(env: PassportOcrAttemptBindings, attemptId: string, stage: PassportOcrStage): Promise<ResponseAttemptRow | null> {
  return env.DB.prepare(`
    SELECT
      id,
      attempt_id,
      stage,
      client_request_id,
      response_id,
      provider_status,
      state,
      result_json,
      openai_request_id,
      http_status,
      submitted_at,
      updated_at
    FROM passport_ocr_response_attempts
    WHERE attempt_id = ? AND stage = ?
    LIMIT 1
  `).bind(attemptId, stage).first<ResponseAttemptRow>();
}

async function ensureResponseAttempt(env: PassportOcrAttemptBindings, attemptId: string, stage: PassportOcrStage): Promise<ResponseAttemptRow> {
  const now = nowIso();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO passport_ocr_response_attempts (
      id,
      attempt_id,
      stage,
      client_request_id,
      state,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
  `).bind(crypto.randomUUID(), attemptId, stage, crypto.randomUUID(), now, now).run();
  const row = await responseAttempt(env, attemptId, stage);
  if (!row) throw new Error("Passport OCR response attempt could not be created.");
  return row;
}

async function markManualReview(
  env: PassportOcrAttemptBindings,
  row: ResponseAttemptRow,
  code: string,
  message: string,
): Promise<void> {
  const now = new Date();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE passport_ocr_response_attempts
      SET state = 'MANUAL_REVIEW', error_code = ?, error_message = ?, updated_at = ?
      WHERE id = ? AND response_id IS NULL AND state IN ('PENDING', 'SUBMITTING')
    `).bind(code, message, nowIso(now), row.id),
    env.DB.prepare(`
      UPDATE passport_ocr_attempts
      SET state = 'MANUAL_REVIEW', last_error_code = ?, last_error_message = ?, updated_at = ?, expires_at = ?
      WHERE id = ?
    `).bind(code, message, nowIso(now), expiryIso(now, MANUAL_REVIEW_TTL_MS), row.attempt_id),
  ]);
}

async function waitForSubmissionCheckpoint(
  env: PassportOcrAttemptBindings,
  attemptId: string,
  stage: PassportOcrStage,
): Promise<ResponseAttemptRow> {
  const deadline = Date.now() + SUBMISSION_WAIT_MS;
  while (Date.now() < deadline) {
    const row = await responseAttempt(env, attemptId, stage);
    if (!row) throw new Error("Passport OCR response attempt disappeared.");
    if (row.response_id || row.state === "COMPLETED" || row.state === "FAILED" || row.state === "MANUAL_REVIEW") return row;
    const submittedAt = row.submitted_at ? new Date(row.submitted_at).getTime() : NaN;
    if (row.state === "SUBMITTING" && Number.isFinite(submittedAt) && Date.now() - submittedAt >= SUBMISSION_STALE_MS) {
      await markManualReview(env, row, "ambiguous_submission", "OpenAI submission outcome is unknown; automatic retry is blocked.");
      const updated = await responseAttempt(env, attemptId, stage);
      if (!updated) throw new Error("Passport OCR response attempt disappeared.");
      return updated;
    }
    await delay(SUBMISSION_WAIT_INTERVAL_MS);
  }
  throw new PassportOpenAiBackgroundError("Another passport OCR request is still submitting.", "timeout");
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function ensurePassportOcrAttempt(env: PassportOcrAttemptBindings, input: {
  bookingId: number;
  slotKey: string;
  imageSha256: string;
  createdBy: string;
}): Promise<PassportOcrAttemptHandle> {
  const now = new Date();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO passport_ocr_attempts (
      id,
      booking_id,
      slot_key,
      image_sha256,
      state,
      created_by,
      created_at,
      updated_at,
      expires_at
    ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    input.bookingId,
    input.slotKey,
    input.imageSha256,
    input.createdBy,
    nowIso(now),
    nowIso(now),
    expiryIso(now, ACTIVE_ATTEMPT_TTL_MS),
  ).run();
  const row = await env.DB.prepare(`
    SELECT id, booking_id, slot_key, image_sha256, object_key, state
    FROM passport_ocr_attempts
    WHERE booking_id = ? AND slot_key = ? AND image_sha256 = ?
    LIMIT 1
  `).bind(input.bookingId, input.slotKey, input.imageSha256).first<AttemptRow>();
  if (!row) throw new Error("Passport OCR attempt could not be created.");
  return attemptFromRow(row);
}

export async function attachPassportOcrObjectKey(
  env: PassportOcrAttemptBindings,
  attemptId: string,
  objectKey: string,
): Promise<string> {
  const now = new Date();
  await env.DB.prepare(`
    UPDATE passport_ocr_attempts
    SET object_key = COALESCE(object_key, ?), updated_at = ?, expires_at = ?
    WHERE id = ?
  `).bind(objectKey, nowIso(now), expiryIso(now, ACTIVE_ATTEMPT_TTL_MS), attemptId).run();
  const row = await env.DB.prepare("SELECT object_key FROM passport_ocr_attempts WHERE id = ? LIMIT 1")
    .bind(attemptId)
    .first<{ object_key: string | null }>();
  if (!row?.object_key) throw new Error("Passport OCR object key could not be attached.");
  return row.object_key;
}

export async function markPassportOcrAttemptState(
  env: PassportOcrAttemptBindings,
  attemptId: string,
  state: PassportOcrAttemptState,
  error?: { code: string; message: string },
): Promise<void> {
  const now = new Date();
  const ttl = state === "MANUAL_REVIEW" ? MANUAL_REVIEW_TTL_MS : ACTIVE_ATTEMPT_TTL_MS;
  await env.DB.prepare(`
    UPDATE passport_ocr_attempts
    SET state = ?, last_error_code = ?, last_error_message = ?, updated_at = ?, expires_at = ?
    WHERE id = ?
  `).bind(state, error?.code ?? null, error?.message ?? null, nowIso(now), expiryIso(now, ttl), attemptId).run();
}

export async function markPassportOcrAttemptSavedByObjectKey(env: PassportOcrAttemptBindings, objectKey: string): Promise<void> {
  const now = new Date();
  await env.DB.prepare(`
    UPDATE passport_ocr_attempts
    SET state = 'PASSPORT_SAVED', updated_at = ?, expires_at = ?
    WHERE object_key = ?
  `).bind(nowIso(now), expiryIso(now, ACTIVE_ATTEMPT_TTL_MS), objectKey).run();
}

export async function runPersistedPassportOpenAiResponse({
  env,
  attempt,
  stage,
  body,
  fetcher = fetch,
  pollIntervalMs,
  timeoutMs,
}: {
  env: PassportOcrAttemptBindings;
  attempt: PassportOcrAttemptHandle;
  stage: PassportOcrStage;
  body: Record<string, unknown>;
  fetcher?: Fetcher;
  pollIntervalMs?: number;
  timeoutMs: number;
}): Promise<PassportOpenAiBackgroundResult> {
  let row = await ensureResponseAttempt(env, attempt.id, stage);
  if (row.state === "COMPLETED") return parseStoredResult(row);
  if (row.state === "MANUAL_REVIEW") {
    throw new PassportOpenAiBackgroundError("Passport OCR requires manual review before retry.", "ambiguous_submission", row.response_id);
  }
  if (row.state === "FAILED") {
    throw new PassportOpenAiBackgroundError("Passport OCR provider request failed.", "request_failed", row.response_id);
  }

  let claimed = false;
  if (row.state === "PENDING") {
    const submittedAt = nowIso();
    const result = await env.DB.prepare(`
      UPDATE passport_ocr_response_attempts
      SET state = 'SUBMITTING', submitted_at = ?, updated_at = ?
      WHERE id = ? AND state = 'PENDING' AND response_id IS NULL
    `).bind(submittedAt, submittedAt, row.id).run();
    claimed = Number(result.meta.changes ?? 0) === 1;
    row = await responseAttempt(env, attempt.id, stage) ?? row;
  }

  if (!claimed && !row.response_id) {
    row = await waitForSubmissionCheckpoint(env, attempt.id, stage);
    if (row.state === "COMPLETED") return parseStoredResult(row);
    if (row.state === "MANUAL_REVIEW") {
      throw new PassportOpenAiBackgroundError("Passport OCR submission outcome is ambiguous; automatic retry is blocked.", "ambiguous_submission");
    }
    if (row.state === "FAILED") {
      throw new PassportOpenAiBackgroundError("Passport OCR provider request failed.", "request_failed", row.response_id);
    }
  }

  try {
    const result = await createAndPollPassportOpenAiResponse({
      apiKey: env.OPENAI_API_KEY,
      body,
      clientRequestId: row.client_request_id,
      fetcher,
      pollIntervalMs,
      responseId: claimed ? null : row.response_id,
      timeoutMs,
      onCheckpoint: async (checkpoint) => {
        const now = nowIso();
        await env.DB.prepare(`
          UPDATE passport_ocr_response_attempts
          SET response_id = COALESCE(response_id, ?), provider_status = ?, state = 'POLLING',
              openai_request_id = COALESCE(openai_request_id, ?), http_status = ?, last_polled_at = ?, updated_at = ?
          WHERE id = ?
        `).bind(
          checkpoint.responseId,
          checkpoint.status,
          checkpoint.openAiRequestId,
          checkpoint.httpStatus,
          now,
          now,
          row.id,
        ).run();
      },
    });
    const completedAt = nowIso();
    await env.DB.prepare(`
      UPDATE passport_ocr_response_attempts
      SET response_id = COALESCE(response_id, ?), provider_status = 'completed', state = 'COMPLETED',
          result_json = ?, openai_request_id = COALESCE(openai_request_id, ?), http_status = ?,
          completed_at = ?, last_polled_at = ?, updated_at = ?, error_code = NULL, error_message = NULL
      WHERE id = ?
    `).bind(
      result.responseId,
      JSON.stringify(result),
      result.openAiRequestId,
      result.httpStatus,
      completedAt,
      completedAt,
      completedAt,
      row.id,
    ).run();
    return result;
  } catch (error) {
    const backgroundError = error instanceof PassportOpenAiBackgroundError ? error : null;
    const responseId = backgroundError?.responseId ?? row.response_id;
    const message = error instanceof Error ? error.message : "Passport OCR provider request failed.";
    if (!responseId && (backgroundError?.code === "ambiguous_submission" || backgroundError?.code === "timeout" || backgroundError?.code === "invalid_response")) {
      await markManualReview(env, row, "ambiguous_submission", message);
    } else if (responseId && backgroundError?.code === "timeout") {
      await env.DB.prepare(`
        UPDATE passport_ocr_response_attempts
        SET response_id = COALESCE(response_id, ?), state = 'POLLING', error_code = 'poll_timeout', error_message = ?, updated_at = ?
        WHERE id = ?
      `).bind(responseId, message, nowIso(), row.id).run();
    } else {
      await env.DB.prepare(`
        UPDATE passport_ocr_response_attempts
        SET response_id = COALESCE(response_id, ?), state = 'FAILED', error_code = ?, error_message = ?, updated_at = ?
        WHERE id = ?
      `).bind(responseId, backgroundError?.code ?? "request_failed", message, nowIso(), row.id).run();
      await markPassportOcrAttemptState(env, attempt.id, "FAILED", {
        code: backgroundError?.code ?? "request_failed",
        message,
      });
    }
    throw error;
  }
}

export async function cleanupExpiredPassportOcrAttempts(env: Pick<PassportOcrAttemptBindings, "DB">, now = new Date()): Promise<number> {
  const result = await env.DB.prepare(`
    DELETE FROM passport_ocr_attempts
    WHERE expires_at <= ?
      AND state IN ('ACTIVE', 'CLASSIFIED', 'OCR_COMPLETED', 'PASSPORT_SAVED', 'FAILED', 'MANUAL_REVIEW', 'DISCARDED')
  `).bind(nowIso(now)).run();
  return Number(result.meta.changes ?? 0);
}
