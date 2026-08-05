import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import worker from "../src/index.ts";
import type { CurrentUser, ModuleKey, UserRole, UserView } from "../src/services/current-user.service.ts";
import {
  listSocialAutomationOverview,
  normalizeSocialPhotoUploadFormData,
  queueSocialPhoto,
  type SocialPostQueueItem,
  type SocialPostStatus,
} from "../src/services/social-automation.service.ts";
import {
  buildSocialImagePrepareRequest,
  DEFAULT_SOCIAL_CAPTION_MODEL,
  DEFAULT_SOCIAL_IMAGE_PREP_MODEL,
  prepareNextQueuedSocialImage,
  prepareSocialImage,
  SOCIAL_IMAGE_PREPARE_CRON,
} from "../src/services/social-image-preparation.service.ts";
import {
  buildSocialCaptionRequest,
  prepareNextSocialCaption,
  prepareSocialCaption,
  SOCIAL_CAPTION_CRON,
} from "../src/services/social-caption.service.ts";
import {
  getSocialPublishAsset,
  publishNextSocialPost,
  publishSocialPost,
  SOCIAL_PUBLIC_PUBLISH_PREFIX,
  SOCIAL_PUBLISH_CRON,
  socialPublishAssetTokenFromKey,
} from "../src/services/social-publish.service.ts";

type PermissionRow = { module_key: ModuleKey; can_access: number; can_edit: number };
type SocialRow = {
  social_post_id: number;
  original_object_key: string;
  processed_object_key: string | null;
  original_file_name: string;
  content_type: string;
  byte_size: number;
  uploaded_by: string;
  uploaded_by_name: string;
  status: SocialPostStatus;
  queued_at: string;
  processing_started_at: string | null;
  image_prepared_at: string | null;
  caption_prepared_at: string | null;
  scheduled_publish_at: string | null;
  posted_at: string | null;
  failed_at: string | null;
  updated_at: string;
  attempt_count: number;
  failure_code: string | null;
  failure_message: string | null;
  openai_request_count: number;
  openai_input_tokens: number;
  openai_cached_input_tokens: number;
  openai_output_tokens: number;
  openai_reasoning_tokens: number;
  openai_total_tokens: number;
  openai_elapsed_ms: number;
  estimated_cost_usd: number;
  analysis_json: string | null;
  caption_json: string | null;
  caption_style_fingerprint: string | null;
  published_image_object_key: string | null;
  facebook_post_id: string | null;
  instagram_post_id: string | null;
  source_metadata_json: string | null;
};

const OWNER_ROW = {
  user_id: "owner-1",
  full_name: "Stefano Owner",
  profile_photo_url: null,
  role: "Owner" as UserRole,
  preferred_language: "en" as const,
  username: "stefano",
  email: null,
  password_hash: "not-returned",
  status: "active",
  created_at: "2026-08-05T00:00:00.000Z",
  updated_at: "2026-08-05T00:00:00.000Z",
  last_login_at: null,
};

const SOCIAL_PERMISSION: PermissionRow = { module_key: "social-automation", can_access: 1, can_edit: 1 };

class FakeSocialStmt {
  private params: unknown[] = [];
  constructor(private db: FakeSocialDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

class FakeSocialDB {
  rows: SocialRow[] = [];
  private nextId = 1;

  constructor(private options: {
    authenticated?: boolean;
    role?: UserRole;
    views?: UserView[];
    permissions?: PermissionRow[];
    failInsert?: boolean;
    failImageReadyUpdate?: boolean;
    failCaptionReadyUpdate?: boolean;
    failDeleteRow?: boolean;
  } = {}) {}

  prepare(sql: string) { return new FakeSocialStmt(this, sql); }

  seed(overrides: Partial<SocialRow> = {}): SocialRow {
    const now = overrides.queued_at ?? "2026-08-05T00:00:00.000Z";
    const row: SocialRow = {
      social_post_id: overrides.social_post_id ?? this.nextId,
      original_object_key: overrides.original_object_key ?? `social/uploads/2026-08-05/${crypto.randomUUID()}.jpg`,
      processed_object_key: overrides.processed_object_key ?? null,
      original_file_name: overrides.original_file_name ?? "photo.jpg",
      content_type: overrides.content_type ?? "image/jpeg",
      byte_size: overrides.byte_size ?? 4,
      uploaded_by: overrides.uploaded_by ?? OWNER_ROW.user_id,
      uploaded_by_name: overrides.uploaded_by_name ?? OWNER_ROW.full_name,
      status: overrides.status ?? "QUEUED",
      queued_at: now,
      processing_started_at: overrides.processing_started_at ?? null,
      image_prepared_at: overrides.image_prepared_at ?? null,
      caption_prepared_at: overrides.caption_prepared_at ?? null,
      scheduled_publish_at: overrides.scheduled_publish_at ?? null,
      posted_at: overrides.posted_at ?? null,
      failed_at: overrides.failed_at ?? null,
      updated_at: overrides.updated_at ?? now,
      attempt_count: overrides.attempt_count ?? 0,
      failure_code: overrides.failure_code ?? null,
      failure_message: overrides.failure_message ?? null,
      openai_request_count: overrides.openai_request_count ?? 0,
      openai_input_tokens: overrides.openai_input_tokens ?? 0,
      openai_cached_input_tokens: overrides.openai_cached_input_tokens ?? 0,
      openai_output_tokens: overrides.openai_output_tokens ?? 0,
      openai_reasoning_tokens: overrides.openai_reasoning_tokens ?? 0,
      openai_total_tokens: overrides.openai_total_tokens ?? 0,
      openai_elapsed_ms: overrides.openai_elapsed_ms ?? 0,
      estimated_cost_usd: overrides.estimated_cost_usd ?? 0,
      analysis_json: overrides.analysis_json ?? null,
      caption_json: overrides.caption_json ?? null,
      caption_style_fingerprint: overrides.caption_style_fingerprint ?? null,
      published_image_object_key: overrides.published_image_object_key ?? null,
      facebook_post_id: overrides.facebook_post_id ?? null,
      instagram_post_id: overrides.instagram_post_id ?? null,
      source_metadata_json: overrides.source_metadata_json ?? null,
    };
    this.nextId = Math.max(this.nextId, row.social_post_id + 1);
    this.rows.push(row);
    return row;
  }

  async all<T>(sql: string, params: unknown[]) {
    void params;
    if (sql.includes("SELECT view_key FROM user_views")) {
      const views = this.options.views ?? ["owner", "staff"];
      return { results: views.map((view_key) => ({ view_key })) as T[] };
    }
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) {
      return { results: (this.options.permissions ?? [SOCIAL_PERMISSION]) as T[] };
    }
    if (sql.includes("SELECT status, COUNT(*) AS count")) {
      const counts = new Map<SocialPostStatus, number>();
      for (const row of this.rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
      return { results: [...counts].map(([status, count]) => ({ status, count })) as T[] };
    }
    if (sql.includes("FROM social_post_queue") && sql.includes("caption_style_fingerprint IS NOT NULL")) {
      return {
        results: [...this.rows]
          .filter((row) => row.social_post_id !== Number(params[0]) && row.caption_style_fingerprint && row.caption_json)
          .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.social_post_id - left.social_post_id)
          .slice(0, Number(params[1]))
          .map((row) => ({
            social_post_id: row.social_post_id,
            caption_style_fingerprint: row.caption_style_fingerprint,
            caption_json: row.caption_json,
            caption_prepared_at: row.caption_prepared_at,
          })) as T[],
      };
    }
    if (sql.includes("FROM social_post_queue") && sql.includes("ORDER BY queued_at DESC")) {
      return { results: [...this.rows].sort((left, right) => right.queued_at.localeCompare(left.queued_at)) as T[] };
    }
    return { results: [] as T[] };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("UPDATE social_post_queue") && sql.includes("SET status = 'PREPARING_IMAGE'") && sql.includes("RETURNING *")) {
      const targetId = params.length >= 3 ? Number(params[2]) : null;
      const candidates = this.rows
        .filter((row) => row.status === "QUEUED" && (targetId === null || row.social_post_id === targetId))
        .sort((left, right) => left.queued_at.localeCompare(right.queued_at) || left.social_post_id - right.social_post_id);
      const row = candidates[0];
      if (!row) return null;
      row.status = "PREPARING_IMAGE";
      row.processing_started_at = String(params[0]);
      row.updated_at = String(params[1]);
      row.attempt_count += 1;
      row.failure_code = null;
      row.failure_message = null;
      return { ...row } as T;
    }
    if (sql.includes("UPDATE social_post_queue") && sql.includes("SET status = 'CAPTIONING'") && sql.includes("RETURNING *")) {
      const targetId = params.length >= 2 ? Number(params[1]) : null;
      const candidates = this.rows
        .filter((row) => row.status === "IMAGE_READY"
          && row.processed_object_key
          && row.analysis_json
          && row.openai_request_count <= 1
          && (targetId === null || row.social_post_id === targetId))
        .sort((left, right) => left.queued_at.localeCompare(right.queued_at) || left.social_post_id - right.social_post_id);
      const row = candidates[0];
      if (!row) return null;
      row.status = "CAPTIONING";
      row.updated_at = String(params[0]);
      row.failure_code = null;
      row.failure_message = null;
      return { ...row } as T;
    }
    if (sql.includes("UPDATE social_post_queue") && sql.includes("SET status = 'POSTING'") && sql.includes("RETURNING *")) {
      const targetId = params.length >= 3 ? Number(params[2]) : null;
      const candidates = this.rows
        .filter((row) => row.status === "READY_TO_POST"
          && row.processed_object_key
          && row.caption_json
          && (targetId === null || row.social_post_id === targetId))
        .sort((left, right) => left.queued_at.localeCompare(right.queued_at) || left.social_post_id - right.social_post_id);
      const row = candidates[0];
      if (!row) return null;
      row.status = "POSTING";
      row.processing_started_at = row.processing_started_at ?? String(params[0]);
      row.updated_at = String(params[1]);
      row.failure_code = null;
      row.failure_message = null;
      return { ...row } as T;
    }
    if (sql.includes("SELECT s.session_id")) {
      if (this.options.authenticated === false) return null;
      return {
        session_id: "session-1",
        expires_at: "2999-01-01T00:00:00.000Z",
        ...OWNER_ROW,
        role: this.options.role ?? OWNER_ROW.role,
      } as T;
    }
    if (sql.includes("WHERE original_object_key = ?")) {
      return (this.rows.find((row) => row.original_object_key === params[0]) ?? null) as T | null;
    }
    if (sql.includes("WHERE social_post_id = ?")) {
      return (this.rows.find((row) => row.social_post_id === Number(params[0])) ?? null) as T | null;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO social_post_queue")) {
      if (this.options.failInsert) throw new Error("D1 insert failed");
      this.rows.push({
        social_post_id: this.nextId,
        original_object_key: String(params[0]),
        processed_object_key: null,
        original_file_name: String(params[1]),
        content_type: String(params[2]),
        byte_size: Number(params[3]),
        uploaded_by: String(params[4]),
        uploaded_by_name: String(params[5]),
        status: "QUEUED",
        queued_at: String(params[6]),
        processing_started_at: null,
        image_prepared_at: null,
        caption_prepared_at: null,
        scheduled_publish_at: null,
        posted_at: null,
        failed_at: null,
        updated_at: String(params[7]),
        attempt_count: 0,
        failure_code: null,
        failure_message: null,
        openai_request_count: 0,
        openai_input_tokens: 0,
        openai_cached_input_tokens: 0,
        openai_output_tokens: 0,
        openai_reasoning_tokens: 0,
        openai_total_tokens: 0,
        openai_elapsed_ms: 0,
        estimated_cost_usd: 0,
        analysis_json: null,
        caption_json: null,
        caption_style_fingerprint: null,
        published_image_object_key: null,
        facebook_post_id: null,
        instagram_post_id: null,
        source_metadata_json: null,
      });
      this.nextId += 1;
      return { meta: { changes: 1, last_row_id: this.nextId - 1 } };
    }
    if (sql.includes("SET status = 'IMAGE_READY'")) {
      if (this.options.failImageReadyUpdate) return { meta: { changes: 0, last_row_id: 0 } };
      const row = this.rows.find((item) => item.social_post_id === Number(params[14]));
      if (!row || row.status !== "PREPARING_IMAGE") return { meta: { changes: 0, last_row_id: 0 } };
      row.status = "IMAGE_READY";
      row.processed_object_key = String(params[0]);
      row.image_prepared_at = String(params[1]);
      row.updated_at = String(params[2]);
      row.analysis_json = String(params[3]);
      row.source_metadata_json = String(params[6]);
      row.openai_request_count = 1;
      row.openai_input_tokens = Number(params[7]);
      row.openai_cached_input_tokens = Number(params[8]);
      row.openai_output_tokens = Number(params[9]);
      row.openai_reasoning_tokens = Number(params[10]);
      row.openai_total_tokens = Number(params[11]);
      row.openai_elapsed_ms = Number(params[12]);
      row.estimated_cost_usd = Number(params[13]);
      row.failure_code = null;
      row.failure_message = null;
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("SET status = 'READY_TO_POST'")) {
      if (this.options.failCaptionReadyUpdate) return { meta: { changes: 0, last_row_id: 0 } };
      const row = this.rows.find((item) => item.social_post_id === Number(params[12]));
      if (!row || row.status !== "CAPTIONING") return { meta: { changes: 0, last_row_id: 0 } };
      row.status = "READY_TO_POST";
      row.caption_prepared_at = String(params[0]);
      row.updated_at = String(params[1]);
      row.caption_json = String(params[2]);
      row.caption_style_fingerprint = String(params[4]);
      row.openai_request_count = 2;
      row.openai_input_tokens += Number(params[5]);
      row.openai_cached_input_tokens += Number(params[6]);
      row.openai_output_tokens += Number(params[7]);
      row.openai_reasoning_tokens += Number(params[8]);
      row.openai_total_tokens += Number(params[9]);
      row.openai_elapsed_ms += Number(params[10]);
      row.estimated_cost_usd += Number(params[11]);
      row.failure_code = null;
      row.failure_message = null;
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("SET status = 'FAILED'")) {
      const isCaptionFailure = sql.includes("caption_openai_response_id");
      const isPublishFailure = sql.includes("published_image_object_key = COALESCE");
      const row = this.rows.find((item) => item.social_post_id === Number(params[isPublishFailure ? 7 : isCaptionFailure ? 13 : 20]));
      if (!row) return { meta: { changes: 0, last_row_id: 0 } };
      row.status = "FAILED";
      row.failed_at = String(params[0]);
      row.updated_at = String(params[1]);
      row.failure_code = String(params[2]);
      row.failure_message = String(params[3]);
      if (isPublishFailure) {
        if (params[4]) row.instagram_post_id = String(params[4]);
        if (params[5]) row.facebook_post_id = String(params[5]);
        if (params[6]) row.published_image_object_key = String(params[6]);
        return { meta: { changes: 1, last_row_id: 0 } };
      }
      if (isCaptionFailure) {
        if (params[5] !== null) row.openai_request_count = 2;
        row.openai_input_tokens += Number(params[6]);
        row.openai_cached_input_tokens += Number(params[7]);
        row.openai_output_tokens += Number(params[8]);
        row.openai_reasoning_tokens += Number(params[9]);
        row.openai_total_tokens += Number(params[10]);
        row.openai_elapsed_ms += Number(params[11]);
        row.estimated_cost_usd += Number(params[12]);
        return { meta: { changes: 1, last_row_id: 0 } };
      }
      if (params[5] !== null) {
        row.openai_request_count = 1;
        row.estimated_cost_usd = Number(params[19]);
      }
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("SET published_image_object_key = ?")) {
      const row = this.rows.find((item) => item.social_post_id === Number(params[2]));
      if (!row || row.status !== "POSTING") return { meta: { changes: 0, last_row_id: 0 } };
      row.published_image_object_key = String(params[0]);
      row.updated_at = String(params[1]);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("SET instagram_post_id = ?")) {
      const row = this.rows.find((item) => item.social_post_id === Number(params[2]));
      if (!row || row.status !== "POSTING") return { meta: { changes: 0, last_row_id: 0 } };
      row.instagram_post_id = String(params[0]);
      row.updated_at = String(params[1]);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("SET facebook_post_id = ?")) {
      const row = this.rows.find((item) => item.social_post_id === Number(params[2]));
      if (!row || row.status !== "POSTING") return { meta: { changes: 0, last_row_id: 0 } };
      row.facebook_post_id = String(params[0]);
      row.updated_at = String(params[1]);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("DELETE FROM social_post_queue")) {
      if (this.options.failDeleteRow) return { meta: { changes: 0, last_row_id: 0 } };
      const index = this.rows.findIndex((item) => item.social_post_id === Number(params[0]));
      if (index < 0) return { meta: { changes: 0, last_row_id: 0 } };
      this.rows.splice(index, 1);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }
}

class FakeR2Storage {
  objects = new Map<string, { body: ArrayBuffer; contentType: string | undefined }>();
  deleted: string[] = [];
  failDeleteKeys = new Set<string>();

  async put(key: string, body: ArrayBuffer | ArrayBufferView | string | null | ReadableStream, options?: R2PutOptions) {
    let buffer: ArrayBuffer;
    if (body instanceof ArrayBuffer) {
      buffer = body;
    } else if (ArrayBuffer.isView(body)) {
      buffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    } else if (typeof body === "string") {
      buffer = new TextEncoder().encode(body).buffer;
    } else {
      throw new Error("Unsupported fake R2 body");
    }
    this.objects.set(key, { body: buffer, contentType: options?.httpMetadata?.contentType });
    return null;
  }

  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(object.body));
          controller.close();
        },
      }),
      arrayBuffer: async () => object.body,
    } as R2ObjectBody;
  }

  async delete(key: string) {
    if (this.failDeleteKeys.has(key)) throw new Error("R2 delete failed");
    this.objects.delete(key);
    this.deleted.push(key);
  }
}

function env(db = new FakeSocialDB(), r2 = new FakeR2Storage(), fetcher?: typeof fetch) {
  return {
    DB: db as unknown as D1Database,
    R2_STORAGE: r2 as unknown as R2Bucket,
    BEDS24_BASE_URL: "https://api.beds24.com/v2",
    BEDS24_LONG_LIFE_TOKEN: "test",
    VANARA_DATABASE_ENVIRONMENT: "test",
    VANARA_DATABASE_NAME: "vanara-test",
    WARAPORN_KB_ARCHIVE: r2 as unknown as R2Bucket,
    OPENAI_API_KEY: "test-openai",
    SOCIAL_VECTOR_STORE_ID: "vs_social_test",
    META_PAGE_ACCESS_TOKEN: "test-meta-token",
    META_FACEBOOK_PAGE_ID: "fb-page-1",
    META_INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig-business-1",
    META_GRAPH_API_VERSION: "v25.0",
    SOCIAL_PUBLIC_BASE_URL: "https://vanara.test",
    fetcher,
  };
}

function currentUser(): CurrentUser {
  return {
    id: OWNER_ROW.user_id,
    displayName: OWNER_ROW.full_name,
    fullName: OWNER_ROW.full_name,
    profilePhotoUrl: null,
    role: OWNER_ROW.role,
    preferredLanguage: OWNER_ROW.preferred_language,
    username: OWNER_ROW.username,
    email: null,
    status: "active",
    views: ["owner", "staff"],
    permissions: [{ module: "social-automation", canAccess: true, canEdit: true }],
    actionPermissions: [],
    lastLoginAt: null,
  };
}

async function request(path: string, init: RequestInit, data: ReturnType<typeof env>) {
  return worker.fetch(new Request(`https://vanara.test${path}`, init), data as never, {} as never);
}

async function json(response: Response) {
  return response.json() as Promise<{ success: boolean; data?: unknown; error?: string }>;
}

function fakeJpegBuffer(): ArrayBuffer {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
}

function successfulOpenAiFetcher(calls: Array<{ input: string; init: RequestInit; body: unknown }>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as unknown;
    calls.push({ input: String(input), init: init ?? {}, body });
    return new Response(JSON.stringify({
      id: "resp_social_image_1",
      output: [
        { type: "file_search_call", results: [{ filename: "Vanara_Social_Style.md" }] },
        { type: "image_generation_call", result: Buffer.from("processed-jpeg").toString("base64") },
        {
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              visual_subject: "Villa terrace",
              visible_details: ["morning light", "wood texture"],
              visual_evidence: ["wood terrace surface", "green leaves near the frame", "warm light on the room edge"],
              caption_anchors: ["wood terrace surface", "green leaves near the frame"],
              story_angles: ["room atmosphere", "garden detail"],
              guest_experience_link: "The terrace detail can connect softly to slowing down at Vanara.",
              do_not_claim: ["sea view", "sunset"],
              avoid_claims: ["sea view", "sunset"],
              confidence_by_detail: { "wood terrace surface": "certain", "green leaves near the frame": "certain" },
              location_context: { resort: "Vanara", island: "Koh Chang", country: "Thailand", source: "app_default" },
              local_context: { resort: "Vanara", island: "Koh Chang", country: "Thailand", source: "app_default", confidence: "declared_context" },
              seasonal_context: { date: "2026-08-05T20:00:00.000Z", likely_season: "green_season", kb_notes: ["green season context"], confidence: "calendar_context_only" },
              caption_context_notes: ["Use the wood terrace and leaves as visual anchors."],
              tone_hints: ["calm", "grounded", "observant"],
              instagram_hint: "Open with a concrete visual detail, not a generic travel hook.",
              facebook_hint: "Preserve a calm narrative around the terrace and leaves.",
              recommended_hashtag_categories: ["rooms", "nature"],
              location_guess: "Vanara Retreat",
              location_source: "owner_upload",
              location_confidence: 0.72,
              mood: "calm",
              colors: ["green", "warm wood"],
              natural_elements: ["leaves"],
              architectural_or_material_details: ["wood"],
              time_of_day_guess: "morning",
              detected_entities: ["terrace"],
              editing_summary: "Natural exposure and colour refinement.",
              risk_notes: "No invented elements.",
              conservative_enhancement_note: "Conservative enhancement used to preserve the original scene.",
            }),
          }],
        },
      ],
      usage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 20 },
        output_tokens: 30,
        output_tokens_details: { reasoning_tokens: 4 },
        total_tokens: 130,
      },
    }), { status: 200, headers: { "x-request-id": "req_social_image_1" } });
  }) as typeof fetch;
}

function socialAnalysisJson(): string {
  return JSON.stringify({
    visual_subject: "Villa terrace",
    visual_evidence: ["wood terrace surface", "green leaves near the frame", "warm light on the room edge"],
    caption_anchors: ["wood terrace surface", "green leaves near the frame"],
    story_angles: ["room atmosphere", "garden detail"],
    guest_experience_link: "The terrace detail can connect softly to slowing down at Vanara.",
    do_not_claim: ["sea view", "sunset"],
    avoid_claims: ["sea view", "sunset"],
    location_context: { resort: "Vanara", island: "Koh Chang", country: "Thailand", source: "app_default" },
    seasonal_context: { date: "2026-08-06", likely_season: "green_season", kb_notes: ["green season context"], confidence: "calendar_context_only" },
    tone_hints: ["calm", "grounded", "observant"],
    instagram_hint: "Open with a concrete visual detail, not a generic travel hook.",
    facebook_hint: "Preserve a calm narrative around the terrace and leaves.",
    recommended_hashtag_categories: ["rooms", "nature"],
  });
}

function captionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    instagram_caption: "EN\nWood grain, green leaves, and soft light make this little terrace feel quietly ready for the day.\n\nTH\nThai natural caption about soft light, green leaves, and the wood terrace at Vanara.\n\n#VanaraResort #VanaraKohChang #KohChang #Thailand #IslandRetreat #TropicalGarden #SlowTravel",
    instagram_caption_en: "Wood grain, green leaves, and soft light make this little terrace feel quietly ready for the day.",
    instagram_caption_th: "Thai natural caption about soft light, green leaves, and the wood terrace at Vanara.",
    facebook_caption: "Wood grain catches the soft light beside a frame of green leaves.\n\nIt is a small Vanara detail, but the kind that slows the morning down on Koh Chang.\n\nWhat kind of quiet corner helps you arrive?\n\nThai natural Facebook paragraph with the same calm Vanara intention.\n\n#VanaraResort #VanaraKohChang #KohChang #Thailand #IslandRetreat #TropicalGarden #SlowTravel",
    facebook_caption_en: "Wood grain catches the soft light beside a frame of green leaves.\n\nIt is a small Vanara detail, but the kind that slows the morning down on Koh Chang.",
    facebook_caption_th: "Thai natural Facebook paragraph with the same calm Vanara intention.",
    instagram_hashtags: ["#VanaraResort", "#VanaraKohChang", "#KohChang", "#Thailand", "#IslandRetreat", "#TropicalGarden", "#SlowTravel"],
    facebook_hashtags: ["#VanaraResort", "#VanaraKohChang", "#KohChang", "#Thailand", "#IslandRetreat", "#TropicalGarden", "#SlowTravel"],
    alt_text: "Wood terrace detail framed by green leaves and warm light at Vanara.",
    grounding_used: ["wood terrace surface", "green leaves near the frame"],
    avoid_claims_respected: true,
    caption_style_fingerprint: {
      opening_pattern: "direct visual detail",
      first_words_signature: "wood grain green leaves soft",
      paragraph_count: 3,
      cta_type: "soft question",
      separator_style: "blank line",
      main_theme: "room atmosphere",
    },
    repetitive_warning: false,
    repetitive_warning_reason: null,
    ...overrides,
  };
}

function successfulCaptionFetcher(calls: Array<{ input: string; init: RequestInit; body: unknown }>, overrides: Record<string, unknown> = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as unknown;
    calls.push({ input: String(input), init: init ?? {}, body });
    return new Response(JSON.stringify({
      id: "resp_social_caption_1",
      output: [
        { type: "file_search_call", results: [{ filename: "Vanara_Social_Style.md" }] },
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(captionPayload(overrides)) }],
        },
      ],
      usage: {
        input_tokens: 80,
        input_tokens_details: { cached_tokens: 10 },
        output_tokens: 60,
        output_tokens_details: { reasoning_tokens: 3 },
        total_tokens: 140,
      },
    }), { status: 200, headers: { "x-request-id": "req_social_caption_1" } });
  }) as typeof fetch;
}

function socialCaptionJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(captionPayload(overrides));
}

function readyToPostSeed(overrides: Partial<SocialRow> = {}): Partial<SocialRow> {
  return {
    status: "READY_TO_POST",
    original_object_key: "social/uploads/2026-08-05/original.jpg",
    processed_object_key: "social/processed/2026-08-05/processed.jpg",
    caption_json: socialCaptionJson(),
    openai_request_count: 2,
    ...overrides,
  };
}

function successfulMetaFetcher(calls: Array<{ input: string; init: RequestInit; body: string }>, failures: Partial<Record<"igCreate" | "igPublish" | "fb", boolean>> = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = String(init?.body ?? "");
    calls.push({ input: url, init: init ?? {}, body });
    if (url.includes("/media_publish")) {
      if (failures.igPublish) return new Response(JSON.stringify({ error: { message: "IG publish failed" } }), { status: 400 });
      return new Response(JSON.stringify({ id: "ig-post-1" }), { status: 200 });
    }
    if (url.includes("/media")) {
      if (failures.igCreate) return new Response(JSON.stringify({ error: { message: "IG create failed" } }), { status: 400 });
      return new Response(JSON.stringify({ id: "ig-container-1" }), { status: 200 });
    }
    if (url.includes("/photos")) {
      if (failures.fb) return new Response(JSON.stringify({ error: { message: "FB publish failed" } }), { status: 400 });
      return new Response(JSON.stringify({ post_id: "fb-post-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "Unexpected Meta endpoint" } }), { status: 404 });
  }) as typeof fetch;
}

test("social photo upload accepts JPG, PNG and WebP only and rejects HEIC clearly", () => {
  const ok = new FormData();
  ok.set("file", new File([new Uint8Array([1, 2, 3])], "pool.webp", { type: "image/webp" }));
  assert.equal(normalizeSocialPhotoUploadFormData(ok).file.name, "pool.webp");

  const heic = new FormData();
  heic.set("file", new File([new Uint8Array([1])], "iphone.heic", { type: "image/heic" }));
  assert.throws(() => normalizeSocialPhotoUploadFormData(heic), /HEIC is not supported\. Please upload JPG, PNG or WebP\./);

  const pdf = new FormData();
  pdf.set("file", new File([new Uint8Array([1])], "notes.pdf", { type: "application/pdf" }));
  assert.throws(() => normalizeSocialPhotoUploadFormData(pdf), /Please upload JPG, PNG or WebP\./);
});

test("social photo upload stores the original image in R2 and queues a D1 record", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const data = env(db, r2);
  const formData = new FormData();
  formData.set("file", new File([new Uint8Array([1, 2, 3])], "Morning Villa.png", { type: "image/png" }));
  const input = normalizeSocialPhotoUploadFormData(formData);

  const item = await queueSocialPhoto(data, input, currentUser(), "2026-08-05T00:30:00.000Z");

  assert.equal(item.status, "QUEUED");
  assert.equal(item.contentType, "image/png");
  assert.equal(item.originalFileName, "Morning Villa.png");
  assert.match(item.originalObjectKey, /^social\/uploads\/2026-08-05\/.+\.png$/);
  assert.equal(item.processedObjectKey, null);
  assert.equal(item.openaiRequestCount, 0);
  assert.equal(item.estimatedCostUsd, 0);
  assert.equal(r2.objects.has(item.originalObjectKey), true);
  assert.equal(db.rows.length, 1);
});

test("social photo upload rolls back the R2 object when D1 queue insert fails", async () => {
  const db = new FakeSocialDB({ failInsert: true });
  const r2 = new FakeR2Storage();
  const data = env(db, r2);
  const formData = new FormData();
  formData.set("file", new File([new Uint8Array([1, 2, 3])], "pool.jpg", { type: "image/jpeg" }));
  const input = normalizeSocialPhotoUploadFormData(formData);

  await assert.rejects(() => queueSocialPhoto(data, input, currentUser(), "2026-08-05T00:30:00.000Z"), /D1 insert failed/);
  assert.equal(r2.objects.size, 0);
  assert.equal(r2.deleted.length, 1);
  assert.equal(db.rows.length, 0);
});

test("social automation overview summarizes the queue without processing jobs", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const data = env(db, r2);
  const formData = new FormData();
  formData.set("file", new File([new Uint8Array([1])], "first.jpg", { type: "image/jpeg" }));
  await queueSocialPhoto(data, normalizeSocialPhotoUploadFormData(formData), currentUser(), "2026-08-05T01:00:00.000Z");

  const overview = await listSocialAutomationOverview(data);
  assert.equal(overview.summary.QUEUED, 1);
  assert.equal(overview.summary.PROCESSING, undefined);
  assert.equal(overview.summary.POSTED, 0);
  assert.equal(overview.latest[0]?.status, "QUEUED");
});

test("social image preparation processes one queued photo FIFO with one OpenAI request", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const older = db.seed({
    social_post_id: 10,
    original_object_key: "social/uploads/2026-08-05/older.jpg",
    queued_at: "2026-08-05T01:00:00.000Z",
  });
  const newer = db.seed({
    social_post_id: 11,
    original_object_key: "social/uploads/2026-08-05/newer.jpg",
    queued_at: "2026-08-05T02:00:00.000Z",
  });
  r2.objects.set(older.original_object_key, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  r2.objects.set(newer.original_object_key, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  const calls: Array<{ input: string; init: RequestInit; body: unknown }> = [];

  const result = await prepareNextQueuedSocialImage(env(db, r2, successfulOpenAiFetcher(calls)), {
    now: "2026-08-05T20:00:00.000Z",
  });

  assert.equal(result.processed, true);
  assert.equal(result.item?.id, older.social_post_id);
  assert.equal(result.item?.status, "IMAGE_READY");
  assert.equal(result.item?.openaiRequestCount, 1);
  assert.equal(db.rows.find((row) => row.social_post_id === newer.social_post_id)?.status, "QUEUED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "https://api.openai.com/v1/responses");

  const requestBody = calls[0]?.body as ReturnType<typeof buildSocialImagePrepareRequest>;
  assert.equal(DEFAULT_SOCIAL_IMAGE_PREP_MODEL, "gpt-5.6-terra");
  assert.equal(DEFAULT_SOCIAL_CAPTION_MODEL, "gpt-5.6-terra");
  assert.equal(requestBody.model, DEFAULT_SOCIAL_IMAGE_PREP_MODEL);
  assert.equal(requestBody.max_tool_calls, 2);
  assert.equal((requestBody.reasoning as { effort?: string } | undefined)?.effort, "low");
  assert.match(JSON.stringify(requestBody.tools), /file_search/);
  assert.match(JSON.stringify(requestBody.tools), /image_generation/);
  assert.match(JSON.stringify(requestBody.tools), /max_num_results":6/);
  assert.match(JSON.stringify(requestBody), /data:image\/jpeg;base64/);
  assert.match(JSON.stringify(requestBody), /Vanara/);
  assert.match(JSON.stringify(requestBody), /Koh Chang/);
  assert.match(JSON.stringify(requestBody), /green_season/);
  assert.match(JSON.stringify(requestBody), /upload_date/);
  assert.match(JSON.stringify(requestBody), /image_capture_date/);
  assert.equal([...r2.objects.keys()].some((key) => key.startsWith("social/processed/2026-08-05/") && key.endsWith(".jpg")), true);
});

test("social image preparation fails unsupported image types without conversion or OpenAI", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed({ content_type: "image/heic", original_object_key: "social/uploads/2026-08-05/iphone.heic" });
  r2.objects.set(row.original_object_key, { body: fakeJpegBuffer(), contentType: "image/heic" });
  const calls: Array<{ input: string; init: RequestInit; body: unknown }> = [];

  const result = await prepareSocialImage(env(db, r2, successfulOpenAiFetcher(calls)), row.social_post_id, {
    now: "2026-08-05T20:00:00.000Z",
  });

  assert.equal(result.processed, false);
  assert.equal(result.item?.status, "FAILED");
  assert.equal(result.item?.failureCode, "unsupported_image_type");
  assert.equal(calls.length, 0);
});

test("social image preparation fails missing original images without OpenAI", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed({ original_object_key: "social/uploads/2026-08-05/missing.jpg" });
  const calls: Array<{ input: string; init: RequestInit; body: unknown }> = [];

  const result = await prepareSocialImage(env(db, r2, successfulOpenAiFetcher(calls)), row.social_post_id, {
    now: "2026-08-05T20:00:00.000Z",
  });

  assert.equal(result.processed, false);
  assert.equal(result.item?.status, "FAILED");
  assert.equal(result.item?.failureCode, "original_image_missing");
  assert.equal(calls.length, 0);
});

test("social image preparation fails malformed OpenAI responses", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed({ original_object_key: "social/uploads/2026-08-05/photo.jpg" });
  r2.objects.set(row.original_object_key, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  const fetcher = (async () => new Response(JSON.stringify({
    id: "resp_bad",
    output: [{ type: "file_search_call", results: [] }],
    output_text: JSON.stringify({ visual_subject: "pool" }),
  }), { status: 200 })) as typeof fetch;

  const result = await prepareSocialImage(env(db, r2, fetcher), row.social_post_id, {
    now: "2026-08-05T20:00:00.000Z",
  });

  assert.equal(result.processed, false);
  assert.equal(result.item?.status, "FAILED");
  assert.equal(result.item?.failureCode, "openai_invalid_response");
});

test("social image preparation rolls back processed R2 image when D1 update fails", async () => {
  const db = new FakeSocialDB({ failImageReadyUpdate: true });
  const r2 = new FakeR2Storage();
  const row = db.seed({ original_object_key: "social/uploads/2026-08-05/photo.jpg" });
  r2.objects.set(row.original_object_key, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  const calls: Array<{ input: string; init: RequestInit; body: unknown }> = [];

  const result = await prepareSocialImage(env(db, r2, successfulOpenAiFetcher(calls)), row.social_post_id, {
    now: "2026-08-05T20:00:00.000Z",
  });

  assert.equal(result.processed, false);
  assert.equal(result.item?.status, "FAILED");
  assert.equal(result.item?.failureCode, "processed_image_persistence_failed");
  assert.equal(r2.deleted.some((key) => key.startsWith("social/processed/")), true);
});

test("social caption preparation processes one image-ready post with one text-only OpenAI request", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const older = db.seed({
    social_post_id: 20,
    status: "IMAGE_READY",
    processed_object_key: "social/processed/2026-08-05/older.jpg",
    analysis_json: socialAnalysisJson(),
    source_metadata_json: JSON.stringify({ upload_date: "2026-08-05", source: { location_context: "app_default" } }),
    openai_request_count: 1,
    openai_input_tokens: 100,
    openai_output_tokens: 30,
    openai_total_tokens: 130,
    estimated_cost_usd: 0.001,
    queued_at: "2026-08-05T01:00:00.000Z",
  });
  const newer = db.seed({
    social_post_id: 21,
    status: "IMAGE_READY",
    processed_object_key: "social/processed/2026-08-05/newer.jpg",
    analysis_json: socialAnalysisJson(),
    openai_request_count: 1,
    queued_at: "2026-08-05T02:00:00.000Z",
  });
  db.seed({
    social_post_id: 19,
    status: "READY_TO_POST",
    caption_prepared_at: "2026-08-04T23:30:00.000Z",
    caption_style_fingerprint: JSON.stringify({
      opening_pattern: "question hook",
      first_words_signature: "what if the garden",
      paragraph_count: 4,
      cta_type: "save line",
      separator_style: "leaf separator",
      main_theme: "garden",
    }),
    caption_json: JSON.stringify({
      instagram_caption_en: "What if the garden became the whole morning?",
      facebook_caption_en: "A garden detail starts the morning at Vanara.",
    }),
  });
  const calls: Array<{ input: string; init: RequestInit; body: unknown }> = [];

  const result = await prepareNextSocialCaption(env(db, r2, successfulCaptionFetcher(calls)), {
    now: "2026-08-05T23:30:00.000Z",
  });

  assert.equal(result.processed, true);
  assert.equal(result.item?.id, older.social_post_id);
  assert.equal(result.item?.status, "READY_TO_POST");
  assert.equal(result.item?.openaiRequestCount, 2);
  assert.equal(db.rows.find((row) => row.social_post_id === newer.social_post_id)?.status, "IMAGE_READY");
  assert.equal(db.rows.find((row) => row.social_post_id === older.social_post_id)?.openai_input_tokens, 180);
  assert.equal(db.rows.find((row) => row.social_post_id === older.social_post_id)?.openai_output_tokens, 90);
  assert.equal(calls.length, 1);

  const requestBody = calls[0]?.body as ReturnType<typeof buildSocialCaptionRequest>;
  assert.equal(requestBody.model, DEFAULT_SOCIAL_CAPTION_MODEL);
  assert.equal(requestBody.max_tool_calls, 1);
  assert.equal((requestBody.reasoning as { effort?: string } | undefined)?.effort, "low");
  assert.equal((requestBody.text as { verbosity?: string } | undefined)?.verbosity, "medium");
  assert.match(JSON.stringify(requestBody.tools), /file_search/);
  assert.match(JSON.stringify(requestBody.tools), /max_num_results":5/);
  assert.doesNotMatch(JSON.stringify(requestBody), /input_image|data:image/);
  assert.match(JSON.stringify(requestBody), /analysis_json/);
  assert.match(JSON.stringify(requestBody), /avoid_recent_patterns/);
  assert.match(JSON.stringify(requestBody), /wood terrace surface/);

  const captionJson = JSON.parse(db.rows.find((row) => row.social_post_id === older.social_post_id)!.caption_json!) as {
    instagram_hashtags: string[];
    facebook_hashtags: string[];
    grounding_used: string[];
    repetitive_warning: boolean;
  };
  assert.equal(captionJson.instagram_hashtags.length, 7);
  assert.equal(captionJson.facebook_hashtags.length, 7);
  assert.deepEqual(captionJson.grounding_used, ["wood terrace surface", "green leaves near the frame"]);
  assert.equal(captionJson.repetitive_warning, false);
});

test("social caption preparation does not call OpenAI when analysis JSON is missing or invalid", async () => {
  const missingDb = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const missing = missingDb.seed({
    status: "IMAGE_READY",
    processed_object_key: "social/processed/2026-08-05/missing-analysis.jpg",
    analysis_json: null,
    openai_request_count: 1,
  });
  const missingCalls: Array<{ input: string; init: RequestInit; body: unknown }> = [];
  await assert.rejects(
    () => prepareSocialCaption(env(missingDb, r2, successfulCaptionFetcher(missingCalls)), missing.social_post_id),
    /not eligible/,
  );
  assert.equal(missingCalls.length, 0);

  const invalidDb = new FakeSocialDB();
  const invalid = invalidDb.seed({
    status: "IMAGE_READY",
    processed_object_key: "social/processed/2026-08-05/invalid-analysis.jpg",
    analysis_json: "{bad",
    openai_request_count: 1,
  });
  const invalidCalls: Array<{ input: string; init: RequestInit; body: unknown }> = [];
  const result = await prepareSocialCaption(env(invalidDb, r2, successfulCaptionFetcher(invalidCalls)), invalid.social_post_id, {
    now: "2026-08-05T23:30:00.000Z",
  });

  assert.equal(result.processed, false);
  assert.equal(result.item?.status, "FAILED");
  assert.equal(result.item?.failureCode, "analysis_json_invalid");
  assert.equal(invalidCalls.length, 0);
});

test("social caption preparation fails malformed OpenAI output after one caption call", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed({
    social_post_id: 30,
    status: "IMAGE_READY",
    processed_object_key: "social/processed/2026-08-05/photo.jpg",
    analysis_json: socialAnalysisJson(),
    openai_request_count: 1,
  });
  const fetcher = (async () => new Response(JSON.stringify({
    id: "resp_bad_caption",
    output: [
      { type: "file_search_call", results: [] },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({ instagram_caption_en: "Missing required fields" }) }] },
    ],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  }), { status: 200 })) as typeof fetch;

  const result = await prepareSocialCaption(env(db, r2, fetcher), row.social_post_id, {
    now: "2026-08-05T23:30:00.000Z",
  });

  assert.equal(result.processed, false);
  assert.equal(result.item?.status, "FAILED");
  assert.equal(result.item?.failureCode, "openai_invalid_response");
  assert.equal(result.item?.openaiRequestCount, 2);
});

test("social caption preparation blocks already-spent or failed items without OpenAI calls", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const spent = db.seed({
    social_post_id: 40,
    status: "IMAGE_READY",
    processed_object_key: "social/processed/2026-08-05/spent.jpg",
    analysis_json: socialAnalysisJson(),
    openai_request_count: 2,
  });
  db.seed({
    social_post_id: 41,
    status: "FAILED",
    processed_object_key: "social/processed/2026-08-05/failed.jpg",
    analysis_json: socialAnalysisJson(),
    openai_request_count: 1,
  });
  const calls: Array<{ input: string; init: RequestInit; body: unknown }> = [];

  await assert.rejects(
    () => prepareSocialCaption(env(db, r2, successfulCaptionFetcher(calls)), spent.social_post_id),
    /not eligible/,
  );
  const cronResult = await prepareNextSocialCaption(env(db, r2, successfulCaptionFetcher(calls)));

  assert.equal(cronResult.processed, false);
  assert.equal(cronResult.item, null);
  assert.equal(calls.length, 0);
  assert.equal(db.rows.find((row) => row.social_post_id === 40)?.status, "IMAGE_READY");
  assert.equal(db.rows.find((row) => row.social_post_id === 41)?.status, "FAILED");
});

test("social caption preparation stores invalid hashtag responses as failed without retrying", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed({
    status: "IMAGE_READY",
    processed_object_key: "social/processed/2026-08-05/photo.jpg",
    analysis_json: socialAnalysisJson(),
    openai_request_count: 1,
  });
  const calls: Array<{ input: string; init: RequestInit; body: unknown }> = [];
  const result = await prepareSocialCaption(env(db, r2, successfulCaptionFetcher(calls, {
    instagram_hashtags: ["#VanaraResort"],
  })), row.social_post_id, {
    now: "2026-08-05T23:30:00.000Z",
  });

  assert.equal(result.processed, false);
  assert.equal(result.item?.status, "FAILED");
  assert.equal(result.item?.failureCode, "openai_invalid_response");
  assert.equal(result.item?.openaiRequestCount, 2);
  assert.equal(calls.length, 1);
});

test("social caption preparation saves repetitive warnings without a second OpenAI call", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed({
    social_post_id: 30,
    status: "IMAGE_READY",
    processed_object_key: "social/processed/2026-08-05/photo.jpg",
    analysis_json: socialAnalysisJson(),
    openai_request_count: 1,
  });
  db.seed({
    social_post_id: 1,
    status: "READY_TO_POST",
    caption_prepared_at: "2026-08-04T23:30:00.000Z",
    caption_style_fingerprint: JSON.stringify({
      opening_pattern: "direct visual detail",
      first_words_signature: "wood grain green leaves soft",
      paragraph_count: 3,
      cta_type: "soft question",
      separator_style: "blank line",
      main_theme: "room atmosphere",
    }),
    caption_json: JSON.stringify({
      instagram_caption_en: "Wood grain, green leaves, and soft light...",
      facebook_caption_en: "Wood grain catches the soft light...",
    }),
  });
  const calls: Array<{ input: string; init: RequestInit; body: unknown }> = [];

  const result = await prepareSocialCaption(env(db, r2, successfulCaptionFetcher(calls)), row.social_post_id, {
    now: "2026-08-05T23:30:00.000Z",
  });

  assert.equal(result.processed, true);
  assert.equal(calls.length, 1);
  const saved = JSON.parse(db.rows.find((item) => item.social_post_id === row.social_post_id)!.caption_json!) as {
    repetitive_warning: boolean;
    repetitive_warning_reason: string | null;
  };
  assert.equal(saved.repetitive_warning, true);
  assert.match(saved.repetitive_warning_reason ?? "", /similar to recent captions/);
});

test("social publish config missing performs no cron mutation or Meta call", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed(readyToPostSeed({ social_post_id: 50 }));
  r2.objects.set(row.processed_object_key!, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  const calls: Array<{ input: string; init: RequestInit; body: string }> = [];
  const data = env(db, r2, successfulMetaFetcher(calls));
  delete data.SOCIAL_PUBLIC_BASE_URL;

  const result = await publishNextSocialPost(data);

  assert.equal(result.published, false);
  assert.equal(calls.length, 0);
  assert.equal(db.rows[0]?.status, "READY_TO_POST");
});

test("social publish processes one ready post, publishes IG and FB, then deletes DB row and R2 images", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const older = db.seed(readyToPostSeed({
    social_post_id: 60,
    queued_at: "2026-08-05T00:00:00.000Z",
    original_object_key: "social/uploads/2026-08-05/older.jpg",
    processed_object_key: "social/processed/2026-08-05/older.jpg",
  }));
  const newer = db.seed(readyToPostSeed({
    social_post_id: 61,
    queued_at: "2026-08-05T01:00:00.000Z",
    original_object_key: "social/uploads/2026-08-05/newer.jpg",
    processed_object_key: "social/processed/2026-08-05/newer.jpg",
  }));
  r2.objects.set(older.original_object_key, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  r2.objects.set(older.processed_object_key!, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  r2.objects.set(newer.original_object_key, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  r2.objects.set(newer.processed_object_key!, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  const calls: Array<{ input: string; init: RequestInit; body: string }> = [];

  const result = await publishNextSocialPost(env(db, r2, successfulMetaFetcher(calls)), { now: "2026-08-06T00:00:00.000Z" });

  assert.equal(result.published, true);
  assert.equal(result.cleaned, true);
  assert.equal(result.instagramPostId, "ig-post-1");
  assert.equal(result.facebookPostId, "fb-post-1");
  assert.equal(calls.length, 3);
  assert.match(calls[0]!.input, /graph\.facebook\.com\/v25\.0\/ig-business-1\/media$/);
  assert.match(calls[1]!.input, /graph\.facebook\.com\/v25\.0\/ig-business-1\/media_publish$/);
  assert.match(calls[2]!.input, /graph\.facebook\.com\/v25\.0\/fb-page-1\/photos$/);
  assert.equal(calls.every((call) => call.init.headers && String((call.init.headers as Record<string, string>).authorization).startsWith("Bearer ")), true);
  assert.match(calls[0]!.body, /image_url=/);
  assert.match(calls[0]!.body, /caption=/);
  assert.match(calls[0]!.body, /Wood\+grain/);
  assert.match(calls[2]!.body, /caption=/);
  assert.match(calls[2]!.body, /Wood\+grain/);
  assert.equal(db.rows.some((row) => row.social_post_id === older.social_post_id), false);
  assert.equal(db.rows.find((row) => row.social_post_id === newer.social_post_id)?.status, "READY_TO_POST");
  assert.equal(r2.objects.has(older.original_object_key), false);
  assert.equal(r2.objects.has(older.processed_object_key!), false);
  assert.equal([...r2.objects.keys()].some((key) => key.startsWith(`${SOCIAL_PUBLIC_PUBLISH_PREFIX}/`)), false);
});

test("social publish serves only temporary public publish assets", async () => {
  const r2 = new FakeR2Storage();
  const allowedKey = "social/public-publish/2026-08-06/photo.jpg";
  const blockedKey = "social/processed/2026-08-06/photo.jpg";
  r2.objects.set(allowedKey, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  r2.objects.set(blockedKey, { body: fakeJpegBuffer(), contentType: "image/jpeg" });

  const allowed = await getSocialPublishAsset(env(new FakeSocialDB(), r2), `${socialPublishAssetTokenFromKey(allowedKey)}.jpg`);
  const blocked = await getSocialPublishAsset(env(new FakeSocialDB(), r2), `${socialPublishAssetTokenFromKey(blockedKey)}.jpg`);

  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("content-type"), "image/jpeg");
  assert.equal(blocked.status, 404);
});

test("social publish failure keeps private images, removes public temp copy, and preserves partial provider ids", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed(readyToPostSeed({ social_post_id: 70 }));
  r2.objects.set(row.original_object_key, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  r2.objects.set(row.processed_object_key!, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  const calls: Array<{ input: string; init: RequestInit; body: string }> = [];

  const result = await publishSocialPost(env(db, r2, successfulMetaFetcher(calls, { fb: true })), row.social_post_id, {
    now: "2026-08-06T00:00:00.000Z",
    baseUrl: "https://manual.vanara.test",
  });

  assert.equal(result.published, false);
  assert.equal(result.instagramPostId, "ig-post-1");
  assert.equal(result.facebookPostId, null);
  const saved = db.rows.find((item) => item.social_post_id === row.social_post_id);
  assert.equal(saved?.status, "FAILED");
  assert.equal(saved?.failure_code, "meta_facebook_publish_failed");
  assert.equal(saved?.instagram_post_id, "ig-post-1");
  assert.equal(r2.objects.has(row.original_object_key), true);
  assert.equal(r2.objects.has(row.processed_object_key!), true);
  assert.equal([...r2.objects.keys()].some((key) => key.startsWith(`${SOCIAL_PUBLIC_PUBLISH_PREFIX}/`)), false);
});

test("social publish marks cleanup failure and retains DB row when R2 deletion fails", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed(readyToPostSeed({ social_post_id: 80 }));
  r2.objects.set(row.original_object_key, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  r2.objects.set(row.processed_object_key!, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  r2.failDeleteKeys.add(row.original_object_key);
  const calls: Array<{ input: string; init: RequestInit; body: string }> = [];

  const result = await publishSocialPost(env(db, r2, successfulMetaFetcher(calls)), row.social_post_id, {
    now: "2026-08-06T00:00:00.000Z",
  });

  assert.equal(result.published, true);
  assert.equal(result.cleaned, false);
  const saved = db.rows.find((item) => item.social_post_id === row.social_post_id);
  assert.equal(saved?.status, "FAILED");
  assert.equal(saved?.failure_code, "publish_cleanup_failed");
  assert.equal(db.rows.length, 1);
});

test("social publish blocks invalid captions and non-ready items without Meta calls", async () => {
  const invalidDb = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const invalid = invalidDb.seed(readyToPostSeed({ social_post_id: 90, caption_json: "{invalid" }));
  r2.objects.set(invalid.processed_object_key!, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  const invalidCalls: Array<{ input: string; init: RequestInit; body: string }> = [];
  const invalidResult = await publishSocialPost(env(invalidDb, r2, successfulMetaFetcher(invalidCalls)), invalid.social_post_id);
  assert.equal(invalidResult.published, false);
  assert.equal(invalidDb.rows.find((row) => row.social_post_id === invalid.social_post_id)?.status, "FAILED");
  assert.equal(invalidDb.rows.find((row) => row.social_post_id === invalid.social_post_id)?.failure_code, "caption_json_invalid");
  assert.equal(invalidCalls.length, 0);

  const failedDb = new FakeSocialDB();
  const failed = failedDb.seed(readyToPostSeed({ social_post_id: 91, status: "FAILED" }));
  const failedCalls: Array<{ input: string; init: RequestInit; body: string }> = [];
  await assert.rejects(
    () => publishSocialPost(env(failedDb, r2, successfulMetaFetcher(failedCalls)), failed.social_post_id),
    /not eligible/,
  );
  assert.equal(failedCalls.length, 0);
});

test("social automation endpoints are owner-only and use the dedicated social permission", async () => {
  const unauthenticated = await request("/api/social/overview", { method: "GET" }, env(new FakeSocialDB({ authenticated: false })));
  assert.equal(unauthenticated.status, 401);

  const staff = await request("/api/social/overview", { method: "GET", headers: { cookie: "vanara_session=x" } }, env(new FakeSocialDB({
    role: "Operations",
    views: ["staff"],
    permissions: [SOCIAL_PERMISSION],
  })));
  assert.equal(staff.status, 403);

  const noPermission = await request("/api/social/overview", { method: "GET", headers: { cookie: "vanara_session=x" } }, env(new FakeSocialDB({
    permissions: [{ module_key: "social-automation", can_access: 0, can_edit: 0 }],
  })));
  assert.equal(noPermission.status, 403);

  const readonlyOwner = new FakeSocialDB({ permissions: [{ module_key: "social-automation", can_access: 1, can_edit: 0 }] });
  const readonlyUpload = new FormData();
  readonlyUpload.set("file", new File([new Uint8Array([1])], "photo.jpg", { type: "image/jpeg" }));
  const readonlyResponse = await request("/api/social/posts", { method: "POST", headers: { cookie: "vanara_session=x" }, body: readonlyUpload }, env(readonlyOwner));
  assert.equal(readonlyResponse.status, 403);

  const readonlyPrepare = await request("/api/social/posts/1/prepare-image", { method: "POST", headers: { cookie: "vanara_session=x" } }, env(readonlyOwner));
  assert.equal(readonlyPrepare.status, 403);
  const readonlyCaption = await request("/api/social/posts/1/prepare-caption", { method: "POST", headers: { cookie: "vanara_session=x" } }, env(readonlyOwner));
  assert.equal(readonlyCaption.status, 403);
  const readonlyPublish = await request("/api/social/posts/1/publish", { method: "POST", headers: { cookie: "vanara_session=x" } }, env(readonlyOwner));
  assert.equal(readonlyPublish.status, 403);

  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const upload = new FormData();
  upload.set("file", new File([new Uint8Array([1, 2])], "social.webp", { type: "image/webp" }));
  const response = await request("/api/social/posts", { method: "POST", headers: { cookie: "vanara_session=x" }, body: upload }, env(db, r2));
  assert.equal(response.status, 201);
  const body = await json(response);
  assert.equal(body.success, true);
  assert.equal((body.data as SocialPostQueueItem).status, "QUEUED");
  assert.equal(db.rows.length, 1);
  assert.equal(r2.objects.size, 1);
});

test("social image preparation endpoint requires owner edit permission and prepares a queued photo", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed({ social_post_id: 1, original_object_key: "social/uploads/2026-08-05/photo.jpg" });
  r2.objects.set(row.original_object_key, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  const calls: Array<{ input: string; init: RequestInit; body: unknown }> = [];

  const response = await request(
    "/api/social/posts/1/prepare-image",
    { method: "POST", headers: { cookie: "vanara_session=x" } },
    env(db, r2, successfulOpenAiFetcher(calls)),
  );
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.equal(body.success, true);
  assert.equal((body.data as { processed: boolean }).processed, true);
  assert.equal(db.rows[0]?.status, "IMAGE_READY");
  assert.equal(calls.length, 1);
});

test("social caption preparation endpoint requires owner edit permission and prepares an image-ready photo", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  db.seed({
    social_post_id: 1,
    status: "IMAGE_READY",
    processed_object_key: "social/processed/2026-08-05/photo.jpg",
    analysis_json: socialAnalysisJson(),
    openai_request_count: 1,
  });
  const calls: Array<{ input: string; init: RequestInit; body: unknown }> = [];

  const response = await request(
    "/api/social/posts/1/prepare-caption",
    { method: "POST", headers: { cookie: "vanara_session=x" } },
    env(db, r2, successfulCaptionFetcher(calls)),
  );
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.equal(body.success, true);
  assert.equal((body.data as { processed: boolean }).processed, true);
  assert.equal(db.rows[0]?.status, "READY_TO_POST");
  assert.equal(calls.length, 1);
});

test("social publish endpoint requires owner edit permission and publishes a ready post without OpenAI", async () => {
  const db = new FakeSocialDB();
  const r2 = new FakeR2Storage();
  const row = db.seed(readyToPostSeed({ social_post_id: 1 }));
  r2.objects.set(row.original_object_key, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  r2.objects.set(row.processed_object_key!, { body: fakeJpegBuffer(), contentType: "image/jpeg" });
  const calls: Array<{ input: string; init: RequestInit; body: string }> = [];

  const response = await request(
    "/api/social/posts/1/publish",
    { method: "POST", headers: { cookie: "vanara_session=x" } },
    env(db, r2, successfulMetaFetcher(calls)),
  );

  assert.equal(response.status, 200);
  const body = await json(response);
  assert.equal(body.success, true);
  assert.equal((body.data as { published: boolean; cleaned: boolean }).published, true);
  assert.equal((body.data as { published: boolean; cleaned: boolean }).cleaned, true);
  assert.equal(calls.length, 3);
  assert.equal(db.rows.length, 0);
});

test("social automation foundation is additive, staged, and isolates Meta publishing", () => {
  const migration = readFileSync(new URL("../migrations/0035_social_automation_foundation.sql", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/services/social-automation.service.ts", import.meta.url), "utf8");
  const imageService = readFileSync(new URL("../src/services/social-image-preparation.service.ts", import.meta.url), "utf8");
  const captionService = readFileSync(new URL("../src/services/social-caption.service.ts", import.meta.url), "utf8");
  const publishService = readFileSync(new URL("../src/services/social-publish.service.ts", import.meta.url), "utf8");
  const imagePrompt = readFileSync(new URL("../src/assets/prompts/social-image-prepare-v1.prompt.ts", import.meta.url), "utf8");
  const captionPrompt = readFileSync(new URL("../src/assets/prompts/social-caption-v1.prompt.ts", import.meta.url), "utf8");
  const wrangler = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../src/pages/SocialAutomationPage.tsx", import.meta.url), "utf8");
  const pageCss = readFileSync(new URL("../../src/styles/SocialAutomationPage.css", import.meta.url), "utf8");
  const frontendService = readFileSync(new URL("../../src/services/social.service.ts", import.meta.url), "utf8");
  const authTypes = readFileSync(new URL("../../src/types/auth.ts", import.meta.url), "utf8");
  const currentUserService = readFileSync(new URL("../src/services/current-user.service.ts", import.meta.url), "utf8");
  const router = readFileSync(new URL("../../src/router/AppRouter.tsx", import.meta.url), "utf8");

  assert.match(migration, /'social-automation'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS social_post_queue/);
  assert.match(migration, /'QUEUED','PREPARING_IMAGE','IMAGE_READY','CAPTIONING','READY_TO_POST','POSTING','POSTED','FAILED','CANCELLED'/);
  assert.match(migration, /original_object_key TEXT NOT NULL UNIQUE/);
  assert.match(migration, /processed_object_key TEXT/);
  assert.match(migration, /caption_style_fingerprint TEXT/);
  assert.match(migration, /openai_request_count INTEGER NOT NULL DEFAULT 0 CHECK \(openai_request_count BETWEEN 0 AND 2\)/);
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\s+social_post_queue\b|\bDELETE\s+FROM\s+social_post_queue\b/i);

  assert.match(server, /function socialOwner/);
  assert.match(server, /requireOwner\(user\)/);
  assert.match(server, /requireModulePermission\(user, "social-automation", action\)/);
  assert.match(server, /app\.get\("\/api\/social\/overview"/);
  assert.match(server, /app\.post\("\/api\/social\/posts"/);
  assert.match(server, /app\.post\("\/api\/social\/posts\/:id\/prepare-image"/);
  assert.match(server, /app\.post\("\/api\/social\/posts\/:id\/prepare-caption"/);
  assert.match(server, /app\.post\("\/api\/social\/posts\/:id\/publish"/);
  assert.match(server, /app\.get\("\/api\/social\/publish-assets\/:assetId"/);
  assert.match(server, /controller\.cron === SOCIAL_IMAGE_PREPARE_CRON/);
  assert.match(server, /controller\.cron === SOCIAL_CAPTION_CRON/);
  assert.match(server, /controller\.cron === SOCIAL_PUBLISH_CRON/);
  assert.equal(SOCIAL_IMAGE_PREPARE_CRON, "0 20 * * *");
  assert.equal(SOCIAL_CAPTION_CRON, "30 23 * * *");
  assert.equal(SOCIAL_PUBLISH_CRON, "0 0 * * *");
  assert.match(wrangler, /"0 20 \* \* \*"/);
  assert.match(wrangler, /"30 23 \* \* \*"/);
  assert.match(wrangler, /"0 0 \* \* \*"/);
  assert.match(service, /const SOCIAL_UPLOAD_PREFIX = "social\/uploads"/);
  assert.match(service, /"image\/jpeg": "jpg"/);
  assert.match(service, /"image\/png": "png"/);
  assert.match(service, /"image\/webp": "webp"/);
  assert.match(service, /image\/heic|image\/heif/);
  assert.match(page, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(page, /previewUrlRef/);
  assert.match(page, /URL\.createObjectURL\(file\)/);
  assert.match(page, /URL\.revokeObjectURL\(previewUrlRef\.current\)/);
  assert.match(page, /social-dropzone__mark--preview/);
  assert.match(page, /<SummaryStrip summary=\{summary\} \/>/);
  assert.match(page, /Queued/);
  assert.match(page, /Image ready/);
  assert.match(page, /Ready to post/);
  assert.match(page, /Failed/);
  assert.match(page, /JPG, PNG or WebP\. HEIC is not supported\./);
  assert.match(page, /Next Social Photo/);
  assert.match(page, /Publishing Queue/);
  assert.match(page, /No photos waiting/);
  assert.match(page, /item\.failureMessage/);
  assert.match(page, /bodyClassName="social-automation-page" wide/);
  assert.match(page, /Prepare Image/);
  assert.match(page, /Prepare Caption/);
  assert.match(page, /Publish/);
  assert.match(page, /title=\{item\.originalFileName\}/);
  assert.match(page, /aria-label=\{`Prepare image for \$\{item\.originalFileName\}`\}/);
  assert.match(page, /aria-label=\{`Prepare caption for \$\{item\.originalFileName\}`\}/);
  assert.match(page, /aria-label=\{`Publish \$\{item\.originalFileName\}`\}/);
  assert.match(pageCss, /\.social-automation-page\s*\{[\s\S]*grid-template-columns: minmax\(0, 0\.92fr\) minmax\(0, 1\.08fr\)/);
  assert.match(pageCss, /@media \(max-width: 980px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(pageCss, /\.social-upload,\s*\n\.social-history\s*\{[\s\S]*padding: clamp\(16px, 3vw, var\(--vc-space-5\)\)/);
  assert.match(pageCss, /\.social-summary-strip\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(pageCss, /@media \(max-width: 640px\)[\s\S]*\.social-summary-strip\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(pageCss, /\.social-automation-page \.vc-section-header\s*\{[\s\S]*flex-wrap: wrap/);
  assert.match(pageCss, /\.social-dropzone\s*\{[\s\S]*min-width: 0/);
  assert.match(pageCss, /\.social-dropzone__copy strong\s*\{[\s\S]*-webkit-line-clamp: 2/);
  assert.match(pageCss, /\.social-dropzone__mark img\s*\{[\s\S]*object-fit: cover/);
  assert.match(pageCss, /\.social-queue-item\s*\{[\s\S]*grid-template-columns: 52px minmax\(0, 1fr\) minmax\(132px, auto\)/);
  assert.match(pageCss, /\.social-queue-item__filename\s*\{[\s\S]*overflow-wrap: anywhere/);
  assert.match(pageCss, /\.social-queue-item__filename\s*\{[\s\S]*-webkit-line-clamp: 2/);
  assert.match(pageCss, /\.social-queue-item__failure\s*\{[\s\S]*overflow-wrap: anywhere/);
  assert.match(pageCss, /\.social-queue-item__failure\s*\{[\s\S]*-webkit-line-clamp: 2/);
  assert.match(pageCss, /\.social-queue-item__prepare\s*\{[\s\S]*min-height: var\(--vc-touch-min\)/);
  assert.match(pageCss, /\.social-status\s*\{[\s\S]*max-width: 100%/);
  assert.match(pageCss, /@media \(max-width: 640px\)[\s\S]*\.social-queue-item__actions\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(pageCss, /--workspace-muted/);
  assert.doesNotMatch(page, /analysis_json|openai_request_count|model|token/i);
  assert.match(frontendService, /\/api\/social\/overview/);
  assert.match(frontendService, /\/api\/social\/posts/);
  assert.match(frontendService, /\/api\/social\/posts\/\$\{postId\}\/prepare-image/);
  assert.match(frontendService, /\/api\/social\/posts\/\$\{postId\}\/prepare-caption/);
  assert.match(frontendService, /\/api\/social\/posts\/\$\{postId\}\/publish/);
  assert.match(imageService, /max_tool_calls: SOCIAL_IMAGE_PREPARE_MAX_TOOL_CALLS/);
  assert.match(imageService, /SOCIAL_IMAGE_PREP_MODEL/);
  assert.match(imageService, /SOCIAL_CAPTION_MODEL/);
  assert.match(imageService, /DEFAULT_SOCIAL_IMAGE_PREP_MODEL = "gpt-5\.6-terra"/);
  assert.doesNotMatch(imageService, /OPENAI_SOCIAL_IMAGE_MODEL = "gpt-5\.5"|model: "gpt-5\.5"/);
  assert.match(imageService, /source_metadata_json/);
  assert.match(imageService, /0x9003/);
  assert.match(imageService, /0x0002/);
  assert.match(imageService, /const SOCIAL_FILE_SEARCH_MAX_RESULTS = 6/);
  assert.match(imageService, /reasoning: \{ effort: "low" \}/);
  assert.match(imageService, /type: "file_search"/);
  assert.match(imageService, /type: "image_generation"/);
  assert.match(imageService, /openai_request_count = 1/);
  assert.match(imageService, /unsupported_image_type/);
  assert.match(imagePrompt, /Preserve the source photo as the same recognisable scene/);
  assert.match(imagePrompt, /Do not invent elements that are not visible in the original photo/);
  assert.match(imagePrompt, /Do not add text, watermark, graphics, borders, frames, or overlays/);
  assert.match(imagePrompt, /Do not write Facebook captions/);
  assert.match(imagePrompt, /Do not write Instagram captions/);
  assert.match(imagePrompt, /social-ready image, not competition-perfect retouching/);
  assert.match(imagePrompt, /one natural, pleasing image pass is enough/);
  assert.match(imagePrompt, /Treat the uploaded photo as the primary source of truth/);
  assert.match(imagePrompt, /visual_evidence/);
  assert.match(imagePrompt, /caption_anchors/);
  assert.match(imagePrompt, /story_angles/);
  assert.match(imagePrompt, /guest_experience_link/);
  assert.match(imagePrompt, /do_not_claim/);
  assert.match(imagePrompt, /avoid_claims/);
  assert.match(imagePrompt, /location_context/);
  assert.match(imagePrompt, /local_context/);
  assert.match(imagePrompt, /seasonal_context/);
  assert.match(imagePrompt, /instagram_hint/);
  assert.match(imagePrompt, /facebook_hint/);
  assert.match(imagePrompt, /recommended_hashtag_categories/);
  assert.match(imagePrompt, /visible image evidence separate from KB context|uploaded photo as the primary source of truth/);
  assert.match(imagePrompt, /visible_details/);
  assert.match(captionService, /SOCIAL_CAPTION_MODEL/);
  assert.match(captionService, /DEFAULT_SOCIAL_CAPTION_MODEL/);
  assert.match(captionService, /max_tool_calls: SOCIAL_CAPTION_MAX_TOOL_CALLS/);
  assert.match(captionService, /SOCIAL_CAPTION_MAX_TOOL_CALLS = 1/);
  assert.match(captionService, /const SOCIAL_CAPTION_FILE_SEARCH_MAX_RESULTS = 5/);
  assert.match(captionService, /reasoning: \{ effort: "low" \}/);
  assert.match(captionService, /verbosity: "medium"/);
  assert.match(captionService, /type: "file_search"/);
  assert.match(captionService, /openai_request_count = 2/);
  assert.match(captionService, /openai_input_tokens = openai_input_tokens \+ \?/);
  assert.match(captionService, /recentCaptionFingerprints/);
  assert.match(captionService, /repetitive_warning/);
  assert.match(captionService, /openai_request_count <= 1/);
  assert.doesNotMatch(captionService, /while\s*\(|for\s*\([^)]*retry|retryCaption|regenerate/i);
  assert.doesNotMatch(captionService, /input_image|data:image|image_generation/);
  assert.match(captionPrompt, /Facebook gold standard/);
  assert.match(captionPrompt, /Instagram gold standard/);
  assert.match(captionPrompt, /Do not make it short by default/);
  assert.match(captionPrompt, /Use at least 2 details from visual_evidence or caption_anchors/);
  assert.match(captionPrompt, /exactly 7/);
  assert.match(captionPrompt, /Do not reuse the same opening syntax/);
  assert.match(captionPrompt, /The prepared analysis_json is the source of visual truth/);
  assert.match(captionPrompt, /Do not request, inspect, or require the image file/);
  assert.match(publishService, /META_PAGE_ACCESS_TOKEN/);
  assert.match(publishService, /META_FACEBOOK_PAGE_ID/);
  assert.match(publishService, /META_INSTAGRAM_BUSINESS_ACCOUNT_ID/);
  assert.match(publishService, /META_GRAPH_API_VERSION/);
  assert.match(publishService, /SOCIAL_PUBLIC_BASE_URL/);
  assert.match(publishService, /DEFAULT_META_GRAPH_API_VERSION = "v25\.0"/);
  assert.match(publishService, /SOCIAL_PUBLIC_PUBLISH_PREFIX = "social\/public-publish"/);
  assert.match(publishService, /authorization: `Bearer \$\{token\}`/);
  assert.match(publishService, /graph\.facebook\.com/);
  assert.match(publishService, /\/media_publish/);
  assert.match(publishService, /\/photos/);
  assert.match(publishService, /DELETE FROM social_post_queue WHERE social_post_id = \?/);
  assert.match(publishService, /env\.R2_STORAGE\.delete\(leased\.original_object_key\)|cleanupKeys/);
  assert.match(publishService, /publish_cleanup_failed/);
  assert.match(publishService, /social_publish_config_missing/);
  assert.match(publishService, /getSocialPublishAsset/);
  assert.match(publishService, /startsWith\(`\$\{SOCIAL_PUBLIC_PUBLISH_PREFIX\}\//);
  assert.doesNotMatch(publishService, /OPENAI_RESPONSES_URL|OPENAI_API_KEY|input_image|image_generation|Cloudinary|google-drive|Google Drive|APP_SECRET/i);
  assert.doesNotMatch(publishService, /access_token/);
  assert.match(authTypes, /"social-automation"/);
  assert.match(currentUserService, /"social-automation"/);
  assert.match(router, /path="social-automation"/);
  assert.doesNotMatch(service + imageService + captionService + page + frontendService, /graph\.facebook\.com|instagram\.com|cloudinary|google-drive|Google Drive|access_token|APP_SECRET/i);
  assert.doesNotMatch(service + imageService + captionService + page + frontendService, /messages\.service|MessagesPage|\/api\/messages|\/sync\/messages/i);
});
