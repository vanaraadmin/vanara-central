import type { CurrentUser } from "./current-user.service.js";
import type { ContractPayrollPolicyResult } from "./payroll-contract-policy.service.js";

export interface FinalizeContractPayrollInput {
  recordId: number;
  employeeUserId: string;
  payrollMonth: string;
  calculation: ContractPayrollPolicyResult;
  user: CurrentUser;
  now: string;
}

export async function finalizeContractPayrollRecord(
  db: D1Database,
  input: FinalizeContractPayrollInput,
): Promise<void> {
  const { calculation, now, recordId, user } = input;
  const descriptor = calculation.descriptor;
  const statements: D1PreparedStatement[] = [
    db.prepare(`
      UPDATE payroll_records
      SET status = 'FINALIZED',
          finalized_at = ?, finalized_by = ?, finalized_by_name = ?,
          updated_at = ?, updated_by = ?
      WHERE payroll_record_id = ? AND status = 'DRAFT'
    `).bind(now, user.id, user.displayName, now, user.id, recordId),
    db.prepare(`
      INSERT INTO payroll_contract_record_snapshots (
        payroll_record_id, employee_key, profile_key, profile_version_key,
        compensation_rule_key, statutory_sso_version_key, contract_type,
        calendar_timezone, monthly_base_salary, employee_social_security,
        employer_social_security, monthly_food_allowance,
        monthly_housing_allowance, monthly_accommodation_deduction,
        prior_month_food_adjustment, paid_leave_opening, paid_leave_used,
        paid_leave_closing, rule_snapshot_json, attendance_snapshot_json,
        correction_snapshot_json, bonus_snapshot_json, finalized_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      recordId,
      descriptor.employeeKey,
      descriptor.profileKey,
      descriptor.profileVersionKey,
      descriptor.compensationRuleKey,
      descriptor.ssoVersionKey,
      descriptor.contractType,
      descriptor.calendarTimezone,
      descriptor.monthlyBaseSalary,
      calculation.employeeSocialSecurity,
      calculation.employerSocialSecurity,
      calculation.mealAllowanceAdvance,
      calculation.housingAllowance,
      calculation.accommodationDeduction,
      calculation.priorMonthFoodAdjustment,
      calculation.paidLeave.opening,
      calculation.paidLeave.used,
      calculation.paidLeave.closing,
      JSON.stringify(descriptor),
      JSON.stringify(calculation.attendance),
      JSON.stringify({
        deltaIds: calculation.correctionDeltaIds,
        amount: calculation.attendanceCorrectionDelta,
      }),
      JSON.stringify({
        ruleIds: calculation.bonusRuleIds,
        amount: calculation.contractBonusTotal,
      }),
      now,
    ),
    db.prepare(`
      UPDATE payroll_events
      SET payroll_record_id = ?
      WHERE employee_user_id = ? AND payroll_month = ? AND payroll_record_id IS NULL
    `).bind(recordId, input.employeeUserId, input.payrollMonth),
  ];

  for (const bonusRuleId of calculation.bonusRuleIds) {
    statements.push(db.prepare(`
      INSERT INTO payroll_bonus_consumptions (
        bonus_rule_id, employee_key, payroll_record_id, consumed_at
      ) VALUES (?, ?, ?, ?)
    `).bind(bonusRuleId, descriptor.employeeKey, recordId, now));
  }
  for (const correctionDeltaId of calculation.correctionDeltaIds) {
    statements.push(db.prepare(`
      INSERT INTO payroll_attendance_correction_applications (
        correction_delta_id, payroll_record_id, applied_at
      ) VALUES (?, ?, ?)
    `).bind(correctionDeltaId, recordId, now));
  }

  await db.batch(statements);
}
