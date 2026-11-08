-- Procurement requests remain visibly actionable for owners until one owner takes responsibility.

ALTER TABLE procurement_requests ADD COLUMN acknowledged_at TEXT;
ALTER TABLE procurement_requests ADD COLUMN acknowledged_by TEXT;
ALTER TABLE procurement_requests ADD COLUMN acknowledged_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_procurement_requests_owner_attention
  ON procurement_requests(status, acknowledged_at, created_at);
