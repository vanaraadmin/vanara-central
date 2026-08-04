CREATE TABLE IF NOT EXISTS waraporn_kb_backups (
    backup_id TEXT PRIMARY KEY,
    object_prefix TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('PREPARING', 'UPLOADING', 'VERIFYING', 'COMPLETE')),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    file_count INTEGER NOT NULL DEFAULT 0,
    markdown_file_count INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER NOT NULL DEFAULT 0,
    top_level_collections TEXT NOT NULL DEFAULT '[]',
    manifest_sha256 TEXT NOT NULL,
    created_by_user_id TEXT,
    error_summary TEXT,

    FOREIGN KEY (created_by_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_waraporn_kb_backups_status_completed
    ON waraporn_kb_backups(status, completed_at DESC);

