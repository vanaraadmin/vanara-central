ALTER TABLE social_post_queue ADD COLUMN image_client_request_id TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_provider_request_id TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_provider_status TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_submitted_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_last_polled_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_provider_terminal_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_provider_error_code TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_provider_error_message TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_poll_lease_token TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_poll_lease_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN image_prior_attempt_audit_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_post_queue_image_client_request
    ON social_post_queue(image_client_request_id)
    WHERE image_client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_post_queue_image_provider_poll
    ON social_post_queue(status, image_provider_status, image_poll_lease_at)
    WHERE image_openai_response_id IS NOT NULL;
