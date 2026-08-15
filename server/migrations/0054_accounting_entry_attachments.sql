CREATE TABLE IF NOT EXISTS accounting_entry_attachments (
    accounting_attachment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    accounting_entry_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL CHECK (sort_order > 0),
    object_key TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size INTEGER CHECK (byte_size IS NULL OR byte_size > 0),
    uploaded_at TEXT NOT NULL,
    created_by_user_id TEXT,
    created_at TEXT NOT NULL,

    UNIQUE (accounting_entry_id, sort_order),

    FOREIGN KEY (accounting_entry_id)
        REFERENCES manual_accounting_entries(accounting_entry_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (created_by_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_accounting_entry_attachments_entry
    ON accounting_entry_attachments(accounting_entry_id, sort_order);

INSERT OR IGNORE INTO accounting_entry_attachments (
    accounting_entry_id,
    sort_order,
    object_key,
    file_name,
    content_type,
    byte_size,
    uploaded_at,
    created_by_user_id,
    created_at
)
SELECT
    accounting_entry_id,
    1,
    receipt_object_key,
    receipt_file_name,
    receipt_content_type,
    NULL,
    receipt_uploaded_at,
    created_by_user_id,
    receipt_uploaded_at
FROM manual_accounting_entries
WHERE receipt_object_key IS NOT NULL
  AND receipt_file_name IS NOT NULL
  AND receipt_content_type IS NOT NULL
  AND receipt_uploaded_at IS NOT NULL;
