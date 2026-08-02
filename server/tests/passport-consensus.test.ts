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

function extraction(overrides: Partial<PassportExtraction>): PassportExtraction {
  return {
    documentType: "P",
    issuingCountry: "UTO",
    surname: "ERIKSSON",
    givenNames: "ANNA",
    passportNumberVisual: "L898902C3",
    nationality: "UTO",
    dateOfBirth: "1974-08-12",
    sex: "F",
    expiryDate: "2012-04-15",
    personalNumber: null,
    mrzLine1: "P<UTOERIKSSON<<ANNA<<<<<<<<<<<<<<<<<<<<<<<<<<<",
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
    extraction({ givenNames: "ANNA", mrzLine1: "P<UTOERIKSSON<<ANNA<<<<<<<<<<<<<<<<<<<<<<<<<<<" }),
    extraction({ givenNames: "ANNA", mrzLine1: "P<UTOERIKSSON<<ANNA<<<<<<<<<<<<<<<<<<<<<<<<<<<" }),
  );

  assert.equal(consensus.fields.firstName.value, "ANNA");
  assert.equal(consensus.fields.firstName.source, "both");
  assert.deepEqual(consensus.fields.firstName.issues, []);
});

test("passport consensus preserves two given names when one extraction omits the second", () => {
  const consensus = buildPassportConsensus(
    extraction({ givenNames: "ANNA MARIA", mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<" }),
    extraction({ givenNames: "ANNA", mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<" }),
  );

  assert.equal(consensus.fields.firstName.value, "ANNA MARIA");
  assert.equal(consensus.fields.firstName.source, "both");
  assert.deepEqual(consensus.fields.firstName.issues, []);
});

test("passport consensus preserves three given names and surfaces unresolved mismatches", () => {
  const consensus = buildPassportConsensus(
    extraction({ givenNames: "ANNA MARIA LISA", mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<" }),
    extraction({ givenNames: "ANNA MARIA LISA", mrzLine1: "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<" }),
  );

  assert.equal(consensus.fields.firstName.value, "ANNA MARIA LISA");
  assert.ok(consensus.fields.firstName.issues.includes("GIVEN_NAMES_VISUAL_MRZ_MISMATCH"));
});
