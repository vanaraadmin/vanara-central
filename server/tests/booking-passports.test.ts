import assert from "node:assert/strict";
import test from "node:test";
import { createBookingPassport } from "../src/services/booking-passports.service.ts";
import type { PassportReviewValidation } from "../src/services/passport-ocr.service.ts";

class FakePassportStatement {
  values: unknown[] = [];

  constructor(private readonly db: FakePassportDb) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    this.db.lastInsert = this.values;
    return { meta: { changes: 1, last_row_id: 41 } };
  }
}

class FakePassportDb {
  lastInsert: unknown[] = [];

  prepare() {
    return new FakePassportStatement(this);
  }
}

function manualValidation(): PassportReviewValidation {
  const extraction = {
    documentType: "P",
    issuingCountry: "CAN",
    surname: "SEGALOTTO",
    givenNames: "JEAN FRANCOIS",
    passportNumberVisual: "P942021XP",
    nationality: "CANADIAN",
    dateOfBirth: "1979-12-11",
    sex: "M",
    expiryDate: "2036-07-07",
    personalNumber: null,
    mrzLine1: null,
    mrzLine2: null,
    mrzPassportNumber: null,
    rawVisualText: null,
    imageQualityAssessment: null,
    fieldStatus: {},
  };
  return {
    firstPass: extraction,
    secondPass: extraction,
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
        passportNumber: { value: "P942021XP", state: "MANUALLY_VERIFIED", source: "manual", issues: [], visualPass1: "P942021XP", visualPass2: "P942021XP", mrzPass1: null, mrzPass2: null, conflicts: [] },
        firstName: { value: "JEAN FRANCOIS", state: "AUTO_VERIFIED", source: "visual", issues: [] },
        lastName: { value: "SEGALOTTO", state: "AUTO_VERIFIED", source: "visual", issues: [] },
        nationality: { value: "CANADIAN", state: "AUTO_VERIFIED", source: "visual", issues: [] },
        gender: { value: "M", state: "AUTO_VERIFIED", source: "visual", issues: [] },
        birthDate: { value: "1979-12-11", state: "AUTO_VERIFIED", source: "visual", issues: [] },
        expiryDate: { value: "2036-07-07", state: "AUTO_VERIFIED", source: "visual", issues: [] },
      },
      unresolvedCriticalConflicts: 1,
      tm30Ready: false,
    },
    ocrModel: "fixture",
    schemaVersion: "fixture",
  };
}

test("manual passport confirmation persists one TM30-ready record", async () => {
  const db = new FakePassportDb();
  const saved = await createBookingPassport({ DB: db as unknown as D1Database }, {
    bookingId: 9001,
    objectKey: "passports/manual-review.jpg",
    passport: {
      firstName: "JEAN FRANCOIS",
      middleName: null,
      lastName: "SEGALOTTO",
      passportNumber: "P942021XP",
      nationality: "CANADIAN",
      gender: "M",
      birthDate: "1979-12-11",
      expiryDate: "2036-07-07",
      verification: manualValidation(),
    },
    validation: manualValidation(),
    createdBy: "owner-stefano",
    verifiedBy: "owner-stefano",
  });

  assert.equal(saved.id, 41);
  assert.equal(saved.birthDate, "1979-12-11");
  assert.equal(saved.expiryDate, "2036-07-07");
  assert.equal(saved.tm30Status, "READY");
  assert.equal(db.lastInsert[21], "READY");
});
