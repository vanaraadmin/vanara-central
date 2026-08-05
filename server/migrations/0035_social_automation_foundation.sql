ALTER TABLE user_module_permissions RENAME TO user_module_permissions_legacy;

CREATE TABLE user_module_permissions (
    user_id TEXT NOT NULL,
    module_key TEXT NOT NULL CHECK (module_key IN (
        'dashboard',
        'rooms',
        'housekeeping',
        'movements',
        'maintenance',
        'procurement',
        'messages',
        'chat',
        'social-automation',
        'owner-dashboard',
        'settings'
    )),
    can_access INTEGER NOT NULL DEFAULT 0 CHECK (can_access IN (0, 1)),
    can_edit INTEGER NOT NULL DEFAULT 0 CHECK (can_edit IN (0, 1)),

    PRIMARY KEY (user_id, module_key),

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

INSERT INTO user_module_permissions (user_id, module_key, can_access, can_edit)
SELECT user_id, module_key, can_access, can_edit
FROM user_module_permissions_legacy;

DROP TABLE user_module_permissions_legacy;

INSERT OR IGNORE INTO user_module_permissions (user_id, module_key, can_access, can_edit)
SELECT user_id, 'social-automation', 1, 1
FROM users
WHERE role = 'Owner';

CREATE TABLE IF NOT EXISTS social_post_queue (
    social_post_id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_object_key TEXT NOT NULL UNIQUE,
    processed_object_key TEXT,
    original_file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    uploaded_by TEXT NOT NULL,
    uploaded_by_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PREPARING_IMAGE','IMAGE_READY','CAPTIONING','READY_TO_POST','POSTING','POSTED','FAILED','CANCELLED')),
    queued_at TEXT NOT NULL,
    processing_started_at TEXT,
    image_prepared_at TEXT,
    caption_prepared_at TEXT,
    scheduled_publish_at TEXT,
    posted_at TEXT,
    failed_at TEXT,
    updated_at TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    failure_code TEXT,
    failure_message TEXT,
    openai_request_count INTEGER NOT NULL DEFAULT 0 CHECK (openai_request_count BETWEEN 0 AND 2),
    openai_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_input_tokens >= 0),
    openai_cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_cached_input_tokens >= 0),
    openai_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_output_tokens >= 0),
    openai_reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_reasoning_tokens >= 0),
    openai_total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_total_tokens >= 0),
    openai_elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (openai_elapsed_ms >= 0),
    estimated_cost_usd REAL NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
    image_openai_response_id TEXT,
    caption_openai_response_id TEXT,
    vector_store_id TEXT,
    analysis_json TEXT,
    caption_json TEXT,
    caption_style_fingerprint TEXT,
    published_image_object_key TEXT,
    facebook_post_id TEXT,
    instagram_post_id TEXT,
    source_metadata_json TEXT,

    FOREIGN KEY (uploaded_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_social_post_queue_status
    ON social_post_queue(status, queued_at);

CREATE INDEX IF NOT EXISTS idx_social_post_queue_scheduled
    ON social_post_queue(scheduled_publish_at, status);

CREATE INDEX IF NOT EXISTS idx_social_post_queue_uploader
    ON social_post_queue(uploaded_by, queued_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_post_queue_updated
    ON social_post_queue(updated_at DESC);
