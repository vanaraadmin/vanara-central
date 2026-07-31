-- Beds24 Auto Action webhook intake.
-- Stores only the received event envelope; booking synchronization remains separate.

CREATE TABLE beds24_webhook_events (
    webhook_event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT NOT NULL UNIQUE,
    event TEXT NOT NULL CHECK (event IN ('booking_created', 'booking_updated', 'booking_cancelled')),
    booking_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    received_at TEXT NOT NULL,
    processing_status TEXT NOT NULL CHECK (processing_status IN ('accepted', 'duplicate'))
);

CREATE INDEX idx_beds24_webhook_events_booking
    ON beds24_webhook_events(booking_id, received_at);

CREATE INDEX idx_beds24_webhook_events_received
    ON beds24_webhook_events(received_at);
