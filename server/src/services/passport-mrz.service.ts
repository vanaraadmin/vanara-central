export type MrzCheckResult = boolean | null;

export interface MrzValidationResult {
  mrzValid: boolean;
  formatValid: boolean;
  documentType: string | null;
  issuingCountry: string | null;
  surname: string | null;
  givenNames: string | null;
  passportNumber: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  expiryDate: string | null;
  personalNumber: string | null;
  checks: {
    passportNumber: MrzCheckResult;
    dateOfBirth: MrzCheckResult;
    expiryDate: MrzCheckResult;
    personalNumber: MrzCheckResult;
    composite: MrzCheckResult;
  };
  issues: string[];
}

const MRZ_CHAR_PATTERN = /^[A-Z0-9<]+$/;
const WEIGHTS = [7, 3, 1] as const;

function mrzValue(character: string): number {
  if (/^\d$/.test(character)) return Number(character);
  if (/^[A-Z]$/.test(character)) return character.charCodeAt(0) - 55;
  if (character === "<") return 0;
  throw new Error(`Unsupported MRZ character: ${character}`);
}

export function mrzCheckDigit(input: string): number {
  let total = 0;
  for (let index = 0; index < input.length; index += 1) {
    total += mrzValue(input[index] ?? "<") * WEIGHTS[index % WEIGHTS.length];
  }
  return total % 10;
}

function check(input: string, digit: string): MrzCheckResult {
  if (!/^\d$/.test(digit)) return false;
  try {
    return mrzCheckDigit(input) === Number(digit);
  } catch {
    return false;
  }
}

function cleanMrzLine(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
}

function unfiller(value: string): string {
  return value.replace(/<+$/g, "").replace(/</g, " ").trim();
}

function normalizeMrzDate(value: string): string | null {
  if (!/^\d{6}$/.test(value)) return null;
  const yy = Number(value.slice(0, 2));
  const mm = value.slice(2, 4);
  const dd = value.slice(4, 6);
  const currentYear = new Date().getUTCFullYear();
  const currentCentury = Math.floor(currentYear / 100) * 100;
  const candidate = currentCentury + yy;
  const year = candidate > currentYear + 20 ? candidate - 100 : candidate;
  const iso = `${year.toString().padStart(4, "0")}-${mm}-${dd}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function parseNames(field: string): { surname: string | null; givenNames: string | null } {
  const [surname = "", given = ""] = field.split("<<");
  return {
    surname: unfiller(surname) || null,
    givenNames: unfiller(given) || null,
  };
}

export function parseTd3Mrz(line1Input: string | null | undefined, line2Input: string | null | undefined): MrzValidationResult {
  const line1 = cleanMrzLine(line1Input);
  const line2 = cleanMrzLine(line2Input);
  const issues: string[] = [];

  if (line1.length !== 44) issues.push("MRZ_LINE_1_INVALID_LENGTH");
  if (line2.length !== 44) issues.push("MRZ_LINE_2_INVALID_LENGTH");
  if (line1 && !MRZ_CHAR_PATTERN.test(line1)) issues.push("MRZ_LINE_1_INVALID_CHARACTERS");
  if (line2 && !MRZ_CHAR_PATTERN.test(line2)) issues.push("MRZ_LINE_2_INVALID_CHARACTERS");
  if (!line1.startsWith("P")) issues.push("MRZ_DOCUMENT_TYPE_INVALID");

  const formatValid = issues.length === 0;
  const names = parseNames(line1.slice(5));
  const passportNumberField = line2.slice(0, 9);
  const birthDateField = line2.slice(13, 19);
  const expiryDateField = line2.slice(21, 27);
  const personalNumberField = line2.slice(28, 42);

  const checks = {
    passportNumber: line2.length >= 10 ? check(passportNumberField, line2[9] ?? "") : false,
    dateOfBirth: line2.length >= 20 ? check(birthDateField, line2[19] ?? "") : false,
    expiryDate: line2.length >= 28 ? check(expiryDateField, line2[27] ?? "") : false,
    personalNumber: line2.length >= 43 ? check(personalNumberField, line2[42] ?? "") : null,
    composite: line2.length >= 44 ? check(`${line2.slice(0, 10)}${line2.slice(13, 20)}${line2.slice(21, 43)}`, line2[43] ?? "") : false,
  };

  for (const [key, value] of Object.entries(checks)) {
    if (value === false) issues.push(`MRZ_${key.toUpperCase()}_CHECK_FAILED`);
  }

  const dateOfBirth = normalizeMrzDate(birthDateField);
  const expiryDate = normalizeMrzDate(expiryDateField);
  if (!dateOfBirth) issues.push("MRZ_BIRTH_DATE_INVALID");
  if (!expiryDate) issues.push("MRZ_EXPIRY_DATE_INVALID");

  const mrzValid = formatValid
    && checks.passportNumber === true
    && checks.dateOfBirth === true
    && checks.expiryDate === true
    && checks.composite === true
    && Boolean(dateOfBirth)
    && Boolean(expiryDate);

  return {
    mrzValid,
    formatValid,
    documentType: line1.slice(0, 2).replace(/</g, "") || null,
    issuingCountry: line1.slice(2, 5).replace(/</g, "") || null,
    surname: names.surname,
    givenNames: names.givenNames,
    passportNumber: unfiller(passportNumberField).replace(/\s/g, "") || null,
    nationality: line2.slice(10, 13).replace(/</g, "") || null,
    dateOfBirth,
    sex: ["M", "F", "X"].includes(line2[20] ?? "") ? line2[20] : null,
    expiryDate,
    personalNumber: unfiller(personalNumberField) || null,
    checks,
    issues,
  };
}

