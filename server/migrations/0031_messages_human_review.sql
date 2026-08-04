ALTER TABLE user_module_permissions RENAME TO user_module_permissions_legacy;

CREATE TABLE user_module_permissions (
    user_id TEXT NOT NULL,
    module_key TEXT NOT NULL CHECK (module_key IN (
        'dashboard',
        'rooms',
        'housekeeping',
        'movements',
        'maintenance',
        'procurement',
        'messages',
        'chat',
        'owner-dashboard',
        'settings'
    )),
    can_access INTEGER NOT NULL DEFAULT 0 CHECK (can_access IN (0, 1)),
    can_edit INTEGER NOT NULL DEFAULT 0 CHECK (can_edit IN (0, 1)),

    PRIMARY KEY (user_id, module_key),

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

INSERT INTO user_module_permissions (user_id, module_key, can_access, can_edit)
SELECT user_id, module_key, can_access, can_edit
FROM user_module_permissions_legacy;

DROP TABLE user_module_permissions_legacy;

ALTER TABLE message_drafts RENAME TO message_drafts_legacy;

CREATE TABLE message_drafts (
    message_draft_id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL UNIQUE,
    message_conversation_id INTEGER NOT NULL,
    booking_id INTEGER,
    prompt_key TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    prompt_checksum TEXT NOT NULL,
    draft_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'FAILED', 'REJECTED', 'APPROVED', 'SENT')),
    model TEXT NOT NULL,
    vector_store_id TEXT NOT NULL,
    openai_response_id TEXT,
    context_hash TEXT NOT NULL,
    runtime_context_json TEXT,
    retrieval_filenames TEXT NOT NULL DEFAULT '[]',
    retrieval_result_count INTEGER NOT NULL DEFAULT 0,
    openai_file_search_call_count INTEGER NOT NULL DEFAULT 0 CHECK (openai_file_search_call_count >= 0),
    openai_request_count INTEGER NOT NULL DEFAULT 1 CHECK (openai_request_count = 1),
    openai_input_tokens INTEGER NOT NULL DEFAULT 0,
    openai_cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    openai_output_tokens INTEGER NOT NULL DEFAULT 0,
    openai_reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    openai_total_tokens INTEGER NOT NULL DEFAULT 0,
    openai_elapsed_ms INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd REAL NOT NULL DEFAULT 0,
    failure_code TEXT,
    failure_message TEXT,
    original_draft_text TEXT,
    edited_draft_text TEXT,
    edited_by TEXT,
    edited_by_name TEXT,
    edited_at TEXT,
    approved_by TEXT,
    approved_by_name TEXT,
    approved_at TEXT,
    rejected_by TEXT,
    rejected_by_name TEXT,
    rejected_at TEXT,
    rejection_reason TEXT,
    sent_at TEXT,
    beds24_message_id TEXT,
    provider_response_id TEXT,
    delivery_idempotency_key TEXT UNIQUE,
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

INSERT INTO message_drafts (
    message_draft_id,
    message_id,
    message_conversation_id,
    booking_id,
    prompt_key,
    prompt_version,
    prompt_checksum,
    draft_text,
    status,
    model,
    vector_store_id,
    openai_response_id,
    context_hash,
    runtime_context_json,
    retrieval_filenames,
    retrieval_result_count,
    openai_file_search_call_count,
    openai_request_count,
    openai_input_tokens,
    openai_cached_input_tokens,
    openai_output_tokens,
    openai_reasoning_tokens,
    openai_total_tokens,
    openai_elapsed_ms,
    estimated_cost_usd,
    failure_code,
    failure_message,
    created_at,
    updated_at
)
SELECT
    message_draft_id,
    message_id,
    message_conversation_id,
    booking_id,
    prompt_key,
    prompt_version,
    prompt_checksum,
    draft_text,
    status,
    model,
    vector_store_id,
    openai_response_id,
    context_hash,
    runtime_context_json,
    retrieval_filenames,
    retrieval_result_count,
    openai_file_search_call_count,
    openai_request_count,
    openai_input_tokens,
    openai_cached_input_tokens,
    openai_output_tokens,
    openai_reasoning_tokens,
    openai_total_tokens,
    openai_elapsed_ms,
    estimated_cost_usd,
    failure_code,
    failure_message,
    created_at,
    updated_at
FROM message_drafts_legacy;

DROP TABLE message_drafts_legacy;

CREATE INDEX IF NOT EXISTS idx_message_drafts_status
    ON message_drafts(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_drafts_booking
    ON message_drafts(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_drafts_prompt_checksum
    ON message_drafts(prompt_checksum);

CREATE INDEX IF NOT EXISTS idx_message_drafts_retrieval_count
    ON message_drafts(retrieval_result_count);

CREATE INDEX IF NOT EXISTS idx_message_drafts_openai_request_count
    ON message_drafts(openai_request_count);

CREATE INDEX IF NOT EXISTS idx_message_drafts_failure_code
    ON message_drafts(failure_code);

CREATE INDEX IF NOT EXISTS idx_message_drafts_file_search_call_count
    ON message_drafts(openai_file_search_call_count);

CREATE INDEX IF NOT EXISTS idx_message_drafts_review
    ON message_drafts(status, updated_at DESC);
