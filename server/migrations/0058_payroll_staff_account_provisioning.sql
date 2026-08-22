-- Payroll staff account provisioning and forced first-login password change.
-- Employee identities remain opaque; account links are supplied explicitly by an Owner.

CREATE TABLE IF NOT EXISTS user_password_requirements (
    user_id TEXT PRIMARY KEY,
    must_change_password INTEGER NOT NULL DEFAULT 1
        CHECK (must_change_password IN (0, 1)),
    required_at TEXT NOT NULL,
    required_by TEXT NOT NULL,
    password_changed_at TEXT,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (required_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_user_password_requirements_pending
    ON user_password_requirements(must_change_password, required_at);

CREATE TABLE IF NOT EXISTS payroll_staff_account_provisioning_audit (
    provisioning_audit_id TEXT PRIMARY KEY,
    request_key TEXT NOT NULL UNIQUE,
    operation_kind TEXT NOT NULL
        CHECK (operation_kind IN ('CREATE_STAFF_ACCOUNT', 'LINK_EXISTING_ACCOUNT')),
    employee_key TEXT NOT NULL,
    auth_user_id TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    created_at TEXT NOT NULL,

    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (auth_user_id)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (requested_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_staff_provisioning_employee_time
    ON payroll_staff_account_provisioning_audit(employee_key, created_at DESC);

CREATE TRIGGER IF NOT EXISTS payroll_staff_provisioning_link_guard
BEFORE INSERT ON payroll_staff_account_provisioning_audit
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM payroll_employees e
    WHERE e.employee_key = NEW.employee_key
      AND e.auth_user_id = NEW.auth_user_id
      AND e.employee_status = 'ACTIVE'
)
BEGIN
    SELECT RAISE(ABORT, 'payroll_staff_account_link_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS payroll_staff_provisioning_audit_no_update
BEFORE UPDATE ON payroll_staff_account_provisioning_audit
BEGIN
    SELECT RAISE(ABORT, 'payroll_staff_account_provisioning_audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_staff_provisioning_audit_no_delete
BEFORE DELETE ON payroll_staff_account_provisioning_audit
BEGIN
    SELECT RAISE(ABORT, 'payroll_staff_account_provisioning_audit is append-only');
END;
