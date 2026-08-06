-- Procurement MVP: simple free-text operational requests with translation-ready metadata.

PRAGMA foreign_keys = OFF;

ALTER TABLE procurement_requests RENAME TO procurement_requests_legacy_0039;

CREATE TABLE procurement_requests (
    request_id INTEGER PRIMARY KEY AUTOINCREMENT,
    requested_by TEXT NOT NULL,
    requested_by_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'REJECTED')),
    custom_item_text TEXT,
    note TEXT,
    request_text_original TEXT NOT NULL DEFAULT '',
    original_language TEXT NOT NULL DEFAULT 'en' CHECK (original_language IN ('en', 'th')),
    translated_text TEXT,
    translated_language TEXT CHECK (translated_language IS NULL OR translated_language IN ('en', 'th')),
    translated_at TEXT,
    translation_provider TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reviewed_at TEXT,
    ordered_at TEXT,
    received_at TEXT,
    rejected_at TEXT,
    closed_by TEXT,
    closed_by_name TEXT,
    closed_at TEXT,
    updated_by TEXT,
    updated_by_name TEXT
);

INSERT INTO procurement_requests (
    request_id,
    requested_by,
    requested_by_name,
    status,
    custom_item_text,
    note,
    request_text_original,
    original_language,
    translated_text,
    translated_language,
    translated_at,
    translation_provider,
    created_at,
    updated_at,
    reviewed_at,
    ordered_at,
    received_at,
    rejected_at,
    closed_by,
    closed_by_name,
    closed_at,
    updated_by,
    updated_by_name
)
SELECT
    request_id,
    requested_by,
    requested_by_name,
    CASE
      WHEN status = 'received' THEN 'DONE'
      WHEN status = 'rejected' THEN 'REJECTED'
      ELSE 'PENDING'
    END,
    custom_item_text,
    note,
    COALESCE(custom_item_text, note, ''),
    'en',
    NULL,
    NULL,
    NULL,
    NULL,
    created_at,
    updated_at,
    reviewed_at,
    ordered_at,
    received_at,
    rejected_at,
    updated_by,
    updated_by_name,
    CASE
      WHEN status = 'received' THEN COALESCE(received_at, updated_at)
      WHEN status = 'rejected' THEN COALESCE(rejected_at, updated_at)
      ELSE NULL
    END,
    updated_by,
    updated_by_name
FROM procurement_requests_legacy_0039;

DROP TABLE procurement_requests_legacy_0039;

ALTER TABLE procurement_request_items RENAME TO procurement_request_items_legacy_0039;

CREATE TABLE procurement_request_items (
    request_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,

    UNIQUE (request_id, item_id),

    FOREIGN KEY (request_id)
        REFERENCES procurement_requests(request_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (item_id)
        REFERENCES procurement_items(item_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

INSERT OR IGNORE INTO procurement_request_items (request_item_id, request_id, item_id, created_at)
SELECT request_item_id, request_id, item_id, created_at
FROM procurement_request_items_legacy_0039;

DROP TABLE procurement_request_items_legacy_0039;

CREATE INDEX idx_procurement_requests_status
    ON procurement_requests(status, created_at);

CREATE INDEX idx_procurement_requests_requested_by
    ON procurement_requests(requested_by, created_at);

CREATE INDEX idx_procurement_requests_mvp_staff_visible
    ON procurement_requests(requested_by, status, closed_at, created_at);

CREATE INDEX idx_procurement_requests_mvp_owner_queue
    ON procurement_requests(status, created_at);

CREATE INDEX idx_procurement_request_items_request
    ON procurement_request_items(request_id);

PRAGMA foreign_keys = ON;
