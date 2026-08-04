ALTER TABLE message_drafts ADD COLUMN openai_request_count INTEGER NOT NULL DEFAULT 1 CHECK (openai_request_count = 1);
ALTER TABLE message_drafts ADD COLUMN openai_input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE message_drafts ADD COLUMN openai_cached_input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE message_drafts ADD COLUMN openai_output_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE message_drafts ADD COLUMN openai_reasoning_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE message_drafts ADD COLUMN openai_total_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE message_drafts ADD COLUMN openai_elapsed_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE message_drafts ADD COLUMN estimated_cost_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE message_drafts ADD COLUMN failure_code TEXT;
ALTER TABLE message_drafts ADD COLUMN failure_message TEXT;

CREATE INDEX IF NOT EXISTS idx_message_drafts_openai_request_count
    ON message_drafts(openai_request_count);

CREATE INDEX IF NOT EXISTS idx_message_drafts_failure_code
    ON message_drafts(failure_code);
