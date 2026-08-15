import { ValidationError, type CurrentUser } from "./current-user.service.js";
import { rebuildOtaFinancialRecords, type OtaFinancialBindings } from "./ota-financial-normalization.service.js";

export interface AccountingBindings extends OtaFinancialBindings {
  DB: D1Database;
  R2_STORAGE: R2Bucket;
}

export type ManualEntryType = "income" | "expense";

const MANUAL_EXPENSE_CATEGORY_ALIASES: Record<string, string> = {
  "software & subscriptions": "IT Costs",
  "it costs": "IT Costs",
  "garden & outdoor": "Garden",
  "garden & pool": "Garden",
  garden: "Garden",
};

export function canonicalManualExpenseCategory(value: string): string {
  const trimmed = value.trim();
  return MANUAL_EXPENSE_CATEGORY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function manualAccountingCategory(note: string | null, fallback: string): string {
  const match = note?.match(/(?:^|;)\s*category:\s*([^;]+)/i);
  const category = match?.[1]?.trim();
  return canonicalManualExpenseCategory(category || fallback);
}

export interface ManualAccountingInput {
  entryType: ManualEntryType;
  entryDate: string;
  amount: number;
  description: string;
  note: string | null;
  receiptUnavailable: boolean;
}

export interface ReceiptInput {
  fileName: string;
  contentType: string;
  body: ArrayBuffer;
}

interface ManualAccountingRow {
  accounting_entry_id: number;
  entry_type: ManualEntryType;
  entry_date: string;
  amount: number;
  description: string;
  note: string | null;
  receipt_object_key: string | null;
  receipt_file_name: string | null;
  receipt_content_type: string | null;
  receipt_uploaded_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AccountingAttachmentRow {
  accounting_attachment_id: number;
  accounting_entry_id: number;
  sort_order: number;
  object_key: string;
  file_name: string;
  content_type: string;
  byte_size: number | null;
  uploaded_at: string;
}

interface OtaFinancialRow {
  ota_financial_record_id: number;
  channel: string;
  ota_booking_id: string | null;
  beds24_booking_id: number;
  booking_group_id: string | null;
  is_group_master: number;
  check_in: string;
  check_out: string;
  room_count: number;
  gross_booking_amount: number | null;
  tax_and_service_charge_amount: number | null;
  ota_fees: number | null;
  expected_net_payout: number | null;
  payment_method: string | null;
  guest_payment_status: string | null;
  source_confidence: "high" | "medium" | "low";
  raw_rate_description: string | null;
  raw_channel_info: string | null;
  created_at: string;
  updated_at: string;
  guest_name: string | null;
}

export interface AccountingEntry {
  id: number;
  type: ManualEntryType;
  date: string;
  amount: number;
  description: string;
  note: string | null;
  receipt: {
    id: number | null;
    page: number;
    fileName: string;
    contentType: string;
    byteSize: number | null;
    uploadedAt: string;
    downloadUrl: string;
  } | null;
  attachments: AccountingAttachment[];
  receiptUnavailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingAttachment {
  id: number;
  page: number;
  fileName: string;
  contentType: string;
  byteSize: number | null;
  uploadedAt: string;
  downloadUrl: string;
}

export interface AccountingOtaRecord {
  id: number;
  channel: string;
  otaBookingId: string | null;
  beds24BookingId: number;
  bookingGroupId: string | null;
  isGroupMaster: boolean;
  checkIn: string;
  checkOut: string;
  roomCount: number;
  grossBookingAmount: number | null;
  taxAndServiceChargeAmount: number | null;
  otaFees: number | null;
  expectedNetPayout: number | null;
  paymentMethod: string | null;
  guestPaymentStatus: string | null;
  sourceConfidence: "high" | "medium" | "low";
  rawRateDescription: string | null;
  rawChannelInfo: string | null;
  createdAt: string;
  updatedAt: string;
  guestName: string | null;
}

export interface AccountingOverview {
  generatedAt: string;
  totals: {
    expectedNetIncomeToDate: number;
    expectedFutureNetIncome: number;
    manualIncome: number;
    manualExpenses: number;
    netManualPosition: number;
  };
  otaRecords: AccountingOtaRecord[];
  manualEntries: AccountingEntry[];
}

const RECEIPT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPTS_PER_ENTRY = 10;

function dateOnly(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`${label} must be a date.`);
  return value;
}

function positiveAmount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new ValidationError("Amount must be greater than zero.");
  return Math.round(parsed * 100) / 100;
}

function clean(value: unknown, label: string, max = 240): string {
  if (typeof value !== "string") throw new ValidationError(`${label} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${label} is required.`);
  return trimmed.slice(0, max);
}

export function normalizeManualAccountingInput(payload: unknown): ManualAccountingInput {
  const input = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const entryType = input.entryType === "income" || input.entryType === "expense" ? input.entryType : null;
  if (!entryType) throw new ValidationError("Entry type must be income or expense.");
  return {
    entryType,
    entryDate: dateOnly(input.entryDate, "Entry date"),
    amount: positiveAmount(input.amount),
    description: clean(input.description, "Description"),
    note: typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 1000) : null,
    receiptUnavailable: input.receiptUnavailable === true,
  };
}

function receiptInput(dataUrlValue: unknown, fileNameValue: unknown): ReceiptInput {
  const dataUrl = typeof dataUrlValue === "string" ? dataUrlValue : "";
  if (!dataUrl) throw new ValidationError("Receipt data is required.");
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new ValidationError("Receipt must be a data URL.");
  const contentType = match[1].toLowerCase();
  if (!RECEIPT_TYPES.has(contentType)) throw new ValidationError("Receipt must be JPG, PNG, WebP, or PDF.");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  } catch {
    throw new ValidationError("Receipt data is invalid.");
  }
  if (bytes.byteLength <= 0) throw new ValidationError("Receipt is empty.");
  if (bytes.byteLength > MAX_RECEIPT_BYTES) throw new ValidationError("Receipt is too large.");
  const fileName = typeof fileNameValue === "string" && fileNameValue.trim()
    ? fileNameValue.trim().slice(0, 180)
    : `receipt.${contentType === "application/pdf" ? "pdf" : contentType.split("/")[1]}`;
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return { fileName, contentType, body };
}

export function normalizeReceiptInput(payload: unknown): ReceiptInput[] {
  const input = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (Array.isArray(input.receipts)) {
    if (input.receipts.length > MAX_RECEIPTS_PER_ENTRY) throw new ValidationError(`A maximum of ${MAX_RECEIPTS_PER_ENTRY} receipts is allowed.`);
    return input.receipts.map((item) => {
      const receipt = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return receiptInput(receipt.dataUrl, receipt.fileName);
    });
  }
  if (!input.receiptDataUrl) return [];
  return [receiptInput(input.receiptDataUrl, input.receiptFileName)];
}

function receiptKey(entryId: number, page: number, fileName: string): string {
  const safeName = fileName.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "receipt";
  return `accounting/receipts/${entryId}/${String(page).padStart(2, "0")}-${crypto.randomUUID()}-${safeName}`;
}

function attachment(row: AccountingAttachmentRow): AccountingAttachment {
  return {
    id: row.accounting_attachment_id,
    page: row.sort_order,
    fileName: row.file_name,
    contentType: row.content_type,
    byteSize: row.byte_size,
    uploadedAt: row.uploaded_at,
    downloadUrl: `/api/accounting/entries/${row.accounting_entry_id}/attachments/${row.accounting_attachment_id}`,
  };
}

function receiptUnavailable(note: string | null): boolean {
  return /(?:^|;)\s*receipt:\s*(?:not[_ ]available|unavailable)(?:;|$)/i.test(note ?? "");
}

function noteWithReceiptStatus(note: string | null, unavailable: boolean): string | null {
  const withoutStatus = (note ?? "").replace(/(?:^|;)\s*receipt:\s*(?:not[_ ]available|unavailable)(?=;|$)/gi, "").replace(/^\s*;|;\s*$/g, "").trim();
  return unavailable ? [withoutStatus, "receipt: unavailable"].filter(Boolean).join("; ") : withoutStatus || null;
}

function entry(row: ManualAccountingRow, rows: AccountingAttachmentRow[] = []): AccountingEntry {
  const attachments = rows.map(attachment);
  const first = attachments[0] ?? (row.receipt_object_key && row.receipt_file_name && row.receipt_content_type && row.receipt_uploaded_at
    ? {
        id: null,
        page: 1,
        fileName: row.receipt_file_name,
        contentType: row.receipt_content_type,
        byteSize: null,
        uploadedAt: row.receipt_uploaded_at,
        downloadUrl: `/api/accounting/entries/${row.accounting_entry_id}/receipt`,
      }
    : null);
  return {
    id: row.accounting_entry_id,
    type: row.entry_type,
    date: row.entry_date,
    amount: row.amount,
    description: row.description,
    note: row.note,
    receipt: first,
    attachments,
    receiptUnavailable: receiptUnavailable(row.note),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ota(row: OtaFinancialRow): AccountingOtaRecord {
  return {
    id: row.ota_financial_record_id,
    channel: row.channel,
    otaBookingId: row.ota_booking_id,
    beds24BookingId: row.beds24_booking_id,
    bookingGroupId: row.booking_group_id,
    isGroupMaster: row.is_group_master === 1,
    checkIn: row.check_in,
    checkOut: row.check_out,
    roomCount: row.room_count,
    grossBookingAmount: row.gross_booking_amount,
    taxAndServiceChargeAmount: row.tax_and_service_charge_amount,
    otaFees: row.ota_fees,
    expectedNetPayout: row.expected_net_payout,
    paymentMethod: row.payment_method,
    guestPaymentStatus: row.guest_payment_status,
    sourceConfidence: row.source_confidence,
    rawRateDescription: row.raw_rate_description,
    rawChannelInfo: row.raw_channel_info,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    guestName: row.guest_name,
  };
}

function sum(values: Array<number | null | undefined>): number {
  return Math.round(values.reduce<number>((total, value) => total + (value ?? 0), 0) * 100) / 100;
}

export async function getAccountingOverview(env: AccountingBindings, today = new Date().toISOString().slice(0, 10)): Promise<AccountingOverview> {
  await rebuildOtaFinancialRecords(env);
  const [otaRows, manualRows, attachmentRows] = await Promise.all([
    env.DB.prepare(`
      SELECT f.ota_financial_record_id, f.channel, f.ota_booking_id, f.beds24_booking_id, f.booking_group_id, f.is_group_master,
        f.check_in, f.check_out, f.room_count, f.gross_booking_amount, f.tax_and_service_charge_amount, f.ota_fees,
        f.expected_net_payout, f.payment_method, f.guest_payment_status, f.source_confidence,
        f.raw_rate_description, f.raw_channel_info, f.created_at, f.updated_at,
        COALESCE(NULLIF(TRIM(b.guest_name), ''), NULLIF(TRIM(COALESCE(b.first_name, '') || ' ' || COALESCE(b.last_name, '')), '')) AS guest_name
      FROM ota_financial_records f
      LEFT JOIN bookings b
        ON b.beds24_booking_id = f.beds24_booking_id
      ORDER BY f.check_in DESC, f.ota_financial_record_id DESC
      LIMIT 160
    `).all<OtaFinancialRow>(),
    env.DB.prepare(`
      SELECT accounting_entry_id, entry_type, entry_date, amount, description, note, receipt_object_key,
        receipt_file_name, receipt_content_type, receipt_uploaded_at, created_at, updated_at
      FROM manual_accounting_entries
      ORDER BY entry_date DESC, accounting_entry_id DESC
      LIMIT 160
    `).all<ManualAccountingRow>(),
    env.DB.prepare(`
      SELECT accounting_attachment_id, accounting_entry_id, sort_order, object_key, file_name, content_type, byte_size, uploaded_at
      FROM accounting_entry_attachments
      ORDER BY accounting_entry_id DESC, sort_order
    `).all<AccountingAttachmentRow>(),
  ]);
  const otaRecords = (otaRows.results ?? []).map(ota);
  const attachmentsByEntry = new Map<number, AccountingAttachmentRow[]>();
  for (const row of attachmentRows.results ?? []) {
    const current = attachmentsByEntry.get(row.accounting_entry_id) ?? [];
    current.push(row);
    attachmentsByEntry.set(row.accounting_entry_id, current);
  }
  const manualEntries = (manualRows.results ?? []).map((row) => entry(row, attachmentsByEntry.get(row.accounting_entry_id) ?? []));
  const toDate = otaRecords.filter((item) => item.checkIn <= today);
  const future = otaRecords.filter((item) => item.checkIn > today);
  const manualIncome = manualEntries.filter((item) => item.type === "income");
  const manualExpenses = manualEntries.filter((item) => item.type === "expense");
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      expectedNetIncomeToDate: sum(toDate.map((item) => item.expectedNetPayout)),
      expectedFutureNetIncome: sum(future.map((item) => item.expectedNetPayout)),
      manualIncome: sum(manualIncome.map((item) => item.amount)),
      manualExpenses: sum(manualExpenses.map((item) => item.amount)),
      netManualPosition: sum(manualIncome.map((item) => item.amount)) - sum(manualExpenses.map((item) => item.amount)),
    },
    otaRecords,
    manualEntries,
  };
}

async function rollbackNewAccountingEntry(env: AccountingBindings, entryId: number, objectKeys: string[]): Promise<void> {
  const objectResults = await Promise.allSettled(objectKeys.map((key) => env.R2_STORAGE.delete(key)));
  let entryRollbackFailed = false;
  try {
    await env.DB.prepare(`DELETE FROM manual_accounting_entries WHERE accounting_entry_id = ?`).bind(entryId).run();
  } catch {
    entryRollbackFailed = true;
  }
  const failedObjectDeletes = objectResults.filter((result) => result.status === "rejected").length;
  if (entryRollbackFailed || failedObjectDeletes > 0) {
    console.error("accounting_entry_rollback_incomplete", { entryId, failedObjectDeletes, entryRollbackFailed });
  }
}

export async function listAccountingAttachments(env: AccountingBindings, entryId: number): Promise<AccountingAttachment[]> {
  const rows = await env.DB.prepare(`
    SELECT accounting_attachment_id, accounting_entry_id, sort_order, object_key, file_name, content_type, byte_size, uploaded_at
    FROM accounting_entry_attachments
    WHERE accounting_entry_id = ?
    ORDER BY sort_order, accounting_attachment_id
  `).bind(entryId).all<AccountingAttachmentRow>();
  return (rows.results ?? []).map(attachment);
}

export async function createManualAccountingEntry(env: AccountingBindings, input: ManualAccountingInput, receipts: ReceiptInput[], user: CurrentUser): Promise<AccountingEntry> {
  const receiptUnavailable = input.entryType === "expense" && receipts.length === 0 && input.receiptUnavailable;
  if (input.entryType === "expense" && receipts.length === 0 && !receiptUnavailable) {
    throw new ValidationError("Add at least one receipt, or mark Receipt unavailable.");
  }
  const now = new Date().toISOString();
  const note = noteWithReceiptStatus(input.note, receiptUnavailable);
  const result = await env.DB.prepare(`
    INSERT INTO manual_accounting_entries (entry_type, entry_date, amount, description, note, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(input.entryType, input.entryDate, input.amount, input.description, note, user.id, now, now).run();
  const entryId = Number(result.meta.last_row_id);
  if (!Number.isInteger(entryId) || entryId <= 0) throw new Error("Accounting entry could not be saved.");

  const planned = receipts.map((receipt, index) => ({
    receipt,
    page: index + 1,
    key: receiptKey(entryId, index + 1, receipt.fileName),
  }));
  const uploadedKeys: string[] = [];
  try {
    const uploads = await Promise.allSettled(planned.map(async ({ receipt, page, key }) => {
      await env.R2_STORAGE.put(key, receipt.body, {
        httpMetadata: { contentType: receipt.contentType },
        customMetadata: { area: "accounting", entryId: String(entryId), page: String(page), uploadedBy: user.id },
      });
      uploadedKeys.push(key);
    }));
    const failedUpload = uploads.find((upload) => upload.status === "rejected");
    if (failedUpload?.status === "rejected") throw failedUpload.reason;

    if (planned.length > 0) {
      const statements = planned.map(({ receipt, page, key }) => env.DB.prepare(`
        INSERT INTO accounting_entry_attachments (
          accounting_entry_id, sort_order, object_key, file_name, content_type, byte_size, uploaded_at, created_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(entryId, page, key, receipt.fileName, receipt.contentType, receipt.body.byteLength, now, user.id, now));
      const first = planned[0];
      statements.push(env.DB.prepare(`
        UPDATE manual_accounting_entries
        SET receipt_object_key = ?, receipt_file_name = ?, receipt_content_type = ?, receipt_uploaded_at = ?, updated_at = ?
        WHERE accounting_entry_id = ?
      `).bind(first.key, first.receipt.fileName, first.receipt.contentType, now, now, entryId));
      await env.DB.batch(statements);
    }

    const row = await env.DB.prepare(`
      SELECT accounting_entry_id, entry_type, entry_date, amount, description, note, receipt_object_key,
        receipt_file_name, receipt_content_type, receipt_uploaded_at, created_at, updated_at
      FROM manual_accounting_entries
      WHERE accounting_entry_id = ?
    `).bind(entryId).first<ManualAccountingRow>();
    if (!row) throw new Error("Accounting entry not found after save.");
    const attachmentRows = await env.DB.prepare(`
      SELECT accounting_attachment_id, accounting_entry_id, sort_order, object_key, file_name, content_type, byte_size, uploaded_at
      FROM accounting_entry_attachments
      WHERE accounting_entry_id = ?
      ORDER BY sort_order, accounting_attachment_id
    `).bind(entryId).all<AccountingAttachmentRow>();
    return entry(row, attachmentRows.results ?? []);
  } catch (error) {
    await rollbackNewAccountingEntry(env, entryId, uploadedKeys);
    throw error;
  }
}

interface AccountingReceiptStorageRow {
  object_key: string;
  file_name: string;
  content_type: string;
}

async function accountingReceiptObject(env: AccountingBindings, row: AccountingReceiptStorageRow | null): Promise<{ object: R2ObjectBody; fileName: string; contentType: string } | null> {
  if (!row) return null;
  const object = await env.R2_STORAGE.get(row.object_key);
  return object ? { object, fileName: row.file_name, contentType: row.content_type } : null;
}

export async function getAccountingReceipt(env: AccountingBindings, entryId: number): Promise<{ object: R2ObjectBody; fileName: string; contentType: string } | null> {
  const attachmentRow = await env.DB.prepare(`
    SELECT object_key, file_name, content_type
    FROM accounting_entry_attachments
    WHERE accounting_entry_id = ?
    ORDER BY sort_order, accounting_attachment_id
    LIMIT 1
  `).bind(entryId).first<AccountingReceiptStorageRow>();
  if (attachmentRow) return accountingReceiptObject(env, attachmentRow);
  const legacyRow = await env.DB.prepare(`
    SELECT receipt_object_key AS object_key, receipt_file_name AS file_name, receipt_content_type AS content_type
    FROM manual_accounting_entries
    WHERE accounting_entry_id = ?
      AND receipt_object_key IS NOT NULL
      AND receipt_file_name IS NOT NULL
      AND receipt_content_type IS NOT NULL
  `).bind(entryId).first<AccountingReceiptStorageRow>();
  return accountingReceiptObject(env, legacyRow);
}

export async function getAccountingAttachment(env: AccountingBindings, entryId: number, attachmentId: number): Promise<{ object: R2ObjectBody; fileName: string; contentType: string } | null> {
  const row = await env.DB.prepare(`
    SELECT object_key, file_name, content_type
    FROM accounting_entry_attachments
    WHERE accounting_entry_id = ? AND accounting_attachment_id = ?
  `).bind(entryId, attachmentId).first<AccountingReceiptStorageRow>();
  return accountingReceiptObject(env, row);
}

export function accountingAttachmentExportName(entryId: number, page: number, fileName: string, contentType: string): string {
  const originalExtension = /\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1]?.toLowerCase();
  const extension = originalExtension && ["jpg", "jpeg", "png", "webp", "pdf"].includes(originalExtension)
    ? originalExtension
    : contentType === "application/pdf" ? "pdf" : contentType.split("/")[1] || "bin";
  return `entry-${String(entryId).padStart(6, "0")}-page-${String(page).padStart(2, "0")}.${extension}`;
}

export async function exportAccountingCsv(env: AccountingBindings, from: string, to: string): Promise<string> {
  const start = dateOnly(from, "From date");
  const end = dateOnly(to, "To date");
  const rows = await env.DB.prepare(`
    SELECT accounting_entry_id, entry_type, entry_date, amount, description, note, receipt_object_key,
      receipt_file_name, receipt_content_type, receipt_uploaded_at, created_at, updated_at
    FROM manual_accounting_entries
    WHERE entry_date BETWEEN ? AND ?
    ORDER BY entry_date, accounting_entry_id
  `).bind(start, end).all<ManualAccountingRow>();
  const attachmentRows = await env.DB.prepare(`
    SELECT a.accounting_attachment_id, a.accounting_entry_id, a.sort_order, a.object_key, a.file_name, a.content_type, a.byte_size, a.uploaded_at
    FROM accounting_entry_attachments a
    INNER JOIN manual_accounting_entries e ON e.accounting_entry_id = a.accounting_entry_id
    WHERE e.entry_date BETWEEN ? AND ?
    ORDER BY a.accounting_entry_id, a.sort_order, a.accounting_attachment_id
  `).bind(start, end).all<AccountingAttachmentRow>();
  const attachmentsByEntry = new Map<number, AccountingAttachmentRow[]>();
  for (const row of attachmentRows.results ?? []) {
    const current = attachmentsByEntry.get(row.accounting_entry_id) ?? [];
    current.push(row);
    attachmentsByEntry.set(row.accounting_entry_id, current);
  }
  const header = ["date", "type", "amount", "description", "category", "note", "receipt_file", "receipt_files"].join(",");
  const lines = (rows.results ?? []).map((row) => [
    row.entry_date,
    row.entry_type,
    String(row.amount),
    row.description,
    manualAccountingCategory(row.note, row.entry_type === "income" ? "Other Manual Income" : "Other Expenses"),
    row.note ?? "",
    row.receipt_file_name ?? "",
    (attachmentsByEntry.get(row.accounting_entry_id) ?? []).map((item) => accountingAttachmentExportName(
      row.accounting_entry_id,
      item.sort_order,
      item.file_name,
      item.content_type,
    )).join("; "),
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
  return [header, ...lines].join("\n");
}
