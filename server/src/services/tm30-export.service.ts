import { operationalBookingStatusSql } from "./booking-status.service.js";
import { buildTm30NationalityMap, tm30NationalityCodeFrom } from "./tm30-nationality.service.js";
import { getBangkokDate } from "./today.service.js";
import { readZipEntries, textEntry, updateTextEntry, writeStoredZip } from "./tm30-zip.service.js";

export interface Tm30Bindings {
  DB: D1Database;
}

export interface Tm30PassportRow {
  bookingId: number;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  gender: string | null;
  passportNumber: string | null;
  nationality: string | null;
  birthDate: string | null;
  checkOutDate: string;
  phone: string | null;
}

export interface Tm30MissingField {
  bookingId: number;
  passportId?: number;
  field: "firstName" | "gender" | "passportNumber" | "nationality";
}

export interface Tm30WorkbookResult {
  workbook: Uint8Array;
  missingFields: Tm30MissingField[];
  rowCount: number;
}

interface Tm30PassportSqlRow {
  id: number;
  booking_id: number;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  passport_number: string | null;
  nationality: string | null;
  gender: string | null;
  birth_date: string | null;
  departure_date: string;
  phone: string | null;
  mobile: string | null;
}

const TEMPLATE_SHEET_PATH = "xl/worksheets/sheet1.xml";
const SHEET_DATA_PATTERN = /<sheetData>[\s\S]*<\/sheetData>/;
const DIMENSION_PATTERN = /<dimension ref="[^"]*"/;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeGender(value: string | null | undefined): string {
  const text = value?.trim().toUpperCase();
  if (!text) return "";
  if (text === "M" || text === "MALE") return "M";
  if (text === "F" || text === "FEMALE") return "F";
  return "";
}

function formatDateForTm30(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const tm30 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (tm30) return text;
  return "";
}

function inlineCell(reference: string, value: string, style = 1): string {
  if (!value) return "";
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function tm30Row(rowNumber: number, row: Tm30PassportRow, nationalityMap: Map<string, string>): string {
  const values = [
    inlineCell(`A${rowNumber}`, cleanText(row.firstName)),
    inlineCell(`B${rowNumber}`, cleanText(row.middleName)),
    inlineCell(`C${rowNumber}`, cleanText(row.lastName)),
    inlineCell(`D${rowNumber}`, normalizeGender(row.gender)),
    inlineCell(`E${rowNumber}`, cleanText(row.passportNumber)),
    inlineCell(`F${rowNumber}`, tm30NationalityCodeFrom(row.nationality, nationalityMap) ?? ""),
    inlineCell(`G${rowNumber}`, formatDateForTm30(row.birthDate), 4),
    inlineCell(`H${rowNumber}`, formatDateForTm30(row.checkOutDate), 4),
    inlineCell(`I${rowNumber}`, cleanText(row.phone)),
  ].filter(Boolean).join("");
  return `<row r="${rowNumber}" customFormat="false" ht="14.4" hidden="false" customHeight="false" outlineLevel="0" collapsed="false">${values}</row>`;
}

function requiredMissingFields(row: Tm30PassportRow, nationalityMap: Map<string, string>): Tm30MissingField[] {
  const missing: Tm30MissingField[] = [];
  if (!cleanText(row.firstName)) missing.push({ bookingId: row.bookingId, field: "firstName" });
  if (!normalizeGender(row.gender)) missing.push({ bookingId: row.bookingId, field: "gender" });
  if (!cleanText(row.passportNumber)) missing.push({ bookingId: row.bookingId, field: "passportNumber" });
  if (!tm30NationalityCodeFrom(row.nationality, nationalityMap)) missing.push({ bookingId: row.bookingId, field: "nationality" });
  return missing;
}

function updateWorksheet(templateSheet: string, rows: Tm30PassportRow[], nationalityMap: Map<string, string>): string {
  const headerRow = templateSheet.match(/<row r="1"[\s\S]*?<\/row>/)?.[0];
  if (!headerRow) throw new Error("TM30 template first sheet is missing the header row.");
  const dataRows = rows.map((row, index) => tm30Row(index + 2, row, nationalityMap)).join("");
  const lastRow = Math.max(5, rows.length + 1);
  return templateSheet
    .replace(DIMENSION_PATTERN, `<dimension ref="A1:I${lastRow}"`)
    .replace(SHEET_DATA_PATTERN, `<sheetData>${headerRow}${dataRows}</sheetData>`);
}

function mapTm30PassportRow(row: Tm30PassportSqlRow): Tm30PassportRow {
  return {
    bookingId: row.booking_id,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    passportNumber: row.passport_number,
    nationality: row.nationality,
    gender: row.gender,
    birthDate: row.birth_date,
    checkOutDate: row.departure_date,
    phone: row.mobile || row.phone,
  };
}

export function normalizeTm30Date(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) return getBangkokDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("TM30 export date must use YYYY-MM-DD.");
  return text;
}

export async function listTm30PassportRows(env: Tm30Bindings, date: string): Promise<Tm30PassportRow[]> {
  const rows = await env.DB.prepare(`
    SELECT
      bp.id,
      bp.booking_id,
      bp.first_name,
      bp.middle_name,
      bp.last_name,
      bp.passport_number,
      bp.nationality,
      bp.gender,
      bp.birth_date,
      b.departure_date,
      b.phone,
      b.mobile
    FROM booking_passports bp
    INNER JOIN bookings b ON b.beds24_booking_id = bp.booking_id
    WHERE b.arrival_date = ?
      AND bp.tm30_status = 'READY'
      AND ${operationalBookingStatusSql("b.status")}
    ORDER BY b.unit_id, b.beds24_booking_id, bp.created_at, bp.id
  `).bind(date).all<Tm30PassportSqlRow>();

  return (rows.results ?? []).map(mapTm30PassportRow);
}

export async function generateTm30Workbook(template: ArrayBuffer, rows: Tm30PassportRow[]): Promise<Tm30WorkbookResult> {
  const entries = await readZipEntries(template.slice(0));
  const nationalityMap = await buildTm30NationalityMap(template.slice(0));
  const missingFields = rows.flatMap((row) => requiredMissingFields(row, nationalityMap));
  const worksheet = updateWorksheet(textEntry(entries, TEMPLATE_SHEET_PATH), rows, nationalityMap);
  return {
    workbook: writeStoredZip(updateTextEntry(entries, TEMPLATE_SHEET_PATH, worksheet)),
    missingFields,
    rowCount: rows.length,
  };
}
