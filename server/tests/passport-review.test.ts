import assert from "node:assert/strict";
import test from "node:test";
import type { PassportData } from "../../src/types/reception.ts";
import { countryCodeToNationality, formatNationalityText } from "../../src/utils/country-nationality.ts";
import {
  isPassportReviewSaveEnabled,
  invalidPassportReviewDateField,
  normalizePassportDateInput,
  normalizePassportNumberCandidate,
  normalizePassportReviewDraft,
  normalizePassportReviewForSave,
  passportNumberCandidatesDiffer,
  passportReviewSaveDisabledReason,
} from "../../src/utils/passport-review.ts";

const validPassport: PassportData = {
  birthDate: "1970-05-25",
  expiryDate: "2030-05-25",
  firstName: "GAETANO",
  gender: "M",
  lastName: "SCIREA",
  middleName: null,
  nationality: "IT",
  passportNumber: "YA1234567",
  verification: {
    consensus: {
      fields: {
        passportNumber: {
          issues: ["PASSPORT_NUMBER_REVIEW_REQUIRED"],
          state: "NEEDS_CONFIRMATION",
          visualPass1: "YA1234567",
        },
      },
      unresolvedCriticalConflicts: 1,
    },
  },
};

test("passport review requires explicit confirmation when OCR cannot verify the passport number", () => {
  const passport = normalizePassportReviewDraft(validPassport);
  assert.equal(passport.nationality, "ITALIAN");
  assert.equal(passportReviewSaveDisabledReason({ isSaving: false, ocrCompleted: true, passport }), "Confirm the passport details before saving.");
  assert.equal(isPassportReviewSaveEnabled({ isSaving: false, ocrCompleted: true, passport }), false);
  const verified = structuredClone(passport);
  if (verified.verification?.consensus?.fields?.passportNumber) {
    verified.verification.consensus.fields.passportNumber.state = "MANUALLY_VERIFIED";
  }
  assert.equal(passportReviewSaveDisabledReason({ isSaving: false, ocrCompleted: true, passport: verified }), null);
});

test("passport review accepts human bilingual dates and normalizes only for save", () => {
  assert.equal(normalizePassportDateInput("11 DIC/DEC 1979"), "1979-12-11");
  assert.equal(normalizePassportDateInput("11 SET/SEP 2027"), "2027-09-11");
  assert.equal(normalizePassportDateInput("07 JUL/JUIL 2036"), "2036-07-07");
  assert.equal(normalizePassportDateInput("31 FEB 2036"), null);
  const draft = { ...validPassport, birthDate: "11 DIC/DEC 1979", expiryDate: "07 JUL/JUIL 2036" };
  assert.equal(invalidPassportReviewDateField(draft), null);
  const prepared = normalizePassportReviewForSave(draft);
  assert.equal(prepared.birthDate, "1979-12-11");
  assert.equal(prepared.expiryDate, "2036-07-07");
});

test("passport review keeps spaces while editing and reports invalid dates before save", () => {
  const draft = { ...validPassport, birthDate: "11 DEC 19" };
  assert.equal(draft.birthDate, "11 DEC 19");
  assert.equal(invalidPassportReviewDateField(draft), "birthDate");
});

test("passport review disables save only for saving, incomplete OCR or blocking validation", () => {
  const passport = normalizePassportReviewDraft(validPassport);
  assert.equal(passportReviewSaveDisabledReason({ isSaving: true, ocrCompleted: true, passport }), "Saving passport.");
  assert.equal(passportReviewSaveDisabledReason({ isSaving: false, ocrCompleted: false, passport }), "Passport scan is not ready.");
  assert.equal(
    passportReviewSaveDisabledReason({ blockingValidationError: "Review date is invalid.", isSaving: false, ocrCompleted: true, passport }),
    "Review date is invalid.",
  );
  assert.equal(
    passportReviewSaveDisabledReason({ isSaving: false, ocrCompleted: true, passport: { ...passport, passportNumber: null } }),
    "Missing TM30 field: Passport number.",
  );
});

test("country nationality mapper renders names instead of country codes", () => {
  assert.equal(countryCodeToNationality("IT"), "ITALIAN");
  assert.equal(countryCodeToNationality("DE"), "GERMAN");
  assert.equal(countryCodeToNationality("SE"), "SWEDISH");
  assert.equal(countryCodeToNationality("TH"), "THAI");
  assert.equal(countryCodeToNationality("TUR"), "TURKISH");
  assert.equal(formatNationalityText("Thailand"), "THAI");
  assert.equal(formatNationalityText("IT"), "ITALIAN");
  assert.equal(formatNationalityText("UTO"), null);
  assert.equal(formatNationalityText(null), null);
});

test("passport number comparison ignores formatting but detects a real candidate mismatch", () => {
  assert.equal(normalizePassportNumberCandidate(" ab-123 45< "), "AB12345");
  assert.equal(passportNumberCandidatesDiffer("AB 12345", "AB12345<"), false);
  assert.equal(passportNumberCandidatesDiffer("AB12345", "AB12346"), true);
  assert.equal(passportNumberCandidatesDiffer("AB12345", null), false);
});
