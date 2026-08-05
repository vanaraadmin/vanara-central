import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import { addPayrollEvent, finalizePayroll, loadPayrollOverview, payrollPdfUrl, savePayrollDraft, savePayrollSettings } from "../services/payroll.service";
import type { PayrollCalculation, PayrollEvent, PayrollEventType, PayrollSettings, PayrollWorker } from "../types/payroll";
import "../styles/PayrollPage.css";

const eventLabels: Record<PayrollEventType, string> = {
  UNPAID_ABSENCE_DAY: "Unpaid absence days",
  UNPAID_ABSENCE_HOUR: "Unpaid absence hours",
  OVERTIME_HOUR: "Overtime hours",
  EXTRA_WORKED_DAY: "Extra worked days",
  SALARY_ADVANCE: "Salary advance",
  BONUS_ADDITION: "Bonus / addition",
  AUTHORIZED_DEDUCTION: "Authorized deduction",
};

const eventOptions: PayrollEventType[] = [
  "UNPAID_ABSENCE_DAY",
  "UNPAID_ABSENCE_HOUR",
  "OVERTIME_HOUR",
  "EXTRA_WORKED_DAY",
  "SALARY_ADVANCE",
  "BONUS_ADDITION",
  "AUTHORIZED_DEDUCTION",
];

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? String(new Date().getUTCFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(new Date().getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function money(value: number): string {
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
}

function signedMoney(value: number): string {
  if (value < 0) return `- ${money(Math.abs(value))}`;
  return `+ ${money(value)}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function daysInFollowingMonth(month: string): number {
  const [yearRaw, monthRaw] = month.split("-");
  return new Date(Date.UTC(Number(yearRaw), Number(monthRaw) + 1, 0)).getUTCDate();
}

function dateBoundsForMonth(month: string): { min: string; max: string } {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw);
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return { min: `${month}-01`, max: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function defaultEventDate(month: string): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = today.find((part) => part.type === "year")?.value ?? "";
  const monthPart = today.find((part) => part.type === "month")?.value ?? "";
  const day = today.find((part) => part.type === "day")?.value ?? "";
  const bangkokToday = `${year}-${monthPart}-${day}`;
  const bounds = dateBoundsForMonth(month);
  if (bangkokToday >= bounds.min && bangkokToday <= bounds.max) return bangkokToday;
  return bangkokToday < bounds.min ? bounds.min : bounds.max;
}

function calculate(settings: PayrollSettings, events: PayrollEvent[], payrollMonth: string): PayrollCalculation {
  const unpaidAbsenceDays = events.filter((event) => event.eventType === "UNPAID_ABSENCE_DAY").reduce((sum, event) => sum + event.quantity, 0);
  const unpaidAbsenceHours = events.filter((event) => event.eventType === "UNPAID_ABSENCE_HOUR").reduce((sum, event) => sum + event.quantity, 0);
  const overtimeHours = events.filter((event) => event.eventType === "OVERTIME_HOUR").reduce((sum, event) => sum + event.quantity, 0);
  const extraWorkedDays = events.filter((event) => event.eventType === "EXTRA_WORKED_DAY").reduce((sum, event) => sum + event.quantity, 0);
  const salaryAdvancesReceived = events.filter((event) => event.eventType === "SALARY_ADVANCE").reduce((sum, event) => sum + event.amount, 0);
  const bonusesAdditions = events.filter((event) => event.eventType === "BONUS_ADDITION").reduce((sum, event) => sum + event.amount, 0);
  const authorizedDeductions = events.filter((event) => event.eventType === "AUTHORIZED_DEDUCTION").reduce((sum, event) => sum + event.amount, 0);
  const totalOvertimeHours = overtimeHours + extraWorkedDays * settings.normalHoursPerDay;
  const followingDays = daysInFollowingMonth(payrollMonth);
  const dailyPay = roundMoney(settings.monthlyGrossSalary / settings.monthlyDayDivisor);
  const hourlyPay = roundMoney(settings.monthlyGrossSalary / settings.monthlyDayDivisor / settings.normalHoursPerDay);
  const employeeSocialSecurity = roundMoney(settings.socialSecurityApplicable ? Math.min(settings.monthlyGrossSalary, settings.socialSecurityWageCeiling) * settings.socialSecurityRate : 0);
  const absenceDeduction = roundMoney(unpaidAbsenceDays * dailyPay + unpaidAbsenceHours * hourlyPay);
  const overtimeCompensation = roundMoney(totalOvertimeHours * hourlyPay * settings.overtimeMultiplier);
  const mealAllowanceAdvance = roundMoney(followingDays * settings.dailyMealAllowanceAdvance);
  const netSalaryPayable = roundMoney(settings.monthlyGrossSalary - employeeSocialSecurity - absenceDeduction + overtimeCompensation - salaryAdvancesReceived + mealAllowanceAdvance + bonusesAdditions - authorizedDeductions);
  const lineItems = [
    { label: "Monthly gross salary", amount: settings.monthlyGrossSalary, tone: "addition" as const, explanation: `Monthly salary: ${money(settings.monthlyGrossSalary)}`, thaiLabel: "เงินเดือนรวมรายเดือน", thaiExplanation: `เงินเดือนรายเดือน ${money(settings.monthlyGrossSalary)}` },
    { label: "Employee Social Security", amount: -employeeSocialSecurity, tone: "deduction" as const, explanation: settings.socialSecurityApplicable ? `${(settings.socialSecurityRate * 100).toFixed(2)}% of ${money(Math.min(settings.monthlyGrossSalary, settings.socialSecurityWageCeiling))}` : "Not applied", thaiLabel: "ประกันสังคมพนักงาน", thaiExplanation: settings.socialSecurityApplicable ? `${(settings.socialSecurityRate * 100).toFixed(2)}%` : "ไม่ใช้" },
    { label: "Unpaid absences", amount: -absenceDeduction, tone: "deduction" as const, explanation: `${unpaidAbsenceDays.toFixed(2)} days x ${money(dailyPay)} + ${unpaidAbsenceHours.toFixed(2)} hours x ${money(hourlyPay)}`, thaiLabel: "หักขาดงานไม่รับค่าจ้าง", thaiExplanation: "คำนวณจากวันและชั่วโมงที่ไม่ได้รับค่าจ้าง" },
    { label: "Overtime compensation", amount: overtimeCompensation, tone: "addition" as const, explanation: `${totalOvertimeHours.toFixed(2)} hours x ${money(hourlyPay)} x ${settings.overtimeMultiplier.toFixed(2)}`, thaiLabel: "ค่าล่วงเวลา", thaiExplanation: "รวมชั่วโมงโอทีและวันทำงานพิเศษ" },
    { label: "Salary advances already received", amount: -salaryAdvancesReceived, tone: "deduction" as const, explanation: "Advances already paid during the month", thaiLabel: "หักเงินล่วงหน้า", thaiExplanation: "เงินล่วงหน้าที่ได้รับแล้ว" },
    { label: "Following-month meal allowance advance", amount: mealAllowanceAdvance, tone: "addition" as const, explanation: `${followingDays} days x ${money(settings.dailyMealAllowanceAdvance)}`, thaiLabel: "ค่าอาหารล่วงหน้าเดือนถัดไป", thaiExplanation: "คำนวณตามจำนวนวันของเดือนถัดไป" },
    { label: "Bonuses / other additions", amount: bonusesAdditions, tone: "addition" as const, explanation: "Authorized additions recorded for this payroll month", thaiLabel: "โบนัส / รายการเพิ่มอื่น", thaiExplanation: "รายการเพิ่มที่ได้รับอนุมัติ" },
    { label: "Other authorized deductions", amount: -authorizedDeductions, tone: "deduction" as const, explanation: "Authorized deductions recorded for this payroll month", thaiLabel: "รายการหักอื่นที่ได้รับอนุมัติ", thaiExplanation: "รายการหักที่ได้รับอนุมัติ" },
    { label: "Net salary payable", amount: netSalaryPayable, tone: "total" as const, explanation: "Final amount payable", thaiLabel: "เงินเดือนสุทธิที่ต้องจ่าย", thaiExplanation: "จำนวนเงินสุดท้ายที่ต้องจ่าย" },
  ];
  return {
    settings,
    aggregates: { unpaidAbsenceDays, unpaidAbsenceHours, overtimeHours, extraWorkedDays, totalOvertimeHours, salaryAdvancesReceived, bonusesAdditions, authorizedDeductions },
    daysInFollowingMonth: followingDays,
    dailyPay,
    hourlyPay,
    employeeSocialSecurity,
    absenceDeduction,
    overtimeCompensation,
    mealAllowanceAdvance,
    netSalaryPayable,
    lineItems,
  };
}

function NumberField({ disabled, label, onChange, step = "0.01", value }: { disabled?: boolean; label: string; onChange(value: number): void; step?: string; value: number }) {
  return (
    <label className="payroll-field">
      <span>{label}</span>
      <input disabled={disabled} min="0" step={step} type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Math.max(0, Number(event.target.value)))} />
    </label>
  );
}

function WorkerCard({ active, onSelect, worker }: { active: boolean; onSelect(): void; worker: PayrollWorker }) {
  const calculation = worker.calculation;
  const initials = worker.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || worker.username.slice(0, 2).toUpperCase();
  return (
    <button className={active ? "payroll-worker payroll-worker--active" : "payroll-worker"} onClick={onSelect} type="button">
      <span className="payroll-worker__avatar">{worker.profilePhotoUrl ? <img alt="" src={worker.profilePhotoUrl} /> : initials}</span>
      <span className="payroll-worker__main">
        <strong>{worker.fullName}</strong>
        <small>@{worker.username} - {worker.role}</small>
        <span>{money(worker.settings.monthlyGrossSalary)} base - SS {worker.settings.socialSecurityApplicable ? "Yes" : "No"}</span>
      </span>
      <span className="payroll-worker__meta">
        <strong>{money(calculation.netSalaryPayable)}</strong>
        <small>{calculation.aggregates.extraWorkedDays.toFixed(2)} extra days / {calculation.aggregates.totalOvertimeHours.toFixed(2)} OT hrs</small>
        <small>{calculation.aggregates.unpaidAbsenceDays.toFixed(2)} absence days / {money(calculation.aggregates.salaryAdvancesReceived)} advances</small>
      </span>
    </button>
  );
}

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const [payrollMonth, setPayrollMonth] = useState(currentMonth());
  const [selectedId, setSelectedId] = useState<string>("");
  const [settingsDraft, setSettingsDraft] = useState<PayrollSettings | null>(null);
  const [eventType, setEventType] = useState<PayrollEventType>("UNPAID_ABSENCE_DAY");
  const [eventDate, setEventDate] = useState(defaultEventDate(currentMonth()));
  const [eventValue, setEventValue] = useState(0);
  const [eventNote, setEventNote] = useState("");
  const [recordNotes, setRecordNotes] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ["payroll", "overview", payrollMonth],
    queryFn: ({ signal }) => loadPayrollOverview(payrollMonth, signal),
  });
  const workers = overview.data?.workers ?? [];
  const selected = workers.find((worker) => worker.id === selectedId) ?? null;
  const locked = selected?.record?.status === "FINALIZED";
  const eventDateBounds = useMemo(() => dateBoundsForMonth(payrollMonth), [payrollMonth]);

  const calculation = useMemo(() => {
    if (!selected) return null;
    if (selected.record?.status === "FINALIZED") return selected.record.calculation;
    return settingsDraft ? calculate(settingsDraft, selected.events, payrollMonth) : selected.calculation;
  }, [payrollMonth, selected, settingsDraft]);

  const refreshPayroll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["payroll"] });
    await queryClient.invalidateQueries({ queryKey: ["staff", "overview"] });
  };

  const settingsMutation = useMutation({
    mutationFn: () => selected && settingsDraft ? savePayrollSettings(selected.id, settingsDraft) : Promise.reject(new Error("Select a worker")),
    onSuccess: async () => {
      setNotice("Settings saved");
      await refreshPayroll();
    },
  });
  const eventMutation = useMutation({
    mutationFn: () => selected ? addPayrollEvent(selected.id, {
      payrollMonth,
      eventDate,
      eventType,
      quantity: eventType === "SALARY_ADVANCE" || eventType === "BONUS_ADDITION" || eventType === "AUTHORIZED_DEDUCTION" ? 0 : eventValue,
      amount: eventType === "SALARY_ADVANCE" || eventType === "BONUS_ADDITION" || eventType === "AUTHORIZED_DEDUCTION" ? eventValue : 0,
      note: eventNote || null,
    }) : Promise.reject(new Error("Select a worker")),
    onSuccess: async () => {
      setNotice("Event added");
      setEventValue(0);
      setEventNote("");
      await refreshPayroll();
    },
    onError: (error) => {
      setNotice(error instanceof Error && error.message.includes("date") ? "Choose a date in this payroll month" : null);
    },
  });
  const draftMutation = useMutation({
    mutationFn: () => selected ? savePayrollDraft(selected.id, payrollMonth, recordNotes || null) : Promise.reject(new Error("Select a worker")),
    onSuccess: async () => {
      setNotice("Draft saved");
      await refreshPayroll();
    },
  });
  const finalizeMutation = useMutation({
    mutationFn: () => selected ? finalizePayroll(selected.id, payrollMonth, recordNotes || null) : Promise.reject(new Error("Select a worker")),
    onSuccess: async () => {
      setNotice("Payroll finalized");
      await refreshPayroll();
    },
  });

  function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locked && eventValue > 0) eventMutation.mutate();
  }

  return (
    <WorkspaceShell title="Payroll" stickyNavigationTitle="Payroll" workspace="payroll" bodyClassName="payroll-page" wide>
      <VanaraGlassRegion className="payroll-workers" ariaLabelledBy="payroll-workers-title">
        <VanaraSectionHeader eyebrow="Owner" headingId="payroll-workers-title" meta={payrollMonth} title="Staff Payroll" />
        <label className="payroll-month">
          <span>Payroll month</span>
          <input type="month" value={payrollMonth} onChange={(event) => { setPayrollMonth(event.target.value); setSelectedId(""); setSettingsDraft(null); setRecordNotes(""); setEventDate(defaultEventDate(event.target.value)); setNotice(null); }} />
        </label>
        {overview.isLoading ? <PageLoading /> : null}
        {overview.isError ? <PageError onRetry={() => void overview.refetch()} /> : null}
        <div className="payroll-worker-list">
          {workers.map((worker) => (
            <WorkerCard active={worker.id === selectedId} key={worker.id} onSelect={() => { setNotice(null); setSelectedId(worker.id); setSettingsDraft(worker.settings); setRecordNotes(worker.record?.notes ?? ""); }} worker={worker} />
          ))}
        </div>
      </VanaraGlassRegion>

      <VanaraGlassRegion className="payroll-detail" ariaLabelledBy="payroll-detail-title">
        <VanaraSectionHeader eyebrow={selected ? selected.role : "Select"} headingId="payroll-detail-title" meta={locked ? "Finalized" : "Draft"} title={selected ? selected.fullName : "Worker Detail"} />
        {!selected || !settingsDraft || !calculation ? (
          <section className="payroll-empty">
            <h2>Select a worker</h2>
            <p>Open one staff profile to set salary, record monthly events and generate the payroll statement.</p>
          </section>
        ) : (
          <>
            <section className="payroll-net" aria-label="Payroll net payable">
              <span>Net Salary Payable</span>
              <strong>{money(calculation.netSalaryPayable)}</strong>
              <small>{locked ? `Finalized ${selected.record?.finalizedAt ? new Date(selected.record.finalizedAt).toLocaleDateString("en-GB") : ""}` : "Live estimate"}</small>
              <small>Can be generated before month end using events recorded so far.</small>
            </section>

            <section className="payroll-settings" aria-label="Worker payroll settings">
              <h3>Worker settings</h3>
              <div className="payroll-form-grid">
                <NumberField label="Monthly gross salary" onChange={(value) => setSettingsDraft({ ...settingsDraft, monthlyGrossSalary: value })} value={settingsDraft.monthlyGrossSalary} />
                <NumberField label="Monthly day divisor" onChange={(value) => setSettingsDraft({ ...settingsDraft, monthlyDayDivisor: value || 30 })} value={settingsDraft.monthlyDayDivisor} />
                <NumberField label="Normal hours / day" onChange={(value) => setSettingsDraft({ ...settingsDraft, normalHoursPerDay: value || 8 })} value={settingsDraft.normalHoursPerDay} />
                <NumberField label="SS rate" onChange={(value) => setSettingsDraft({ ...settingsDraft, socialSecurityRate: value })} step="0.001" value={settingsDraft.socialSecurityRate} />
                <NumberField label="SS wage ceiling" onChange={(value) => setSettingsDraft({ ...settingsDraft, socialSecurityWageCeiling: value })} value={settingsDraft.socialSecurityWageCeiling} />
                <NumberField label="Overtime multiplier" onChange={(value) => setSettingsDraft({ ...settingsDraft, overtimeMultiplier: value })} value={settingsDraft.overtimeMultiplier} />
                <NumberField label="Meal / day advance" onChange={(value) => setSettingsDraft({ ...settingsDraft, dailyMealAllowanceAdvance: value })} value={settingsDraft.dailyMealAllowanceAdvance} />
                <label className="payroll-field payroll-field--check">
                  <span>Social Security</span>
                  <input checked={settingsDraft.socialSecurityApplicable} type="checkbox" onChange={(event) => setSettingsDraft({ ...settingsDraft, socialSecurityApplicable: event.target.checked })} />
                </label>
              </div>
              {locked ? <p className="payroll-lock-note">This month is finalized. Settings remain editable for future payroll, but this finalized snapshot will not change.</p> : null}
              <button className="payroll-action" disabled={settingsMutation.isPending} onClick={() => settingsMutation.mutate()} type="button">{settingsMutation.isPending ? "Saving" : "Save settings"}</button>
            </section>

            <section className="payroll-events" aria-label="Monthly payroll events">
              <h3>Monthly events</h3>
              <form className="payroll-event-form" onSubmit={submitEvent}>
                <label className="payroll-field">
                  <span>Event date</span>
                  <input disabled={locked} max={eventDateBounds.max} min={eventDateBounds.min} type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
                </label>
                <label className="payroll-field">
                  <span>Event</span>
                  <select disabled={locked} value={eventType} onChange={(event) => setEventType(event.target.value as PayrollEventType)}>
                    {eventOptions.map((type) => <option key={type} value={type}>{eventLabels[type]}</option>)}
                  </select>
                </label>
                <NumberField disabled={locked} label={eventType === "SALARY_ADVANCE" || eventType === "BONUS_ADDITION" || eventType === "AUTHORIZED_DEDUCTION" ? "Amount THB" : "Quantity"} onChange={setEventValue} value={eventValue} />
                <label className="payroll-field payroll-field--wide"><span>Note</span><input disabled={locked} value={eventNote} onChange={(event) => setEventNote(event.target.value)} /></label>
                <button className="payroll-action" disabled={locked || eventMutation.isPending || eventValue <= 0} type="submit">{eventMutation.isPending ? "Adding" : "Add event"}</button>
              </form>
              <ul className="payroll-event-list">
                {selected.events.length === 0 ? <li>No monthly events recorded.</li> : selected.events.map((event) => (
                  <li key={event.id}>
                    <strong>{eventLabels[event.eventType]}</strong>
                    <span>{event.amount > 0 ? money(event.amount) : event.quantity.toFixed(2)}</span>
                    {event.note ? <small>{event.note}</small> : null}
                    <small>Event date {new Date(`${event.eventDate}T00:00:00`).toLocaleDateString("en-GB")}</small>
                  </li>
                ))}
              </ul>
            </section>

            <section className="payroll-summary" aria-label="Payroll summary positive negative lines net payable">
              <h3>Calculation</h3>
              <dl className="payroll-summary-list">
                {calculation.lineItems.map((item) => (
                  <div className={`payroll-line payroll-line--${item.tone}`} key={item.label}>
                    <dt>{item.label}<small>{item.explanation}</small></dt>
                    <dd>{item.tone === "total" ? money(item.amount) : signedMoney(item.amount)}</dd>
                  </div>
                ))}
              </dl>
              <label className="payroll-field payroll-field--wide">
                <span>Payroll notes</span>
                <textarea disabled={locked} value={recordNotes} onChange={(event) => setRecordNotes(event.target.value)} />
              </label>
              <div className="payroll-actions">
                <button className="payroll-action" disabled={locked || draftMutation.isPending} onClick={() => draftMutation.mutate()} type="button">{draftMutation.isPending ? "Saving" : "Save draft"}</button>
                <button className="payroll-action payroll-action--primary" disabled={locked || finalizeMutation.isPending} onClick={() => finalizeMutation.mutate()} type="button">{finalizeMutation.isPending ? "Finalizing" : "Finalize"}</button>
                <a className="payroll-action" href={payrollPdfUrl(selected.id, payrollMonth)}>Generate PDF</a>
              </div>
            </section>
            {notice && ![settingsMutation, eventMutation, draftMutation, finalizeMutation].some((mutation) => mutation.isError) ? <p className="payroll-notice">{notice}</p> : null}
            {[settingsMutation, eventMutation, draftMutation, finalizeMutation].some((mutation) => mutation.isError) ? <p className="payroll-error">{eventMutation.isError && notice ? notice : "Payroll action could not be completed."}</p> : null}
          </>
        )}
      </VanaraGlassRegion>
    </WorkspaceShell>
  );
}
