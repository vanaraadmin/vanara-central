import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
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
  loadPayrollContractDocumentFile,
  loadPayrollOverview,
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
          <strong>{money(calculation.salaryBalancePayable ?? calculation.netSalaryPayable)}</strong>
          {calculation.contract ? <small>Current salary payable on {calculation.salaryPaymentDate ? new Date(`${calculation.salaryPaymentDate}T12:00:00+07:00`).toLocaleDateString("en-GB") : "payday"}</small> : null}
          {calculation.contract ? <small>Contractual food / housing allowance: {money(calculation.openingAllowanceAdvanceTotal ?? 0)}</small> : null}
          <small>{calculation.aggregates.extraWorkedDays.toFixed(2)} extra days / {calculation.aggregates.totalOvertimeHours.toFixed(2)} OT hrs</small>
          <small>{calculation.aggregates.unpaidAbsenceDays.toFixed(2)} absence days / {money(calculation.aggregates.salaryAdvancesReceived)} advances</small>
        </span>
      ) : <span className="payroll-worker__meta"><small>{worker.loadError}</small></span>}
    </button>
  );
}

function payrollPaymentDate(payrollMonth: string): string {
  const [yearRaw, monthRaw] = payrollMonth.split("-");
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw), 2));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function openingAllowancePaymentDate(payrollMonth: string): string {
  return `${payrollMonth}-01`;
}

function nextPayrollMonth(payrollMonth: string): string {
  const [yearRaw, monthRaw] = payrollMonth.split("-");
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function bangkokToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function PayrollMonthPlan({
  payrollMonth,
  workers,
  upcomingMonth,
  upcomingWorkers,
}: {
  payrollMonth: string;
  workers: PayrollWorker[];
  upcomingMonth: string;
  upcomingWorkers: PayrollWorker[];
}) {
  const contractWorkers = workers.filter((worker) => worker.calculation?.contract);
  const totals = contractWorkers.reduce((sum, worker) => {
    const calculation = worker.calculation!;
    sum.total += calculation.netSalaryPayable;
    sum.opening += calculation.openingAllowanceAdvanceTotal ?? 0;
    sum.balance += calculation.salaryBalancePayable ?? calculation.netSalaryPayable;
    return sum;
  }, { total: 0, opening: 0, balance: 0 });
  const upcomingOpeningRows = upcomingWorkers.filter((worker) => (worker.calculation?.openingAllowanceAdvanceTotal ?? 0) > 0);
  if (contractWorkers.length === 0 && upcomingOpeningRows.length === 0) return null;
  const openingRows = contractWorkers.filter((worker) => (worker.calculation?.openingAllowanceAdvanceTotal ?? 0) > 0);
  const openingDate = openingAllowancePaymentDate(payrollMonth);
  const paymentDate = payrollPaymentDate(payrollMonth);
  const isOpeningAllowanceTransition = payrollMonth < "2026-11";
  const nextAllowanceByWorkerId = new Map(upcomingOpeningRows.map((worker) => [
    worker.id,
    worker.calculation!.openingAllowanceAdvanceTotal ?? 0,
  ]));
  const salaryPaymentTotal = totals.balance + upcomingOpeningRows.reduce(
    (sum, worker) => sum + (worker.calculation?.openingAllowanceAdvanceTotal ?? 0),
    0,
  );
  return (
    <section className="payroll-month-plan" aria-label="Upcoming contract payroll payments">
      <header><span>Upcoming payments</span><small>Contract-driven · owner only</small></header>
      {contractWorkers.length > 0 ? <>
        {isOpeningAllowanceTransition ? <article>
          <div className="payroll-month-plan__heading"><span>{new Date(`${openingDate}T12:00:00+07:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span><strong>{money(totals.opening)}</strong></div>
          <small>Allowances due — food and housing</small>
          {openingRows.length === 0 ? <p>No contractual opening advance this month.</p> : (
            <ul>{openingRows.map((worker) => {
              const calculation = worker.calculation!;
              return <li key={worker.id}><span>{worker.fullName}</span><b>{money(calculation.openingAllowanceAdvanceTotal ?? 0)}</b><small>Food {money(calculation.openingFoodAdvance ?? 0)} · Housing {money(calculation.openingHousingAdvance ?? 0)}</small></li>;
            })}</ul>
          )}
        </article> : null}
        <article>
          <div className="payroll-month-plan__heading"><span>{new Date(`${paymentDate}T12:00:00+07:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span><strong>{money(salaryPaymentTotal)}</strong></div>
          <small>Salary balance plus next month’s food and housing allowances</small>
          <ul>{contractWorkers.map((worker) => {
            const calculation = worker.calculation!;
            const salaryBalance = calculation.salaryBalancePayable ?? calculation.netSalaryPayable;
            const nextAllowance = nextAllowanceByWorkerId.get(worker.id) ?? 0;
            return <li key={worker.id}><span>{worker.fullName}</span><b>{money(salaryBalance + nextAllowance)}</b><small>Salary {money(salaryBalance)} · {upcomingMonth} food / housing {money(nextAllowance)}</small></li>;
          })}</ul>
        </article>
      </> : null}
      {isOpeningAllowanceTransition && upcomingOpeningRows.length > 0 ? <article>
        <div className="payroll-month-plan__heading"><span>Next: {new Date(`${openingAllowancePaymentDate(upcomingMonth)}T12:00:00+07:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span><strong>{money(upcomingOpeningRows.reduce((sum, worker) => sum + (worker.calculation?.openingAllowanceAdvanceTotal ?? 0), 0))}</strong></div>
        <small>Next month’s allowances due — food and housing</small>
        <ul>{upcomingOpeningRows.map((worker) => {
          const calculation = worker.calculation!;
          return <li key={worker.id}><span>{worker.fullName}</span><b>{money(calculation.openingAllowanceAdvanceTotal ?? 0)}</b><small>Food {money(calculation.openingFoodAdvance ?? 0)} · Housing {money(calculation.openingHousingAdvance ?? 0)}</small></li>;
        })}</ul>
      </article> : null}
    </section>
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

interface PreparedContractFile {
  file: File;
  objectUrl: string;
}

function isStandaloneDisplayMode(): boolean {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || standaloneNavigator.standalone === true;
}

function canShareContractFile(file: File): boolean {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function downloadPreparedContract(file: File, objectUrl: string): void {
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.name;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function ContractDocumentActions({ document: contractDocument }: { document: PayrollContractDocument }) {
  const { translate } = useLanguage();
  const [busyMode, setBusyMode] = useState<"inline" | "download" | null>(null);
  const [prepared, setPrepared] = useState<PreparedContractFile | null>(null);
  const [sharePending, setSharePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewObjectUrl = useRef<string | null>(null);
  const standalone = useMemo(() => isStandaloneDisplayMode(), []);

  const closePreview = useCallback(() => {
    if (previewObjectUrl.current) {
      URL.revokeObjectURL(previewObjectUrl.current);
      previewObjectUrl.current = null;
    }
    setPrepared(null);
    setSharePending(false);
    setError(null);
  }, []);

  useEffect(() => () => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
  }, []);

  useEffect(() => {
    if (!prepared) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePreview, prepared]);

  function showControlledPreview(file: File, objectUrl: string): void {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = objectUrl;
    setPrepared({ file, objectUrl });
  }

  function releaseLater(objectUrl: string): void {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  async function openContract(mode: "inline" | "download"): Promise<void> {
    if (busyMode) return;
    const previewWindow = mode === "inline" && !standalone ? window.open("", "_blank") : null;
    if (previewWindow) previewWindow.opener = null;
    setBusyMode(mode);
    setError(null);
    try {
      const file = await loadPayrollContractDocumentFile(contractDocument, mode);
      const objectUrl = URL.createObjectURL(file);
      if (standalone) {
        showControlledPreview(file, objectUrl);
      } else if (mode === "inline" && previewWindow) {
        previewWindow.location.replace(objectUrl);
        releaseLater(objectUrl);
      } else if (mode === "download") {
        downloadPreparedContract(file, objectUrl);
        releaseLater(objectUrl);
      } else {
        showControlledPreview(file, objectUrl);
      }
    } catch (cause) {
      previewWindow?.close();
      setError(cause instanceof Error ? cause.message : translate("contractPdfOpenFailed"));
    } finally {
      setBusyMode(null);
    }
  }

  async function sharePreparedContract(): Promise<void> {
    if (!prepared || sharePending) return;
    if (!canShareContractFile(prepared.file)) {
      setError(translate("contractPdfShareUnavailable"));
      return;
    }
    setSharePending(true);
    setError(null);
    try {
      await navigator.share({ files: [prepared.file], title: prepared.file.name });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(translate("contractPdfShareFailed"));
      }
    } finally {
      setSharePending(false);
    }
  }

  const preview = prepared ? (
    <div className="payroll-contract-preview" role="dialog" aria-modal="true" aria-labelledby="payroll-contract-preview-title">
      <section className="payroll-contract-preview__panel">
        <header className="payroll-contract-preview__header">
          <span>
            <small>{translate("contractPdfPreview")}</small>
            <strong id="payroll-contract-preview-title">{prepared.file.name}</strong>
          </span>
          <button className="payroll-action" onClick={closePreview} type="button">{translate("close")}</button>
        </header>
        <div className="payroll-contract-preview__body">
          <iframe src={prepared.objectUrl} title={prepared.file.name} />
        </div>
        <footer className="payroll-contract-preview__footer">
          {canShareContractFile(prepared.file) ? (
            <button className="payroll-action payroll-action--primary" disabled={sharePending} onClick={() => void sharePreparedContract()} type="button">
              {sharePending ? translate("sharingContractPdf") : translate("shareSaveContractPdf")}
            </button>
          ) : <p>{translate("contractPdfShareUnavailable")}</p>}
          <button className="payroll-action" onClick={closePreview} type="button">{translate("back")}</button>
        </footer>
        {error ? <p className="payroll-contract-preview__error" role="alert">{error}</p> : null}
      </section>
    </div>
  ) : null;

  return (
    <>
      <span className="payroll-contract-actions">
        <button className="payroll-action" disabled={busyMode !== null} onClick={() => void openContract("inline")} type="button">
          {busyMode === "inline" ? translate("openingContractPdf") : translate("viewContractPdf")}
        </button>
        <button className="payroll-action" disabled={busyMode !== null} onClick={() => void openContract("download")} type="button">
          {busyMode === "download" ? translate("downloadingContractPdf") : translate("downloadContractPdf")}
        </button>
      </span>
      {!prepared && error ? <span className="payroll-contract-action-error" role="alert">{error}</span> : null}
      {preview ? createPortal(preview, document.body) : null}
    </>
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
  const upcomingMonth = nextPayrollMonth(payrollMonth);
  const upcomingOverview = useQuery({
    queryKey: ["payroll", "overview", upcomingMonth],
    queryFn: ({ signal }) => loadPayrollOverview(upcomingMonth, signal),
  });
  const workers = overview.data?.workers ?? [];
  const upcomingWorkers = upcomingOverview.data?.workers ?? [];
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
        {!overview.isLoading && !overview.isError && !upcomingOverview.isLoading && !upcomingOverview.isError ? <PayrollMonthPlan payrollMonth={payrollMonth} workers={workers} upcomingMonth={upcomingMonth} upcomingWorkers={upcomingWorkers} /> : null}
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
            <section className="payroll-net" aria-label="Payroll payment plan">
              <span>{contract ? "Total contractual payroll" : "Net Salary Payable"}</span>
              <strong>{money(calculation.netSalaryPayable)}</strong>
              {contract ? (
                <div className="payroll-net__schedule">
                  <div><span>Allowances due</span><b>{money(calculation.openingAllowanceAdvanceTotal ?? 0)}</b><small>Food {money(calculation.openingFoodAdvance ?? 0)} · Housing {money(calculation.openingHousingAdvance ?? 0)}</small></div>
                  <div><span>Current salary payable</span><b>{money(calculation.salaryBalancePayable ?? calculation.netSalaryPayable)}</b><small>{calculation.salaryPaymentDate ? `Pay on ${new Date(`${calculation.salaryPaymentDate}T12:00:00+07:00`).toLocaleDateString("en-GB")}` : "Pay on the 2nd of the following month"}</small></div>
                </div>
              ) : null}
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
                {bangkokToday() >= payrollPaymentDate(payrollMonth)
                  ? <a className="payroll-action" href={payrollPdfUrl(selected.id, payrollMonth)}>Download payslip PDF</a>
                  : <span className="payroll-lock-note">Payslip PDF available on {new Date(`${payrollPaymentDate(payrollMonth)}T12:00:00+07:00`).toLocaleDateString("en-GB")}</span>}
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
                  <ContractDocumentActions document={selectedDocument} key={selectedDocument.documentId} />
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
