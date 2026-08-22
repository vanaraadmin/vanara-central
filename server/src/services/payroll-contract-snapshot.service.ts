interface ContractRuleSnapshot {
  contractType?: "INDEFINITE" | "SEASONAL";
  ssoTreatment?: "SECTION_33" | "EXEMPT_DECLARED";
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

interface ContractSnapshotRow {
  employee_key: string;
  profile_version_key: string;
  compensation_rule_key: string;
  contract_type: "INDEFINITE" | "SEASONAL";
  employer_social_security: number;
  monthly_housing_allowance: number;
  monthly_accommodation_deduction: number;
  prior_month_food_adjustment: number;
  paid_leave_opening: number;
  paid_leave_used: number;
  paid_leave_closing: number;
  rule_snapshot_json: string;
}

export interface PayrollContractSnapshotView {
  employerSocialSecurity: number;
  housingAllowance: number;
  accommodationDeduction: number;
  priorMonthFoodAdjustment: number;
  contract: {
    employeeKey: string;
    profileVersionKey: string;
    compensationRuleKey: string;
    contractType: "INDEFINITE" | "SEASONAL";
    ssoTreatment: "SECTION_33" | "EXEMPT_DECLARED";
    effectiveFrom: string;
    effectiveTo: string | null;
    paidLeave: {
      eligible: boolean;
      opening: number;
      used: number;
      closing: number;
    };
  };
}

export function applyPayrollContractSnapshot<T extends object>(
  finalizedCalculation: T,
  snapshot: PayrollContractSnapshotView | null,
): T | (T & PayrollContractSnapshotView) {
  return snapshot ? { ...finalizedCalculation, ...snapshot } : finalizedCalculation;
}

function parseRuleSnapshot(value: string): ContractRuleSnapshot {
  try {
    const parsed = JSON.parse(value) as ContractRuleSnapshot;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function loadPayrollContractSnapshot(
  db: D1Database,
  payrollRecordId: number,
): Promise<PayrollContractSnapshotView | null> {
  const row = await db.prepare(`
    SELECT employee_key, profile_version_key, compensation_rule_key,
           contract_type, employer_social_security,
           monthly_housing_allowance, monthly_accommodation_deduction,
           prior_month_food_adjustment, paid_leave_opening,
           paid_leave_used, paid_leave_closing, rule_snapshot_json
    FROM payroll_contract_record_snapshots
    WHERE payroll_record_id = ?
  `).bind(payrollRecordId).first<ContractSnapshotRow>();
  if (!row) return null;

  const rule = parseRuleSnapshot(row.rule_snapshot_json);
  const contractType = rule.contractType ?? row.contract_type;
  const opening = Number(row.paid_leave_opening);
  const used = Number(row.paid_leave_used);
  const closing = Number(row.paid_leave_closing);
  return {
    employerSocialSecurity: Number(row.employer_social_security),
    housingAllowance: Number(row.monthly_housing_allowance),
    accommodationDeduction: Number(row.monthly_accommodation_deduction),
    priorMonthFoodAdjustment: Number(row.prior_month_food_adjustment),
    contract: {
      employeeKey: row.employee_key,
      profileVersionKey: row.profile_version_key,
      compensationRuleKey: row.compensation_rule_key,
      contractType,
      ssoTreatment: rule.ssoTreatment ?? "SECTION_33",
      effectiveFrom: rule.effectiveFrom ?? "",
      effectiveTo: rule.effectiveTo ?? null,
      paidLeave: {
        eligible: contractType === "INDEFINITE" && opening + used + closing > 0,
        opening,
        used,
        closing,
      },
    },
  };
}
