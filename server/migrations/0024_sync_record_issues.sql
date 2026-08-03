-- Internal sync health details for record-level provider import issues.
-- No credentials or raw provider payloads are stored here.

CREATE TABLE IF NOT EXISTS sync_record_issues (
    sync_record_issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_type TEXT NOT NULL,
    issue_type TEXT NOT NULL CHECK (issue_type IN ('failed', 'skipped')),
    provider_record_id TEXT NOT NULL,
    first_failure_at TEXT NOT NULL,
    latest_failure_at TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
    error_category TEXT NOT NULL,
    error_message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (sync_type, provider_record_id, issue_type)
);

CREATE INDEX IF NOT EXISTS idx_sync_record_issues_recent
    ON sync_record_issues(sync_type, latest_failure_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_record_issues_status
    ON sync_record_issues(sync_type, status, latest_failure_at DESC);
