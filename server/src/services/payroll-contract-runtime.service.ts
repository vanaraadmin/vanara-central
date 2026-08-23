import {
  PayrollContractAccountLinkRequiredError,
  calculateContractPayrollPolicy,
  loadContractPayrollPolicy,
  saveContractAttendance,
  type ContractPayrollEvent,
  type ContractPayrollPolicyResult,
  type PayrollAttendanceStatus,
  type SavePayrollAttendanceInput,
} from "./payroll-contract-policy.service.js";

interface ContractEmployeeRow {
  employee_key: string;
  profile_key: string;
  auth_user_id: string | null;
}

export interface ContractRuntimeIdentity {
  employeeKey: string;
  profileKey: string;
  authUserId: string;
}

export interface ContractRuntimeEvent {
  id: number;
  eventType: ContractPayrollEvent["eventType"];
  quantity: number;
  amount: number;
  rateMultiplier?: number | null;
}

function payrollMonthEnd(payrollMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(payrollMonth);
  if (!match) throw new Error("Payroll month is invalid.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Payroll month is invalid.");
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${payrollMonth}-${String(day).padStart(2, "0")}`;
}

export async function resolveContractRuntimeIdentity(
  db: D1Database,
  employeeIdentifier: string,
): Promise<ContractRuntimeIdentity | null> {
  const row = await db.prepare(`
    SELECT employee_key, profile_key, auth_user_id
    FROM payroll_employees
    WHERE employee_status = 'ACTIVE'
      AND (employee_key = ? OR auth_user_id = ?)
  `).bind(employeeIdentifier, employeeIdentifier).first<ContractEmployeeRow>();
  if (!row) return null;
  if (!row.auth_user_id) throw new PayrollContractAccountLinkRequiredError(row.employee_key);
  return {
    employeeKey: row.employee_key,
    profileKey: row.profile_key,
    authUserId: row.auth_user_id,
  };
}

export async function resolveContractRuntimeActivation(
  db: D1Database,
  employeeIdentifier: string,
  payrollMonth: string,
): Promise<ContractRuntimeIdentity | null> {
  const identity = await resolveContractRuntimeIdentity(db, employeeIdentifier);
  if (!identity) return null;
  const activation = await db.prepare(`
    SELECT employee_key
    FROM payroll_contract_runtime_activations
    WHERE employee_key = ?
      AND active_from_bangkok <= ?
  `).bind(identity.employeeKey, payrollMonthEnd(payrollMonth)).first<{ employee_key: string }>();
  return activation ? identity : null;
}

export async function calculateContractRuntimePayroll(
  db: D1Database,
  employeeIdentifier: string,
  payrollMonth: string,
  events: ContractRuntimeEvent[],
): Promise<ContractPayrollPolicyResult | null> {
  const identity = await resolveContractRuntimeActivation(db, employeeIdentifier, payrollMonth);
  if (!identity) return null;
  const policy = await loadContractPayrollPolicy(db, identity.authUserId, payrollMonth);
  if (!policy) {
    throw new Error(`Contract payroll profile could not be loaded for ${identity.employeeKey}.`);
  }
  policy.events = events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    quantity: event.quantity,
    amount: event.amount,
    rateMultiplier: event.rateMultiplier,
  }));
  return calculateContractPayrollPolicy(policy);
}

export async function saveContractRuntimeAttendance(
  db: D1Database,
  employeeIdentifier: string,
  input: SavePayrollAttendanceInput,
  actorUserId: string,
  now: string,
): Promise<{ date: string; status: PayrollAttendanceStatus }> {
  const identity = await resolveContractRuntimeActivation(db, employeeIdentifier, input.workDate.slice(0, 7));
  if (!identity) throw new Error("Contract payroll runtime is not active.");

  const idempotencyKey = input.idempotencyKey.trim().slice(0, 200);
  const prior = await db.prepare(`
    SELECT employee_key, work_date_bangkok, new_status
    FROM payroll_attendance_audit
    WHERE idempotency_key = ?
  `).bind(idempotencyKey).first<{
    employee_key: string;
    work_date_bangkok: string;
    new_status: PayrollAttendanceStatus;
  }>();
  if (prior) {
    if (
      prior.employee_key !== identity.employeeKey
      || prior.work_date_bangkok !== input.workDate
      || prior.new_status !== input.status
    ) {
      throw new Error("Attendance idempotency key is already used for a different change.");
    }
    return { date: prior.work_date_bangkok, status: prior.new_status };
  }

  return saveContractAttendance(db, identity.authUserId, {
    ...input,
    idempotencyKey,
  }, actorUserId, now);
}
