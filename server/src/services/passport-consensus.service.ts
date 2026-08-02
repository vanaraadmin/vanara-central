import { parseTd3Mrz, type MrzValidationResult } from "./passport-mrz.service.js";

export type FieldReadStatus = "READ" | "UNCERTAIN" | "NOT_FOUND";
export type PassportVerificationState = "AUTO_VERIFIED" | "NEEDS_CONFIRMATION" | "MISSING" | "MANUALLY_VERIFIED";
export type PassportFieldSource = "MRZ" | "visual" | "both" | "manual" | "none";

export interface PassportExtraction {
  documentType: string | null;
  issuingCountry: string | null;
  surname: string | null;
  givenNames: string | null;
  passportNumberVisual: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  expiryDate: string | null;
  personalNumber: string | null;
  mrzLine1: string | null;
  mrzLine2: string | null;
  mrzPassportNumber: string | null;
  rawVisualText: string | null;
  imageQualityAssessment: string | null;
  fieldStatus: Record<string, FieldReadStatus>;
}

export interface FieldVerification {
  value: string | null;
  state: PassportVerificationState;
  source: PassportFieldSource;
  issues: string[];
}

export interface PassportConsensus {
  mrz: MrzValidationResult;
  fields: {
    passportNumber: FieldVerification & {
      visualPass1: string | null;
      visualPass2: string | null;
      mrzPass1: string | null;
      mrzPass2: string | null;
      conflicts: Array<{ position: number; expected: string; actual: string; kind: string }>;
    };
    firstName: FieldVerification;
    lastName: FieldVerification;
    nationality: FieldVerification;
    gender: FieldVerification;
    birthDate: FieldVerification;
    expiryDate: FieldVerification;
  };
  unresolvedCriticalConflicts: number;
  tm30Ready: boolean;
}

const SUSPICIOUS_PAIRS = new Set(["B8", "8B", "O0", "0O", "I1", "1I", "S5", "5S", "Z2", "2Z", "G6", "6G", "A4", "4A"]);

function clean(value: string | null | undefined): string | null {
  const text = value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  return text || null;
}

function cleanName(value: string | null | undefined): string | null {
  const text = value?.trim().replace(/\s+/g, " ") ?? "";
  return text || null;
}

function nameKey(value: string | null | undefined): string | null {
  const text = cleanName(value)?.toUpperCase().replace(/\s+/g, "") ?? "";
  return text || null;
}

function nameTokenCount(value: string | null | undefined): number {
  return cleanName(value)?.split(" ").filter(Boolean).length ?? 0;
}

function mostCompleteName(...values: Array<string | null | undefined>): string | null {
  return values
    .map((value, index) => ({ value: cleanName(value), tokens: nameTokenCount(value), index }))
    .filter((entry): entry is { value: string; tokens: number; index: number } => Boolean(entry.value))
    .sort((left, right) => right.tokens - left.tokens || right.value.length - left.value.length || left.index - right.index)[0]?.value ?? null;
}

function givenNamesField(first: PassportExtraction, second: PassportExtraction, mrzGivenNames: string | null): FieldVerification {
  const visual = mostCompleteName(first.givenNames, second.givenNames);
  const mrz = cleanName(mrzGivenNames);
  const value = mostCompleteName(visual, mrz);
  if (!value) return { value: null, state: "MISSING", source: "none", issues: ["FIELD_MISSING"] };
  const visualKey = nameKey(visual);
  const mrzKey = nameKey(mrz);
  const issues = visualKey && mrzKey && visualKey !== mrzKey ? ["GIVEN_NAMES_VISUAL_MRZ_MISMATCH"] : [];
  return {
    value,
    state: "AUTO_VERIFIED",
    source: visualKey && mrzKey && visualKey === mrzKey ? "both" : mrz ? "MRZ" : "visual",
    issues,
  };
}

function conflictPositions(expected: string | null, actual: string | null) {
  if (!expected || !actual || expected === actual) return [];
  const max = Math.max(expected.length, actual.length);
  const conflicts: Array<{ position: number; expected: string; actual: string; kind: string }> = [];
  for (let index = 0; index < max; index += 1) {
    const left = expected[index] ?? "";
    const right = actual[index] ?? "";
    if (left === right) continue;
    conflicts.push({
      position: index + 1,
      expected: left,
      actual: right,
      kind: SUSPICIOUS_PAIRS.has(`${left}${right}`) ? "SUSPICIOUS_OCR_SUBSTITUTION" : "DIFFERENT_CHARACTER",
    });
  }
  return conflicts;
}

function simpleField(value: string | null, source: PassportFieldSource, required = true): FieldVerification {
  if (!value) return { value: null, state: required ? "MISSING" : "NEEDS_CONFIRMATION", source: "none", issues: ["FIELD_MISSING"] };
  return { value, state: "AUTO_VERIFIED", source, issues: [] };
}

export function buildPassportConsensus(first: PassportExtraction, second: PassportExtraction): PassportConsensus {
  const mrz = parseTd3Mrz(first.mrzLine1 || second.mrzLine1, first.mrzLine2 || second.mrzLine2);
  const visualPass1 = clean(first.passportNumberVisual);
  const visualPass2 = clean(second.passportNumberVisual);
  const mrzPass1 = clean(first.mrzPassportNumber);
  const mrzPass2 = clean(second.mrzPassportNumber);
  const parsedMrzPassport = clean(mrz.passportNumber);
  const issues: string[] = [];

  if (!visualPass1) issues.push("VISUAL_PASS_1_MISSING");
  if (!visualPass2) issues.push("VISUAL_PASS_2_MISSING");
  if (visualPass1 && visualPass2 && visualPass1 !== visualPass2) issues.push("VISUAL_PASSES_DISAGREE");
  if (mrzPass1 && mrzPass2 && mrzPass1 !== mrzPass2) issues.push("MRZ_PASSES_DISAGREE");
  if (!mrz.mrzValid) issues.push("MRZ_INVALID");
  if (parsedMrzPassport && mrzPass1 && parsedMrzPassport !== mrzPass1) issues.push("MRZ_PASS_1_DIFFERS_FROM_PARSED_MRZ");
  if (parsedMrzPassport && mrzPass2 && parsedMrzPassport !== mrzPass2) issues.push("MRZ_PASS_2_DIFFERS_FROM_PARSED_MRZ");
  if (parsedMrzPassport && visualPass1 && parsedMrzPassport !== visualPass1) issues.push("VISUAL_PASS_1_DIFFERS_FROM_MRZ");
  if (parsedMrzPassport && visualPass2 && parsedMrzPassport !== visualPass2) issues.push("VISUAL_PASS_2_DIFFERS_FROM_MRZ");

  const presentMrzPassports = [mrzPass1, mrzPass2].filter((value): value is string => Boolean(value));
  const presentVisualPassports = [visualPass1, visualPass2].filter((value): value is string => Boolean(value));
  const autoVerifiedPassport = Boolean(
    parsedMrzPassport
    && mrz.mrzValid
    && mrz.checks.passportNumber === true
    && presentMrzPassports.length > 0
    && presentVisualPassports.length > 0
    && presentMrzPassports.every((value) => value === parsedMrzPassport)
    && presentVisualPassports.every((value) => value === parsedMrzPassport),
  );

  const passportNumber = {
    value: autoVerifiedPassport ? parsedMrzPassport : parsedMrzPassport ?? visualPass1 ?? visualPass2,
    state: autoVerifiedPassport ? "AUTO_VERIFIED" as const : (parsedMrzPassport || visualPass1 || visualPass2 ? "NEEDS_CONFIRMATION" as const : "MISSING" as const),
    source: autoVerifiedPassport ? "both" as const : (parsedMrzPassport ? "MRZ" as const : "visual" as const),
    issues,
    visualPass1,
    visualPass2,
    mrzPass1,
    mrzPass2,
    conflicts: [
      ...conflictPositions(parsedMrzPassport, visualPass1),
      ...conflictPositions(parsedMrzPassport, visualPass2),
      ...conflictPositions(mrzPass1, mrzPass2),
    ],
  };

  const firstName = givenNamesField(first, second, mrz.givenNames);
  const lastName = simpleField(cleanName(first.surname ?? second.surname ?? mrz.surname), mrz.surname ? "MRZ" : "visual");
  const nationality = simpleField(clean(first.nationality ?? second.nationality ?? mrz.nationality), mrz.nationality ? "MRZ" : "visual");
  const gender = simpleField(clean(first.sex ?? second.sex ?? mrz.sex), mrz.sex ? "MRZ" : "visual");
  const birthDate = simpleField(first.dateOfBirth ?? second.dateOfBirth ?? mrz.dateOfBirth, mrz.dateOfBirth ? "MRZ" : "visual");
  const expiryDate = simpleField(first.expiryDate ?? second.expiryDate ?? mrz.expiryDate, mrz.expiryDate ? "MRZ" : "visual");

  const fieldList = [passportNumber, firstName, lastName, nationality, gender, birthDate, expiryDate];
  const unresolvedCriticalConflicts = fieldList.filter((field) => field.state !== "AUTO_VERIFIED").length;

  return {
    mrz,
    fields: { passportNumber, firstName, lastName, nationality, gender, birthDate, expiryDate },
    unresolvedCriticalConflicts,
    tm30Ready: unresolvedCriticalConflicts === 0,
  };
}
