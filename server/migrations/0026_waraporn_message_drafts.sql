CREATE TABLE IF NOT EXISTS message_drafts (
    message_draft_id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL UNIQUE,
    message_conversation_id INTEGER NOT NULL,
    booking_id INTEGER,
    prompt_key TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    prompt_checksum TEXT NOT NULL,
    draft_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'FAILED')),
    model TEXT NOT NULL,
    vector_store_id TEXT NOT NULL,
    openai_response_id TEXT,
    context_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (message_id)
        REFERENCES messages(message_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (message_conversation_id)
        REFERENCES message_conversations(message_conversation_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_message_drafts_status
    ON message_drafts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_drafts_booking
    ON message_drafts(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_drafts_prompt_checksum
    ON message_drafts(prompt_checksum);
