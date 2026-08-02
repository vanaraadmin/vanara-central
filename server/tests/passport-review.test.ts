import assert from "node:assert/strict";
import test from "node:test";
import type { PassportData } from "../../src/types/reception.ts";
import { countryCodeToNationality, formatNationalityText } from "../../src/utils/country-nationality.ts";
import { isPassportReviewSaveEnabled, normalizePassportReviewDraft, passportReviewSaveDisabledReason } from "../../src/utils/passport-review.ts";

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

test("passport review enables save after successful OCR when mandatory fields are valid", () => {
  const passport = normalizePassportReviewDraft(validPassport);
  assert.equal(passport.nationality, "ITALIAN");
  assert.equal(passportReviewSaveDisabledReason({ isSaving: false, ocrCompleted: true, passport }), null);
  assert.equal(isPassportReviewSaveEnabled({ isSaving: false, ocrCompleted: true, passport }), true);
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
