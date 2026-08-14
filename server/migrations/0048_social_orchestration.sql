ALTER TABLE social_post_queue ADD COLUMN pipeline_stage TEXT;
ALTER TABLE social_post_queue ADD COLUMN pipeline_acquired_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN pipeline_lease_token TEXT;
ALTER TABLE social_post_queue ADD COLUMN r2_read_started_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN r2_read_completed_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN r2_write_started_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN r2_write_completed_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_leased_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_request_started_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_response_received_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_watchdog_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (caption_attempt_count >= 0);
ALTER TABLE social_post_queue ADD COLUMN publish_r2_started_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN publish_r2_completed_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN instagram_request_started_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN instagram_response_received_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN facebook_request_started_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN facebook_response_received_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN publish_watchdog_at TEXT;

CREATE INDEX IF NOT EXISTS idx_social_post_queue_due_pipeline
    ON social_post_queue(status, scheduled_publish_at, pipeline_acquired_at);

CREATE INDEX IF NOT EXISTS idx_social_post_queue_caption_watchdog
    ON social_post_queue(status, caption_leased_at, caption_request_started_at);
