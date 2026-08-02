-- Harden passport OCR persistence for MRZ validation, review audit, and TM30 readiness.

ALTER TABLE booking_passports ADD COLUMN document_type TEXT;
ALTER TABLE booking_passports ADD COLUMN issuing_country TEXT;
ALTER TABLE booking_passports ADD COLUMN expiry_date TEXT;
ALTER TABLE booking_passports ADD COLUMN mrz_line_1 TEXT;
ALTER TABLE booking_passports ADD COLUMN mrz_line_2 TEXT;
ALTER TABLE booking_passports ADD COLUMN mrz_validation_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE booking_passports ADD COLUMN field_verification_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE booking_passports ADD COLUMN manual_corrections_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE booking_passports ADD COLUMN quality_gate_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE booking_passports ADD COLUMN ocr_model TEXT;
ALTER TABLE booking_passports ADD COLUMN ocr_schema_version TEXT;
ALTER TABLE booking_passports ADD COLUMN tm30_status TEXT NOT NULL DEFAULT 'NOT_READY';
ALTER TABLE booking_passports ADD COLUMN created_by TEXT;
ALTER TABLE booking_passports ADD COLUMN verified_by TEXT;
ALTER TABLE booking_passports ADD COLUMN verified_at TEXT;

CREATE INDEX idx_booking_passports_tm30_status
    ON booking_passports(tm30_status, booking_id);
