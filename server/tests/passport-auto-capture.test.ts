import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSPORT_AUTO_CAPTURE_DWELL_MS,
  isAutoCaptureCandidateFresh,
  selectBestAutoCaptureCandidate,
  shouldStartAutoCaptureTimer,
  type PassportAutoCaptureCandidate,
} from "../../src/utils/passport-auto-capture.ts";
import { shouldCancelReadyLatch, shouldIgnoreTemporaryReadyDegradation } from "../../src/utils/passport-ready-latch.ts";

function candidate(overrides: Partial<PassportAutoCaptureCandidate> = {}): PassportAutoCaptureCandidate {
  return {
    capturedAt: 1_100,
    borderEdgeRatio: 0.08,
    cropValid: true,
    documentCoverage: 0.32,
    edgeVariance: 24,
    ...overrides,
  };
}

test("auto capture dwell time is approximately immediate without being surprising", () => {
  assert.equal(PASSPORT_AUTO_CAPTURE_DWELL_MS, 400);
});

test("READY starts one auto capture timer only when all capture preconditions are true", () => {
  const base = {
    autoCaptureEnabled: true,
    cameraReady: true,
    captureInFlight: false,
    candidate: candidate(),
    hasExistingTimer: false,
    now: 1_200,
    readyUntil: 2_200,
    streamLive: true,
  };
  assert.equal(shouldStartAutoCaptureTimer(base), true);
  assert.equal(shouldStartAutoCaptureTimer({ ...base, hasExistingTimer: true }), false);
  assert.equal(shouldStartAutoCaptureTimer({ ...base, captureInFlight: true }), false);
  assert.equal(shouldStartAutoCaptureTimer({ ...base, streamLive: false }), false);
  assert.equal(shouldStartAutoCaptureTimer({ ...base, autoCaptureEnabled: false }), false);
});

test("auto capture selects the best valid recent candidate", () => {
  const olderSharp = candidate({ capturedAt: 1_050, documentCoverage: 0.31, edgeVariance: 30 });
  const newerLarger = candidate({ capturedAt: 1_100, documentCoverage: 0.36, edgeVariance: 20 });
  const newerEquivalent = candidate({ capturedAt: 1_150, documentCoverage: 0.361, edgeVariance: 21 });
  assert.equal(selectBestAutoCaptureCandidate(olderSharp, newerLarger), newerLarger);
  assert.equal(selectBestAutoCaptureCandidate(newerLarger, newerEquivalent), newerEquivalent);
  assert.equal(selectBestAutoCaptureCandidate(newerLarger, candidate({ cropValid: false })), newerLarger);
});

test("auto capture does not use stale READY candidates", () => {
  assert.equal(isAutoCaptureCandidateFresh(candidate({ capturedAt: 1_100 }), 1_200, 2_200), true);
  assert.equal(isAutoCaptureCandidateFresh(candidate({ capturedAt: 900 }), 1_200, 2_200), false);
  assert.equal(isAutoCaptureCandidateFresh(candidate({ capturedAt: 2_300 }), 1_200, 2_200), false);
});

test("structural document loss cancels auto capture while mild motion does not", () => {
  assert.equal(shouldCancelReadyLatch("PASSPORT_NOT_DETECTED"), true);
  assert.equal(shouldCancelReadyLatch("DOCUMENT_CROPPED"), true);
  assert.equal(shouldCancelReadyLatch("DOCUMENT_TOO_SMALL"), true);
  assert.equal(shouldCancelReadyLatch("IMAGE_BLURRED"), false);
  assert.equal(shouldIgnoreTemporaryReadyDegradation("IMAGE_BLURRED", 2_200, 1_400), true);
});
