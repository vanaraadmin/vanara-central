import type { PassportData } from "../types/reception";
import { formatNationalityText } from "./country-nationality";

export type PassportReviewField = "firstName" | "middleName" | "lastName" | "passportNumber" | "nationality" | "gender" | "birthDate" | "expiryDate";

export const PASSPORT_REVIEW_FIELDS: Array<{ key: PassportReviewField; label: string }> = [
  { key: "firstName", label: "First name" },
  { key: "middleName", label: "Middle name" },
  { key: "lastName", label: "Last name" },
  { key: "passportNumber", label: "Passport number" },
  { key: "nationality", label: "Nationality" },
  { key: "gender", label: "Gender" },
  { key: "birthDate", label: "Birth date" },
  { key: "expiryDate", label: "Expiry date" },
];

export const TM30_REQUIRED_REVIEW_FIELDS: PassportReviewField[] = ["firstName", "lastName", "passportNumber", "nationality", "gender", "birthDate"];

export function passportReviewFieldLabel(field: PassportReviewField): string {
  return PASSPORT_REVIEW_FIELDS.find((item) => item.key === field)?.label ?? field;
}

export function normalizePassportReviewDraft(passport: PassportData): PassportData {
  return {
    ...passport,
    nationality: formatNationalityText(passport.nationality),
  };
}

const MONTH_ALIASES: Record<string, number> = {
  JAN: 1, JANV: 1, GEN: 1,
  FEB: 2, FEV: 2,
  MAR: 3,
  APR: 4, AVR: 4,
  MAY: 5, MAI: 5, MAG: 5,
  JUN: 6, JUIN: 6, GIU: 6,
  JUL: 7, JUIL: 7, LUG: 7,
  AUG: 8, AOUT: 8, AGO: 8,
  SEP: 9, SEPT: 9, SET: 9,
  OCT: 10, OTT: 10,
  NOV: 11,
  DEC: 12, DIC: 12,
};

function validIsoDate(year: number, month: number, day: number): string | null {
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizePassportDateInput(value: string | null | undefined): string | null {
  const input = value?.trim() ?? "";
  if (!input) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = /^(\d{1,2})[\s./-]+(\d{1,2})[\s./-]+(\d{4})$/.exec(input);
  if (numeric) return validIsoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));

  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9/]+/g, " ")
    .trim();
  const parts = normalized.split(/\s+/);
  if (parts.length !== 3 || !/^\d{1,2}$/.test(parts[0]) || !/^\d{4}$/.test(parts[2])) return null;
  const month = parts[1]
    .split("/")
    .map((part) => MONTH_ALIASES[part])
    .find((candidate): candidate is number => Boolean(candidate));
  return month ? validIsoDate(Number(parts[2]), month, Number(parts[0])) : null;
}

export function invalidPassportReviewDateField(passport: PassportData): "birthDate" | "expiryDate" | null {
  if (passport.birthDate?.trim() && !normalizePassportDateInput(passport.birthDate)) return "birthDate";
  if (passport.expiryDate?.trim() && !normalizePassportDateInput(passport.expiryDate)) return "expiryDate";
  return null;
}

export function normalizePassportReviewForSave(passport: PassportData): PassportData {
  return {
    ...normalizePassportReviewDraft(passport),
    firstName: passport.firstName?.trim() || null,
    middleName: passport.middleName?.trim() || null,
    lastName: passport.lastName?.trim() || null,
    passportNumber: normalizePassportNumberCandidate(passport.passportNumber),
    gender: passport.gender?.trim() || null,
    birthDate: normalizePassportDateInput(passport.birthDate),
    expiryDate: normalizePassportDateInput(passport.expiryDate),
  };
}

export function normalizePassportNumberCandidate(value: string | null | undefined): string | null {
  const normalized = value?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  return normalized || null;
}

export function passportNumberCandidatesDiffer(
  visualCandidate: string | null | undefined,
  mrzCandidate: string | null | undefined,
): boolean {
  const visual = normalizePassportNumberCandidate(visualCandidate);
  const mrz = normalizePassportNumberCandidate(mrzCandidate);
  return Boolean(visual && mrz && visual !== mrz);
}

export function passportNumberNeedsManualConfirmation(passport: PassportData): boolean {
  const verification = passport.verification as {
    consensus?: { fields?: { passportNumber?: { state?: string } } };
  } | undefined;
  const state = verification?.consensus?.fields?.passportNumber?.state;
  return state !== "AUTO_VERIFIED" && state !== "MANUALLY_VERIFIED";
}

export function missingPassportReviewFields(passport: PassportData): PassportReviewField[] {
  return TM30_REQUIRED_REVIEW_FIELDS.filter((field) => !passport[field]?.trim());
}

export function passportReviewSaveDisabledReason({
  blockingValidationError = null,
  confirmationRequiredError = "Confirm the passport details before saving.",
  isSaving,
  ocrCompleted,
  passport,
}: {
  blockingValidationError?: string | null;
  confirmationRequiredError?: string;
  isSaving: boolean;
  ocrCompleted: boolean;
  passport: PassportData;
}): string | null {
  if (isSaving) return "Saving passport.";
  if (!ocrCompleted) return "Passport scan is not ready.";
  if (blockingValidationError) return blockingValidationError;
  const missingRequiredFields = missingPassportReviewFields(passport);
  if (missingRequiredFields.length > 0) return `Missing TM30 field: ${passportReviewFieldLabel(missingRequiredFields[0])}.`;
  if (passportNumberNeedsManualConfirmation(passport)) return confirmationRequiredError;
  return null;
}

export function isPassportReviewSaveEnabled(options: Parameters<typeof passportReviewSaveDisabledReason>[0]): boolean {
  return passportReviewSaveDisabledReason(options) === null;
}
