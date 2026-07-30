-- Sprint 09: Housekeeping workflow foundation.
-- Extends the existing housekeeping table without changing Beds24 data.

ALTER TABLE housekeeping
    ADD COLUMN assigned_user_id TEXT;

ALTER TABLE housekeeping
    ADD COLUMN assigned_user_name TEXT;

ALTER TABLE housekeeping
    ADD COLUMN assigned_at TEXT;

ALTER TABLE housekeeping
    ADD COLUMN updated_by TEXT;

ALTER TABLE housekeeping
    ADD COLUMN updated_by_name TEXT;

ALTER TABLE housekeeping
    ADD COLUMN checklist_json TEXT NOT NULL DEFAULT '{"version":1,"items":[{"id":"bathroom","label":"Bathroom","completed":false},{"id":"floor","label":"Floor","completed":false},{"id":"towels","label":"Towels","completed":false},{"id":"bed","label":"Bed","completed":false},{"id":"amenities","label":"Amenities","completed":false},{"id":"final-check","label":"Final Check","completed":false}]}';

CREATE INDEX idx_housekeeping_unit_work_date
    ON housekeeping(unit_id, work_date);

CREATE INDEX idx_housekeeping_assigned_user
    ON housekeeping(assigned_user_id);
