-- Permanently remove one unused, never-activated payroll profile and its inactive account.
-- Pre-application audit confirmed no payroll, attendance, documents, bonuses,
-- leave, food-authorisation, snapshot, session, message, social, or accounting data.
-- The sole provisioning audit must be removed to satisfy the explicit erasure request.
DROP TRIGGER IF EXISTS payroll_staff_provisioning_audit_no_delete;

DELETE FROM payroll_staff_account_provisioning_audit
WHERE employee_key = 'EMPLOYEE-0006'
   OR auth_user_id = '9b0f05e4-7a52-4019-bb5d-38701b822e36';

CREATE TRIGGER payroll_staff_provisioning_audit_no_delete
BEFORE DELETE ON payroll_staff_account_provisioning_audit
BEGIN
    SELECT RAISE(ABORT, 'payroll_staff_account_provisioning_audit is append-only');
END;

DELETE FROM payroll_contract_compensation_rules
WHERE profile_version_id IN (
  SELECT profile_version_id
  FROM payroll_contract_profile_versions
  WHERE profile_key = 'PROFILE-0006'
);

DELETE FROM payroll_contract_bonus_rules
WHERE profile_version_id IN (
  SELECT profile_version_id
  FROM payroll_contract_profile_versions
  WHERE profile_key = 'PROFILE-0006'
);

DELETE FROM payroll_employees
WHERE employee_key = 'EMPLOYEE-0006';

DELETE FROM payroll_contract_profile_versions
WHERE profile_key = 'PROFILE-0006';

DELETE FROM payroll_contract_profiles
WHERE profile_key = 'PROFILE-0006';

DELETE FROM users
WHERE user_id = '9b0f05e4-7a52-4019-bb5d-38701b822e36';
