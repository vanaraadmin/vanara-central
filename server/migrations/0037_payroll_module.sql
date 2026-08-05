ALTER TABLE user_module_permissions RENAME TO user_module_permissions_legacy;

ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;

UPDATE users
SET
    first_name = CASE
        WHEN instr(trim(full_name), ' ') > 0 THEN substr(trim(full_name), 1, instr(trim(full_name), ' ') - 1)
        ELSE trim(full_name)
    END,
    last_name = CASE
        WHEN instr(trim(full_name), ' ') > 0 THEN trim(substr(trim(full_name), instr(trim(full_name), ' ') + 1))
        ELSE ''
    END
WHERE first_name IS NULL OR last_name IS NULL;

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
SELECT user_id, 'payroll', 1, 1
FROM users
WHERE role = 'Owner';

CREATE TABLE IF NOT EXISTS payroll_worker_settings (
    employee_user_id TEXT PRIMARY KEY,
    monthly_gross_salary REAL NOT NULL DEFAULT 0 CHECK (monthly_gross_salary >= 0),
    monthly_day_divisor REAL NOT NULL DEFAULT 30 CHECK (monthly_day_divisor > 0),
    normal_hours_per_day REAL NOT NULL DEFAULT 8 CHECK (normal_hours_per_day > 0),
    social_security_applicable INTEGER NOT NULL DEFAULT 1 CHECK (social_security_applicable IN (0, 1)),
    social_security_rate REAL NOT NULL DEFAULT 0.05 CHECK (social_security_rate >= 0),
    social_security_wage_ceiling REAL NOT NULL DEFAULT 17500 CHECK (social_security_wage_ceiling >= 0),
    overtime_multiplier REAL NOT NULL DEFAULT 1.5 CHECK (overtime_multiplier >= 0),
    daily_meal_allowance_advance REAL NOT NULL DEFAULT 50 CHECK (daily_meal_allowance_advance >= 0),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,

    FOREIGN KEY (employee_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (updated_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payroll_events (
    payroll_event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    payroll_record_id INTEGER,
    employee_user_id TEXT NOT NULL,
    payroll_month TEXT NOT NULL CHECK (payroll_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    event_date TEXT NOT NULL CHECK (event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'UNPAID_ABSENCE_DAY',
        'UNPAID_ABSENCE_HOUR',
        'OVERTIME_HOUR',
        'EXTRA_WORKED_DAY',
        'SALARY_ADVANCE',
        'BONUS_ADDITION',
        'AUTHORIZED_DEDUCTION'
    )),
    quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
    note TEXT,
    created_by TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (employee_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (created_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (payroll_record_id)
        REFERENCES payroll_records(payroll_record_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_events_employee_month
    ON payroll_events(employee_user_id, payroll_month, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_events_record
    ON payroll_events(payroll_record_id);

CREATE TABLE IF NOT EXISTS payroll_records (
    payroll_record_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_user_id TEXT NOT NULL,
    employee_name_snapshot TEXT NOT NULL,
    payroll_month TEXT NOT NULL CHECK (payroll_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINALIZED')),

    monthly_gross_salary REAL NOT NULL CHECK (monthly_gross_salary >= 0),
    monthly_day_divisor REAL NOT NULL CHECK (monthly_day_divisor > 0),
    normal_hours_per_day REAL NOT NULL CHECK (normal_hours_per_day > 0),
    social_security_applicable INTEGER NOT NULL CHECK (social_security_applicable IN (0, 1)),
    social_security_rate REAL NOT NULL CHECK (social_security_rate >= 0),
    social_security_wage_ceiling REAL NOT NULL CHECK (social_security_wage_ceiling >= 0),
    overtime_multiplier REAL NOT NULL CHECK (overtime_multiplier >= 0),
    daily_meal_allowance_advance REAL NOT NULL CHECK (daily_meal_allowance_advance >= 0),
    days_in_following_month INTEGER NOT NULL CHECK (days_in_following_month IN (28, 29, 30, 31)),

    unpaid_absence_days REAL NOT NULL DEFAULT 0 CHECK (unpaid_absence_days >= 0),
    unpaid_absence_hours REAL NOT NULL DEFAULT 0 CHECK (unpaid_absence_hours >= 0),
    overtime_hours REAL NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
    extra_worked_days REAL NOT NULL DEFAULT 0 CHECK (extra_worked_days >= 0),
    total_overtime_hours REAL NOT NULL DEFAULT 0 CHECK (total_overtime_hours >= 0),
    salary_advances_received REAL NOT NULL DEFAULT 0 CHECK (salary_advances_received >= 0),
    bonuses_additions REAL NOT NULL DEFAULT 0 CHECK (bonuses_additions >= 0),
    authorized_deductions REAL NOT NULL DEFAULT 0 CHECK (authorized_deductions >= 0),
    notes TEXT,

    daily_pay REAL NOT NULL DEFAULT 0,
    hourly_pay REAL NOT NULL DEFAULT 0,
    employee_social_security REAL NOT NULL DEFAULT 0,
    absence_deduction REAL NOT NULL DEFAULT 0,
    overtime_compensation REAL NOT NULL DEFAULT 0,
    meal_allowance_advance REAL NOT NULL DEFAULT 0,
    net_salary_payable REAL NOT NULL DEFAULT 0,
    line_items_json TEXT NOT NULL,
    explanations_json TEXT NOT NULL,
    event_snapshot_json TEXT NOT NULL,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    finalized_at TEXT,
    finalized_by TEXT,
    finalized_by_name TEXT,

    UNIQUE (employee_user_id, payroll_month),

    FOREIGN KEY (employee_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (created_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (updated_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (finalized_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_records_month
    ON payroll_records(payroll_month, status);

CREATE INDEX IF NOT EXISTS idx_payroll_records_employee
    ON payroll_records(employee_user_id, payroll_month DESC);
