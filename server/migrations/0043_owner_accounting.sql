ALTER TABLE user_module_permissions RENAME TO user_module_permissions_legacy;

CREATE TABLE user_module_permissions (
    user_id TEXT NOT NULL,
    module_key TEXT NOT NULL CHECK (module_key IN (
        'dashboard',
        'rooms',
        'housekeeping',
        'movements',
        'maintenance',
        'procurement',
        'messages',
        'chat',
        'social-automation',
        'payroll',
        'accounting',
        'owner-dashboard',
        'settings'
    )),
    can_access INTEGER NOT NULL DEFAULT 0 CHECK (can_access IN (0, 1)),
    can_edit INTEGER NOT NULL DEFAULT 0 CHECK (can_edit IN (0, 1)),

    PRIMARY KEY (user_id, module_key),

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

INSERT INTO user_module_permissions (user_id, module_key, can_access, can_edit)
SELECT user_id, module_key, can_access, can_edit
FROM user_module_permissions_legacy;

DROP TABLE user_module_permissions_legacy;

INSERT OR IGNORE INTO user_module_permissions (user_id, module_key, can_access, can_edit)
SELECT user_id, 'accounting', 1, 1
FROM users
WHERE role = 'Owner';

CREATE TABLE ota_financial_records (
    ota_financial_record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    ota_booking_id TEXT,
    beds24_booking_id INTEGER NOT NULL,
    booking_group_id TEXT,
    is_group_master INTEGER NOT NULL DEFAULT 0 CHECK (is_group_master IN (0, 1)),
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    room_count INTEGER NOT NULL DEFAULT 1 CHECK (room_count >= 1),
    gross_booking_amount REAL CHECK (gross_booking_amount IS NULL OR gross_booking_amount >= 0),
    tax_and_service_charge_amount REAL CHECK (tax_and_service_charge_amount IS NULL OR tax_and_service_charge_amount >= 0),
    ota_fees REAL CHECK (ota_fees IS NULL OR ota_fees >= 0),
    expected_net_payout REAL CHECK (expected_net_payout IS NULL OR expected_net_payout >= 0),
    payment_method TEXT,
    guest_payment_status TEXT,
    source_confidence TEXT NOT NULL DEFAULT 'low' CHECK (source_confidence IN ('high', 'medium', 'low')),
    raw_rate_description TEXT,
    raw_channel_info TEXT,
    raw_source_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (beds24_booking_id)
);

CREATE INDEX idx_ota_financial_records_dates
    ON ota_financial_records(check_in, check_out);

CREATE INDEX idx_ota_financial_records_channel
    ON ota_financial_records(channel);

CREATE INDEX idx_ota_financial_records_group
    ON ota_financial_records(booking_group_id);

CREATE TABLE manual_accounting_entries (
    accounting_entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense')),
    entry_date TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    note TEXT,
    receipt_object_key TEXT,
    receipt_file_name TEXT,
    receipt_content_type TEXT,
    receipt_uploaded_at TEXT,
    created_by_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (created_by_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX idx_manual_accounting_entries_date
    ON manual_accounting_entries(entry_date);

CREATE INDEX idx_manual_accounting_entries_type
    ON manual_accounting_entries(entry_type);
