import { ApiError, requestJson } from "./api.client";
import type { ReceptionCheckInField, ReceptionCheckOutField, ReceptionOverview, ReceptionResponse, ReceptionStay, ReceptionStayResponse } from "../types/reception";

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
