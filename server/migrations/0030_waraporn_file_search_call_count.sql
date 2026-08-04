ALTER TABLE message_drafts ADD COLUMN openai_file_search_call_count INTEGER NOT NULL DEFAULT 0 CHECK (openai_file_search_call_count >= 0);

CREATE INDEX IF NOT EXISTS idx_message_drafts_file_search_call_count
    ON message_drafts(openai_file_search_call_count);
