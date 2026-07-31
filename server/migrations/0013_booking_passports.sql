-- Sprint 2: persistent booking-to-passport association.
-- One row represents one uploaded passport linked to the Reception booking id.

CREATE TABLE booking_passports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    first_name TEXT,
    middle_name TEXT,
    last_name TEXT,
    passport_number TEXT,
    nationality TEXT,
    gender TEXT,
    birth_date TEXT,
    created_at TEXT NOT NULL,

    FOREIGN KEY (booking_id)
        REFERENCES bookings(beds24_booking_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX idx_booking_passports_booking
    ON booking_passports(booking_id, created_at);
