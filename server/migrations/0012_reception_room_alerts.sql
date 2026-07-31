-- Sprint 1: persistent Reception alerts shown inside Room detail.
-- Alerts are keyed by Beds24 booking id and unit id; they do not use guest names.

CREATE TABLE reception_room_alerts (
    alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
    beds24_booking_id INTEGER NOT NULL,
    unit_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('passport_missing', 'deposit_pending')),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    created_by TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    resolved_by TEXT,
    resolved_by_name TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (beds24_booking_id, alert_type)
);

CREATE INDEX idx_reception_room_alerts_unit_status
    ON reception_room_alerts(unit_id, status, created_at);

CREATE INDEX idx_reception_room_alerts_booking_status
    ON reception_room_alerts(beds24_booking_id, status);
