import { ApiError, requestJson } from "./api.client";
import type { BookingPassport, BookingPassportResponse, BookingPassportsResponse, PassportClassificationResponse, PassportData, PassportLivePreflightResponse, PassportOcrResponse, ReceptionCheckInField, ReceptionCheckOutField, ReceptionOverview, ReceptionResponse, ReceptionStay, ReceptionStayResponse } from "../types/reception";

async function sendJson(path: string, method: "POST" | "PATCH", payload: unknown, signal?: AbortSignal): Promise<ReceptionStay> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const body = await response.json().catch(() => null) as ReceptionStayResponse | null;
  if (!response.ok) throw new ApiError(body?.error ?? "Reception request failed", response.status);
  if (!body?.success || !body.data) throw new Error(body?.error ?? "Reception stay is unavailable");
  return body.data;
}

type RelativeCrop = { x: number; y: number; width: number; height: number };
const OCR_FULL_IMAGE_MAX_LONG_EDGE = 1800;
const CLASSIFICATION_IMAGE_MAX_LONG_EDGE = 1800;
const PASSPORT_NUMBER_CROP_MAX_LONG_EDGE = 1000;
const MRZ_CROP_MAX_LONG_EDGE = 1600;
const PASSPORT_JPEG_QUALITY = 0.94;
const CLASSIFICATION_JPEG_QUALITY = 0.9;

async function encodePassportImage(file: File, filename: string, maxLongEdge: number, quality: number): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Passport image could not be prepared.");
  }
  context.filter = "brightness(1.04) contrast(1.12)";
  context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("Passport image could not be prepared."));
    }, "image/jpeg", quality);
  });
  return new File([blob], filename, { type: "image/jpeg" });
}

async function cropPassportImage(file: File, crop: RelativeCrop, filename: string, maxLongEdge: number): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const sx = Math.max(0, Math.round(bitmap.width * crop.x));
  const sy = Math.max(0, Math.round(bitmap.height * crop.y));
  const sw = Math.max(1, Math.round(bitmap.width * crop.width));
  const sh = Math.max(1, Math.round(bitmap.height * crop.height));
  const scale = Math.min(1, maxLongEdge / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Passport OCR crop could not be prepared.");
  }
  context.filter = "brightness(1.04) contrast(1.12)";
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("Passport OCR crop could not be prepared."));
    }, "image/jpeg", 0.95);
  });
  return new File([blob], filename, { type: "image/jpeg" });
}

async function appendPassportOcrImages(formData: FormData, file: File): Promise<void> {
  const normalized = await encodePassportImage(file, "passport-ocr.jpg", OCR_FULL_IMAGE_MAX_LONG_EDGE, PASSPORT_JPEG_QUALITY);
  formData.set("passport", normalized);
  const [passportNumberCrop, mrzCrop] = await Promise.all([
    cropPassportImage(normalized, { x: 0.48, y: 0.05, width: 0.48, height: 0.3 }, "passport-number-crop.jpg", PASSPORT_NUMBER_CROP_MAX_LONG_EDGE),
    cropPassportImage(normalized, { x: 0.02, y: 0.64, width: 0.96, height: 0.34 }, "passport-mrz-crop.jpg", MRZ_CROP_MAX_LONG_EDGE),
  ]);
  formData.set("passportNumberCrop", passportNumberCrop);
  formData.set("mrzCrop", mrzCrop);
}

async function appendPassportClassificationImages(formData: FormData, file: File): Promise<void> {
  const normalized = await encodePassportImage(file, "passport-classification.jpg", CLASSIFICATION_IMAGE_MAX_LONG_EDGE, CLASSIFICATION_JPEG_QUALITY);
  const mrzCrop = await cropPassportImage(normalized, { x: 0.02, y: 0.62, width: 0.96, height: 0.36 }, "passport-classification-mrz.jpg", MRZ_CROP_MAX_LONG_EDGE);
  formData.set("passport", normalized);
  formData.set("mrzCrop", mrzCrop);
}

export async function loadReceptionOverview(date?: string, signal?: AbortSignal): Promise<ReceptionOverview> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await requestJson<ReceptionResponse>(`/api/reception${query}`, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Reception data is unavailable");
  return response.data;
}

export async function updateReceptionCheckIn(bookingId: number, field: ReceptionCheckInField, completed: boolean, signal?: AbortSignal): Promise<ReceptionStay> {
  return sendJson(`/api/reception/stays/${bookingId}/check-in`, "PATCH", { field, completed }, signal);
}

export async function updateReceptionCheckOut(bookingId: number, field: ReceptionCheckOutField, completed: boolean, signal?: AbortSignal): Promise<ReceptionStay> {
  return sendJson(`/api/reception/stays/${bookingId}/check-out`, "PATCH", { field, completed }, signal);
}

export async function completeReceptionCheckIn(bookingId: number, payload: { passportRegistrationCompleted: boolean; depositCollected: boolean }, signal?: AbortSignal): Promise<ReceptionStay> {
  return sendJson(`/api/reception/stays/${bookingId}/check-in-completed`, "POST", payload, signal);
}

export async function completeReceptionCheckOut(bookingId: number, payload: { roomInspected: boolean; keysReturned: boolean; depositReturned?: boolean }, signal?: AbortSignal): Promise<ReceptionStay> {
  return sendJson(`/api/reception/stays/${bookingId}/check-out-completed`, "POST", payload, signal);
}

export async function saveReceptionNotes(bookingId: number, payload: { body?: string; specialNotes?: string | null }, signal?: AbortSignal): Promise<ReceptionStay> {
  return sendJson(`/api/reception/stays/${bookingId}/notes`, "POST", payload, signal);
}

export async function loadBookingPassports(bookingId: number, signal?: AbortSignal): Promise<BookingPassport[]> {
  const response = await requestJson<BookingPassportsResponse>(`/api/reception/stays/${bookingId}/passports`, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Booking passports are unavailable");
  return response.data;
}

export async function uploadBookingPassport(bookingId: number, file: File, signal?: AbortSignal): Promise<PassportOcrResponse> {
  const formData = new FormData();
  await appendPassportOcrImages(formData, file);
  const response = await fetch(`/api/reception/stays/${bookingId}/passports/ocr`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    body: formData,
    signal,
  });
  const body = await response.json().catch(() => null) as PassportOcrResponse | null;
  if (!response.ok || !body?.success) {
    throw new ApiError(body?.error?.message ?? "Passport upload could not be completed.", response.status, body?.error?.requestId);
  }
  return body;
}

export async function uploadPassportForReview(file: File, signal?: AbortSignal): Promise<Required<Pick<PassportOcrResponse, "objectKey" | "passport">> & Pick<PassportOcrResponse, "timing">> {
  const formData = new FormData();
  await appendPassportOcrImages(formData, file);
  const response = await fetch("/api/reception/passports/ocr", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    body: formData,
    signal,
  });
  const body = await response.json().catch(() => null) as PassportOcrResponse | null;
  if (!response.ok || !body?.success || !body.objectKey || !body.passport) {
    throw new ApiError(body?.error?.message ?? "Passport OCR could not be completed.", response.status, body?.error?.requestId);
  }
  return {
    objectKey: body.objectKey,
    passport: body.passport,
    timing: body.timing,
  };
}

export async function classifyPassportForScan(file: File, signal?: AbortSignal): Promise<Required<Pick<PassportClassificationResponse, "classification" | "decision">> & Pick<PassportClassificationResponse, "timing">> {
  const formData = new FormData();
  await appendPassportClassificationImages(formData, file);
  const response = await fetch("/api/reception/passports/classify", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    body: formData,
    signal,
  });
  const body = await response.json().catch(() => null) as PassportClassificationResponse | null;
  if (!response.ok || !body?.success || !body.classification || !body.decision) {
    throw new ApiError(body?.error?.message ?? "Passport could not be checked.", response.status, body?.error?.requestId);
  }
  return {
    classification: body.classification,
    decision: body.decision,
    timing: body.timing,
  };
}

export async function livePassportPreflight(file: File, signal?: AbortSignal): Promise<Required<Pick<PassportLivePreflightResponse, "preflight" | "ready">> & Pick<PassportLivePreflightResponse, "timing" | "requestId">> {
  const formData = new FormData();
  formData.set("passport", file);
  const response = await fetch("/api/reception/passports/live-preflight", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    body: formData,
    signal,
  });
  const body = await response.json().catch(() => null) as PassportLivePreflightResponse | null;
  if (!response.ok || !body?.success || !body.preflight || typeof body.ready !== "boolean") {
    throw new ApiError(body?.error?.message ?? "Passport live check could not be completed.", response.status, body?.error?.requestId);
  }
  return {
    preflight: body.preflight,
    ready: body.ready,
    timing: body.timing,
    requestId: body.requestId,
  };
}

export async function saveBookingPassport(bookingId: number, objectKey: string, passport: PassportData, signal?: AbortSignal): Promise<BookingPassport> {
  const response = await fetch(`/api/reception/stays/${bookingId}/passports`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ objectKey, passport }),
    signal,
  });
  const body = await response.json().catch(() => null) as BookingPassportResponse | null;
  if (!response.ok || !body?.success || !body.data) {
    throw new ApiError(body?.error ?? "Passport record could not be saved.", response.status);
  }
  return body.data;
}

export async function discardPassportUpload(objectKey: string, signal?: AbortSignal): Promise<void> {
  await fetch("/api/reception/passports/discard", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ objectKey }),
    signal,
  }).catch(() => undefined);
}
