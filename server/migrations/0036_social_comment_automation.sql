CREATE TABLE IF NOT EXISTS social_comments (
    social_comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('FACEBOOK','INSTAGRAM')),
    provider_comment_id TEXT NOT NULL,
    provider_parent_id TEXT NOT NULL,
    post_caption TEXT,
    post_permalink TEXT,
    author_provider_id TEXT,
    author_username TEXT,
    author_name TEXT,
    comment_text TEXT NOT NULL,
    commented_at TEXT,
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','SKIPPED','GENERATING','NO_REPLY','PUBLISHING','REPLIED','FAILED')),
    skip_reason TEXT,
    should_reply INTEGER CHECK (should_reply IN (0, 1)),
    reply_text TEXT,
    reply_provider_id TEXT,
    language TEXT,
    risk_level TEXT,
    ai_reason TEXT,
    confidence REAL,
    openai_request_count INTEGER NOT NULL DEFAULT 0 CHECK (openai_request_count BETWEEN 0 AND 1),
    openai_response_id TEXT,
    openai_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_input_tokens >= 0),
    openai_cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_cached_input_tokens >= 0),
    openai_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_output_tokens >= 0),
    openai_reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_reasoning_tokens >= 0),
    openai_total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_total_tokens >= 0),
    openai_elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (openai_elapsed_ms >= 0),
    estimated_cost_usd REAL NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
    failure_code TEXT,
    failure_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    processed_at TEXT,
    replied_at TEXT,

    UNIQUE (platform, provider_comment_id)
);

CREATE INDEX IF NOT EXISTS idx_social_comments_status
    ON social_comments(status, created_at);

CREATE INDEX IF NOT EXISTS idx_social_comments_platform_parent
    ON social_comments(platform, provider_parent_id, commented_at);

CREATE INDEX IF NOT EXISTS idx_social_comments_updated
    ON social_comments(updated_at DESC);

CREATE TABLE IF NOT EXISTS social_comment_runs (
    social_comment_run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCESS','PARTIAL','FAILED')),
    comments_checked INTEGER NOT NULL DEFAULT 0 CHECK (comments_checked >= 0),
    comments_imported INTEGER NOT NULL DEFAULT 0 CHECK (comments_imported >= 0),
    skipped_local INTEGER NOT NULL DEFAULT 0 CHECK (skipped_local >= 0),
    ai_evaluated INTEGER NOT NULL DEFAULT 0 CHECK (ai_evaluated >= 0),
    replies_published INTEGER NOT NULL DEFAULT 0 CHECK (replies_published >= 0),
    no_reply INTEGER NOT NULL DEFAULT 0 CHECK (no_reply >= 0),
    failed INTEGER NOT NULL DEFAULT 0 CHECK (failed >= 0),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_social_comment_runs_started
    ON social_comment_runs(started_at DESC);
