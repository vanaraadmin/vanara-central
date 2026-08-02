import type { PassportClassification, PassportData } from "../types/reception";
import type { Rect, SourceCrop } from "./passport-crop";

export type PassportFailureCode =
  | "NOT_PASSPORT"
  | "NOT_BIODATA_PAGE"
  | "DOCUMENT_CROPPED"
  | "MRZ_NOT_VISIBLE"
  | "TOO_DARK"
  | "TOO_BLURRED"
  | "TOO_MUCH_GLARE"
  | "CLASSIFICATION_TIMEOUT"
  | "CLASSIFICATION_NETWORK_ERROR"
  | "UPLOAD_FAILED"
  | "OCR_TIMEOUT"
  | "OCR_MODEL_ERROR"
  | "OCR_PARSE_ERROR"
  | "OCR_VALIDATION_FAILED"
  | "SAVE_FAILED"
  | "UNKNOWN";

export interface PassportFailure {
  code: PassportFailureCode;
  message: string;
  technical?: boolean;
  requestId?: string;
}

export interface CaptureDebug {
  captureId: number;
  sourceWidth: number;
  sourceHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  objectFitScale?: number;
  guide: Rect;
  crop: SourceCrop;
  canvasWidth: number;
  canvasHeight: number;
  finalBlobBytes?: number;
}

export type PassportWorkflowState =
  | { phase: "CLOSED" }
  | { phase: "CAMERA"; captureId: number }
  | { phase: "CAPTURED"; captureId: number; file: File; previewUrl: string; debug?: CaptureDebug }
  | { phase: "CLASSIFYING"; captureId: number; file: File; previewUrl: string; debug?: CaptureDebug }
  | { phase: "REJECTED"; captureId: number; file: File; previewUrl: string; reason: PassportFailure; debug?: CaptureDebug }
  | { phase: "READY_FOR_OCR"; captureId: number; file: File; previewUrl: string; classification: PassportClassification; debug?: CaptureDebug }
  | { phase: "OCR_RUNNING"; captureId: number; file: File; previewUrl: string; classification?: PassportClassification; debug?: CaptureDebug }
  | { phase: "OCR_FAILED"; captureId: number; file: File; previewUrl: string; error: PassportFailure; classification?: PassportClassification; debug?: CaptureDebug }
  | { phase: "REVIEW"; captureId: number; objectKey: string; passport: PassportData; previewUrl?: string }
  | { phase: "SAVING"; captureId: number; objectKey: string; passport: PassportData; previewUrl?: string }
  | { phase: "SAVE_FAILED"; captureId: number; objectKey: string; passport: PassportData; error: PassportFailure; previewUrl?: string }
  | { phase: "COMPLETED"; passportId: number };

export type PassportWorkflowAction =
  | { type: "OPEN"; captureId: number }
  | { type: "CAPTURE"; captureId: number; file: File; previewUrl: string; debug?: CaptureDebug }
  | { type: "START_CLASSIFICATION"; captureId: number }
  | { type: "CLASSIFICATION_ACCEPTED"; captureId: number; classification: PassportClassification }
  | { type: "CLASSIFICATION_REJECTED"; captureId: number; reason: PassportFailure }
  | { type: "START_OCR"; captureId: number }
  | { type: "OCR_SUCCESS"; captureId: number; objectKey: string; passport: PassportData }
  | { type: "OCR_FAILURE"; captureId: number; error: PassportFailure }
  | { type: "START_SAVE"; captureId: number; passport: PassportData }
  | { type: "SAVE_SUCCESS"; captureId: number; passportId: number }
  | { type: "SAVE_FAILURE"; captureId: number; error: PassportFailure }
  | { type: "RETAKE"; captureId: number }
  | { type: "CANCEL" };

export const initialPassportWorkflowState: PassportWorkflowState = { phase: "CLOSED" };

export function activePassportCaptureId(state: PassportWorkflowState): number | null {
  return "captureId" in state ? state.captureId : null;
}

export function passportWorkflowReducer(
  state: PassportWorkflowState,
  action: PassportWorkflowAction,
): PassportWorkflowState {
  switch (action.type) {
    case "OPEN":
      return state.phase === "CLOSED" ? { phase: "CAMERA", captureId: action.captureId } : state;
    case "CAPTURE":
      return state.phase === "CAMERA" && state.captureId === action.captureId
        ? { phase: "CAPTURED", captureId: action.captureId, file: action.file, previewUrl: action.previewUrl, debug: action.debug }
        : state;
    case "START_CLASSIFICATION":
      return state.phase === "CAPTURED" && state.captureId === action.captureId
        ? { phase: "CLASSIFYING", captureId: state.captureId, file: state.file, previewUrl: state.previewUrl, debug: state.debug }
        : state;
    case "CLASSIFICATION_ACCEPTED":
      return state.phase === "CLASSIFYING" && state.captureId === action.captureId
        ? { phase: "READY_FOR_OCR", captureId: state.captureId, file: state.file, previewUrl: state.previewUrl, classification: action.classification, debug: state.debug }
        : state;
    case "CLASSIFICATION_REJECTED":
      return state.phase === "CLASSIFYING" && state.captureId === action.captureId
        ? { phase: "REJECTED", captureId: state.captureId, file: state.file, previewUrl: state.previewUrl, reason: action.reason, debug: state.debug }
        : state;
    case "START_OCR":
      if ((state.phase === "READY_FOR_OCR" || state.phase === "OCR_FAILED") && state.captureId === action.captureId) {
        return { phase: "OCR_RUNNING", captureId: state.captureId, file: state.file, previewUrl: state.previewUrl, classification: state.classification, debug: state.debug };
      }
      return state;
    case "OCR_SUCCESS":
      return state.phase === "OCR_RUNNING" && state.captureId === action.captureId
        ? { phase: "REVIEW", captureId: state.captureId, objectKey: action.objectKey, passport: action.passport, previewUrl: state.previewUrl }
        : state;
    case "OCR_FAILURE":
      return state.phase === "OCR_RUNNING" && state.captureId === action.captureId
        ? { phase: "OCR_FAILED", captureId: state.captureId, file: state.file, previewUrl: state.previewUrl, error: action.error, classification: state.classification, debug: state.debug }
        : state;
    case "START_SAVE":
      return (state.phase === "REVIEW" || state.phase === "SAVE_FAILED") && state.captureId === action.captureId
        ? { phase: "SAVING", captureId: state.captureId, objectKey: state.objectKey, passport: action.passport, previewUrl: state.previewUrl }
        : state;
    case "SAVE_SUCCESS":
      return state.phase === "SAVING" && state.captureId === action.captureId
        ? { phase: "COMPLETED", passportId: action.passportId }
        : state;
    case "SAVE_FAILURE":
      return state.phase === "SAVING" && state.captureId === action.captureId
        ? { phase: "SAVE_FAILED", captureId: state.captureId, objectKey: state.objectKey, passport: state.passport, error: action.error, previewUrl: state.previewUrl }
        : state;
    case "RETAKE":
      return state.phase !== "CLOSED" && state.phase !== "COMPLETED"
        ? { phase: "CAMERA", captureId: action.captureId }
        : state;
    case "CANCEL":
      return { phase: "CLOSED" };
    default:
      return state;
  }
}

export function canCancelPassportWorkflow(state: PassportWorkflowState): boolean {
  return state.phase !== "CLOSED" && state.phase !== "COMPLETED";
}
