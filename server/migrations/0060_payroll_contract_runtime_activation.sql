-- Explicit activation gate for contract-backed payroll runtime.
-- Account links, document links, and contract effective dates never enable the runtime.

CREATE TABLE IF NOT EXISTS payroll_contract_runtime_activations (
    employee_key TEXT PRIMARY KEY,
    active_from_bangkok TEXT NOT NULL
        CHECK (active_from_bangkok GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    activation_reference TEXT NOT NULL,
    activated_at TEXT NOT NULL,
    activated_by TEXT NOT NULL,

    FOREIGN KEY (employee_key)
        REFERENCES payroll_employees(employee_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    FOREIGN KEY (activated_by)
        REFERENCES users(user_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS payroll_contract_runtime_activation_no_update
BEFORE UPDATE ON payroll_contract_runtime_activations
BEGIN
    SELECT RAISE(ABORT, 'payroll contract runtime activation is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_contract_runtime_activation_no_delete
BEFORE DELETE ON payroll_contract_runtime_activations
BEGIN
    SELECT RAISE(ABORT, 'payroll contract runtime activation is immutable');
END;
