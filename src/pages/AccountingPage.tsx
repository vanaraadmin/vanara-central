import { useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { appendAccountingReceiptSelections, removeAccountingReceiptSelection, type PendingAccountingReceipt } from "../services/accounting-receipt-selection";
import { accountingExportUrl, createAccountingEntry, loadAccountingOverview } from "../services/accounting.service";
import type { ManualEntryType } from "../types/accounting";
import { useLanguage } from "../providers/language.context";
import "../styles/AccountingPage.css";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonth(): string {
  return today().slice(0, 8) + "01";
}

function money(value: number | null | undefined, unavailableLabel: string): string {
  if (value === null || value === undefined) return unavailableLabel;
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
  const { language } = useLanguage();
  const thai = language === "th";
  const t = (english: string, thaiText: string) => thai ? thaiText : english;
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
  const categoryLabel = (item: { value: string; label: string }) => thai ? ({
    "INCASSI PER STANZE": "รายได้จากห้องพัก",
    "INCASSI RISTORANTE / BAR": "รายได้จากร้านอาหาร / บาร์",
    "INCASSI AFFITTO MOTORINO": "รายได้จากการเช่ามอเตอร์ไซค์",
    "Resort Supplies": "อุปกรณ์รีสอร์ต",
    "Food & Beverage Operations": "ค่าอาหารและเครื่องดื่ม",
    "Repairs & Maintenance": "ซ่อมแซมและบำรุงรักษา",
    "Utilities & Connectivity": "ค่าสาธารณูปโภคและอินเทอร์เน็ต",
    "IT Costs": "ค่าใช้จ่ายด้านไอที",
    Garden: "สวน",
    "Transport & Fuel": "ขนส่งและเชื้อเพลิง",
    "Office & Admin": "สำนักงานและธุรการ",
    "Government, Bank & Legal": "ราชการ ธนาคาร และกฎหมาย",
    "Marketing & Reviews": "การตลาดและรีวิว",
    "Guest Services": "บริการผู้เข้าพัก",
    "Other Expenses": "ค่าใช้จ่ายอื่น ๆ",
  }[item.value] ?? item.label) : item.label;

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

  const receiptRequirementMet = receipts.length > 0 || receiptUnavailable;
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
    <WorkspaceShell title={t("Accounting", "บัญชี")} workspace="accounting" bodyClassName="accounting-shell" wide>
      <div className="accounting-page">
        {accounting.isLoading ? <PageLoading /> : null}
        {accounting.isError && !accounting.data ? <PageError onRetry={() => void accounting.refetch()} /> : null}
        {accounting.data ? (
          <>
            <section className="accounting-kpis" aria-label={t("Accounting totals", "ยอดรวมบัญชี")}>
              <article><span>{t("Checked-in net", "รายได้สุทธิที่เช็กอินแล้ว")}</span><strong>{money(totals?.expectedNetIncomeToDate, t("Unknown", "ไม่ทราบ"))}</strong></article>
              <article><span>{t("Future net forecast", "คาดการณ์รายได้สุทธิ")}</span><strong>{money(totals?.expectedFutureNetIncome, t("Unknown", "ไม่ทราบ"))}</strong></article>
              <article><span>{t("Manual income", "รายได้ที่บันทึก")}</span><strong>{money(totals?.manualIncome, t("Unknown", "ไม่ทราบ"))}</strong></article>
              <article><span>{t("Manual expenses", "ค่าใช้จ่ายที่บันทึก")}</span><strong>{money(totals?.manualExpenses, t("Unknown", "ไม่ทราบ"))}</strong></article>
            </section>

            <section className="accounting-panel">
              <header className="accounting-panel__header">
                <div>
                  <h2>{t("Manual entry", "บันทึกรายการ")}</h2>
                  <p>{t("Record income or expenses. Receipts stay attached for accountant review.", "บันทึกรายได้หรือค่าใช้จ่าย พร้อมแนบใบเสร็จสำหรับตรวจสอบ")}</p>
                </div>
              </header>
              <form className="accounting-form" onSubmit={onSubmit}>
                <label><span>{t("Type", "ประเภท")}</span><select value={entryType} onChange={(event) => {
                  const nextType = event.target.value as ManualEntryType;
                  setEntryType(nextType);
                  setCategory(categoriesFor(nextType)[0].value);
                }}><option value="income">{t("Income", "รายได้")}</option><option value="expense">{t("Expense", "ค่าใช้จ่าย")}</option></select></label>
                <label><span>{t("Date", "วันที่")}</span><input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label>
                <label><span>{t("Amount", "จำนวนเงิน")}</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                <label className="accounting-form__wide">
                  <span>{t("Category", "หมวดหมู่")}</span>
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {activeCategories.map((item) => <option key={item.value} value={item.value}>{categoryLabel(item)}</option>)}
                  </select>
                </label>
                <label className="accounting-form__wide"><span>{t("Description", "รายละเอียด")}</span><textarea value={description} placeholder={entryType === "expense" ? t("What was bought?", "ซื้ออะไร?") : t("What was collected?", "รับเงินจากอะไร?")} onChange={(event) => setDescription(event.target.value)} /></label>
                <div className="accounting-upload">
                  <span>{t("Receipt photos/PDFs", "รูปใบเสร็จ / PDF")}</span>
                  <div className="accounting-upload__actions">
                    <label className="accounting-upload__button">
                      <input type="file" accept="image/*" capture="environment" onChange={onReceipt} />
                      <span>{t("Take receipt photo", "ถ่ายรูปใบเสร็จ")}</span>
                    </label>
                    <label className="accounting-upload__button accounting-upload__button--secondary">
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={onReceipt} />
                      <span>{t("Choose files/PDFs", "เลือกไฟล์ / PDF")}</span>
                    </label>
                  </div>
                  {receipts.length > 0 ? (
                    <ol className="accounting-upload__list" aria-label={t("Selected receipt pages", "หน้าของใบเสร็จที่เลือก")}>
                      {receipts.map((receipt, index) => (
                        <li key={receipt.id} className="accounting-upload__item">
                          {receipt.contentType.startsWith("image/")
                            ? <img src={receipt.dataUrl} alt="" loading="lazy" decoding="async" />
                            : <span className="accounting-upload__file-type" aria-hidden="true">PDF</span>}
                          <span className="accounting-upload__file-name"><strong>{t(`Page ${index + 1}`, `หน้า ${index + 1}`)}</strong><small>{receipt.fileName}</small></span>
                          <button type="button" onClick={() => removeReceipt(receipt.id)} aria-label={`${t("Remove", "ลบ")} ${receipt.fileName}`}>{t("Remove", "ลบ")}</button>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <small>{receipts.length > 0 ? t(`${receipts.length} receipt page${receipts.length === 1 ? "" : "s"} selected.`, `เลือกใบเสร็จ ${receipts.length} หน้าแล้ว`) : t("Add readable JPG, PNG, WebP or PDF receipt pages.", "เพิ่มรูปหรือ PDF ใบเสร็จที่อ่านได้")}</small>
                  <label className="accounting-upload__unavailable">
                    <input type="checkbox" checked={receiptUnavailable} onChange={(event) => {
                      setReceiptUnavailable(event.target.checked);
                      if (event.target.checked) setReceipts([]);
                    }} />
                    <span>{t("Receipt unavailable", "ไม่มีใบเสร็จ")}</span>
                  </label>
                  {receiptError ? <small className="accounting-error">{receiptError}</small> : null}
                </div>
                <button className="accounting-action" disabled={!canSubmit || saveEntry.isPending} type="submit">{saveEntry.isPending ? t("Saving", "กำลังบันทึก") : t("Save entry", "บันทึกรายการ")}</button>
              </form>
              {saveEntry.isError ? <p className="accounting-error">{saveEntry.error instanceof Error ? saveEntry.error.message : "Entry could not be saved."}</p> : null}
            </section>

            <section className="accounting-panel">
              <header className="accounting-panel__header">
                <div>
                  <h2>{t("Export for accountant", "ส่งออกสำหรับนักบัญชี")}</h2>
                  <p>{t("Download income and expense movements for the selected fiscal period.", "ดาวน์โหลดรายการรายได้และค่าใช้จ่ายตามช่วงวันที่")}</p>
                </div>
                <a className="accounting-action" href={accountingExportUrl(from, to)}>{t("Export CSV", "ดาวน์โหลด CSV")}</a>
              </header>
              <div className="accounting-export-range">
                <label><span>{t("From", "ตั้งแต่")}</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
                <label><span>{t("To", "ถึง")}</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
