-- Require workflow provenance for passport records that count in Reception.

ALTER TABLE booking_passports
    ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX idx_booking_passports_booking_source
    ON booking_passports(booking_id, source, created_at);
