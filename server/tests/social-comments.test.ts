import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildSocialCommentReplyRequest,
  runSocialCommentAutomation,
  shouldSkipSocialCommentLocally,
  SOCIAL_COMMENT_CRON,
  type SocialCommentPlatform,
  type SocialCommentStatus,
} from "../src/services/social-comments.service.ts";

type CommentRow = {
  social_comment_id: number;
  platform: SocialCommentPlatform;
  provider_comment_id: string;
  provider_parent_id: string;
  post_caption: string | null;
  post_permalink: string | null;
  author_provider_id: string | null;
  author_username: string | null;
  author_name: string | null;
  comment_text: string;
  commented_at: string | null;
  status: SocialCommentStatus;
  skip_reason: string | null;
  should_reply: number | null;
  reply_text: string | null;
  reply_provider_id: string | null;
  language: string | null;
  risk_level: string | null;
  ai_reason: string | null;
  confidence: number | null;
  openai_request_count: number;
  openai_response_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  replied_at: string | null;
};

class FakeCommentStmt {
  private params: unknown[] = [];
  constructor(private db: FakeCommentDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

class FakeCommentDB {
  comments: CommentRow[] = [];
  runs: Array<Record<string, unknown>> = [];
  nextCommentId = 1;
  nextRunId = 1;

  prepare(sql: string) { return new FakeCommentStmt(this, sql); }

  seed(overrides: Partial<CommentRow>): CommentRow {
    const now = overrides.created_at ?? "2026-08-05T00:00:00.000Z";
    const row: CommentRow = {
      social_comment_id: overrides.social_comment_id ?? this.nextCommentId,
      platform: overrides.platform ?? "FACEBOOK",
      provider_comment_id: overrides.provider_comment_id ?? `comment-${this.nextCommentId}`,
      provider_parent_id: overrides.provider_parent_id ?? "post-1",
      post_caption: overrides.post_caption ?? "A garden morning at Vanara.",
      post_permalink: overrides.post_permalink ?? "https://example.com/post",
      author_provider_id: overrides.author_provider_id ?? "guest-1",
      author_username: overrides.author_username ?? "guest",
      author_name: overrides.author_name ?? "Guest",
      comment_text: overrides.comment_text ?? "Beautiful",
      commented_at: overrides.commented_at ?? now,
      status: overrides.status ?? "NEW",
      skip_reason: overrides.skip_reason ?? null,
      should_reply: overrides.should_reply ?? null,
      reply_text: overrides.reply_text ?? null,
      reply_provider_id: overrides.reply_provider_id ?? null,
      language: overrides.language ?? null,
      risk_level: overrides.risk_level ?? null,
      ai_reason: overrides.ai_reason ?? null,
      confidence: overrides.confidence ?? null,
      openai_request_count: overrides.openai_request_count ?? 0,
      openai_response_id: overrides.openai_response_id ?? null,
      failure_code: overrides.failure_code ?? null,
      failure_message: overrides.failure_message ?? null,
      created_at: now,
      updated_at: overrides.updated_at ?? now,
      processed_at: overrides.processed_at ?? null,
      replied_at: overrides.replied_at ?? null,
    };
    this.nextCommentId = Math.max(this.nextCommentId, row.social_comment_id + 1);
    this.comments.push(row);
    return row;
  }

  async all<T>(sql: string, params: unknown[]) {
    if (sql.includes("FROM social_comments") && sql.includes("provider_parent_id = ?")) {
      return {
        results: this.comments
          .filter((row) => row.platform === params[0] && row.provider_parent_id === params[1])
          .slice(0, 8)
          .map((row) => ({
            author_name: row.author_name,
            author_username: row.author_username,
            comment_text: row.comment_text,
            status: row.status,
            reply_text: row.reply_text,
            commented_at: row.commented_at,
            replied_at: row.replied_at,
          })) as T[],
      };
    }
    return { results: [] as T[] };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("WHERE platform = ? AND provider_comment_id = ?")) {
      return (this.comments.find((row) => row.platform === params[0] && row.provider_comment_id === params[1]) ?? null) as T | null;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO social_comment_runs")) {
      this.runs.push({ social_comment_run_id: this.nextRunId, started_at: params[0], status: "RUNNING" });
      this.nextRunId += 1;
      return { meta: { changes: 1, last_row_id: this.nextRunId - 1 } };
    }
    if (sql.includes("UPDATE social_comment_runs")) {
      const run = this.runs.find((item) => item.social_comment_run_id === params[10]);
      if (run) {
        Object.assign(run, {
          finished_at: params[0],
          status: params[1],
          comments_checked: params[2],
          comments_imported: params[3],
          skipped_local: params[4],
          ai_evaluated: params[5],
          replies_published: params[6],
          no_reply: params[7],
          failed: params[8],
          error_message: params[9],
        });
      }
      return { meta: { changes: run ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("INSERT OR IGNORE INTO social_comments")) {
      const exists = this.comments.some((row) => row.platform === params[0] && row.provider_comment_id === params[1]);
      if (exists) return { meta: { changes: 0, last_row_id: 0 } };
      this.seed({
        platform: params[0] as SocialCommentPlatform,
        provider_comment_id: String(params[1]),
        provider_parent_id: String(params[2]),
        post_caption: params[3] ? String(params[3]) : null,
        post_permalink: params[4] ? String(params[4]) : null,
        author_provider_id: params[5] ? String(params[5]) : null,
        author_username: params[6] ? String(params[6]) : null,
        author_name: params[7] ? String(params[7]) : null,
        comment_text: String(params[8]),
        commented_at: params[9] ? String(params[9]) : null,
        created_at: String(params[10]),
        updated_at: String(params[11]),
      });
      return { meta: { changes: 1, last_row_id: this.nextCommentId - 1 } };
    }
    if (sql.includes("SET status = 'SKIPPED'")) {
      const row = this.comments.find((item) => item.social_comment_id === params[3]);
      if (row) {
        row.status = "SKIPPED";
        row.skip_reason = String(params[0]);
        row.processed_at = String(params[1]);
        row.updated_at = String(params[2]);
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("SET status = 'GENERATING'")) {
      const row = this.comments.find((item) => item.social_comment_id === params[1] && item.openai_request_count === 0);
      if (row) {
        row.status = "GENERATING";
        row.updated_at = String(params[0]);
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("should_reply = ?")) {
      const row = this.comments.find((item) => item.social_comment_id === params[17]);
      if (row) {
        row.status = params[0] as SocialCommentStatus;
        row.should_reply = Number(params[1]);
        row.reply_text = params[2] ? String(params[2]) : null;
        row.language = String(params[3]);
        row.risk_level = String(params[4]);
        row.ai_reason = String(params[5]);
        row.confidence = Number(params[6]);
        row.openai_request_count = 1;
        row.openai_response_id = params[7] ? String(params[7]) : null;
        row.processed_at = String(params[15]);
        row.updated_at = String(params[16]);
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("SET status = 'FAILED'")) {
      const row = this.comments.find((item) => item.social_comment_id === params[19]);
      if (row) {
        row.status = "FAILED";
        row.failure_code = String(params[0]);
        row.failure_message = String(params[1]);
        if (params[2] !== null) row.openai_request_count = 1;
        if (params[3]) row.openai_response_id = String(params[3]);
        row.updated_at = String(params[21]);
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("SET status = 'REPLIED'")) {
      const row = this.comments.find((item) => item.social_comment_id === params[3]);
      if (row) {
        row.status = "REPLIED";
        row.reply_provider_id = String(params[0]);
        row.replied_at = String(params[1]);
        row.updated_at = String(params[2]);
        row.failure_code = null;
        row.failure_message = null;
      }
      return { meta: { changes: row ? 1 : 0, last_row_id: 0 } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }
}

function env(db: FakeCommentDB, fetcher: typeof fetch) {
  return {
    DB: db as unknown as D1Database,
    OPENAI_API_KEY: "test-openai",
    META_PAGE_ACCESS_TOKEN: "test-meta",
    META_FACEBOOK_PAGE_ID: "fb-page-1",
    META_INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig-account-1",
    META_GRAPH_API_VERSION: "v25.0",
    SOCIAL_VECTOR_STORE_ID: "vs_social_test",
    fetcher,
  };
}

type CommentFixture = { id: string; message?: string; text?: string; from?: { id?: string; name?: string }; username?: string; created_time?: string; timestamp?: string };

function socialFetcher(options: {
  comments?: CommentFixture[];
  ai?: Record<string, unknown>;
  failReply?: boolean;
  calls: { openai: number; reply: number; meta: string[]; bodies: string[] };
}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    options.calls.bodies.push(String(init?.body ?? ""));
    if (url === "https://api.openai.com/v1/responses") {
      options.calls.openai += 1;
      return new Response(JSON.stringify({
        id: "resp_comment_1",
        output_text: JSON.stringify({
          should_reply: true,
          reply_text: "Thank you for your kind words.",
          language: "en",
          reason: "Warm praise deserves a short reply.",
          confidence: 0.92,
          risk_level: "low",
          ...options.ai,
        }),
        usage: {
          input_tokens: 40,
          input_tokens_details: { cached_tokens: 5 },
          output_tokens: 20,
          output_tokens_details: { reasoning_tokens: 1 },
          total_tokens: 60,
        },
      }), { status: 200, headers: { "x-request-id": "req_comment_1" } });
    }
    options.calls.meta.push(url);
    if (url.includes("/published_posts")) {
      return new Response(JSON.stringify({ data: [{ id: "fb-post-1", message: "Garden post", permalink_url: "https://facebook.test/post" }] }), { status: 200 });
    }
    if (url.includes("/media") && !url.includes("/comments")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (url.includes("/fb-post-1/comments") && init?.method === "GET") {
      return new Response(JSON.stringify({ data: options.comments ?? [] }), { status: 200 });
    }
    if (url.includes("/comments") && init?.method === "POST") {
      options.calls.reply += 1;
      if (options.failReply) return new Response(JSON.stringify({ error: { message: "Reply failed" } }), { status: 400 });
      return new Response(JSON.stringify({ id: "reply-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;
}

test("social comments local skip filters avoid OpenAI for obvious spam and emoji-only comments", async () => {
  assert.equal(shouldSkipSocialCommentLocally({ platform: "FACEBOOK", text: "🔥🔥", authorProviderId: "guest", authorUsername: "guest", authorName: "Guest" }, { facebookPageId: "fb-page-1", instagramBusinessAccountId: "ig-account-1" }), "emoji_only");
  assert.equal(shouldSkipSocialCommentLocally({ platform: "FACEBOOK", text: "Buy crypto now https://x.test", authorProviderId: "guest", authorUsername: "guest", authorName: "Guest" }, { facebookPageId: "fb-page-1", instagramBusinessAccountId: "ig-account-1" }), "spam_link");

  const db = new FakeCommentDB();
  const calls = { openai: 0, reply: 0, meta: [] as string[], bodies: [] as string[] };
  const result = await runSocialCommentAutomation(env(db, socialFetcher({
    calls,
    comments: [{ id: "c-spam", message: "Buy crypto now https://x.test", from: { id: "guest-1", name: "Guest" } }],
  })), { now: "2026-08-05T01:00:00.000Z" });

  assert.equal(result.checked, 1);
  assert.equal(result.skippedLocal, 1);
  assert.equal(calls.openai, 0);
  assert.equal(calls.reply, 0);
  assert.equal(db.comments[0]?.status, "SKIPPED");
});

test("social comments eligible comment uses one OpenAI call and publishes one reply", async () => {
  const db = new FakeCommentDB();
  const calls = { openai: 0, reply: 0, meta: [] as string[], bodies: [] as string[] };
  const result = await runSocialCommentAutomation(env(db, socialFetcher({
    calls,
    comments: [{ id: "c-1", message: "This place looks beautiful", from: { id: "guest-1", name: "Guest" }, created_time: "2026-08-05T00:00:00+0000" }],
  })), { now: "2026-08-05T01:00:00.000Z" });

  assert.equal(result.aiEvaluated, 1);
  assert.equal(result.repliesPublished, 1);
  assert.equal(calls.openai, 1);
  assert.equal(calls.reply, 1);
  assert.equal(db.comments[0]?.status, "REPLIED");
  assert.equal(db.comments[0]?.openai_request_count, 1);
  assert.equal(db.comments[0]?.reply_provider_id, "reply-1");
});

test("social comments should_reply false does not publish", async () => {
  const db = new FakeCommentDB();
  const calls = { openai: 0, reply: 0, meta: [] as string[], bodies: [] as string[] };
  const result = await runSocialCommentAutomation(env(db, socialFetcher({
    calls,
    ai: { should_reply: false, reply_text: null, reason: "No public reply needed." },
    comments: [{ id: "c-no-reply", message: "Nice", from: { id: "guest-1", name: "Guest" } }],
  })), { now: "2026-08-05T01:00:00.000Z" });

  assert.equal(result.aiEvaluated, 1);
  assert.equal(result.noReply, 1);
  assert.equal(calls.openai, 1);
  assert.equal(calls.reply, 0);
  assert.equal(db.comments[0]?.status, "NO_REPLY");
});

test("social comments already processed comment does not call OpenAI again", async () => {
  const db = new FakeCommentDB();
  db.seed({ provider_comment_id: "c-processed", status: "REPLIED", openai_request_count: 1, reply_provider_id: "reply-old" });
  const calls = { openai: 0, reply: 0, meta: [] as string[], bodies: [] as string[] };
  await runSocialCommentAutomation(env(db, socialFetcher({
    calls,
    comments: [{ id: "c-processed", message: "Beautiful", from: { id: "guest-1", name: "Guest" } }],
  })), { now: "2026-08-05T01:00:00.000Z" });

  assert.equal(calls.openai, 0);
  assert.equal(calls.reply, 0);
  assert.equal(db.comments[0]?.status, "REPLIED");
});

test("social comments publish failure can retry saved reply without a second OpenAI call", async () => {
  const db = new FakeCommentDB();
  db.seed({
    provider_comment_id: "c-failed-publish",
    status: "FAILED",
    failure_code: "social_comment_publish_failed",
    reply_text: "Thank you.",
    openai_request_count: 1,
  });
  const calls = { openai: 0, reply: 0, meta: [] as string[], bodies: [] as string[] };
  const result = await runSocialCommentAutomation(env(db, socialFetcher({
    calls,
    comments: [{ id: "c-failed-publish", message: "Beautiful", from: { id: "guest-1", name: "Guest" } }],
  })), { now: "2026-08-05T01:00:00.000Z" });

  assert.equal(result.repliesPublished, 1);
  assert.equal(calls.openai, 0);
  assert.equal(calls.reply, 1);
  assert.equal(db.comments[0]?.status, "REPLIED");
});

test("social comments budget leaves excess eligible comments for a later run", async () => {
  const db = new FakeCommentDB();
  const calls = { openai: 0, reply: 0, meta: [] as string[], bodies: [] as string[] };
  const result = await runSocialCommentAutomation(env(db, socialFetcher({
    calls,
    comments: [
      { id: "c-1", message: "Beautiful place", from: { id: "guest-1", name: "Guest One" } },
      { id: "c-2", message: "Looks peaceful", from: { id: "guest-2", name: "Guest Two" } },
    ],
  })), { now: "2026-08-05T01:00:00.000Z", maxAiComments: 1 });

  assert.equal(result.checked, 2);
  assert.equal(result.aiEvaluated, 1);
  assert.equal(calls.openai, 1);
  assert.equal(db.comments.filter((row) => row.status === "NEW").length, 1);
});

test("social comment automation source guardrails keep it autonomous and cost-bounded", () => {
  const migration = readFileSync(new URL("../migrations/0036_social_comment_automation.sql", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/services/social-comments.service.ts", import.meta.url), "utf8");
  const prompt = readFileSync(new URL("../src/assets/prompts/social-comment-reply-v1.prompt.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const wrangler = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../src/pages/SocialAutomationPage.tsx", import.meta.url), "utf8");
  const frontendTypes = readFileSync(new URL("../../src/types/social.ts", import.meta.url), "utf8");
  const frontendCss = readFileSync(new URL("../../src/styles/SocialAutomationPage.css", import.meta.url), "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS social_comments/);
  assert.match(migration, /UNIQUE \(platform, provider_comment_id\)/);
  assert.match(migration, /openai_request_count INTEGER NOT NULL DEFAULT 0 CHECK \(openai_request_count BETWEEN 0 AND 1\)/);
  assert.doesNotMatch(migration, /READY_TO_REPLY|REVIEW/);
  assert.match(service, /DEFAULT_SOCIAL_COMMENT_AI_BUDGET_PER_RUN = 6/);
  assert.match(service, /SOCIAL_COMMENT_MAX_TOOL_CALLS = 1/);
  assert.match(service, /max_tool_calls: SOCIAL_COMMENT_MAX_TOOL_CALLS/);
  assert.match(service, /shouldSkipSocialCommentLocally/);
  assert.match(service, /openai_request_count = 0/);
  assert.match(service, /retrySavedReplyIfNeeded/);
  assert.doesNotMatch(service, /while\s*\(|retry.*OpenAI|second.*OpenAI/i);
  assert.match(prompt, /Return one JSON object only/);
  assert.match(prompt, /Decide should_reply and write reply_text in this same response/);
  assert.match(prompt, /Do not ask for another model call/);
  assert.match(server, /controller\.cron === SOCIAL_COMMENT_CRON/);
  assert.equal(SOCIAL_COMMENT_CRON, "17 * * * *");
  assert.doesNotMatch(server, /\/api\/social\/comments\/run/);
  assert.match(wrangler, /"17 \* \* \* \*"/);
  assert.doesNotMatch(page + frontendTypes + frontendCss, /Comment replies|commentReplies|social-comments|comments\/run/i);
  assert.doesNotMatch(service + prompt, /messages\.service|MessagesPage|\/api\/messages|\/sync\/messages|Cloudinary|google-drive|APP_SECRET/i);
  assert.doesNotMatch(server, /\/api\/social\/comments\/run|commentReplies/i);
  assert.doesNotMatch(service, /console\.log|console\.warn|access_token/);

  const request = buildSocialCommentReplyRequest({
    comment: {
      platform: "FACEBOOK",
      providerCommentId: "c-1",
      providerParentId: "post-1",
      postCaption: "Garden post",
      postPermalink: "https://example.test/post",
      authorProviderId: "guest-1",
      authorUsername: "guest",
      authorName: "Guest",
      text: "Beautiful place",
      commentedAt: "2026-08-05T00:00:00Z",
    },
    threadContext: [],
    storeId: "vs_test",
    model: "gpt-5.6-luna",
    now: "2026-08-05T01:00:00Z",
  });
  assert.equal(request.max_tool_calls, 1);
  assert.equal((request.reasoning as { effort?: string }).effort, "low");
  assert.match(JSON.stringify(request.tools), /file_search/);
  assert.equal(request.model, "gpt-5.6-luna");
});
