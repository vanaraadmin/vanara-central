import type { PassportData, PassportReviewValidation } from "./passport-ocr.service.js";

export interface BookingPassportBindings {
  DB: D1Database;
}

export interface BookingPassportRecord {
  id: number;
  bookingId: number;
  objectKey: string;
  source: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  passportNumber: string | null;
  nationality: string | null;
  gender: string | null;
  birthDate: string | null;
  expiryDate: string | null;
  documentType: string | null;
  issuingCountry: string | null;
  mrzLine1: string | null;
  mrzLine2: string | null;
  mrzValidation: unknown;
  fieldVerification: unknown;
  manualCorrections: unknown;
  qualityGate: unknown;
  tm30Status: "NOT_READY" | "READY" | "EXPORTED";
  createdAt: string;
}

interface BookingPassportRow {
  id: number;
  booking_id: number;
  object_key: string;
  source: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  passport_number: string | null;
  nationality: string | null;
  gender: string | null;
  birth_date: string | null;
  expiry_date: string | null;
  document_type: string | null;
  issuing_country: string | null;
  mrz_line_1: string | null;
  mrz_line_2: string | null;
  mrz_validation_json: string;
  field_verification_json: string;
  manual_corrections_json: string;
  quality_gate_json: string;
  tm30_status: "NOT_READY" | "READY" | "EXPORTED";
  created_at: string;
}

export interface CreateBookingPassportInput {
  bookingId: number;
  objectKey: string;
  passport: PassportData;
  validation?: PassportReviewValidation;
  manualCorrections?: unknown;
  createdBy?: string;
  verifiedBy?: string;
}

export const RECEPTION_OCR_PASSPORT_SOURCE = "reception_ocr_flow";

function fallbackValidation(input: CreateBookingPassportInput): PassportReviewValidation {
  return {
    firstPass: {
      documentType: null,
      issuingCountry: null,
      surname: input.passport.lastName,
      givenNames: input.passport.firstName,
      passportNumberVisual: input.passport.passportNumber,
      nationality: input.passport.nationality,
      dateOfBirth: input.passport.birthDate,
      sex: input.passport.gender,
      expiryDate: input.passport.expiryDate ?? null,
      personalNumber: null,
      mrzLine1: null,
      mrzLine2: null,
      mrzPassportNumber: null,
      rawVisualText: null,
      imageQualityAssessment: null,
      fieldStatus: {},
    },
    secondPass: {
      documentType: null,
      issuingCountry: null,
      surname: input.passport.lastName,
      givenNames: input.passport.firstName,
      passportNumberVisual: input.passport.passportNumber,
      nationality: input.passport.nationality,
      dateOfBirth: input.passport.birthDate,
      sex: input.passport.gender,
      expiryDate: input.passport.expiryDate ?? null,
      personalNumber: null,
      mrzLine1: null,
      mrzLine2: null,
      mrzPassportNumber: null,
      rawVisualText: null,
      imageQualityAssessment: null,
      fieldStatus: {},
    },
    consensus: {
      mrz: {
        mrzValid: false,
        formatValid: false,
        documentType: null,
        issuingCountry: null,
        surname: null,
        givenNames: null,
        passportNumber: null,
        nationality: null,
        dateOfBirth: null,
        sex: null,
        expiryDate: null,
        personalNumber: null,
        checks: { passportNumber: false, dateOfBirth: false, expiryDate: false, personalNumber: null, composite: false },
        issues: ["MRZ_NOT_AVAILABLE"],
      },
      fields: {
        passportNumber: { value: input.passport.passportNumber, state: "MANUALLY_VERIFIED", source: "manual", issues: [], visualPass1: input.passport.passportNumber, visualPass2: input.passport.passportNumber, mrzPass1: null, mrzPass2: null, conflicts: [] },
        firstName: { value: input.passport.firstName, state: "MANUALLY_VERIFIED", source: "manual", issues: [] },
        lastName: { value: input.passport.lastName, state: "MANUALLY_VERIFIED", source: "manual", issues: [] },
        nationality: { value: input.passport.nationality, state: "MANUALLY_VERIFIED", source: "manual", issues: [] },
        gender: { value: input.passport.gender, state: "MANUALLY_VERIFIED", source: "manual", issues: [] },
        birthDate: { value: input.passport.birthDate, state: "MANUALLY_VERIFIED", source: "manual", issues: [] },
        expiryDate: { value: input.passport.expiryDate ?? null, state: "MANUALLY_VERIFIED", source: "manual", issues: [] },
      },
      unresolvedCriticalConflicts: 0,
      tm30Ready: true,
    },
    ocrModel: "manual-test",
    schemaVersion: "fallback",
  };
}

function mapBookingPassport(row: BookingPassportRow): BookingPassportRecord {
  return {
    id: row.id,
    bookingId: row.booking_id,
    objectKey: row.object_key,
    source: row.source,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    passportNumber: row.passport_number,
    nationality: row.nationality,
    gender: row.gender,
    birthDate: row.birth_date,
    expiryDate: row.expiry_date,
    documentType: row.document_type,
    issuingCountry: row.issuing_country,
    mrzLine1: row.mrz_line_1,
    mrzLine2: row.mrz_line_2,
    mrzValidation: JSON.parse(row.mrz_validation_json || "{}") as unknown,
    fieldVerification: JSON.parse(row.field_verification_json || "{}") as unknown,
    manualCorrections: JSON.parse(row.manual_corrections_json || "{}") as unknown,
    qualityGate: JSON.parse(row.quality_gate_json || "{}") as unknown,
    tm30Status: row.tm30_status,
    createdAt: row.created_at,
  };
}

export async function createBookingPassport(env: BookingPassportBindings, input: CreateBookingPassportInput): Promise<BookingPassportRecord> {
  const createdAt = new Date().toISOString();
  const validation = input.validation ?? fallbackValidation(input);
  const tm30Status = validation.consensus.tm30Ready ? "READY" : "NOT_READY";
  const result = await env.DB.prepare(`
    INSERT INTO booking_passports (
      booking_id,
      object_key,
      source,
      first_name,
      middle_name,
      last_name,
      passport_number,
      nationality,
      gender,
      birth_date,
      expiry_date,
      document_type,
      issuing_country,
      mrz_line_1,
      mrz_line_2,
      mrz_validation_json,
      field_verification_json,
      manual_corrections_json,
      quality_gate_json,
      ocr_model,
      ocr_schema_version,
      tm30_status,
      created_by,
      verified_by,
      verified_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.bookingId,
    input.objectKey,
    RECEPTION_OCR_PASSPORT_SOURCE,
    input.passport.firstName,
    input.passport.middleName,
    input.passport.lastName,
    input.passport.passportNumber,
    input.passport.nationality,
    input.passport.gender,
    input.passport.birthDate,
    input.passport.expiryDate ?? validation.consensus.fields.expiryDate.value,
    validation.firstPass.documentType ?? validation.consensus.mrz.documentType,
    validation.firstPass.issuingCountry ?? validation.consensus.mrz.issuingCountry,
    validation.firstPass.mrzLine1 ?? validation.secondPass.mrzLine1,
    validation.firstPass.mrzLine2 ?? validation.secondPass.mrzLine2,
    JSON.stringify(validation.consensus.mrz),
    JSON.stringify(validation.consensus.fields),
    JSON.stringify(input.manualCorrections ?? {}),
    JSON.stringify({ status: "ACCEPTED_FOR_OCR" }),
    validation.ocrModel,
    validation.schemaVersion,
    tm30Status,
    input.createdBy ?? null,
    input.verifiedBy ?? null,
    createdAt,
    createdAt,
  ).run();

  return {
    id: Number(result.meta.last_row_id),
    bookingId: input.bookingId,
    objectKey: input.objectKey,
    source: RECEPTION_OCR_PASSPORT_SOURCE,
    firstName: input.passport.firstName,
    middleName: input.passport.middleName,
    lastName: input.passport.lastName,
    passportNumber: input.passport.passportNumber,
    nationality: input.passport.nationality,
    gender: input.passport.gender,
    birthDate: input.passport.birthDate,
    expiryDate: input.passport.expiryDate ?? validation.consensus.fields.expiryDate.value,
    documentType: validation.firstPass.documentType ?? validation.consensus.mrz.documentType,
    issuingCountry: validation.firstPass.issuingCountry ?? validation.consensus.mrz.issuingCountry,
    mrzLine1: validation.firstPass.mrzLine1 ?? validation.secondPass.mrzLine1,
    mrzLine2: validation.firstPass.mrzLine2 ?? validation.secondPass.mrzLine2,
    mrzValidation: validation.consensus.mrz,
    fieldVerification: validation.consensus.fields,
    manualCorrections: input.manualCorrections ?? {},
    qualityGate: { status: "ACCEPTED_FOR_OCR" },
    tm30Status,
    createdAt,
  };
}

export async function listBookingPassports(env: BookingPassportBindings, bookingId: number): Promise<BookingPassportRecord[]> {
  const rows = await env.DB.prepare(`
    SELECT
      id,
      booking_id,
      object_key,
      source,
      first_name,
      middle_name,
      last_name,
      passport_number,
      nationality,
      gender,
      birth_date,
      expiry_date,
      document_type,
      issuing_country,
      mrz_line_1,
      mrz_line_2,
      mrz_validation_json,
      field_verification_json,
      manual_corrections_json,
      quality_gate_json,
      tm30_status,
      created_at
    FROM booking_passports
    WHERE booking_id = ?
      AND source = ?
    ORDER BY created_at ASC, id ASC
  `).bind(bookingId, RECEPTION_OCR_PASSPORT_SOURCE).all<BookingPassportRow>();

  return (rows.results ?? []).map(mapBookingPassport);
}
