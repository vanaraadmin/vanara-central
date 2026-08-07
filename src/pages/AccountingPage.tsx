import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { accountingExportUrl, createAccountingEntry, loadAccountingOverview } from "../services/accounting.service";
import type { ManualEntryType } from "../types/accounting";
import "../styles/AccountingPage.css";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonth(): string {
  return today().slice(0, 8) + "01";
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unknown";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Receipt could not be read.")));
    reader.addEventListener("error", () => reject(new Error("Receipt could not be read.")));
    reader.readAsDataURL(file);
  });
}

export default function AccountingPage() {
  const queryClient = useQueryClient();
  const [entryType, setEntryType] = useState<ManualEntryType>("expense");
  const [entryDate, setEntryDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());

  const accounting = useQuery({
    queryKey: ["accounting", "overview"],
    queryFn: ({ signal }) => loadAccountingOverview(signal),
  });

  const saveEntry = useMutation({
    mutationFn: () => createAccountingEntry({
      entryType,
      entryDate,
      amount: Number(amount),
      description,
      note: note.trim() ? note.trim() : null,
      receiptDataUrl,
      receiptFileName,
    }),
    onSuccess: async () => {
      setAmount("");
      setDescription("");
      setNote("");
      setReceiptDataUrl(null);
      setReceiptFileName(null);
      await queryClient.invalidateQueries({ queryKey: ["accounting"] });
    },
  });

  const canSubmit = entryDate && Number(amount) > 0 && description.trim().length > 0;
  const totals = accounting.data?.totals;
  const latestOta = useMemo(() => accounting.data?.otaRecords.slice(0, 24) ?? [], [accounting.data?.otaRecords]);
  const manualEntries = useMemo(() => accounting.data?.manualEntries.slice(0, 24) ?? [], [accounting.data?.manualEntries]);

  async function onReceipt(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReceiptDataUrl(await fileToDataUrl(file));
    setReceiptFileName(file.name);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    saveEntry.mutate();
  }

  return (
    <WorkspaceShell title="Accounting" workspace="accounting" bodyClassName="accounting-shell" wide>
      <div className="accounting-page">
        {accounting.isLoading ? <PageLoading /> : null}
        {accounting.isError && !accounting.data ? <PageError onRetry={() => void accounting.refetch()} /> : null}
        {accounting.data ? (
          <>
            <section className="accounting-kpis" aria-label="Accounting totals">
              <article><span>Expected net to date</span><strong>{money(totals?.expectedNetIncomeToDate)}</strong></article>
              <article><span>Future booked net</span><strong>{money(totals?.expectedFutureNetIncome)}</strong></article>
              <article><span>Manual income</span><strong>{money(totals?.manualIncome)}</strong></article>
              <article><span>Manual expenses</span><strong>{money(totals?.manualExpenses)}</strong></article>
            </section>

            <section className="accounting-panel">
              <header className="accounting-panel__header">
                <div>
                  <h2>Manual entry</h2>
                  <p>Record income or expenses. Receipts stay attached for accountant review.</p>
                </div>
              </header>
              <form className="accounting-form" onSubmit={onSubmit}>
                <label><span>Type</span><select value={entryType} onChange={(event) => setEntryType(event.target.value as ManualEntryType)}><option value="income">Income</option><option value="expense">Expense</option></select></label>
                <label><span>Date</span><input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label>
                <label><span>Amount</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                <label className="accounting-form__wide"><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
                <label className="accounting-form__wide"><span>Note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
                <label className="accounting-upload"><span>Receipt photo/PDF</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onReceipt} /><small>{receiptFileName ?? "JPG, PNG, WebP or PDF."}</small></label>
                <button className="accounting-action" disabled={!canSubmit || saveEntry.isPending} type="submit">{saveEntry.isPending ? "Saving" : "Save entry"}</button>
              </form>
              {saveEntry.isError ? <p className="accounting-error">Entry could not be saved.</p> : null}
            </section>

            <section className="accounting-panel">
              <header className="accounting-panel__header">
                <div>
                  <h2>Export for accountant</h2>
                  <p>Download income and expense movements for the selected fiscal period.</p>
                </div>
                <a className="accounting-action" href={accountingExportUrl(from, to)}>Export CSV</a>
              </header>
              <div className="accounting-export-range">
                <label><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
                <label><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
              </div>
            </section>

            <section className="accounting-panel">
              <header className="accounting-panel__header"><div><h2>OTA Income</h2><p>Expected payout by booking channel, ready for owner review.</p></div></header>
              <div className="accounting-table" role="table" aria-label="OTA income records">
                <div role="row"><strong>Stay</strong><strong>Guest</strong><strong>Channel</strong><strong>Rooms</strong><strong>Gross</strong><strong>Fees</strong><strong>Expected net</strong></div>
                {latestOta.map((record) => (
                  <div role="row" key={record.id}>
                    <span>{record.checkIn} to {record.checkOut}</span>
                    <span>{record.guestName ?? "Guest not listed"}</span>
                    <span>{record.channel}</span>
                    <span>{record.roomCount}</span>
                    <span>{money(record.grossBookingAmount)}</span>
                    <span>{money(record.otaFees)}</span>
                    <span>{money(record.expectedNetPayout)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="accounting-panel">
              <header className="accounting-panel__header"><div><h2>Recent Movements</h2><p>Owner-entered income and expenses.</p></div></header>
              <ul className="accounting-entry-list">
                {manualEntries.map((entry) => (
                  <li key={entry.id}>
                    <span><strong>{entry.description}</strong><small>{entry.date} / {entry.type}</small></span>
                    <span>{money(entry.amount)}{entry.receipt ? <a href={entry.receipt.downloadUrl}>Receipt</a> : null}</span>
                  </li>
                ))}
                {manualEntries.length === 0 ? <li>No movements yet.</li> : null}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
