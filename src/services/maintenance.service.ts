import { ApiError, requestJson } from "./api.client";
import type {
  CreateMaintenanceTicketPayload,
  MaintenanceAssignableOptions,
  MaintenanceAssignableUsersResponse,
  MaintenanceDetailResponse,
  MaintenanceListResponse,
  MaintenanceNoteResponse,
  MaintenancePhotoResponse,
  MaintenanceStatus,
  MaintenanceTicketDetail,
  MaintenanceTicketSummary,
  UpdateMaintenanceTicketPayload,
  UpdateMaintenanceAssignmentPayload,
} from "../types/maintenance";

async function sendJson<T>(path: string, method: "POST" | "PATCH", payload: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("The server returned an invalid response", response.status);
  }

  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : "The request could not be completed";
    throw new ApiError(message, response.status);
  }

  return body as T;
}

export async function loadMaintenanceTickets(filters: { search?: string; status?: MaintenanceStatus | "All" }, signal?: AbortSignal): Promise<MaintenanceTicketSummary[]> {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.status && filters.status !== "All") params.set("status", filters.status);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await requestJson<MaintenanceListResponse>(`/api/maintenance/tickets${suffix}`, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Maintenance tickets are unavailable");
  return response.data;
}

export async function loadMaintenanceTicket(id: number, signal?: AbortSignal): Promise<MaintenanceTicketDetail> {
  const response = await requestJson<MaintenanceDetailResponse>(`/api/maintenance/tickets/${id}`, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Maintenance ticket is unavailable");
  return response.data;
}

export async function createMaintenanceTicket(payload: CreateMaintenanceTicketPayload, signal?: AbortSignal): Promise<MaintenanceTicketDetail> {
  const response = await sendJson<MaintenanceDetailResponse>("/api/maintenance/tickets", "POST", payload, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Maintenance ticket could not be created");
  return response.data;
}

export async function loadMaintenanceAssignableUsers(signal?: AbortSignal): Promise<MaintenanceAssignableOptions> {
  const response = await requestJson<MaintenanceAssignableUsersResponse>("/api/maintenance/assignable-users", signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Assignable maintenance users are unavailable");
  return response.data;
}

export async function updateMaintenanceTicket(id: number, payload: UpdateMaintenanceTicketPayload, signal?: AbortSignal): Promise<MaintenanceTicketDetail> {
  const response = await sendJson<MaintenanceDetailResponse>(`/api/maintenance/tickets/${id}`, "PATCH", payload, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Maintenance ticket could not be updated");
  return response.data;
}

export async function assignMaintenanceTicket(id: number, payload: UpdateMaintenanceAssignmentPayload, signal?: AbortSignal): Promise<MaintenanceTicketDetail> {
  const response = await sendJson<MaintenanceDetailResponse>(`/api/maintenance/tickets/${id}/assignment`, "PATCH", payload, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Maintenance assignment could not be updated");
  return response.data;
}

export async function transitionMaintenanceTicket(id: number, status: MaintenanceStatus, reason?: string | null, signal?: AbortSignal): Promise<MaintenanceTicketDetail> {
  const response = await sendJson<MaintenanceDetailResponse>(`/api/maintenance/tickets/${id}/status`, "PATCH", { status, reason: reason ?? null }, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Maintenance status could not be updated");
  return response.data;
}

export async function updateMaintenanceOutOfService(id: number, outOfService: boolean, signal?: AbortSignal): Promise<MaintenanceTicketDetail> {
  const response = await sendJson<MaintenanceDetailResponse>(`/api/maintenance/tickets/${id}/out-of-service`, "PATCH", { outOfService }, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Out of Service could not be updated");
  return response.data;
}

export async function addMaintenanceNote(id: number, body: string, signal?: AbortSignal) {
  const response = await sendJson<MaintenanceNoteResponse>(`/api/maintenance/tickets/${id}/notes`, "POST", { body }, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Maintenance note could not be added");
  return response.data;
}

export async function addMaintenancePhoto(id: number, payload: { localReference?: string | null; url?: string | null; caption?: string | null }, signal?: AbortSignal) {
  const response = await sendJson<MaintenancePhotoResponse>(`/api/maintenance/tickets/${id}/photos`, "POST", payload, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Maintenance photo could not be added");
  return response.data;
}
