import { useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { appendAccountingReceiptSelections, removeAccountingReceiptSelection, type PendingAccountingReceipt } from "../services/accounting-receipt-selection";
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

const incomeCategories = [
  { value: "INCASSI PER STANZE", label: "Room Income" },
  { value: "INCASSI RISTORANTE / BAR", label: "Restaurant / Bar Income" },
  { value: "INCASSI AFFITTO MOTORINO", label: "Motorbike Rental Income" },
] as const;

const expenseCategories = [
  { value: "Resort Supplies", label: "Resort Supplies" },
  { value: "Food & Beverage Operations", label: "Food & Beverage Operations" },
  { value: "Repairs & Maintenance", label: "Repairs & Maintenance" },
  { value: "Utilities & Connectivity", label: "Utilities & Connectivity" },
  { value: "IT Costs", label: "IT Costs" },
  { value: "Garden", label: "Garden" },
  { value: "Transport & Fuel", label: "Transport & Fuel" },
  { value: "Office & Admin", label: "Office & Admin" },
  { value: "Government, Bank & Legal", label: "Government, Bank & Legal" },
  { value: "Marketing & Reviews", label: "Marketing & Reviews" },
  { value: "Guest Services", label: "Guest Services" },
  { value: "Other Expenses", label: "Other Expenses" },
] as const;

function categoriesFor(type: ManualEntryType): ReadonlyArray<{ value: string; label: string }> {
  return type === "income" ? incomeCategories : expenseCategories;
}

function accountingNote(category: string): string {
  return `category: ${category}`;
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
  const [category, setCategory] = useState<string>(expenseCategories[0].value);
  const [description, setDescription] = useState("");
  const [receipts, setReceipts] = useState<PendingAccountingReceipt[]>([]);
  const [receiptUnavailable, setReceiptUnavailable] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const activeCategories = categoriesFor(entryType);

  const accounting = useQuery({
    queryKey: ["accounting", "overview"],
    queryFn: ({ signal }) => loadAccountingOverview(signal),
  });

  const saveEntry = useMutation({
    mutationFn: () => createAccountingEntry({
      entryType,
      entryDate,
      amount: Number(amount),
      description: description.trim(),
      note: accountingNote(category),
      receipts: receipts.map((receipt) => ({ dataUrl: receipt.dataUrl, fileName: receipt.fileName })),
      receiptUnavailable,
    }),
    onSuccess: async () => {
      setAmount("");
      setDescription("");
      setReceipts([]);
      setReceiptUnavailable(false);
      setReceiptError(null);
      await queryClient.invalidateQueries({ queryKey: ["accounting"] });
    },
  });

  const receiptRequirementMet = entryType === "income" || receipts.length > 0 || receiptUnavailable;
  const canSubmit = entryDate && Number(amount) > 0 && category.trim().length > 0 && description.trim().length > 0 && receiptRequirementMet;
  const totals = accounting.data?.totals;

  async function onReceipt(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setReceiptError(null);
    try {
      const additions = await Promise.all(files.map(async (file) => ({
        id: crypto.randomUUID(),
        dataUrl: await fileToDataUrl(file),
        fileName: file.name,
        contentType: file.type,
        byteSize: file.size,
      })));
      setReceipts((current) => appendAccountingReceiptSelections(current, additions));
      setReceiptUnavailable(false);
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : "Receipt could not be read.");
    }
  }

  function removeReceipt(id: string) {
    setReceipts((current) => removeAccountingReceiptSelection(current, id));
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
              <article><span>Checked-in net</span><strong>{money(totals?.expectedNetIncomeToDate)}</strong></article>
              <article><span>Future net forecast</span><strong>{money(totals?.expectedFutureNetIncome)}</strong></article>
              <article><span>Owner income</span><strong>{money(totals?.manualIncome)}</strong></article>
              <article><span>Owner expenses</span><strong>{money(totals?.manualExpenses)}</strong></article>
            </section>

            <section className="accounting-panel">
              <header className="accounting-panel__header">
                <div>
                  <h2>Manual entry</h2>
                  <p>Record income or expenses. Receipts stay attached for accountant review.</p>
                </div>
              </header>
              <form className="accounting-form" onSubmit={onSubmit}>
                <label><span>Type</span><select value={entryType} onChange={(event) => {
                  const nextType = event.target.value as ManualEntryType;
                  setEntryType(nextType);
                  setCategory(categoriesFor(nextType)[0].value);
                  if (nextType === "income") setReceiptUnavailable(false);
                }}><option value="income">Income</option><option value="expense">Expense</option></select></label>
                <label><span>Date</span><input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label>
                <label><span>Amount</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                <label className="accounting-form__wide">
                  <span>Category</span>
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {activeCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="accounting-form__wide"><span>Description</span><textarea value={description} placeholder={entryType === "expense" ? "What was bought?" : "What was collected?"} onChange={(event) => setDescription(event.target.value)} /></label>
                <div className="accounting-upload">
                  <span>Receipt photos/PDFs</span>
                  <div className="accounting-upload__actions">
                    <label className="accounting-upload__button">
                      <input type="file" accept="image/*" capture="environment" onChange={onReceipt} />
                      <span>Take receipt photo</span>
                    </label>
                    <label className="accounting-upload__button accounting-upload__button--secondary">
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={onReceipt} />
                      <span>Choose files/PDFs</span>
                    </label>
                  </div>
                  {receipts.length > 0 ? (
                    <ol className="accounting-upload__list" aria-label="Selected receipt pages">
                      {receipts.map((receipt, index) => (
                        <li key={receipt.id} className="accounting-upload__item">
                          {receipt.contentType.startsWith("image/")
                            ? <img src={receipt.dataUrl} alt="" loading="lazy" decoding="async" />
                            : <span className="accounting-upload__file-type" aria-hidden="true">PDF</span>}
                          <span className="accounting-upload__file-name"><strong>Page {index + 1}</strong><small>{receipt.fileName}</small></span>
                          <button type="button" onClick={() => removeReceipt(receipt.id)} aria-label={`Remove ${receipt.fileName}`}>Remove</button>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <small>{receipts.length > 0 ? `${receipts.length} receipt page${receipts.length === 1 ? "" : "s"} selected.` : "Add readable JPG, PNG, WebP or PDF receipt pages."}</small>
                  {entryType === "expense" ? (
                    <label className="accounting-upload__unavailable">
                      <input type="checkbox" checked={receiptUnavailable} onChange={(event) => {
                        setReceiptUnavailable(event.target.checked);
                        if (event.target.checked) setReceipts([]);
                      }} />
                      <span>Receipt unavailable</span>
                    </label>
                  ) : null}
                  {receiptError ? <small className="accounting-error">{receiptError}</small> : null}
                </div>
                <button className="accounting-action" disabled={!canSubmit || saveEntry.isPending} type="submit">{saveEntry.isPending ? "Saving" : "Save entry"}</button>
              </form>
              {saveEntry.isError ? <p className="accounting-error">{saveEntry.error instanceof Error ? saveEntry.error.message : "Entry could not be saved."}</p> : null}
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
          </>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
