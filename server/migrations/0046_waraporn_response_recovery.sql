CREATE TABLE IF NOT EXISTS waraporn_response_jobs (
    message_id INTEGER PRIMARY KEY,
    message_conversation_id INTEGER NOT NULL,
    booking_id INTEGER,
    openai_response_id TEXT UNIQUE,
    response_status TEXT NOT NULL CHECK (response_status IN (
        'SUBMITTING',
        'QUEUED',
        'IN_PROGRESS',
        'COMPLETED',
        'FAILED',
        'INCOMPLETE',
        'CANCELLED',
        'UNKNOWN'
    )),
    prompt_key TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    prompt_checksum TEXT NOT NULL,
    model TEXT NOT NULL,
    vector_store_id TEXT NOT NULL,
    context_hash TEXT NOT NULL,
    runtime_context_json TEXT NOT NULL,
    openai_request_count INTEGER NOT NULL DEFAULT 1 CHECK (openai_request_count = 1),
    submitted_at TEXT,
    last_checked_at TEXT,
    completed_at TEXT,
    failure_code TEXT,
    failure_message TEXT,
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

CREATE INDEX IF NOT EXISTS idx_waraporn_response_jobs_status
    ON waraporn_response_jobs(response_status, updated_at);
