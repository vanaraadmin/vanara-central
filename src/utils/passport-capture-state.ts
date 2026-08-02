export type PassportCapturePhase =
  | "CAMERA_PREVIEW"
  | "CAPTURED"
  | "CLASSIFYING"
  | "REJECTED"
  | "READY_FOR_OCR"
  | "OCR_RUNNING";

export interface PassportSemanticDecision {
  ready: boolean;
}

export function canApplyPassportClassification(activeCaptureId: number, resultCaptureId: number): boolean {
  return activeCaptureId === resultCaptureId;
}

export function passportPhaseAfterClassification(decision: PassportSemanticDecision): PassportCapturePhase {
  return decision.ready ? "READY_FOR_OCR" : "REJECTED";
}

export function canScanPassport(phase: PassportCapturePhase, decision: PassportSemanticDecision | null, hasFile: boolean): boolean {
  return hasFile && phase === "READY_FOR_OCR" && decision?.ready === true;
}
