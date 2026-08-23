import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import { useLanguage } from "../providers/language.context";
import { loadCurrentUser } from "../services/auth.service";
import {
  addPayrollEvent,
  finalizePayroll,
  loadPayrollContractDocuments,
  loadPayrollOverview,
  payrollContractDocumentUrl,
  payrollPdfUrl,
  savePayrollAttendance,
  savePayrollDraft,
  savePayrollSettings,
} from "../services/payroll.service";
import type {
  PayrollAttendanceStatus,
  PayrollContractDocument,
  PayrollEventType,
  PayrollSettings,
  PayrollWorker,
} from "../types/payroll";
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

const attendanceLabels: Record<PayrollAttendanceStatus, string> = {
  WORKED: "Worked",
  UNPAID_ABSENCE: "Unpaid absence",
  PAID_LEAVE: "Paid annual leave",
  PROTECTED_PAID_LEAVE: "Protected paid leave",
  WEEKLY_REST: "Weekly rest day",
};

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

function NumberField({ commitEmptyAsZero, disabled, label, onChange, step = "0.01", value }: { commitEmptyAsZero?: boolean; disabled?: boolean; label: string; onChange(value: number): void; step?: string; value: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft !== null ? draft : Number.isFinite(value) ? String(value) : "";
  return (
    <label className="payroll-field">
      <span>{label}</span>
      <input
        disabled={disabled}
        min="0"
        step={step}
        type="number"
        value={displayValue}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next === "") {
            if (commitEmptyAsZero) onChange(0);
            return;
          }
          const parsed = Number(next);
          if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed);
        }}
      />
    </label>
  );
}

function WorkerCard({ active, onSelect, worker }: { active: boolean; onSelect(): void; worker: PayrollWorker }) {
  const calculation = worker.calculation;
  const settings = worker.settings;
  const initials = worker.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || worker.username.slice(0, 2).toUpperCase();
  return (
    <button className={active ? "payroll-worker payroll-worker--active" : "payroll-worker"} onClick={onSelect} type="button">
      <span className="payroll-worker__avatar">{worker.profilePhotoUrl ? <img alt="" src={worker.profilePhotoUrl} /> : initials}</span>
      <span className="payroll-worker__main">
        <strong>{worker.fullName}</strong>
        <small>@{worker.username} - {worker.role}</small>
        {settings ? <span>{money(settings.monthlyGrossSalary)} base - SS {settings.socialSecurityApplicable ? "Yes" : "No"} - Food {settings.mealAllowanceApplicable ? "On" : "Off"}</span> : null}
      </span>
      {calculation ? (
        <span className="payroll-worker__meta">
          <strong>{money(calculation.netSalaryPayable)}</strong>
          <small>{calculation.aggregates.extraWorkedDays.toFixed(2)} extra days / {calculation.aggregates.totalOvertimeHours.toFixed(2)} OT hrs</small>
          <small>{calculation.aggregates.unpaidAbsenceDays.toFixed(2)} absence days / {money(calculation.aggregates.salaryAdvancesReceived)} advances</small>
        </span>
      ) : <span className="payroll-worker__meta"><small>{worker.loadError}</small></span>}
    </button>
  );
}

function contractDate(value: string): string {
  return new Date(`${value}T12:00:00+07:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

function ContractDocumentActions({ document }: { document: PayrollContractDocument }) {
  const { translate } = useLanguage();
  return (
    <span className="payroll-contract-actions">
      <a
        className="payroll-action"
        href={payrollContractDocumentUrl(document.documentId, "inline")}
        rel="noopener noreferrer"
        target="_blank"
      >
        {translate("viewContractPdf")}
      </a>
      <a className="payroll-action" href={payrollContractDocumentUrl(document.documentId, "download")}>
        {translate("downloadContractPdf")}
      </a>
    </span>
  );
}

function OwnerPayrollWorkspace() {
  const { translate } = useLanguage();
  const queryClient = useQueryClient();
  const [payrollMonth, setPayrollMonth] = useState(currentMonth());
  const [selectedId, setSelectedId] = useState<string>("");
  const [settingsDraft, setSettingsDraft] = useState<PayrollSettings | null>(null);
  const [eventType, setEventType] = useState<PayrollEventType>("UNPAID_ABSENCE_DAY");
  const [eventDate, setEventDate] = useState(defaultEventDate(currentMonth()));
  const [eventValue, setEventValue] = useState(0);
  const [eventNote, setEventNote] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState<PayrollAttendanceStatus>("WORKED");
  const [attendanceDate, setAttendanceDate] = useState(defaultEventDate(currentMonth()));
  const [attendanceNote, setAttendanceNote] = useState("");
  const [recordNotes, setRecordNotes] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ["payroll", "overview", payrollMonth],
    queryFn: ({ signal }) => loadPayrollOverview(payrollMonth, signal),
  });
  const documents = useQuery({
    queryKey: ["payroll", "contract-documents"],
    queryFn: ({ signal }) => loadPayrollContractDocuments(signal),
  });
  const workers = overview.data?.workers ?? [];
  const selected = workers.find((worker) => worker.id === selectedId) ?? null;
  const selectedDocument = selected?.employeeKey ? documents.data?.find((document) => document.employeeKey === selected.employeeKey) ?? null : null;
  const locked = selected?.record?.status === "FINALIZED";
  const contract = selected?.calculation?.contract ?? null;
  const calculation = selected?.calculation ?? null;
  const eventDateBounds = useMemo(() => dateBoundsForMonth(payrollMonth), [payrollMonth]);
  const availableEventOptions = contract ? eventOptions.filter((type) => type !== "UNPAID_ABSENCE_DAY") : eventOptions;
  const paidLeaveAvailable = contract?.contractType === "INDEFINITE"
    && contract.paidLeave.eligible
    && contract.paidLeave.closing > 0;
  const availableAttendanceStatuses: PayrollAttendanceStatus[] = paidLeaveAvailable
    ? ["WORKED", "UNPAID_ABSENCE", "PAID_LEAVE", "PROTECTED_PAID_LEAVE", "WEEKLY_REST"]
    : ["WORKED", "UNPAID_ABSENCE", "PROTECTED_PAID_LEAVE", "WEEKLY_REST"];

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
    onError: (error) => setNotice(error instanceof Error ? error.message : "Payroll event could not be saved"),
  });
  const attendanceMutation = useMutation({
    mutationFn: () => selected ? savePayrollAttendance(selected.id, {
      workDate: attendanceDate,
      status: attendanceStatus,
      note: attendanceNote || null,
      idempotencyKey: crypto.randomUUID(),
    }) : Promise.reject(new Error("Select a worker")),
    onSuccess: async () => {
      setNotice("Attendance saved");
      setAttendanceNote("");
      await refreshPayroll();
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Attendance could not be saved"),
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

  function submitAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (contract) attendanceMutation.mutate();
  }

  const mutationError = [settingsMutation, eventMutation, attendanceMutation, draftMutation, finalizeMutation]
    .find((mutation) => mutation.isError)?.error;

  return (
    <WorkspaceShell title="Payroll" stickyNavigationTitle="Payroll" workspace="payroll" bodyClassName="payroll-page" wide>
      <VanaraGlassRegion className="payroll-workers" ariaLabelledBy="payroll-workers-title">
        <VanaraSectionHeader eyebrow="Owner" headingId="payroll-workers-title" meta={payrollMonth} title="Staff Payroll" />
        <label className="payroll-month">
          <span>Payroll month</span>
          <input type="month" value={payrollMonth} onChange={(event) => {
            const month = event.target.value;
            setPayrollMonth(month);
            setSelectedId("");
            setSettingsDraft(null);
            setRecordNotes("");
            setEventDate(defaultEventDate(month));
            setAttendanceDate(defaultEventDate(month));
            setNotice(null);
          }} />
        </label>
        {overview.isLoading ? <PageLoading /> : null}
        {overview.isError ? <PageError onRetry={() => void overview.refetch()} /> : null}
        <div className="payroll-worker-list">
          {workers.map((worker) => (
            <WorkerCard active={worker.id === selectedId} key={worker.id} onSelect={() => {
              setNotice(null);
              setSelectedId(worker.id);
              setSettingsDraft(worker.settings);
              setRecordNotes(worker.record?.notes ?? "");
              setEventType(worker.calculation?.contract ? "UNPAID_ABSENCE_HOUR" : "UNPAID_ABSENCE_DAY");
            }} worker={worker} />
          ))}
        </div>
      </VanaraGlassRegion>

      <VanaraGlassRegion className="payroll-detail" ariaLabelledBy="payroll-detail-title">
        <VanaraSectionHeader eyebrow={selected ? selected.role : "Select"} headingId="payroll-detail-title" meta={locked ? "Finalized" : "Draft"} title={selected ? selected.fullName : "Worker Detail"} />
        {selected?.loadError ? (
          <section className="payroll-empty" role="alert">
            <h2>Unable to load this worker</h2>
            <p>{selected.loadError}</p>
          </section>
        ) : !selected || !settingsDraft || !calculation ? (
          <section className="payroll-empty">
            <h2>Select a worker</h2>
            <p>Open one staff profile to record attendance and monthly events, then generate the payroll statement.</p>
          </section>
        ) : (
          <>
            <section className="payroll-net" aria-label="Payroll net payable">
              <span>Net Salary Payable</span>
              <strong>{money(calculation.netSalaryPayable)}</strong>
              <small>{locked ? `Finalized ${selected.record?.finalizedAt ? new Date(selected.record.finalizedAt).toLocaleDateString("en-GB") : ""}` : "Server-calculated estimate"}</small>
              {calculation.employerSocialSecurity !== undefined ? <small>Employer Social Security: {money(calculation.employerSocialSecurity)}</small> : null}
            </section>

            <section className="payroll-settings" aria-label="Worker payroll settings">
              <h3>{contract ? "Contract profile" : "Worker settings"}</h3>
              {contract ? (
                <div className="payroll-form-grid">
                  <label className="payroll-field"><span>Base salary</span><input disabled value={money(settingsDraft.monthlyGrossSalary)} /></label>
                  <label className="payroll-field"><span>Contract</span><input disabled value={contract.contractType === "INDEFINITE" ? "Indefinite" : "Seasonal"} /></label>
                  <label className="payroll-field"><span>Social Security</span><input disabled value={settingsDraft.socialSecurityApplicable ? money(calculation.employeeSocialSecurity) : "Not applicable"} /></label>
                  <label className="payroll-field"><span>Employer Social Security</span><input disabled value={money(calculation.employerSocialSecurity ?? 0)} /></label>
                  <label className="payroll-field"><span>Food allowance</span><input disabled value={money(calculation.mealAllowanceAdvance)} /></label>
                  <label className="payroll-field"><span>Housing allowance</span><input disabled value={money(calculation.housingAllowance ?? 0)} /></label>
                  <label className="payroll-field"><span>Accommodation deduction</span><input disabled value={money(calculation.accommodationDeduction ?? 0)} /></label>
                  <label className="payroll-field"><span>Contract bonus</span><input disabled value={money(calculation.contractBonusTotal ?? 0)} /></label>
                  <label className="payroll-field"><span>Paid leave balance</span><input disabled value={contract.contractType === "INDEFINITE" ? `${contract.paidLeave.closing.toFixed(2)} days` : "Not applicable"} /></label>
                  <label className="payroll-field"><span>Profile version</span><input disabled value={contract.profileVersionKey} /></label>
                </div>
              ) : (
                <>
                  <div className="payroll-form-grid">
                    <NumberField label="Base salary" onChange={(value) => setSettingsDraft({ ...settingsDraft, monthlyGrossSalary: value })} value={settingsDraft.monthlyGrossSalary} />
                    <label className="payroll-field payroll-field--check">
                      <span>Social Security</span>
                      <input checked={settingsDraft.socialSecurityApplicable} type="checkbox" onChange={(event) => setSettingsDraft({ ...settingsDraft, socialSecurityApplicable: event.target.checked })} />
                    </label>
                    <label className="payroll-field payroll-field--check">
                      <span>Meal allowance</span>
                      <input checked={settingsDraft.mealAllowanceApplicable} type="checkbox" onChange={(event) => setSettingsDraft({ ...settingsDraft, mealAllowanceApplicable: event.target.checked })} />
                    </label>
                  </div>
                  {locked ? <p className="payroll-lock-note">This month is finalized. Settings remain editable for future legacy payroll, but this finalized snapshot will not change.</p> : null}
                  <button className="payroll-action" disabled={settingsMutation.isPending} onClick={() => settingsMutation.mutate()} type="button">{settingsMutation.isPending ? "Saving" : "Save settings"}</button>
                </>
              )}
            </section>

            {contract ? (
              <section className="payroll-events" aria-label="Contract attendance">
                <h3>Attendance</h3>
                {locked ? <p className="payroll-lock-note">This payroll is finalized. Attendance corrections are carried into the next open payroll and do not change this statement.</p> : null}
                <form className="payroll-event-form" onSubmit={submitAttendance}>
                  <label className="payroll-field"><span>Work date</span><input max={eventDateBounds.max} min={eventDateBounds.min} type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label>
                  <label className="payroll-field"><span>Status</span><select value={attendanceStatus} onChange={(event) => setAttendanceStatus(event.target.value as PayrollAttendanceStatus)}>{availableAttendanceStatuses.map((status) => <option key={status} value={status}>{attendanceLabels[status]}</option>)}</select></label>
                  <label className="payroll-field payroll-field--wide"><span>Note</span><input value={attendanceNote} onChange={(event) => setAttendanceNote(event.target.value)} /></label>
                  <button className="payroll-action" disabled={attendanceMutation.isPending} type="submit">{attendanceMutation.isPending ? "Saving" : "Save attendance"}</button>
                </form>
              </section>
            ) : null}

            <section className="payroll-events" aria-label="Monthly payroll events">
              <h3>Monthly events</h3>
              <form className="payroll-event-form" onSubmit={submitEvent}>
                <label className="payroll-field"><span>Event date</span><input disabled={locked} max={eventDateBounds.max} min={eventDateBounds.min} type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label>
                <label className="payroll-field"><span>Event</span><select disabled={locked} value={eventType} onChange={(event) => setEventType(event.target.value as PayrollEventType)}>{availableEventOptions.map((type) => <option key={type} value={type}>{eventLabels[type]}</option>)}</select></label>
                <NumberField commitEmptyAsZero disabled={locked} label={eventType === "SALARY_ADVANCE" || eventType === "BONUS_ADDITION" || eventType === "AUTHORIZED_DEDUCTION" ? "Amount THB" : "Quantity"} onChange={setEventValue} value={eventValue} />
                <label className="payroll-field payroll-field--wide"><span>Note</span><input disabled={locked} value={eventNote} onChange={(event) => setEventNote(event.target.value)} /></label>
                <button className="payroll-action" disabled={locked || eventMutation.isPending || eventValue <= 0} type="submit">{eventMutation.isPending ? "Adding" : "Add event"}</button>
              </form>
              <ul className="payroll-event-list">
                {selected.events.length === 0 ? <li>No monthly events recorded.</li> : selected.events.map((event) => (
                  <li key={event.id}><strong>{eventLabels[event.eventType]}</strong><span>{event.amount > 0 ? money(event.amount) : event.quantity.toFixed(2)}</span>{event.note ? <small>{event.note}</small> : null}<small>Event date {new Date(`${event.eventDate}T00:00:00`).toLocaleDateString("en-GB")}</small></li>
                ))}
              </ul>
            </section>

            <section className="payroll-summary" aria-label="Payroll summary positive negative lines net payable">
              <h3>Calculation</h3>
              <dl className="payroll-summary-list">
                {calculation.lineItems.map((item) => (
                  <div className={`payroll-line payroll-line--${item.tone}`} key={item.label}>
                    <dt>{item.label}<small>{item.explanation}</small><small lang="th">{item.thaiLabel}: {item.thaiExplanation}</small></dt>
                    <dd>{item.tone === "total" || item.tone === "information" ? money(item.amount) : signedMoney(item.amount)}</dd>
                  </div>
                ))}
              </dl>
              <label className="payroll-field payroll-field--wide"><span>Payroll notes</span><textarea disabled={locked} value={recordNotes} onChange={(event) => setRecordNotes(event.target.value)} /></label>
              <div className="payroll-actions">
                <button className="payroll-action" disabled={locked || draftMutation.isPending} onClick={() => draftMutation.mutate()} type="button">{draftMutation.isPending ? "Saving" : "Save draft"}</button>
                <button className="payroll-action payroll-action--primary" disabled={locked || finalizeMutation.isPending} onClick={() => finalizeMutation.mutate()} type="button">{finalizeMutation.isPending ? "Finalizing" : "Finalize"}</button>
                <a className="payroll-action" href={payrollPdfUrl(selected.id, payrollMonth)}>Generate PDF</a>
              </div>
            </section>
            <section className="payroll-events" aria-label="Employment contract document">
              <h3>{translate("employmentContracts")}</h3>
              {documents.isLoading ? <PageLoading /> : null}
              {documents.isError ? (
                <div className="payroll-contract-error" role="alert">
                  <p>{translate("contractDocumentsUnavailable")}</p>
                  <button className="payroll-action" onClick={() => void documents.refetch()} type="button">
                    {translate("tryAgain")}
                  </button>
                </div>
              ) : null}
              {!documents.isLoading && !documents.isError && !selectedDocument ? (
                <p className="payroll-lock-note">{translate("contractNotAvailable")}</p>
              ) : null}
              {selectedDocument ? (
                <div className="payroll-self-contract">
                  <span className="payroll-contract-copy">
                    <strong>{selectedDocument.fileName}</strong>
                    <small>{translate("contractVersion", { version: selectedDocument.versionNumber })}</small>
                    <small>{translate("contractEffectiveFrom", { date: contractDate(selectedDocument.effectiveFromBangkok) })}</small>
                  </span>
                  <ContractDocumentActions document={selectedDocument} />
                </div>
              ) : null}
            </section>
            {notice && !mutationError ? <p className="payroll-notice">{notice}</p> : null}
            {mutationError ? <p className="payroll-error">{mutationError instanceof Error ? mutationError.message : "Payroll action could not be completed."}</p> : null}
          </>
        )}
      </VanaraGlassRegion>
    </WorkspaceShell>
  );
}

export default function PayrollPage() {
  const { translate } = useLanguage();
  const user = useQuery({
    queryKey: ["current-user"],
    queryFn: ({ signal }) => loadCurrentUser(signal),
  });

  if (user.isLoading) {
    return <WorkspaceShell title={translate("payroll")} workspace="payroll"><PageLoading /></WorkspaceShell>;
  }
  if (user.isError || !user.data) {
    return (
      <WorkspaceShell title={translate("payroll")} workspace="payroll">
        <PageError onRetry={() => void user.refetch()} />
      </WorkspaceShell>
    );
  }
  if (!user.data.isOwner) return <Navigate replace to="/staff" />;
  return <OwnerPayrollWorkspace />;
}
