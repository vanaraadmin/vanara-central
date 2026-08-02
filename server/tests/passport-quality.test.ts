import assert from "node:assert/strict";
import test from "node:test";
import { analyzePassportPixels, evaluatePassportLiveQuality, evaluatePassportQuality, type PassportQualityMetrics } from "../../src/utils/passport-quality.ts";
import { decidePassportClassification } from "../src/services/passport-classification.service.ts";

const CLEAR: PassportQualityMetrics = {
  width: 1800,
  height: 1200,
  originalWidth: 1800,
  originalHeight: 1200,
  averageBrightness: 142,
  darkRatio: 0.18,
  highlightRatio: 0.04,
  edgeVariance: 31,
  documentCoverage: 0.36,
  borderEdgeRatio: 0.08,
  lowerMrzContrast: 0.2,
  skewScore: 0.1,
  mrzLikelihood: 0.82,
  passportAspectScore: 0.92,
  passportConfidence: 0.82,
};

function metrics(overrides: Partial<PassportQualityMetrics>): PassportQualityMetrics {
  return { ...CLEAR, ...overrides };
}

test("passport quality gate accepts a clear passport image", () => {
  const result = evaluatePassportQuality(CLEAR);
  assert.equal(result.status, "ACCEPTED_FOR_OCR");
  assert.equal(result.liveState, "READY");
  assert.deepEqual(result.issues, []);
});

test("passport quality gate rejects low resolution images", () => {
  const result = evaluatePassportQuality(metrics({ width: 900, height: 600, originalWidth: 900, originalHeight: 600 }));
  assert.equal(result.status, "RETAKE_REQUIRED");
  assert.ok(result.issues.includes("LOW_RESOLUTION"));
});

test("passport quality gate evaluates resolution from original dimensions, not analysis canvas dimensions", () => {
  const result = evaluatePassportQuality(metrics({
    width: 1200,
    height: 900,
    originalWidth: 4032,
    originalHeight: 3024,
  }));
  assert.equal(result.status, "ACCEPTED_FOR_OCR");
  assert.equal(result.metrics.width, 1200);
  assert.equal(result.metrics.height, 900);
  assert.equal(result.metrics.originalWidth, 4032);
  assert.equal(result.metrics.originalHeight, 3024);
  assert.ok(!result.issues.includes("LOW_RESOLUTION"));
});

test("passport pixel analysis rejects mismatched original dimensions against a resized canvas buffer", () => {
  const analysisWidth = 1200;
  const analysisHeight = 900;
  const pixelBuffer = new Uint8ClampedArray(analysisWidth * analysisHeight * 4);

  assert.equal(pixelBuffer.length, analysisWidth * analysisHeight * 4);
  assert.throws(
    () => analyzePassportPixels(pixelBuffer, 4032, 3024),
    /pixel buffer dimensions do not match analysis dimensions/,
  );
  assert.doesNotThrow(() => analyzePassportPixels(pixelBuffer, analysisWidth, analysisHeight));
});

test("passport quality gate rejects dark images", () => {
  const result = evaluatePassportQuality(metrics({ averageBrightness: 42, darkRatio: 0.7 }));
  assert.equal(result.status, "RETAKE_REQUIRED");
  assert.ok(result.issues.includes("IMAGE_TOO_DARK"));
});

test("passport quality gate rejects blurred images", () => {
  const result = evaluatePassportQuality(metrics({ edgeVariance: 8 }));
  assert.equal(result.status, "RETAKE_REQUIRED");
  assert.ok(result.issues.includes("IMAGE_BLURRED"));
});

test("passport quality gate rejects glare", () => {
  const result = evaluatePassportQuality(metrics({ highlightRatio: 0.32 }));
  assert.equal(result.status, "RETAKE_REQUIRED");
  assert.ok(result.issues.includes("EXCESSIVE_GLARE"));
});

test("passport quality gate rejects cropped passport edges", () => {
  const result = evaluatePassportQuality(metrics({ borderEdgeRatio: 0.34 }));
  assert.equal(result.status, "RETAKE_REQUIRED");
  assert.ok(result.issues.includes("DOCUMENT_CROPPED"));
});

test("passport quality gate rejects missing lower MRZ region", () => {
  const result = evaluatePassportQuality(metrics({ lowerMrzContrast: 0.03 }));
  assert.equal(result.status, "RETAKE_REQUIRED");
  assert.ok(result.issues.includes("MRZ_NOT_VISIBLE"));
});

test("passport live guidance treats weak MRZ as advisory when the document is otherwise capturable", () => {
  const result = evaluatePassportLiveQuality(metrics({ lowerMrzContrast: 0.02 }));
  assert.equal(result.liveState, "DOCUMENT_DETECTED");
  assert.equal(result.blockingIssue, null);
  assert.ok(!result.issues.includes("MRZ_NOT_VISIBLE"));
  assert.equal(result.guidance, "Hold steady");
});

test("passport live guidance blocks only obvious critical failures", () => {
  const dark = evaluatePassportLiveQuality(metrics({ averageBrightness: 18, darkRatio: 0.9 }));
  assert.equal(dark.liveState, "NO_DOCUMENT");
  assert.equal(dark.blockingIssue, "IMAGE_TOO_DARK");

  const outside = evaluatePassportLiveQuality(metrics({ documentCoverage: 0.08 }));
  assert.equal(outside.liveState, "NO_DOCUMENT");
  assert.equal(outside.blockingIssue, "DOCUMENT_TOO_SMALL");
});

test("passport live guidance treats normal hand tremor as advisory instead of blocking", () => {
  const result = evaluatePassportLiveQuality(metrics({ edgeVariance: 3.8 }));
  assert.equal(result.liveState, "DOCUMENT_DETECTED");
  assert.equal(result.blockingIssue, null);
  assert.ok(result.issues.includes("IMAGE_BLURRED"));
  assert.equal(result.guidance, "Hold steady");
});

test("passport live guidance blocks only severe blur or lost focus", () => {
  const result = evaluatePassportLiveQuality(metrics({ edgeVariance: 1.2 }));
  assert.equal(result.liveState, "NO_DOCUMENT");
  assert.equal(result.blockingIssue, "IMAGE_BLURRED");
});

test("passport live guidance allows subdued but sharp readable indoor light", () => {
  const result = evaluatePassportLiveQuality(metrics({
    averageBrightness: 58,
    darkRatio: 0.58,
    edgeVariance: 34,
    documentCoverage: 0.38,
    borderEdgeRatio: 0.08,
  }));
  assert.equal(result.liveState, "DOCUMENT_DETECTED");
  assert.equal(result.blockingIssue, null);
  assert.ok(!result.issues.includes("IMAGE_TOO_DARK"));
});

test("passport live guidance does not semantically reject a plain table", () => {
  const result = evaluatePassportLiveQuality(metrics({
    averageBrightness: 126,
    darkRatio: 0.16,
    edgeVariance: 24,
    documentCoverage: 0.42,
    borderEdgeRatio: 0.08,
    lowerMrzContrast: 0.18,
    mrzLikelihood: 0.02,
    passportAspectScore: 0.1,
    passportConfidence: 0.08,
  }));

  assert.equal(result.liveState, "DOCUMENT_DETECTED");
  assert.ok(!result.issues.includes("PASSPORT_NOT_DETECTED"));
});

test("passport AI classification decision rejects non-passport and non-biodata images", () => {
  assert.deepEqual(decidePassportClassification({
    isPassport: false,
    isPassportBiodataPage: false,
    passportConfidence: 0.02,
    passportComplete: false,
    mrzVisible: false,
    excessiveGlare: false,
    unreadableBlur: false,
    unreadableDarkness: false,
    recommendation: "This is not a passport.",
  }), { ready: false, code: "not_a_passport", messageKey: "passport.notPassport", message: "This is not a passport." });

  assert.deepEqual(decidePassportClassification({
    isPassport: true,
    isPassportBiodataPage: false,
    passportConfidence: 0.9,
    passportComplete: true,
    mrzVisible: true,
    excessiveGlare: false,
    unreadableBlur: false,
    unreadableDarkness: false,
    recommendation: "Open the passport on the biodata page.",
  }), { ready: false, code: "not_biodata_page", messageKey: "passport.notBiodataPage", message: "Open the passport on the biodata page." });
});

test("passport AI classification accepts subdued light when text remains readable", () => {
  assert.deepEqual(decidePassportClassification({
    isPassport: true,
    isPassportBiodataPage: true,
    passportConfidence: 0.88,
    passportComplete: true,
    mrzVisible: true,
    excessiveGlare: false,
    unreadableBlur: false,
    unreadableDarkness: false,
    recommendation: "Ready to scan.",
  }), { ready: true, code: "passport_ready", messageKey: "passport.ready", message: "Ready to scan." });
});

test("passport AI classification rejects only darkness that makes the document unreadable", () => {
  assert.deepEqual(decidePassportClassification({
    isPassport: true,
    isPassportBiodataPage: true,
    passportConfidence: 0.82,
    passportComplete: true,
    mrzVisible: true,
    excessiveGlare: false,
    unreadableBlur: false,
    unreadableDarkness: true,
    recommendation: "More light would improve the scan.",
  }), { ready: false, code: "unreadable_darkness", messageKey: "passport.moreLight", message: "More light would improve the scan." });
});

test("passport live guidance never marks a passport biodata page as semantically ready", () => {
  const result = evaluatePassportLiveQuality(metrics({
    documentCoverage: 0.38,
    borderEdgeRatio: 0.08,
    lowerMrzContrast: 0.2,
    mrzLikelihood: 0.86,
    passportAspectScore: 0.9,
    passportConfidence: 0.84,
  }));

  assert.equal(result.liveState, "DOCUMENT_DETECTED");
  assert.equal(result.guidance, "Hold steady");
});

test("passport quality gate rejects cropped images without passport-specific content", () => {
  const result = evaluatePassportQuality(metrics({
    mrzLikelihood: 0.02,
    passportAspectScore: 0.1,
    passportConfidence: 0.08,
  }));

  assert.equal(result.status, "RETAKE_REQUIRED");
  assert.ok(result.issues.includes("PASSPORT_NOT_DETECTED"));
});

test("passport quality gate flags rotation as manual review when otherwise readable", () => {
  const result = evaluatePassportQuality(metrics({ skewScore: 0.5 }));
  assert.equal(result.status, "MANUAL_REVIEW_REQUIRED");
  assert.ok(result.issues.includes("IMAGE_ROTATED"));
});
