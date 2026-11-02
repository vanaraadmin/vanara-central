-- Owner-authorized erasure of the departed EMPLOYEE-0005 account and payroll profile.
-- This profile has no finalized payroll history. Remove its private contract object separately from R2.

DROP TRIGGER IF EXISTS payroll_contract_document_no_delete;
DROP TRIGGER IF EXISTS payroll_contract_access_audit_no_delete;
DROP TRIGGER IF EXISTS payroll_contract_runtime_activation_no_delete;
DROP TRIGGER IF EXISTS payroll_staff_provisioning_audit_no_delete;

DELETE FROM payroll_contract_document_access_audit
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_contract_documents
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_staff_account_provisioning_audit
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_contract_runtime_activations
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_events
WHERE employee_user_id = (SELECT user_id FROM users WHERE username = 'sarawut');

DELETE FROM payroll_final_food_adjustment_authorizations
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_paid_leave_ledger
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_paid_leave_entitlements
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_attendance_correction_applications
WHERE correction_delta_id IN (
    SELECT correction_delta_id FROM payroll_attendance_correction_deltas WHERE employee_key = 'EMPLOYEE-0005'
);

DELETE FROM payroll_attendance_correction_deltas
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_attendance_audit
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_attendance_days
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_bonus_consumptions
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_contract_bonus_rules
WHERE profile_version_id IN (
    SELECT profile_version_id FROM payroll_contract_profile_versions WHERE profile_key = 'PROFILE-0005'
);

DELETE FROM payroll_contract_compensation_rules
WHERE profile_version_id IN (
    SELECT profile_version_id FROM payroll_contract_profile_versions WHERE profile_key = 'PROFILE-0005'
);

DELETE FROM payroll_employees
WHERE employee_key = 'EMPLOYEE-0005';

DELETE FROM payroll_contract_profile_versions
WHERE profile_key = 'PROFILE-0005';

DELETE FROM payroll_contract_profiles
WHERE profile_key = 'PROFILE-0005';

DELETE FROM user_password_requirements
WHERE user_id = (SELECT user_id FROM users WHERE username = 'sarawut');

DELETE FROM users
WHERE username = 'sarawut';

CREATE TRIGGER IF NOT EXISTS payroll_contract_document_no_delete
BEFORE DELETE ON payroll_contract_documents
BEGIN
    SELECT RAISE(ABORT, 'payroll contract document metadata is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_contract_access_audit_no_delete
BEFORE DELETE ON payroll_contract_document_access_audit
BEGIN
    SELECT RAISE(ABORT, 'payroll contract access audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS payroll_contract_runtime_activation_no_delete
BEFORE DELETE ON payroll_contract_runtime_activations
BEGIN
    SELECT RAISE(ABORT, 'payroll contract runtime activation is immutable');
END;

CREATE TRIGGER IF NOT EXISTS payroll_staff_provisioning_audit_no_delete
BEFORE DELETE ON payroll_staff_account_provisioning_audit
BEGIN
    SELECT RAISE(ABORT, 'payroll_staff_account_provisioning_audit is append-only');
END;
