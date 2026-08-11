import { ValidationError, type CurrentUser } from "./current-user.service.js";
import { rebuildOtaFinancialRecords, type OtaFinancialBindings } from "./ota-financial-normalization.service.js";

export interface AccountingBindings extends OtaFinancialBindings {
  DB: D1Database;
  R2_STORAGE: R2Bucket;
}

export type ManualEntryType = "income" | "expense";

export interface ManualAccountingInput {
  entryType: ManualEntryType;
  entryDate: string;
  amount: number;
  description: string;
  note: string | null;
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
    fileName: string;
    contentType: string;
    uploadedAt: string;
    downloadUrl: string;
  } | null;
  createdAt: string;
  updatedAt: string;
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
  };
}

export function normalizeReceiptInput(payload: unknown): ReceiptInput | null {
  const input = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const dataUrl = typeof input.receiptDataUrl === "string" ? input.receiptDataUrl : "";
  if (!dataUrl) return null;
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new ValidationError("Receipt must be a data URL.");
  const contentType = match[1].toLowerCase();
  if (!RECEIPT_TYPES.has(contentType)) throw new ValidationError("Receipt must be JPG, PNG, WebP, or PDF.");
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  if (bytes.byteLength > MAX_RECEIPT_BYTES) throw new ValidationError("Receipt is too large.");
  const fileName = typeof input.receiptFileName === "string" && input.receiptFileName.trim()
    ? input.receiptFileName.trim().slice(0, 180)
    : `receipt.${contentType === "application/pdf" ? "pdf" : contentType.split("/")[1]}`;
  return { fileName, contentType, body: bytes.buffer };
}

function receiptKey(entryId: number, fileName: string): string {
  const safeName = fileName.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "receipt";
  return `accounting/receipts/${entryId}/${Date.now()}-${safeName}`;
}

function entry(row: ManualAccountingRow): AccountingEntry {
  return {
    id: row.accounting_entry_id,
    type: row.entry_type,
    date: row.entry_date,
    amount: row.amount,
    description: row.description,
    note: row.note,
    receipt: row.receipt_object_key && row.receipt_file_name && row.receipt_content_type && row.receipt_uploaded_at
      ? {
          fileName: row.receipt_file_name,
          contentType: row.receipt_content_type,
          uploadedAt: row.receipt_uploaded_at,
          downloadUrl: `/api/accounting/entries/${row.accounting_entry_id}/receipt`,
        }
      : null,
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
  const [otaRows, manualRows] = await Promise.all([
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
  ]);
  const otaRecords = (otaRows.results ?? []).map(ota);
  const manualEntries = (manualRows.results ?? []).map(entry);
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

export async function createManualAccountingEntry(env: AccountingBindings, input: ManualAccountingInput, receipt: ReceiptInput | null, user: CurrentUser): Promise<AccountingEntry> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO manual_accounting_entries (entry_type, entry_date, amount, description, note, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(input.entryType, input.entryDate, input.amount, input.description, input.note, user.id, now, now).run();
  const entryId = Number(result.meta.last_row_id);
  if (!Number.isInteger(entryId) || entryId <= 0) throw new Error("Accounting entry could not be saved.");

  if (receipt) {
    const key = receiptKey(entryId, receipt.fileName);
    await env.R2_STORAGE.put(key, receipt.body, {
      httpMetadata: { contentType: receipt.contentType },
      customMetadata: { area: "accounting", entryId: String(entryId), uploadedBy: user.id },
    });
    await env.DB.prepare(`
      UPDATE manual_accounting_entries
      SET receipt_object_key = ?, receipt_file_name = ?, receipt_content_type = ?, receipt_uploaded_at = ?, updated_at = ?
      WHERE accounting_entry_id = ?
    `).bind(key, receipt.fileName, receipt.contentType, now, now, entryId).run();
  }

  const row = await env.DB.prepare(`
    SELECT accounting_entry_id, entry_type, entry_date, amount, description, note, receipt_object_key,
      receipt_file_name, receipt_content_type, receipt_uploaded_at, created_at, updated_at
    FROM manual_accounting_entries
    WHERE accounting_entry_id = ?
  `).bind(entryId).first<ManualAccountingRow>();
  if (!row) throw new Error("Accounting entry not found after save.");
  return entry(row);
}

export async function getAccountingReceipt(env: AccountingBindings, entryId: number): Promise<{ object: R2ObjectBody; fileName: string; contentType: string } | null> {
  const row = await env.DB.prepare(`
    SELECT receipt_object_key, receipt_file_name, receipt_content_type
    FROM manual_accounting_entries
    WHERE accounting_entry_id = ?
  `).bind(entryId).first<{ receipt_object_key: string | null; receipt_file_name: string | null; receipt_content_type: string | null }>();
  if (!row?.receipt_object_key || !row.receipt_file_name || !row.receipt_content_type) return null;
  const object = await env.R2_STORAGE.get(row.receipt_object_key);
  return object ? { object, fileName: row.receipt_file_name, contentType: row.receipt_content_type } : null;
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
  const header = ["date", "type", "amount", "description", "note", "receipt_file"].join(",");
  const lines = (rows.results ?? []).map((row) => [
    row.entry_date,
    row.entry_type,
    String(row.amount),
    row.description,
    row.note ?? "",
    row.receipt_file_name ?? "",
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
  return [header, ...lines].join("\n");
}
