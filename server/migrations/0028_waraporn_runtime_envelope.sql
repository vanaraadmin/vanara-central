ALTER TABLE message_drafts ADD COLUMN runtime_context_json TEXT;
ALTER TABLE message_drafts ADD COLUMN retrieval_filenames TEXT NOT NULL DEFAULT '[]';
ALTER TABLE message_drafts ADD COLUMN retrieval_result_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_message_drafts_retrieval_count
    ON message_drafts(retrieval_result_count);
