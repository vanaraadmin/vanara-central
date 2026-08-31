-- Add the fifth opaque payroll contract profile without linking an auth account.
-- Contract runtime activation remains a separate, explicit Owner-approved action.

INSERT OR IGNORE INTO payroll_contract_profiles (
    profile_key,
    profile_status,
    created_at
) VALUES (
    'PROFILE-0005',
    'ACTIVE',
    CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO payroll_employees (
    employee_key,
    profile_key,
    auth_user_id,
    employee_status,
    created_at,
    linked_at,
    linked_by
) VALUES (
    'EMPLOYEE-0005',
    'PROFILE-0005',
    NULL,
    'ACTIVE',
    CURRENT_TIMESTAMP,
    NULL,
    NULL
);

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
) VALUES (
    'PROFILE-0005',
    'PROFILE-0005-2026-10-V1',
    'SEASONAL',
    '2026-10-01',
    '2027-04-30',
    'Asia/Bangkok',
    8,
    30,
    1.5,
    3,
    0,
    0,
    'SECTION_33',
    2,
    'Base weekly rest day: Friday. Roster changes require notice.',
    CURRENT_TIMESTAMP
);

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
    'PROFILE-0005-SEASON-V1',
    '2026-10-01',
    '2027-04-30',
    NULL,
    13500,
    1500,
    0,
    0,
    CURRENT_TIMESTAMP
FROM payroll_contract_profile_versions
WHERE version_key = 'PROFILE-0005-2026-10-V1';
