import assert from "node:assert/strict";
import test from "node:test";
import { buildPassportConsensus, type PassportExtraction } from "../src/services/passport-consensus.service.ts";

const status = {
  documentType: "READ",
  issuingCountry: "READ",
  surname: "READ",
  givenNames: "READ",
  passportNumberVisual: "READ",
  nationality: "READ",
  dateOfBirth: "READ",
  sex: "READ",
  expiryDate: "READ",
  mrzLine1: "READ",
  mrzLine2: "READ",
  mrzPassportNumber: "READ",
} as const;

function td3Line1(givenNames: string): string {
  return `P<UTOERIKSSON<<${givenNames.replace(/\s+/g, "<")}`.padEnd(44, "<");
}

function extraction(overrides: Partial<PassportExtraction>): PassportExtraction {
  return {
    documentType: "P",
    issuingCountry: "UTO",
    surname: "ERIKSSON",
    givenNames: "ANNA MARIA",
    passportNumberVisual: "L898902C3",
    nationality: "UTO",
    dateOfBirth: "1974-08-12",
    sex: "F",
    expiryDate: "2012-04-15",
    personalNumber: null,
    mrzLine1: td3Line1("ANNA MARIA"),
    mrzLine2: "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
    mrzPassportNumber: "L898902C3",
    rawVisualText: null,
    imageQualityAssessment: null,
    fieldStatus: status,
    ...overrides,
  };
}

test("passport consensus preserves one given name", () => {
  const consensus = buildPassportConsensus(
    extraction({ givenNames: "ANNA", mrzLine1: td3Line1("ANNA") }),
    extraction({ givenNames: "ANNA", mrzLine1: td3Line1("ANNA") }),
  );

  assert.equal(consensus.fields.firstName.value, "ANNA");
  assert.equal(consensus.fields.firstName.source, "MRZ");
  assert.deepEqual(consensus.fields.firstName.issues, []);
});

test("passport consensus preserves two given names when one extraction omits the second", () => {
  const consensus = buildPassportConsensus(
    extraction({ givenNames: "ANNA MARIA", mrzLine1: td3Line1("ANNA MARIA") }),
    extraction({ givenNames: "ANNA", mrzLine1: td3Line1("ANNA MARIA") }),
  );

  assert.equal(consensus.fields.firstName.value, "ANNA MARIA");
  assert.equal(consensus.fields.firstName.source, "MRZ");
  assert.deepEqual(consensus.fields.firstName.issues, []);
});

test("passport consensus preserves three given names and surfaces unresolved mismatches", () => {
  const consensus = buildPassportConsensus(
    extraction({ givenNames: "ANNA MARIA LISA", mrzLine1: td3Line1("ANNA MARIA") }),
    extraction({ givenNames: "ANNA MARIA LISA", mrzLine1: td3Line1("ANNA MARIA") }),
  );

  assert.equal(consensus.fields.firstName.value, "ANNA MARIA");
  assert.ok(consensus.fields.firstName.issues.includes("GIVEN_NAMES_VISUAL_MRZ_MISMATCH"));
});

test("passport number auto-verifies when visual and MRZ match after normalization", () => {
  const consensus = buildPassportConsensus(
    extraction({ passportNumberVisual: "L898-902 C3" }),
    extraction({ passportNumberVisual: "L898 902C3" }),
  );

  assert.equal(consensus.mrz.checks.passportNumber, true);
  assert.equal(consensus.mrz.mrzValid, true);
  assert.equal(consensus.fields.passportNumber.value, "L898902C3");
  assert.equal(consensus.fields.passportNumber.state, "AUTO_VERIFIED");
});

test("valid deterministic MRZ remains authoritative when visual text differs", () => {
  const consensus = buildPassportConsensus(
    extraction({ passportNumberVisual: "X898902C3", givenNames: "ANNA MARIA" }),
    extraction({ passportNumberVisual: "X898902C3", givenNames: "ANNA MARIA" }),
  );

  assert.equal(consensus.mrz.mrzValid, true);
  assert.equal(consensus.fields.passportNumber.value, "L898902C3");
  assert.equal(consensus.fields.passportNumber.state, "AUTO_VERIFIED");
  assert.equal(consensus.fields.passportNumber.source, "MRZ");
  assert.equal(consensus.fields.firstName.value, "ANNA MARIA");
  assert.equal(consensus.tm30Ready, true);
  assert.ok(consensus.fields.passportNumber.issues.includes("VISUAL_PASS_1_DIFFERS_FROM_MRZ"));
});

test("clear visual passport number remains available for explicit review when MRZ is incomplete", () => {
  const consensus = buildPassportConsensus(
    extraction({ passportNumberVisual: "P942021XP", mrzLine1: null, mrzLine2: null, mrzPassportNumber: null }),
    extraction({ passportNumberVisual: null, mrzLine1: null, mrzLine2: null, mrzPassportNumber: null }),
  );

  assert.equal(consensus.fields.passportNumber.value, "P942021XP");
  assert.equal(consensus.fields.passportNumber.state, "NEEDS_CONFIRMATION");
  assert.equal(consensus.fields.passportNumber.source, "visual");
});
