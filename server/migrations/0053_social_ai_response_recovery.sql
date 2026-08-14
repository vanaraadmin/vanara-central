ALTER TABLE social_post_queue ADD COLUMN caption_client_request_id TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_provider_request_id TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_provider_status TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_submitted_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_last_polled_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_provider_terminal_at TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_provider_error_code TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_provider_error_message TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_poll_lease_token TEXT;
ALTER TABLE social_post_queue ADD COLUMN caption_poll_lease_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_post_queue_caption_client_request
    ON social_post_queue(caption_client_request_id)
    WHERE caption_client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_post_queue_caption_provider_poll
    ON social_post_queue(status, caption_provider_status, caption_poll_lease_at)
    WHERE caption_openai_response_id IS NOT NULL;
