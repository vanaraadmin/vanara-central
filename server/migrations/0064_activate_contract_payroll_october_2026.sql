-- Owner-authorized rollout of the contract-backed payroll runtime.
-- Payroll starts with the October 2026 competence month.  Contract terms remain
-- the source of truth; this only opens the calculation runtime for linked staff.

-- Mark receives on-site accommodation in October 2026, so no cash housing
-- allowance is due for that month.  His contractual cash housing allowance
-- resumes from November 2026 through the end of the seasonal contract.
UPDATE payroll_contract_compensation_rules
SET effective_from_bangkok = '2026-11-01'
WHERE rule_key = 'PROFILE-0007-SEASON-V1'
  AND effective_from_bangkok = '2026-10-01'
  AND effective_to_bangkok = '2027-04-30';

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
SELECT
    profile_version_id,
    'PROFILE-0007-OCTOBER-ONSITE-ACCOMMODATION-V1',
    '2026-10-01',
    '2026-10-31',
    NULL,
    14000,
    1500,
    0,
    0,
    CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions
WHERE version_key = 'PROFILE-0007-2026-10-V1';

-- Explicit authorization recorded 2026-09-29 by the Owner account.
INSERT OR IGNORE INTO payroll_contract_runtime_activations (
    employee_key,
    active_from_bangkok,
    activation_reference,
    activated_at,
    activated_by
)
SELECT
    employee_key,
    '2026-10-01',
    'owner-approved-contract-payroll-october-2026',
    '2026-09-29T00:00:00.000Z',
    'owner-bootstrap'
FROM payroll_employees
WHERE employee_key IN (
    'EMPLOYEE-0001', 'EMPLOYEE-0002', 'EMPLOYEE-0003',
    'EMPLOYEE-0004', 'EMPLOYEE-0005', 'EMPLOYEE-0007'
);
