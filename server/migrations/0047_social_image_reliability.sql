ALTER TABLE social_post_queue ADD COLUMN image_phase TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_leased_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_source_ready_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_request_started_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_response_received_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_finalized_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_watchdog_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_recovery_state TEXT;

CREATE INDEX IF NOT EXISTS idx_social_post_queue_image_watchdog
    ON social_post_queue(status, image_leased_at, image_request_started_at);
