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

export function missingPassportReviewFields(passport: PassportData): PassportReviewField[] {
  return TM30_REQUIRED_REVIEW_FIELDS.filter((field) => !passport[field]?.trim());
}

export function passportReviewSaveDisabledReason({
  blockingValidationError = null,
  isSaving,
  ocrCompleted,
  passport,
}: {
  blockingValidationError?: string | null;
  isSaving: boolean;
  ocrCompleted: boolean;
  passport: PassportData;
}): string | null {
  if (isSaving) return "Saving passport.";
  if (!ocrCompleted) return "Passport scan is not ready.";
  if (blockingValidationError) return blockingValidationError;
  const missingRequiredFields = missingPassportReviewFields(passport);
  if (missingRequiredFields.length > 0) return `Missing TM30 field: ${passportReviewFieldLabel(missingRequiredFields[0])}.`;
  return null;
}

export function isPassportReviewSaveEnabled(options: Parameters<typeof passportReviewSaveDisabledReason>[0]): boolean {
  return passportReviewSaveDisabledReason(options) === null;
}
