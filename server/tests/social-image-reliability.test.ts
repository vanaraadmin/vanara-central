import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  reconcileStaleSocialImagePreparations,
} from "../src/services/social-image-preparation.service.ts";

type RecoveryRow = Record<string, unknown> & {
  social_post_id: number;
  original_object_key: string;
  status: string;
  processing_started_at: string | null;
  image_leased_at: string | null;
  image_phase: string | null;
  image_source_ready_at: string | null;
  image_request_started_at: string | null;
  image_response_received_at: string | null;
  image_openai_response_id: string | null;
  image_recovery_state: string | null;
  openai_request_count: number;
  attempt_count: number;
};

function row(id: number, overrides: Partial<RecoveryRow> = {}): RecoveryRow {
  return {
    social_post_id: id,
    original_object_key: `social/uploads/original-${id}.jpg`,
    processed_object_key: null,
    original_file_name: `original-${id}.jpg`,
    content_type: "image/jpeg",
    byte_size: 1234,
    uploaded_by: "owner-bootstrap",
    uploaded_by_name: "Stefano",
    status: "PREPARING_IMAGE",
    queued_at: "2026-08-12T01:00:00.000Z",
    processing_started_at: "2026-08-12T01:01:00.000Z",
    image_prepared_at: null,
    caption_prepared_at: null,
    scheduled_publish_at: null,
    posted_at: null,
    failed_at: null,
    updated_at: "2026-08-12T01:01:00.000Z",
    attempt_count: 1,
    failure_code: null,
    failure_message: null,
    openai_request_count: 0,
    estimated_cost_usd: 0,
    image_phase: "LEASED",
    image_leased_at: "2026-08-12T01:01:00.000Z",
    image_source_ready_at: null,
    image_request_started_at: null,
    image_response_received_at: null,
    image_finalized_at: null,
    image_watchdog_at: null,
    image_openai_response_id: null,
    image_recovery_state: null,
    ...overrides,
  };
}

class RecoveryDb {
  constructor(readonly rows: RecoveryRow[]) {}

  prepare(sql: string) {
    let params: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        params = values;
        return this;
      },
      run: async () => {
        if (sql.includes("image_preparation_interrupted_retry_safe")) {
          const cutoff = String(params[4]);
          const candidates = this.rows.filter((item) =>
            item.status === "PREPARING_IMAGE"
            && String(item.image_leased_at ?? item.processing_started_at) <= cutoff
            && item.image_request_started_at === null
            && item.image_response_received_at === null
            && item.image_openai_response_id === null
            && item.openai_request_count === 0);
          for (const item of candidates) {
            Object.assign(item, {
              status: "FAILED",
              image_phase: "FAILED",
              image_watchdog_at: params[0],
              image_finalized_at: params[1],
              image_recovery_state: "RETRY_SAFE",
              failed_at: params[2],
              updated_at: params[3],
              failure_code: "image_preparation_interrupted_retry_safe",
            });
          }
          return { meta: { changes: candidates.length } };
        }
        if (sql.includes("image_preparation_outcome_unknown_manual_review")) {
          const cutoff = String(params[4]);
          const candidates = this.rows.filter((item) =>
            item.status === "PREPARING_IMAGE"
            && String(item.image_leased_at ?? item.processing_started_at) <= cutoff
            && (item.image_request_started_at !== null
              || item.image_response_received_at !== null
              || item.image_openai_response_id !== null
              || item.openai_request_count > 0));
          for (const item of candidates) {
            Object.assign(item, {
              status: "FAILED",
              image_phase: "FAILED",
              image_watchdog_at: params[0],
              image_finalized_at: params[1],
              image_recovery_state: "MANUAL_REVIEW",
              failed_at: params[2],
              updated_at: params[3],
              failure_code: "image_preparation_outcome_unknown_manual_review",
            });
          }
          return { meta: { changes: candidates.length } };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
      first: async <T>() => {
        const id = Number(params[0]);
        return (this.rows.find((item) => item.social_post_id === id) ?? null) as T | null;
      },
    };
  }
}

test("crashes after lease or R2 source validation become retry-safe without touching the original", async () => {
  const leased = row(1);
  const sourceReady = row(2, {
    image_phase: "SOURCE_READY",
    image_source_ready_at: "2026-08-12T01:02:00.000Z",
  });
  const db = new RecoveryDb([leased, sourceReady]);

  const result = await reconcileStaleSocialImagePreparations(
    { DB: db as unknown as D1Database },
    "2026-08-12T01:30:00.000Z",
  );

  assert.deepEqual(result, { retrySafe: 2, manualReview: 0 });
  assert.deepEqual(
    await reconcileStaleSocialImagePreparations({ DB: db as unknown as D1Database }, "2026-08-12T01:31:00.000Z"),
    { retrySafe: 0, manualReview: 0 },
  );
  assert.equal(db.rows.every((item) => item.image_recovery_state === "RETRY_SAFE"), true);
  assert.deepEqual(db.rows.map((item) => item.original_object_key), [
    "social/uploads/original-1.jpg",
    "social/uploads/original-2.jpg",
  ]);
});

test("crashes at the request boundary or after the AI response require manual review", async () => {
  const requestStarted = row(3, {
    image_phase: "REQUEST_STARTED",
    image_request_started_at: "2026-08-12T01:02:00.000Z",
    openai_request_count: 1,
  });
  const responseReceived = row(4, {
    image_phase: "RESPONSE_RECEIVED",
    image_request_started_at: "2026-08-12T01:02:00.000Z",
    image_response_received_at: "2026-08-12T01:03:00.000Z",
    image_openai_response_id: "resp_existing",
    openai_request_count: 1,
  });
  const db = new RecoveryDb([requestStarted, responseReceived]);

  const result = await reconcileStaleSocialImagePreparations(
    { DB: db as unknown as D1Database },
    "2026-08-12T01:30:00.000Z",
  );

  assert.deepEqual(result, { retrySafe: 0, manualReview: 2 });
  assert.equal(db.rows.every((item) => item.image_recovery_state === "MANUAL_REVIEW"), true);
});

test("checkpoint ordering and cron recovery guard the paid request boundary", () => {
  const service = readFileSync(new URL("../src/services/social-image-preparation.service.ts", import.meta.url), "utf8");
  const config = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../migrations/0047_social_image_reliability.sql", import.meta.url), "utf8");
  const prepareFlow = service.slice(service.indexOf("export async function prepareSocialImage"));

  assert.ok(prepareFlow.indexOf("markImageSourceReady") < prepareFlow.indexOf("markImageRequestStarted"));
  assert.ok(prepareFlow.indexOf("markImageRequestStarted") < prepareFlow.indexOf("callOpenAiSocialImagePrepare"));
  assert.ok(prepareFlow.indexOf("callOpenAiSocialImagePrepare") < prepareFlow.indexOf("markImageResponseReceived"));
  assert.equal(prepareFlow.match(/callOpenAiSocialImagePrepare\(/g)?.length, 1);
  assert.match(service, /openai_request_count = openai_request_count \+ 1/);
  assert.match(service, /SOCIAL_IMAGE_PREPARE_CRON = "\*\/10 \* \* \* \*"/);
  assert.match(config, /"\*\/10 \* \* \* \*"/);
  assert.match(prepareFlow, /if \(socialPostId === null\) await reconcileStaleSocialImagePreparations/);
  assert.doesNotMatch(service.slice(service.indexOf("export async function reconcileStaleSocialImagePreparations"), service.indexOf("async function callOpenAiSocialImagePrepare")), /callOpenAi|prepareSocialImage/);
  assert.match(service, /status = 'FAILED'[\s\S]*image_recovery_state = 'RETRY_SAFE'[\s\S]*openai_request_count = 0[\s\S]*attempt_count < \$\{SOCIAL_IMAGE_MAX_ATTEMPTS\}/);
  assert.doesNotMatch(service, /R2_STORAGE\.delete\(leased\.original_object_key\)/);
  assert.match(migration, /image_request_started_at/);
  assert.match(migration, /image_response_received_at/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM social_post_queue/i);
});
