import { requestJson } from "./api.client";
import type { HousekeepingV2Overview, HousekeepingV2Response, HousekeepingV2RoomDetail, HousekeepingV2RoomResponse } from "../types/housekeeping-v2";

export async function loadHousekeepingV2Overview(date?: string, signal?: AbortSignal): Promise<HousekeepingV2Overview> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await requestJson<HousekeepingV2Response>(`/api/housekeeping/v2/tasks${query}`, signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Housekeeping tasks are unavailable");
  }
  return response.data;
}

async function sendHousekeepingV2Action(path: string, payload: unknown, signal?: AbortSignal): Promise<HousekeepingV2RoomDetail> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const body = await response.json() as HousekeepingV2RoomResponse;
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.error ?? "Housekeeping action could not be completed");
  }
  return body.data;
}

export async function loadHousekeepingV2Room(unitId: string, date?: string, signal?: AbortSignal): Promise<HousekeepingV2RoomDetail> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await requestJson<HousekeepingV2RoomResponse>(`/api/housekeeping/v2/rooms/${encodeURIComponent(unitId)}${query}`, signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Housekeeping room is unavailable");
  }
  return response.data;
}

export function claimHousekeepingTask(taskId: number, expectedVersion: number): Promise<HousekeepingV2RoomDetail> {
  return sendHousekeepingV2Action(`/api/housekeeping/v2/tasks/${taskId}/claim`, { expectedVersion });
}

export function releaseHousekeepingClaim(taskId: number, expectedVersion: number): Promise<HousekeepingV2RoomDetail> {
  return sendHousekeepingV2Action(`/api/housekeeping/v2/tasks/${taskId}/release-claim`, { expectedVersion });
}

export function startHousekeepingTask(taskId: number, expectedVersion: number): Promise<HousekeepingV2RoomDetail> {
  return sendHousekeepingV2Action(`/api/housekeeping/v2/tasks/${taskId}/start`, { expectedVersion });
}

export function updateHousekeepingTaskChecklist(taskId: number, expectedVersion: number, itemKey: string, completed: boolean): Promise<HousekeepingV2RoomDetail> {
  return sendHousekeepingV2Action(`/api/housekeeping/v2/tasks/${taskId}/checklist`, { expectedVersion, itemKey, completed });
}

export function completeHousekeepingTask(taskId: number, expectedVersion: number): Promise<HousekeepingV2RoomDetail> {
  return sendHousekeepingV2Action(`/api/housekeeping/v2/tasks/${taskId}/complete`, { expectedVersion });
}

export function skipHousekeepingTask(taskId: number, expectedVersion: number, reason: string): Promise<HousekeepingV2RoomDetail> {
  return sendHousekeepingV2Action(`/api/housekeeping/v2/tasks/${taskId}/skip`, { expectedVersion, reason });
}

export function cancelHousekeepingTask(taskId: number, expectedVersion: number, reason: string): Promise<HousekeepingV2RoomDetail> {
  return sendHousekeepingV2Action(`/api/housekeeping/v2/tasks/${taskId}/cancel`, { expectedVersion, reason });
}

export function reopenHousekeepingTask(taskId: number, expectedVersion: number, reason: string): Promise<HousekeepingV2RoomDetail> {
  return sendHousekeepingV2Action(`/api/housekeeping/v2/tasks/${taskId}/reopen`, { expectedVersion, reason });
}

export function forceHousekeepingRoomRelease(taskId: number, expectedVersion: number, bookingId: number, reason: string): Promise<HousekeepingV2RoomDetail> {
  return sendHousekeepingV2Action(`/api/housekeeping/v2/tasks/${taskId}/force-release`, { expectedVersion, bookingId, reason });
}
