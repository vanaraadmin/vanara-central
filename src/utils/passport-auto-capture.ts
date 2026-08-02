export const PASSPORT_AUTO_CAPTURE_DWELL_MS = 400;

export interface PassportAutoCaptureCandidate {
  capturedAt: number;
  cropValid: boolean;
  documentCoverage: number;
  edgeVariance: number;
  borderEdgeRatio: number;
}

export function isAutoCaptureCandidateFresh(candidate: PassportAutoCaptureCandidate | null | undefined, now: number, readyUntil: number): boolean {
  return Boolean(candidate) && candidate!.capturedAt <= readyUntil && candidate!.capturedAt >= readyUntil - 1_200 && candidate!.capturedAt <= now;
}

export function isAutoCaptureCandidateStructurallyValid(candidate: PassportAutoCaptureCandidate | null | undefined): boolean {
  return Boolean(candidate) && candidate!.cropValid && candidate!.documentCoverage >= 0.12 && candidate!.borderEdgeRatio <= 0.58;
}

export function selectBestAutoCaptureCandidate<T extends PassportAutoCaptureCandidate>(current: T | null | undefined, next: T | null | undefined): T | null {
  if (!isAutoCaptureCandidateStructurallyValid(current)) return isAutoCaptureCandidateStructurallyValid(next) ? next! : null;
  if (!isAutoCaptureCandidateStructurallyValid(next)) return current!;
  const left = current!;
  const right = next!;
  const coverageDelta = right.documentCoverage - left.documentCoverage;
  if (Math.abs(coverageDelta) > 0.025) return coverageDelta > 0 ? right : left;
  const sharpnessDelta = right.edgeVariance - left.edgeVariance;
  if (Math.abs(sharpnessDelta) > 2) return sharpnessDelta > 0 ? right : left;
  return right.capturedAt >= left.capturedAt ? right : left;
}

export function shouldStartAutoCaptureTimer({
  autoCaptureEnabled,
  captureInFlight,
  candidate,
  cameraReady,
  hasExistingTimer,
  now,
  readyUntil,
  streamLive,
}: {
  autoCaptureEnabled: boolean;
  cameraReady: boolean;
  captureInFlight: boolean;
  candidate: PassportAutoCaptureCandidate | null | undefined;
  hasExistingTimer: boolean;
  now: number;
  readyUntil: number;
  streamLive: boolean;
}): boolean {
  return autoCaptureEnabled
    && cameraReady
    && streamLive
    && !captureInFlight
    && !hasExistingTimer
    && isAutoCaptureCandidateFresh(candidate, now, readyUntil)
    && isAutoCaptureCandidateStructurallyValid(candidate);
}
