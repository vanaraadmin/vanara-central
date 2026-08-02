export type PassportQualityStatus = "ACCEPTED_FOR_OCR" | "RETAKE_REQUIRED" | "MANUAL_REVIEW_REQUIRED";
export type PassportLiveState = "NO_DOCUMENT" | "DOCUMENT_DETECTED" | "PASSPORT_LIKELY" | "READY" | "NOT_READY" | "ALMOST_READY";
export type PassportQualityIssue =
  | "LOW_RESOLUTION"
  | "IMAGE_BLURRED"
  | "IMAGE_TOO_DARK"
  | "EXCESSIVE_GLARE"
  | "DOCUMENT_TOO_SMALL"
  | "DOCUMENT_CROPPED"
  | "MRZ_NOT_VISIBLE"
  | "PASSPORT_NOT_DETECTED"
  | "IMAGE_ROTATED"
  | "IMAGE_DECODE_FAILED";

export interface PassportQualityMetrics {
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  averageBrightness: number;
  darkRatio: number;
  highlightRatio: number;
  edgeVariance: number;
  documentCoverage: number;
  borderEdgeRatio: number;
  lowerMrzContrast: number;
  skewScore: number;
  mrzLikelihood: number;
  passportAspectScore: number;
  passportConfidence: number;
}

export interface PassportQualityResult {
  status: PassportQualityStatus;
  liveState: PassportLiveState;
  issues: PassportQualityIssue[];
  message: string;
  guidance: string;
  metrics: PassportQualityMetrics;
  readinessScore?: number;
  blockingIssue?: PassportQualityIssue | null;
}

export const PASSPORT_QUALITY_THRESHOLDS = {
  minWidth: 1200,
  minHeight: 760,
  minAverageBrightness: 72,
  maxDarkRatio: 0.48,
  maxHighlightRatio: 0.18,
  minEdgeVariance: 19,
  minDocumentCoverage: 0.28,
  maxBorderEdgeRatio: 0.2,
  minLowerMrzContrast: 0.11,
  maxSkewScore: 0.34,
} as const;

const LIVE_ADVISORY_EDGE_VARIANCE = 4;
const LIVE_SEVERE_BLUR_EDGE_VARIANCE = 1.5;

type PixelSource = Uint8ClampedArray | number[];

function luminance(data: PixelSource, offset: number): number {
  return 0.2126 * (data[offset] ?? 0) + 0.7152 * (data[offset + 1] ?? 0) + 0.0722 * (data[offset + 2] ?? 0);
}

export function analyzePassportPixels(data: PixelSource, width: number, height: number): PassportQualityMetrics {
  if (data.length !== width * height * 4) {
    throw new Error("Passport pixel buffer dimensions do not match analysis dimensions.");
  }

  let total = 0;
  let dark = 0;
  let highlight = 0;
  let edgeTotal = 0;
  let edgeCount = 0;
  let documentEdges = 0;
  let borderEdges = 0;
  let lowerDark = 0;
  let lowerLight = 0;
  let leftEdges = 0;
  let rightEdges = 0;
  let minEdgeX = width;
  let minEdgeY = height;
  let maxEdgeX = 0;
  let maxEdgeY = 0;
  const lowerRows = new Map<number, number>();

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      const value = luminance(data, index);
      total += value;
      if (value < 55) dark += 1;
      if (value > 238) highlight += 1;

      if (x + 2 < width && y + 2 < height) {
        const right = luminance(data, (y * width + x + 2) * 4);
        const down = luminance(data, ((y + 2) * width + x) * 4);
        const edge = Math.abs(value - right) + Math.abs(value - down);
        edgeTotal += edge;
        edgeCount += 1;
        if (edge > 44) {
          documentEdges += 1;
          minEdgeX = Math.min(minEdgeX, x);
          minEdgeY = Math.min(minEdgeY, y);
          maxEdgeX = Math.max(maxEdgeX, x);
          maxEdgeY = Math.max(maxEdgeY, y);
          if (x < width * 0.06 || x > width * 0.94 || y < height * 0.06 || y > height * 0.94) borderEdges += 1;
          if (x < width / 2) leftEdges += 1;
          else rightEdges += 1;
        }
        if (y > height * 0.62 && y < height * 0.94 && edge > 34) {
          lowerRows.set(y, (lowerRows.get(y) ?? 0) + 1);
        }
      }

      if (y > height * 0.68) {
        if (value < 92) lowerDark += 1;
        if (value > 145) lowerLight += 1;
      }
    }
  }

  const sampled = Math.max(1, Math.ceil(width / 2) * Math.ceil(height / 2));
  const edgeVariance = edgeTotal / Math.max(1, edgeCount);
  const edgeBoundsWidth = documentEdges > 0 ? maxEdgeX - minEdgeX + 2 : 0;
  const edgeBoundsHeight = documentEdges > 0 ? maxEdgeY - minEdgeY + 2 : 0;
  const documentCoverage = (edgeBoundsWidth * edgeBoundsHeight) / Math.max(1, width * height);
  const documentAspect = edgeBoundsHeight > 0 ? edgeBoundsWidth / edgeBoundsHeight : 0;
  const passportAspectScore = clamp01(1 - Math.abs(documentAspect - 1.42) / 0.55);
  const borderEdgeRatio = borderEdges / Math.max(1, documentEdges);
  const lowerMrzContrast = Math.min(lowerDark, lowerLight) / Math.max(1, lowerDark + lowerLight);
  const skewScore = Math.abs(leftEdges - rightEdges) / Math.max(1, leftEdges + rightEdges);
  const rowEdgeThreshold = Math.max(8, width / 42);
  const textDenseRows = [...lowerRows.values()].filter((count) => count >= rowEdgeThreshold).length;
  const rowDensity = textDenseRows / Math.max(1, height * 0.16);
  const twoBandSignal = textDenseRows >= 8 ? 1 : textDenseRows / 8;
  const mrzLikelihood = clamp01((rowDensity * 0.58) + (twoBandSignal * 0.42));
  const passportConfidence = clamp01(
    mrzLikelihood * 0.46
    + passportAspectScore * 0.32
    + clamp01((documentCoverage - 0.16) / 0.2) * 0.14
    + lowerMrzContrast * 0.08,
  );

  return {
    width,
    height,
    originalWidth: width,
    originalHeight: height,
    averageBrightness: total / sampled,
    darkRatio: dark / sampled,
    highlightRatio: highlight / sampled,
    edgeVariance,
    documentCoverage,
    borderEdgeRatio,
    lowerMrzContrast,
    skewScore,
    mrzLikelihood,
    passportAspectScore,
    passportConfidence,
  };
}

export function evaluatePassportQuality(metrics: PassportQualityMetrics): PassportQualityResult {
  const issues: PassportQualityIssue[] = [];
  const t = PASSPORT_QUALITY_THRESHOLDS;

  if (metrics.originalWidth < t.minWidth || metrics.originalHeight < t.minHeight) issues.push("LOW_RESOLUTION");
  if (metrics.averageBrightness < t.minAverageBrightness || metrics.darkRatio > t.maxDarkRatio) issues.push("IMAGE_TOO_DARK");
  if (metrics.highlightRatio > t.maxHighlightRatio) issues.push("EXCESSIVE_GLARE");
  if (metrics.edgeVariance < t.minEdgeVariance) issues.push("IMAGE_BLURRED");
  if (metrics.documentCoverage < t.minDocumentCoverage) issues.push("DOCUMENT_TOO_SMALL");
  if (metrics.borderEdgeRatio > t.maxBorderEdgeRatio) issues.push("DOCUMENT_CROPPED");
  if (metrics.lowerMrzContrast < t.minLowerMrzContrast) issues.push("MRZ_NOT_VISIBLE");
  if (metrics.passportConfidence < 0.5) issues.push("PASSPORT_NOT_DETECTED");
  if (metrics.skewScore > t.maxSkewScore) issues.push("IMAGE_ROTATED");

  const blocking = issues.filter((issue) => issue !== "IMAGE_ROTATED");
  const status: PassportQualityStatus = blocking.length === 0
    ? (issues.length === 0 ? "ACCEPTED_FOR_OCR" : "MANUAL_REVIEW_REQUIRED")
    : "RETAKE_REQUIRED";
  const liveState: PassportLiveState = status === "ACCEPTED_FOR_OCR" ? "READY" : blocking.length <= 2 ? "ALMOST_READY" : "NOT_READY";
  const guidance = guidanceFor(issues, liveState);

  return {
    status,
    liveState,
    issues,
    guidance,
    message: status === "ACCEPTED_FOR_OCR"
      ? "Ready to scan"
      : "The passport is not clear enough. Please retake the photo.",
    metrics,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scoreBrightness(metrics: PassportQualityMetrics): number {
  const brightness = clamp01((metrics.averageBrightness - 28) / 52);
  const darkPenalty = clamp01(1 - Math.max(0, metrics.darkRatio - 0.62) / 0.28);
  return Math.min(brightness, darkPenalty);
}

function scoreSharpness(metrics: PassportQualityMetrics): number {
  return clamp01((metrics.edgeVariance - LIVE_ADVISORY_EDGE_VARIANCE) / 16);
}

function scoreCoverage(metrics: PassportQualityMetrics): number {
  return clamp01((metrics.documentCoverage - 0.12) / 0.18);
}

function scoreBorder(metrics: PassportQualityMetrics): number {
  return clamp01(1 - Math.max(0, metrics.borderEdgeRatio - 0.18) / 0.42);
}

function liveGuidanceFor(issues: PassportQualityIssue[], liveState: PassportLiveState, blockingIssue: PassportQualityIssue | null): string {
  if (blockingIssue === "IMAGE_TOO_DARK") return "Too dark";
  if (blockingIssue === "IMAGE_BLURRED") return "Hold steady";
  if (blockingIssue === "DOCUMENT_TOO_SMALL") return "Move closer";
  if (blockingIssue === "DOCUMENT_CROPPED") return "Move farther away";
  if (liveState === "READY") return "Ready to scan";
  if (issues.includes("IMAGE_TOO_DARK")) return "Too dark";
  if (issues.includes("IMAGE_BLURRED")) return "Hold steady";
  if (issues.includes("DOCUMENT_TOO_SMALL")) return "Move closer";
  if (issues.includes("DOCUMENT_CROPPED")) return "Move farther away";
  return "Hold steady";
}

export function evaluatePassportLiveQuality(metrics: PassportQualityMetrics): PassportQualityResult {
  const issues: PassportQualityIssue[] = [];
  if (metrics.averageBrightness < 45 || metrics.darkRatio > 0.7) issues.push("IMAGE_TOO_DARK");
  if (metrics.edgeVariance < LIVE_ADVISORY_EDGE_VARIANCE) issues.push("IMAGE_BLURRED");
  if (metrics.documentCoverage < PASSPORT_QUALITY_THRESHOLDS.minDocumentCoverage) issues.push("DOCUMENT_TOO_SMALL");
  if (metrics.borderEdgeRatio > PASSPORT_QUALITY_THRESHOLDS.maxBorderEdgeRatio) issues.push("DOCUMENT_CROPPED");
  if (metrics.skewScore > PASSPORT_QUALITY_THRESHOLDS.maxSkewScore) issues.push("IMAGE_ROTATED");

  const brightnessScore = scoreBrightness(metrics);
  const sharpnessScore = scoreSharpness(metrics);
  const coverageScore = scoreCoverage(metrics);
  const borderScore = scoreBorder(metrics);
  const stabilityScore = 1;
  const readinessScore =
    brightnessScore * 0.2
    + sharpnessScore * 0.25
    + coverageScore * 0.3
    + borderScore * 0.15
    + stabilityScore * 0.1;

  const blockingIssue: PassportQualityIssue | null =
    metrics.averageBrightness < 24 || metrics.darkRatio > 0.9
      ? "IMAGE_TOO_DARK"
      : metrics.edgeVariance < LIVE_SEVERE_BLUR_EDGE_VARIANCE
        ? "IMAGE_BLURRED"
        : metrics.documentCoverage < 0.12
          ? "DOCUMENT_TOO_SMALL"
          : metrics.borderEdgeRatio > 0.58
            ? "DOCUMENT_CROPPED"
            : null;
  const liveState: PassportLiveState = !blockingIssue && readinessScore >= 0.72
    ? "DOCUMENT_DETECTED"
    : !blockingIssue && metrics.documentCoverage >= 0.12
      ? "DOCUMENT_DETECTED"
      : "NO_DOCUMENT";

  return {
    status: "RETAKE_REQUIRED",
    liveState,
    issues,
    guidance: liveGuidanceFor(issues, liveState, blockingIssue),
    message: "Hold the passport biodata page inside the guide.",
    metrics,
    readinessScore,
    blockingIssue,
  };
}

export function guidanceFor(issues: PassportQualityIssue[], liveState: PassportLiveState): string {
  if (issues.includes("DOCUMENT_TOO_SMALL")) return "Move closer";
  if (issues.includes("DOCUMENT_CROPPED")) return "Move farther away";
  if (issues.includes("IMAGE_TOO_DARK")) return "Too dark";
  if (issues.includes("EXCESSIVE_GLARE")) return "Too much glare";
  if (issues.includes("IMAGE_BLURRED")) return "Hold steady";
  if (issues.includes("MRZ_NOT_VISIBLE")) return "Keep the bottom MRZ visible";
  if (issues.includes("PASSPORT_NOT_DETECTED")) return "Show passport biodata page";
  if (issues.includes("IMAGE_ROTATED")) return "Show the whole passport";
  return liveState === "READY" ? "Ready to scan" : "Show the whole passport";
}

export async function analyzeImageFile(file: File, maxWidth = 960): Promise<PassportQualityResult> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    const metrics = emptyMetrics();
    return { status: "RETAKE_REQUIRED", liveState: "NOT_READY", issues: ["IMAGE_DECODE_FAILED"], message: "The image could not be read. Please retake the photo.", guidance: "Show the whole passport", metrics };
  }
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    const metrics = emptyMetrics();
    return { status: "RETAKE_REQUIRED", liveState: "NOT_READY", issues: ["IMAGE_DECODE_FAILED"], message: "The image could not be read. Please retake the photo.", guidance: "Show the whole passport", metrics };
  }
  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const metrics = analyzePassportPixels(imageData.data, width, height);
  metrics.originalWidth = bitmap.width;
  metrics.originalHeight = bitmap.height;
  const result = evaluatePassportQuality(metrics);
  bitmap.close();
  return result;
}

export function analyzeCanvasFrame(canvas: HTMLCanvasElement): PassportQualityResult | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width === 0 || canvas.height === 0) return null;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return evaluatePassportLiveQuality(analyzePassportPixels(imageData.data, canvas.width, canvas.height));
}

function emptyMetrics(): PassportQualityMetrics {
  return {
    width: 0,
    height: 0,
    originalWidth: 0,
    originalHeight: 0,
    averageBrightness: 0,
    darkRatio: 1,
    highlightRatio: 0,
    edgeVariance: 0,
    documentCoverage: 0,
    borderEdgeRatio: 0,
    lowerMrzContrast: 0,
    skewScore: 1,
    mrzLikelihood: 0,
    passportAspectScore: 0,
    passportConfidence: 0,
  };
}
