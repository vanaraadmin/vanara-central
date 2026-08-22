-- Vanara Central Payroll contract profiles.
-- All contractual dates below are local calendar dates in Asia/Bangkok.
-- This migration is additive and idempotent. It does not link auth accounts.

CREATE TABLE IF NOT EXISTS payroll_contract_profiles (
    profile_key TEXT PRIMARY KEY,
    profile_status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (profile_status IN ('ACTIVE', 'INACTIVE')),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_contract_profile_versions (
    profile_version_id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_key TEXT NOT NULL,
    version_key TEXT NOT NULL UNIQUE,
    contract_type TEXT NOT NULL
        CHECK (contract_type IN ('INDEFINITE', 'SEASONAL')),
    effective_from_bangkok TEXT NOT NULL
        CHECK (effective_from_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    effective_to_bangkok TEXT
        CHECK (effective_to_bangkok IS NULL OR effective_to_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    calendar_timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok'
        CHECK (calendar_timezone = 'Asia/Bangkok'),
    normal_hours_per_day REAL NOT NULL DEFAULT 8
        CHECK (normal_hours_per_day > 0),
    monthly_day_divisor REAL NOT NULL DEFAULT 30
        CHECK (monthly_day_divisor = 30),
    ordinary_overtime_multiplier REAL NOT NULL DEFAULT 1.5
        CHECK (ordinary_overtime_multiplier > 0),
    rest_day_overtime_multiplier REAL NOT NULL DEFAULT 3
        CHECK (rest_day_overtime_multiplier > 0),
    paid_leave_days REAL NOT NULL DEFAULT 0
        CHECK (paid_leave_days >= 0),
    paid_leave_eligible_after_months INTEGER NOT NULL DEFAULT 0
        CHECK (paid_leave_eligible_after_months >= 0),
    sso_treatment TEXT NOT NULL
        CHECK (sso_treatment IN ('SECTION_33', 'EXEMPT_DECLARED')),
    salary_payment_day INTEGER NOT NULL DEFAULT 2
        CHECK (salary_payment_day BETWEEN 1 AND 28),
    rule_notes TEXT,
    created_at TEXT NOT NULL,

    FOREIGN KEY (profile_key)
        REFERENCES payroll_contract_profiles(profile_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_profile_versions_effective
    ON payroll_contract_profile_versions(
        profile_key,
        effective_from_bangkok,
        effective_to_bangkok
    );

CREATE TABLE IF NOT EXISTS payroll_employees (
    employee_key TEXT PRIMARY KEY,
    profile_key TEXT NOT NULL,
    auth_user_id TEXT UNIQUE,
    employee_status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (employee_status IN ('ACTIVE', 'INACTIVE')),
    created_at TEXT NOT NULL,
    linked_at TEXT,
    linked_by TEXT,

    FOREIGN KEY (profile_key)
        REFERENCES payroll_contract_profiles(profile_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (auth_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    FOREIGN KEY (linked_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_employees_profile
    ON payroll_employees(profile_key, employee_status);

CREATE TABLE IF NOT EXISTS payroll_contract_compensation_rules (
    compensation_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_version_id INTEGER NOT NULL,
    rule_key TEXT NOT NULL UNIQUE,
    effective_from_bangkok TEXT NOT NULL
        CHECK (effective_from_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    effective_to_bangkok TEXT
        CHECK (effective_to_bangkok IS NULL OR effective_to_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    month_mask TEXT,
    monthly_base_salary REAL NOT NULL
        CHECK (monthly_base_salary >= 0),
    monthly_food_allowance REAL NOT NULL DEFAULT 0
        CHECK (monthly_food_allowance >= 0),
    monthly_housing_allowance REAL NOT NULL DEFAULT 0
        CHECK (monthly_housing_allowance >= 0),
    monthly_accommodation_deduction REAL NOT NULL DEFAULT 0
        CHECK (monthly_accommodation_deduction >= 0),
    created_at TEXT NOT NULL,

    FOREIGN KEY (profile_version_id)
        REFERENCES payroll_contract_profile_versions(profile_version_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_compensation_effective
    ON payroll_contract_compensation_rules(
        profile_version_id,
        effective_from_bangkok,
        effective_to_bangkok
    );

CREATE TABLE IF NOT EXISTS payroll_contract_bonus_rules (
    bonus_rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_version_id INTEGER NOT NULL,
    bonus_key TEXT NOT NULL UNIQUE,
    competence_month TEXT NOT NULL
        CHECK (competence_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    payment_date_bangkok TEXT NOT NULL
        CHECK (payment_date_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    amount REAL NOT NULL CHECK (amount > 0),
    label_en TEXT NOT NULL,
    label_th TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (profile_version_id)
        REFERENCES payroll_contract_profile_versions(profile_version_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_bonus_competence_payment
    ON payroll_contract_bonus_rules(
        profile_version_id,
        competence_month,
        payment_date_bangkok
    );

CREATE TABLE IF NOT EXISTS payroll_bonus_consumptions (
    bonus_consumption_id INTEGER PRIMARY KEY AUTOINCREMENT,
    bonus_rule_id INTEGER NOT NULL,
    employee_key TEXT NOT NULL,
    payroll_record_id INTEGER NOT NULL,
    consumed_at TEXT NOT NULL,

    UNIQUE (bonus_rule_id, employee_key),

    FOREIGN KEY (bonus_rule_id)
        REFERENCES payroll_contract_bonus_rules(bonus_rule_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (payroll_record_id)
        REFERENCES payroll_records(payroll_record_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payroll_statutory_sso_parameters (
    sso_parameter_id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_key TEXT NOT NULL UNIQUE,
    effective_from_bangkok TEXT NOT NULL
        CHECK (effective_from_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    effective_to_bangkok TEXT
        CHECK (effective_to_bangkok IS NULL OR effective_to_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    employee_rate REAL NOT NULL CHECK (employee_rate >= 0),
    employer_rate REAL NOT NULL CHECK (employer_rate >= 0),
    wage_ceiling REAL NOT NULL CHECK (wage_ceiling >= 0),
    rounding_mode TEXT NOT NULL DEFAULT 'NEAREST_BAHT'
        CHECK (rounding_mode IN ('NEAREST_BAHT')),
    source_note TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_sso_effective
    ON payroll_statutory_sso_parameters(
        effective_from_bangkok,
        effective_to_bangkok
    );

CREATE TABLE IF NOT EXISTS payroll_attendance_days (
    employee_key TEXT NOT NULL,
    work_date_bangkok TEXT NOT NULL
        CHECK (work_date_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    attendance_status TEXT NOT NULL CHECK (attendance_status IN (
        'WORKED',
        'UNPAID_ABSENCE',
        'PAID_LEAVE',
        'PROTECTED_PAID_LEAVE',
        'WEEKLY_REST'
    )),
    note TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,

    PRIMARY KEY (employee_key, work_date_bangkok),

    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (created_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (updated_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_attendance_status_date
    ON payroll_attendance_days(attendance_status, work_date_bangkok);

CREATE TABLE IF NOT EXISTS payroll_attendance_audit (
    attendance_audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_key TEXT NOT NULL,
    work_date_bangkok TEXT NOT NULL
        CHECK (work_date_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    previous_status TEXT,
    new_status TEXT,
    note TEXT,
    changed_at TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,

    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (changed_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_attendance_audit_employee_date
    ON payroll_attendance_audit(employee_key, work_date_bangkok, changed_at);

CREATE TABLE IF NOT EXISTS payroll_attendance_correction_deltas (
    correction_delta_id INTEGER PRIMARY KEY AUTOINCREMENT,
    attendance_audit_id INTEGER NOT NULL UNIQUE,
    employee_key TEXT NOT NULL,
    origin_month TEXT NOT NULL
        CHECK (origin_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    origin_work_date_bangkok TEXT NOT NULL
        CHECK (origin_work_date_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    salary_delta REAL NOT NULL DEFAULT 0,
    food_delta REAL NOT NULL DEFAULT 0,
    calculation_json TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (attendance_audit_id)
        REFERENCES payroll_attendance_audit(attendance_audit_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_correction_delta_open
    ON payroll_attendance_correction_deltas(employee_key, origin_month);

CREATE TABLE IF NOT EXISTS payroll_attendance_correction_applications (
    correction_application_id INTEGER PRIMARY KEY AUTOINCREMENT,
    correction_delta_id INTEGER NOT NULL UNIQUE,
    payroll_record_id INTEGER NOT NULL,
    applied_at TEXT NOT NULL,

    FOREIGN KEY (correction_delta_id)
        REFERENCES payroll_attendance_correction_deltas(correction_delta_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (payroll_record_id)
        REFERENCES payroll_records(payroll_record_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payroll_paid_leave_entitlements (
    paid_leave_entitlement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_key TEXT NOT NULL,
    leave_year INTEGER NOT NULL CHECK (leave_year BETWEEN 2000 AND 2200),
    profile_version_id INTEGER NOT NULL,
    eligible_from_bangkok TEXT NOT NULL
        CHECK (eligible_from_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    entitled_days REAL NOT NULL CHECK (entitled_days >= 0),
    created_at TEXT NOT NULL,

    UNIQUE (employee_key, leave_year, profile_version_id),

    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (profile_version_id)
        REFERENCES payroll_contract_profile_versions(profile_version_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payroll_paid_leave_ledger (
    paid_leave_ledger_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_key TEXT NOT NULL,
    leave_year INTEGER NOT NULL CHECK (leave_year BETWEEN 2000 AND 2200),
    entry_type TEXT NOT NULL CHECK (entry_type IN (
        'ENTITLEMENT',
        'PAID_LEAVE_USED',
        'ATTENDANCE_CORRECTION',
        'AUTHORIZED_ADJUSTMENT'
    )),
    delta_days REAL NOT NULL,
    work_date_bangkok TEXT
        CHECK (work_date_bangkok IS NULL OR work_date_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    attendance_audit_id INTEGER,
    note TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,

    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (attendance_audit_id)
        REFERENCES payroll_attendance_audit(attendance_audit_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (created_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_paid_leave_ledger_balance
    ON payroll_paid_leave_ledger(employee_key, leave_year, created_at);

CREATE TABLE IF NOT EXISTS payroll_final_food_adjustment_authorizations (
    authorization_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_key TEXT NOT NULL,
    origin_month TEXT NOT NULL
        CHECK (origin_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    authorized_cap REAL NOT NULL CHECK (authorized_cap >= 0),
    authorization_reference TEXT NOT NULL,
    authorized_at TEXT NOT NULL,
    authorized_by TEXT NOT NULL,

    UNIQUE (employee_key, origin_month),

    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (authorized_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payroll_event_rate_overrides (
    payroll_event_id INTEGER PRIMARY KEY,
    rate_multiplier REAL NOT NULL CHECK (rate_multiplier > 0),

    FOREIGN KEY (payroll_event_id)
        REFERENCES payroll_events(payroll_event_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payroll_contract_record_snapshots (
    payroll_record_id INTEGER PRIMARY KEY,
    employee_key TEXT NOT NULL,
    profile_key TEXT NOT NULL,
    profile_version_key TEXT NOT NULL,
    compensation_rule_key TEXT NOT NULL,
    statutory_sso_version_key TEXT,
    contract_type TEXT NOT NULL
        CHECK (contract_type IN ('INDEFINITE', 'SEASONAL')),
    calendar_timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok'
        CHECK (calendar_timezone = 'Asia/Bangkok'),
    monthly_base_salary REAL NOT NULL DEFAULT 0,
    employee_social_security REAL NOT NULL DEFAULT 0,
    employer_social_security REAL NOT NULL DEFAULT 0,
    monthly_food_allowance REAL NOT NULL DEFAULT 0,
    monthly_housing_allowance REAL NOT NULL DEFAULT 0,
    monthly_accommodation_deduction REAL NOT NULL DEFAULT 0,
    prior_month_food_adjustment REAL NOT NULL DEFAULT 0,
    paid_leave_opening REAL NOT NULL DEFAULT 0,
    paid_leave_used REAL NOT NULL DEFAULT 0,
    paid_leave_closing REAL NOT NULL DEFAULT 0,
    rule_snapshot_json TEXT NOT NULL,
    attendance_snapshot_json TEXT NOT NULL,
    correction_snapshot_json TEXT NOT NULL,
    bonus_snapshot_json TEXT NOT NULL,
    finalized_at TEXT NOT NULL,

    FOREIGN KEY (payroll_record_id)
        REFERENCES payroll_records(payroll_record_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS payroll_attendance_audit_no_update
BEFORE UPDATE ON payroll_attendance_audit
BEGIN
    SELECT RAISE(ABORT, 'payroll attendance audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_paid_leave_entitlement_no_update
BEFORE UPDATE ON payroll_paid_leave_entitlements
BEGIN
    SELECT RAISE(ABORT, 'payroll paid leave entitlements are append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_paid_leave_entitlement_no_delete
BEFORE DELETE ON payroll_paid_leave_entitlements
BEGIN
    SELECT RAISE(ABORT, 'payroll paid leave entitlements are append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_correction_application_no_update
BEFORE UPDATE ON payroll_attendance_correction_applications
BEGIN
    SELECT RAISE(ABORT, 'payroll correction applications are immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_correction_application_no_delete
BEFORE DELETE ON payroll_attendance_correction_applications
BEGIN
    SELECT RAISE(ABORT, 'payroll correction applications are immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_final_food_authorization_no_update
BEFORE UPDATE ON payroll_final_food_adjustment_authorizations
BEGIN
    SELECT RAISE(ABORT, 'payroll final food authorizations are immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_final_food_authorization_no_delete
BEFORE DELETE ON payroll_final_food_adjustment_authorizations
BEGIN
    SELECT RAISE(ABORT, 'payroll final food authorizations are immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_attendance_audit_no_delete
BEFORE DELETE ON payroll_attendance_audit
BEGIN
    SELECT RAISE(ABORT, 'payroll attendance audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_correction_delta_no_update
BEFORE UPDATE ON payroll_attendance_correction_deltas
BEGIN
    SELECT RAISE(ABORT, 'payroll correction deltas are append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_correction_delta_no_delete
BEFORE DELETE ON payroll_attendance_correction_deltas
BEGIN
    SELECT RAISE(ABORT, 'payroll correction deltas are append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_paid_leave_ledger_no_update
BEFORE UPDATE ON payroll_paid_leave_ledger
BEGIN
    SELECT RAISE(ABORT, 'payroll paid leave ledger is append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_paid_leave_ledger_no_delete
BEFORE DELETE ON payroll_paid_leave_ledger
BEGIN
    SELECT RAISE(ABORT, 'payroll paid leave ledger is append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_bonus_consumption_no_update
BEFORE UPDATE ON payroll_bonus_consumptions
BEGIN
    SELECT RAISE(ABORT, 'payroll bonus consumption is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_bonus_consumption_no_delete
BEFORE DELETE ON payroll_bonus_consumptions
BEGIN
    SELECT RAISE(ABORT, 'payroll bonus consumption is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_contract_snapshot_no_update
BEFORE UPDATE ON payroll_contract_record_snapshots
BEGIN
    SELECT RAISE(ABORT, 'finalized payroll contract snapshot is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_contract_snapshot_no_delete
BEFORE DELETE ON payroll_contract_record_snapshots
BEGIN
    SELECT RAISE(ABORT, 'finalized payroll contract snapshot is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_finalized_record_no_update
BEFORE UPDATE ON payroll_records
WHEN OLD.status = 'FINALIZED'
BEGIN
    SELECT RAISE(ABORT, 'finalized payroll record is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_finalized_record_no_delete
BEFORE DELETE ON payroll_records
WHEN OLD.status = 'FINALIZED'
BEGIN
    SELECT RAISE(ABORT, 'finalized payroll record is immutable');
END;

INSERT OR IGNORE INTO payroll_statutory_sso_parameters (
    version_key,
    effective_from_bangkok,
    effective_to_bangkok,
    employee_rate,
    employer_rate,
    wage_ceiling,
    rounding_mode,
    source_note,
    created_at
) VALUES (
    'SSO-2026-2028-V1',
    '2026-01-01',
    '2028-12-31',
    0.05,
    0.05,
    17500,
    'NEAREST_BAHT',
    'Section 33 parameters effective 2026-2028; supersede with a later effective-dated migration.',
    CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO payroll_contract_profiles (
    profile_key,
    profile_status,
    created_at
) VALUES
    ('PROFILE-0001', 'ACTIVE', CURRENT_TIMESTAMP),
    ('PROFILE-0002', 'ACTIVE', CURRENT_TIMESTAMP),
    ('PROFILE-0003', 'ACTIVE', CURRENT_TIMESTAMP),
    ('PROFILE-0004', 'ACTIVE', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO payroll_employees (
    employee_key,
    profile_key,
    auth_user_id,
    employee_status,
    created_at,
    linked_at,
    linked_by
) VALUES
    ('EMPLOYEE-0001', 'PROFILE-0001', NULL, 'ACTIVE', CURRENT_TIMESTAMP, NULL, NULL),
    ('EMPLOYEE-0002', 'PROFILE-0002', NULL, 'ACTIVE', CURRENT_TIMESTAMP, NULL, NULL),
    ('EMPLOYEE-0003', 'PROFILE-0003', NULL, 'ACTIVE', CURRENT_TIMESTAMP, NULL, NULL),
    ('EMPLOYEE-0004', 'PROFILE-0004', NULL, 'ACTIVE', CURRENT_TIMESTAMP, NULL, NULL);

INSERT OR IGNORE INTO payroll_contract_profile_versions (
    profile_key,
    version_key,
    contract_type,
    effective_from_bangkok,
    effective_to_bangkok,
    calendar_timezone,
    normal_hours_per_day,
    monthly_day_divisor,
    ordinary_overtime_multiplier,
    rest_day_overtime_multiplier,
    paid_leave_days,
    paid_leave_eligible_after_months,
    sso_treatment,
    salary_payment_day,
    rule_notes,
    created_at
) VALUES
    ('PROFILE-0001', 'PROFILE-0001-2026-09-V1', 'INDEFINITE', '2026-09-01', NULL, 'Asia/Bangkok', 8, 30, 1.5, 3, 6, 12, 'SECTION_33', 2, 'Base weekly rest day: Tuesday. Roster changes require notice.', CURRENT_TIMESTAMP),
    ('PROFILE-0002', 'PROFILE-0002-2026-09-V1', 'INDEFINITE', '2026-09-01', NULL, 'Asia/Bangkok', 8, 30, 1.5, 3, 6, 12, 'SECTION_33', 2, 'Base weekly rest day: Wednesday. Roster changes require notice.', CURRENT_TIMESTAMP),
    ('PROFILE-0003', 'PROFILE-0003-2026-10-V1', 'SEASONAL', '2026-10-01', '2027-04-30', 'Asia/Bangkok', 8, 30, 1.5, 3, 0, 0, 'EXEMPT_DECLARED', 2, 'Base weekly rest day: Thursday. Roster changes require notice.', CURRENT_TIMESTAMP),
    ('PROFILE-0004', 'PROFILE-0004-2026-10-V1', 'SEASONAL', '2026-10-01', '2027-04-30', 'Asia/Bangkok', 8, 30, 1.5, 3, 0, 0, 'SECTION_33', 2, 'Base weekly rest day: Monday. Roster changes require notice.', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO payroll_contract_compensation_rules (
    profile_version_id,
    rule_key,
    effective_from_bangkok,
    effective_to_bangkok,
    month_mask,
    monthly_base_salary,
    monthly_food_allowance,
    monthly_housing_allowance,
    monthly_accommodation_deduction,
    created_at
)
SELECT profile_version_id, 'PROFILE-0001-LOW-V1', '2026-09-01', NULL, '05,06,07,08,09,10', 10620, 0, 0, 1000, CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions WHERE version_key = 'PROFILE-0001-2026-09-V1';

INSERT OR IGNORE INTO payroll_contract_compensation_rules (
    profile_version_id,
    rule_key,
    effective_from_bangkok,
    effective_to_bangkok,
    month_mask,
    monthly_base_salary,
    monthly_food_allowance,
    monthly_housing_allowance,
    monthly_accommodation_deduction,
    created_at
)
SELECT profile_version_id, 'PROFILE-0001-HIGH-V1', '2026-11-01', NULL, '11,12,01,02,03,04', 14000, 1500, 0, 0, CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions WHERE version_key = 'PROFILE-0001-2026-09-V1';

INSERT OR IGNORE INTO payroll_contract_compensation_rules (
    profile_version_id,
    rule_key,
    effective_from_bangkok,
    effective_to_bangkok,
    month_mask,
    monthly_base_salary,
    monthly_food_allowance,
    monthly_housing_allowance,
    monthly_accommodation_deduction,
    created_at
)
SELECT profile_version_id, 'PROFILE-0002-LOW-V1', '2026-09-01', NULL, '05,06,07,08,09,10', 10620, 0, 0, 1000, CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions WHERE version_key = 'PROFILE-0002-2026-09-V1';

INSERT OR IGNORE INTO payroll_contract_compensation_rules (
    profile_version_id,
    rule_key,
    effective_from_bangkok,
    effective_to_bangkok,
    month_mask,
    monthly_base_salary,
    monthly_food_allowance,
    monthly_housing_allowance,
    monthly_accommodation_deduction,
    created_at
)
SELECT profile_version_id, 'PROFILE-0002-HIGH-V1', '2026-11-01', NULL, '11,12,01,02,03,04', 14000, 1500, 0, 0, CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions WHERE version_key = 'PROFILE-0002-2026-09-V1';

INSERT OR IGNORE INTO payroll_contract_compensation_rules (
    profile_version_id,
    rule_key,
    effective_from_bangkok,
    effective_to_bangkok,
    month_mask,
    monthly_base_salary,
    monthly_food_allowance,
    monthly_housing_allowance,
    monthly_accommodation_deduction,
    created_at
)
SELECT profile_version_id, 'PROFILE-0003-OCTOBER-V1', '2026-10-01', '2026-10-31', NULL, 12500, 1500, 0, 0, CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions WHERE version_key = 'PROFILE-0003-2026-10-V1';

INSERT OR IGNORE INTO payroll_contract_compensation_rules (
    profile_version_id,
    rule_key,
    effective_from_bangkok,
    effective_to_bangkok,
    month_mask,
    monthly_base_salary,
    monthly_food_allowance,
    monthly_housing_allowance,
    monthly_accommodation_deduction,
    created_at
)
SELECT profile_version_id, 'PROFILE-0003-NOVEMBER-APRIL-V1', '2026-11-01', '2027-04-30', NULL, 12500, 1500, 2500, 0, CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions WHERE version_key = 'PROFILE-0003-2026-10-V1';

INSERT OR IGNORE INTO payroll_contract_compensation_rules (
    profile_version_id,
    rule_key,
    effective_from_bangkok,
    effective_to_bangkok,
    month_mask,
    monthly_base_salary,
    monthly_food_allowance,
    monthly_housing_allowance,
    monthly_accommodation_deduction,
    created_at
)
SELECT profile_version_id, 'PROFILE-0004-OCTOBER-V1', '2026-10-01', '2026-10-31', NULL, 10620, 0, 0, 0, CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions WHERE version_key = 'PROFILE-0004-2026-10-V1';

INSERT OR IGNORE INTO payroll_contract_compensation_rules (
    profile_version_id,
    rule_key,
    effective_from_bangkok,
    effective_to_bangkok,
    month_mask,
    monthly_base_salary,
    monthly_food_allowance,
    monthly_housing_allowance,
    monthly_accommodation_deduction,
    created_at
)
SELECT profile_version_id, 'PROFILE-0004-NOVEMBER-APRIL-V1', '2026-11-01', '2027-04-30', NULL, 11000, 1500, 1000, 0, CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions WHERE version_key = 'PROFILE-0004-2026-10-V1';

INSERT OR IGNORE INTO payroll_contract_bonus_rules (
    profile_version_id,
    bonus_key,
    competence_month,
    payment_date_bangkok,
    amount,
    label_en,
    label_th,
    created_at
)
SELECT profile_version_id, 'PROFILE-0003-BONUS-001', '2026-10', '2026-11-02', 5000, 'Welcome-back bonus', 'โบนัสต้อนรับกลับมาทำงาน', CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions WHERE version_key = 'PROFILE-0003-2026-10-V1'
UNION ALL
SELECT profile_version_id, 'PROFILE-0003-BONUS-002', '2027-01', '2027-02-02', 5000, 'Season retention bonus', 'โบนัสทำงานต่อเนื่องตามฤดูกาล', CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions WHERE version_key = 'PROFILE-0003-2026-10-V1';
