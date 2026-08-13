-- Persist paid passport OCR work so Worker restarts and duplicate submissions resume safely.

CREATE TABLE passport_ocr_attempts (
    id TEXT PRIMARY KEY,
    booking_id INTEGER NOT NULL,
    slot_key TEXT NOT NULL,
    image_sha256 TEXT NOT NULL,
    object_key TEXT,
    state TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (state IN ('ACTIVE', 'CLASSIFIED', 'OCR_COMPLETED', 'PASSPORT_SAVED', 'FAILED', 'MANUAL_REVIEW', 'DISCARDED')),
    created_by TEXT,
    last_error_code TEXT,
    last_error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    UNIQUE (booking_id, slot_key, image_sha256)
);

CREATE INDEX idx_passport_ocr_attempt_identity
    ON passport_ocr_attempts(booking_id, image_sha256, updated_at DESC);

CREATE INDEX idx_passport_ocr_attempt_expiry
    ON passport_ocr_attempts(state, expires_at);

CREATE TABLE passport_ocr_response_attempts (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    stage TEXT NOT NULL
        CHECK (stage IN ('CLASSIFICATION', 'VISUAL_BIODATA', 'MRZ', 'VERIFICATION')),
    client_request_id TEXT NOT NULL,
    response_id TEXT,
    provider_status TEXT,
    state TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (state IN ('PENDING', 'SUBMITTING', 'POLLING', 'COMPLETED', 'FAILED', 'MANUAL_REVIEW')),
    result_json TEXT,
    openai_request_id TEXT,
    http_status INTEGER,
    submitted_at TEXT,
    last_polled_at TEXT,
    completed_at TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (attempt_id, stage),
    FOREIGN KEY (attempt_id)
        REFERENCES passport_ocr_attempts(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_passport_ocr_response_resume
    ON passport_ocr_response_attempts(state, response_id, updated_at);
