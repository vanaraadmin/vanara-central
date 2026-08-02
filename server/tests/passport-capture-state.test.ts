import assert from "node:assert/strict";
import test from "node:test";
import {
  activePassportCaptureId,
  initialPassportWorkflowState,
  passportWorkflowReducer,
  type PassportFailure,
  type PassportWorkflowState,
} from "../../src/utils/passport-workflow-state.ts";
import {
  nextReadyLatchUntil,
  shouldCancelReadyLatch,
  shouldIgnoreReadyDegradationDuringTap,
} from "../../src/utils/passport-ready-latch.ts";
import type { PassportClassification, PassportData } from "../../src/types/reception.ts";

const file = new File(["passport"], "passport.jpg", { type: "image/jpeg" });
const classification: PassportClassification = {
  isPassport: true,
  isPassportBiodataPage: true,
  passportConfidence: 0.92,
  passportComplete: true,
  mrzVisible: true,
  excessiveGlare: false,
  unreadableBlur: false,
  unreadableDarkness: false,
  recommendation: "Ready",
};
const passport: PassportData = {
  firstName: "Test",
  middleName: null,
  lastName: "Guest",
  passportNumber: "A1234567",
  nationality: "ITA",
  gender: "M",
  birthDate: "1990-01-01",
};
const failure: PassportFailure = { code: "OCR_MODEL_ERROR", message: "OCR failed.", technical: true };

function capturedState(): PassportWorkflowState {
  let state = passportWorkflowReducer(initialPassportWorkflowState, { type: "OPEN", captureId: 1 });
  state = passportWorkflowReducer(state, { type: "CAPTURE", captureId: 1, file, previewUrl: "blob:one" });
  return state;
}

function readyState(): PassportWorkflowState {
  let state = capturedState();
  state = passportWorkflowReducer(state, { type: "START_CLASSIFICATION", captureId: 1 });
  state = passportWorkflowReducer(state, { type: "CLASSIFICATION_ACCEPTED", captureId: 1, classification });
  return state;
}

test("open and capture enter CAMERA and CAPTURED explicitly", () => {
  let state = passportWorkflowReducer(initialPassportWorkflowState, { type: "OPEN", captureId: 1 });
  assert.equal(state.phase, "CAMERA");
  state = passportWorkflowReducer(state, { type: "CAPTURE", captureId: 1, file, previewUrl: "blob:one" });
  assert.equal(state.phase, "CAPTURED");
});

test("invalid transitions are rejected", () => {
  const state = passportWorkflowReducer(initialPassportWorkflowState, { type: "START_OCR", captureId: 1 });
  assert.equal(state.phase, "CLOSED");
});

test("classification accepted and rejected move to distinct states", () => {
  let accepted = capturedState();
  accepted = passportWorkflowReducer(accepted, { type: "START_CLASSIFICATION", captureId: 1 });
  accepted = passportWorkflowReducer(accepted, { type: "CLASSIFICATION_ACCEPTED", captureId: 1, classification });
  assert.equal(accepted.phase, "READY_FOR_OCR");

  let rejected = capturedState();
  rejected = passportWorkflowReducer(rejected, { type: "START_CLASSIFICATION", captureId: 1 });
  rejected = passportWorkflowReducer(rejected, { type: "CLASSIFICATION_REJECTED", captureId: 1, reason: { code: "NOT_PASSPORT", message: "This is not a passport." } });
  assert.equal(rejected.phase, "REJECTED");
});

test("OCR failure enters OCR_FAILED and retry can start OCR again", () => {
  let state = readyState();
  state = passportWorkflowReducer(state, { type: "START_OCR", captureId: 1 });
  state = passportWorkflowReducer(state, { type: "OCR_FAILURE", captureId: 1, error: failure });
  assert.equal(state.phase, "OCR_FAILED");
  state = passportWorkflowReducer(state, { type: "START_OCR", captureId: 1 });
  assert.equal(state.phase, "OCR_RUNNING");
});

test("retake clears image, classification and error by entering a fresh CAMERA state", () => {
  let state = readyState();
  state = passportWorkflowReducer(state, { type: "START_OCR", captureId: 1 });
  state = passportWorkflowReducer(state, { type: "OCR_FAILURE", captureId: 1, error: failure });
  state = passportWorkflowReducer(state, { type: "RETAKE", captureId: 2 });
  assert.deepEqual(state, { phase: "CAMERA", captureId: 2 });
});

test("cancel works from every active phase", () => {
  const states: PassportWorkflowState[] = [
    passportWorkflowReducer(initialPassportWorkflowState, { type: "OPEN", captureId: 1 }),
    capturedState(),
    readyState(),
  ];
  for (const state of states) {
    assert.deepEqual(passportWorkflowReducer(state, { type: "CANCEL" }), { phase: "CLOSED" });
  }
});

test("stale classification and OCR cannot update a new capture", () => {
  let state = capturedState();
  state = passportWorkflowReducer(state, { type: "RETAKE", captureId: 2 });
  assert.equal(activePassportCaptureId(state), 2);
  state = passportWorkflowReducer(state, { type: "CLASSIFICATION_ACCEPTED", captureId: 1, classification });
  assert.equal(state.phase, "CAMERA");

  state = readyState();
  state = passportWorkflowReducer(state, { type: "START_OCR", captureId: 1 });
  state = passportWorkflowReducer(state, { type: "RETAKE", captureId: 2 });
  state = passportWorkflowReducer(state, { type: "OCR_SUCCESS", captureId: 1, objectKey: "passports/old.jpg", passport });
  assert.equal(state.phase, "CAMERA");
});

test("save failure preserves review data", () => {
  let state = readyState();
  state = passportWorkflowReducer(state, { type: "START_OCR", captureId: 1 });
  state = passportWorkflowReducer(state, { type: "OCR_SUCCESS", captureId: 1, objectKey: "passports/one.jpg", passport });
  state = passportWorkflowReducer(state, { type: "START_SAVE", captureId: 1, passport: { ...passport, lastName: "Edited" } });
  state = passportWorkflowReducer(state, { type: "SAVE_FAILURE", captureId: 1, error: { code: "SAVE_FAILED", message: "Save failed." } });
  assert.equal(state.phase, "SAVE_FAILED");
  assert.equal(state.passport.lastName, "Edited");
});

test("successful save completes workflow", () => {
  let state = readyState();
  state = passportWorkflowReducer(state, { type: "START_OCR", captureId: 1 });
  state = passportWorkflowReducer(state, { type: "OCR_SUCCESS", captureId: 1, objectKey: "passports/one.jpg", passport });
  state = passportWorkflowReducer(state, { type: "START_SAVE", captureId: 1, passport });
  state = passportWorkflowReducer(state, { type: "SAVE_SUCCESS", captureId: 1, passportId: 99 });
  assert.deepEqual(state, { phase: "COMPLETED", passportId: 99 });
});

test("READY latch remains active for tap micro-movement", () => {
  const now = 1_000;
  const readyUntil = nextReadyLatchUntil(true, now);
  assert.equal(readyUntil, 2_200);
  assert.equal(shouldIgnoreReadyDegradationDuringTap("IMAGE_BLURRED", true, readyUntil, 1_120), true);
  assert.equal(shouldIgnoreReadyDegradationDuringTap("IMAGE_BLURRED", false, readyUntil, 1_120), false);
  assert.equal(shouldIgnoreReadyDegradationDuringTap("IMAGE_BLURRED", true, readyUntil, 2_220), false);
});

test("READY latch is cancelled only by critical document loss", () => {
  assert.equal(shouldCancelReadyLatch("PASSPORT_NOT_DETECTED"), true);
  assert.equal(shouldCancelReadyLatch("DOCUMENT_CROPPED"), true);
  assert.equal(shouldCancelReadyLatch("IMAGE_BLURRED"), false);
  assert.equal(shouldCancelReadyLatch(null), false);
});
