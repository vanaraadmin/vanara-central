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
  estimated_cost_usd: number;
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
  } = {}) {}

  prepare(sql: string) { return new FakeSocialStmt(this, sql); }

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
    if (sql.includes("FROM social_post_queue") && sql.includes("ORDER BY queued_at DESC")) {
      return { results: [...this.rows].sort((left, right) => right.queued_at.localeCompare(left.queued_at)) as T[] };
    }
    return { results: [] as T[] };
  }

  async first<T>(sql: string, params: unknown[]) {
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
        estimated_cost_usd: 0,
      });
      this.nextId += 1;
      return { meta: { changes: 1, last_row_id: this.nextId - 1 } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }
}

class FakeR2Storage {
  objects = new Map<string, { body: ArrayBuffer; contentType: string | undefined }>();
  deleted: string[] = [];

  async put(key: string, body: ArrayBuffer | ArrayBufferView | string | null | ReadableStream, options?: R2PutOptions) {
    assert.ok(body instanceof ArrayBuffer);
    this.objects.set(key, { body, contentType: options?.httpMetadata?.contentType });
    return null;
  }

  async delete(key: string) {
    this.objects.delete(key);
    this.deleted.push(key);
  }
}

function env(db = new FakeSocialDB(), r2 = new FakeR2Storage()) {
  return {
    DB: db as unknown as D1Database,
    R2_STORAGE: r2 as unknown as R2Bucket,
    BEDS24_BASE_URL: "https://api.beds24.com/v2",
    BEDS24_LONG_LIFE_TOKEN: "test",
    VANARA_DATABASE_ENVIRONMENT: "test",
    VANARA_DATABASE_NAME: "vanara-test",
    WARAPORN_KB_ARCHIVE: r2 as unknown as R2Bucket,
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

test("social automation foundation is additive, staged, and avoids external publishing calls", () => {
  const migration = readFileSync(new URL("../migrations/0035_social_automation_foundation.sql", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/services/social-automation.service.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../src/pages/SocialAutomationPage.tsx", import.meta.url), "utf8");
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
  assert.match(service, /const SOCIAL_UPLOAD_PREFIX = "social\/uploads"/);
  assert.match(service, /"image\/jpeg": "jpg"/);
  assert.match(service, /"image\/png": "png"/);
  assert.match(service, /"image\/webp": "webp"/);
  assert.match(service, /image\/heic|image\/heif/);
  assert.match(page, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(page, /JPG, PNG or WebP only\. HEIC is not supported\./);
  assert.match(frontendService, /\/api\/social\/overview/);
  assert.match(frontendService, /\/api\/social\/posts/);
  assert.match(authTypes, /"social-automation"/);
  assert.match(currentUserService, /"social-automation"/);
  assert.match(router, /path="social-automation"/);
  assert.doesNotMatch(service + page + frontendService, /api\.openai\.com|graph\.facebook\.com|instagram\.com|cloudinary|Google Drive|access_token|APP_SECRET/i);
  assert.doesNotMatch(service + page + frontendService, /messages\.service|MessagesPage|\/api\/messages|\/sync\/messages/i);
});
