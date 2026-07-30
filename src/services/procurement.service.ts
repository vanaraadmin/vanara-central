import { ApiError, requestJson } from "./api.client";
import type {
  ApiResponse,
  CreateProcurementRequestPayload,
  CurrentUserView,
  ProcurementItem,
  ProcurementRequest,
  ProcurementStatus,
  UpdateProcurementRequestPayload,
} from "../types/procurement";

async function sendJson<T>(path: string, method: "POST" | "PATCH", payload: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new ApiError("The server returned an invalid response", response.status); }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : "The request could not be completed";
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export async function loadCurrentUser(signal?: AbortSignal): Promise<CurrentUserView> {
  const response = await requestJson<ApiResponse<CurrentUserView>>("/api/current-user", signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Current user is unavailable");
  return response.data;
}

export async function loadProcurementItems(signal?: AbortSignal): Promise<ProcurementItem[]> {
  const response = await requestJson<ApiResponse<ProcurementItem[]>>("/api/procurement/items", signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Supply items are unavailable");
  return response.data;
}

export async function createProcurementRequest(payload: CreateProcurementRequestPayload, signal?: AbortSignal): Promise<ProcurementRequest> {
  const response = await sendJson<ApiResponse<ProcurementRequest>>("/api/procurement/requests", "POST", payload, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Supply request could not be created");
  return response.data;
}

export async function loadProcurementRequests(status: ProcurementStatus | "all", signal?: AbortSignal): Promise<ProcurementRequest[]> {
  const suffix = status === "all" ? "" : `?status=${status}`;
  const response = await requestJson<ApiResponse<ProcurementRequest[]>>(`/api/procurement/requests${suffix}`, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Supply requests are unavailable");
  return response.data;
}

export async function loadProcurementRequest(id: number, signal?: AbortSignal): Promise<ProcurementRequest> {
  const response = await requestJson<ApiResponse<ProcurementRequest>>(`/api/procurement/requests/${id}`, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Supply request is unavailable");
  return response.data;
}

export async function updateProcurementRequest(id: number, payload: UpdateProcurementRequestPayload, signal?: AbortSignal): Promise<ProcurementRequest> {
  const response = await sendJson<ApiResponse<ProcurementRequest>>(`/api/procurement/requests/${id}`, "PATCH", payload, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Supply request could not be updated");
  return response.data;
}
