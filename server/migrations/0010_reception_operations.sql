-- Sprint 12: local Reception operations.
-- Stores only resort-local operational flags, notes and audit events.
-- Beds24 booking data remains read-only and is never modified here.

CREATE TABLE reception_stays (
    beds24_booking_id INTEGER PRIMARY KEY,
    guest_arrived INTEGER NOT NULL DEFAULT 0 CHECK (guest_arrived IN (0, 1)),
    passport_collected INTEGER NOT NULL DEFAULT 0 CHECK (passport_collected IN (0, 1)),
    deposit_collected INTEGER NOT NULL DEFAULT 0 CHECK (deposit_collected IN (0, 1)),
    welcome_completed INTEGER NOT NULL DEFAULT 0 CHECK (welcome_completed IN (0, 1)),
    keys_delivered INTEGER NOT NULL DEFAULT 0 CHECK (keys_delivered IN (0, 1)),
    guest_left INTEGER NOT NULL DEFAULT 0 CHECK (guest_left IN (0, 1)),
    keys_returned INTEGER NOT NULL DEFAULT 0 CHECK (keys_returned IN (0, 1)),
    deposit_returned INTEGER NOT NULL DEFAULT 0 CHECK (deposit_returned IN (0, 1)),
    room_released INTEGER NOT NULL DEFAULT 0 CHECK (room_released IN (0, 1)),
    special_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE reception_guest_notes (
    note_id INTEGER PRIMARY KEY AUTOINCREMENT,
    beds24_booking_id INTEGER NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE reception_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    beds24_booking_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    from_value TEXT,
    to_value TEXT,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_reception_guest_notes_booking
    ON reception_guest_notes(beds24_booking_id, created_at);

CREATE INDEX idx_reception_events_booking
    ON reception_events(beds24_booking_id, created_at);
