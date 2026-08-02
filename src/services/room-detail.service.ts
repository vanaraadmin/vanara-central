import { ApiError, requestJson } from "./api.client";
import type { MaintenanceDetailResponse, MaintenanceTicketDetail } from "../types/maintenance";
import type { CreateRoomMaintenanceTicketPayload, CreateRoomOnDemandCleaningPayload, ReceptionRoomAlert, RoomDetail, RoomDetailResponse, RoomHousekeepingStatus, RoomNote, RoomNoteResponse } from "../types/room-detail";
import type { ReceptionStayResponse } from "../types/reception";

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

export async function loadRoomDetail(roomId: string, signal?: AbortSignal): Promise<RoomDetail> {
  const response = await requestJson<RoomDetailResponse>(`/api/rooms/${encodeURIComponent(roomId)}`, signal);

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Room detail is unavailable");
  }

  return response.data;
}

export async function updateRoomHousekeeping(roomId: string, status: RoomHousekeepingStatus, signal?: AbortSignal): Promise<RoomDetail> {
  const response = await sendJson<RoomDetailResponse>(`/api/rooms/${encodeURIComponent(roomId)}/housekeeping`, "PATCH", { status }, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Housekeeping status could not be updated");
  return response.data;
}

export async function addRoomNote(roomId: string, body: string, signal?: AbortSignal): Promise<RoomNote> {
  const response = await sendJson<RoomNoteResponse>(`/api/rooms/${encodeURIComponent(roomId)}/notes`, "POST", { body }, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Room note could not be added");
  return response.data;
}

export async function createRoomMaintenanceTicket(roomId: string, payload: CreateRoomMaintenanceTicketPayload, signal?: AbortSignal): Promise<MaintenanceTicketDetail> {
  const response = await sendJson<MaintenanceDetailResponse>(`/api/rooms/${encodeURIComponent(roomId)}/maintenance/tickets`, "POST", payload, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Maintenance ticket could not be created");
  return response.data;
}

export async function createRoomOnDemandCleaning(roomId: string, payload: CreateRoomOnDemandCleaningPayload, signal?: AbortSignal): Promise<void> {
  const response = await sendJson<RoomDetailResponse>(`/api/rooms/${encodeURIComponent(roomId)}/on-demand-cleaning`, "POST", {
    source: "ROOM_WORKSPACE",
    priority: payload.priority ?? "normal",
    note: payload.note ?? null,
    includeLinen: false,
    idempotencyKey: payload.idempotencyKey ?? null,
  }, signal);
  if (!response.success) throw new Error(response.error ?? "On-demand cleaning could not be created");
}

export async function resolveReceptionRoomAlert(alert: ReceptionRoomAlert, signal?: AbortSignal): Promise<void> {
  const response = await sendJson<ReceptionStayResponse>(`/api/reception/stays/${alert.bookingId}/alerts/${alert.type}/resolve`, "POST", {}, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Reception alert could not be completed");
}
