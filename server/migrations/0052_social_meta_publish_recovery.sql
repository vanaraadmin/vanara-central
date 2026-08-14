ALTER TABLE social_post_queue ADD COLUMN instagram_container_id TEXT;
ALTER TABLE social_post_queue ADD COLUMN instagram_container_status TEXT;
ALTER TABLE social_post_queue ADD COLUMN instagram_container_request_started_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN instagram_container_created_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN instagram_container_last_polled_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN instagram_publish_request_started_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN instagram_publish_response_received_at TEXT;

CREATE INDEX IF NOT EXISTS idx_social_post_queue_meta_recovery
    ON social_post_queue(status, scheduled_publish_at, pipeline_acquired_at, instagram_container_status);

CREATE TABLE IF NOT EXISTS social_post_events (
    social_post_event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    social_post_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    stage TEXT NOT NULL,
    detail_code TEXT,
    provider_id TEXT,
    dedupe_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (social_post_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_social_post_events_job
    ON social_post_events(social_post_id, created_at, social_post_event_id);
