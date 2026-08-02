import type { PassportQualityIssue } from "./passport-quality";

export const PASSPORT_READY_LATCH_MS = 1_200;

const STABILITY_ONLY_ISSUES = new Set<PassportQualityIssue>(["IMAGE_BLURRED"]);
const CRITICAL_READY_CANCEL_ISSUES = new Set<PassportQualityIssue>([
  "DOCUMENT_CROPPED",
  "DOCUMENT_TOO_SMALL",
  "PASSPORT_NOT_DETECTED",
]);

export function isReadyLatched(readyUntil: number, now: number): boolean {
  return readyUntil > now;
}

export function nextReadyLatchUntil(isReady: boolean, now: number): number {
  return isReady ? now + PASSPORT_READY_LATCH_MS : 0;
}

export function shouldIgnoreReadyDegradationDuringTap(issue: PassportQualityIssue | null | undefined, pointerActive: boolean, readyUntil: number, now: number): boolean {
  return pointerActive && isReadyLatched(readyUntil, now) && issue !== null && issue !== undefined && STABILITY_ONLY_ISSUES.has(issue);
}

export function shouldIgnoreTemporaryReadyDegradation(issue: PassportQualityIssue | null | undefined, readyUntil: number, now: number): boolean {
  return isReadyLatched(readyUntil, now) && issue !== null && issue !== undefined && STABILITY_ONLY_ISSUES.has(issue);
}

export function shouldCancelReadyLatch(issue: PassportQualityIssue | null | undefined): boolean {
  return issue !== null && issue !== undefined && CRITICAL_READY_CANCEL_ISSUES.has(issue);
}
