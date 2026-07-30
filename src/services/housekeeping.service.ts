import { ApiError, requestJson } from "./api.client";
import type { HousekeepingAssignableUser, HousekeepingAssignableUsersResponse, HousekeepingChecklistItemId, HousekeepingOverview, HousekeepingResponse, HousekeepingWorkflowStatus } from "../types/housekeeping";

async function sendJson(path: string, payload: unknown, signal?: AbortSignal): Promise<HousekeepingOverview> {
  const response = await fetch(path, {
    method: "PATCH",
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

  const payloadBody = body as HousekeepingResponse;
  if (!payloadBody.success || !payloadBody.data) throw new Error(payloadBody.error ?? "Housekeeping data is unavailable");
  return payloadBody.data;
}

export async function loadHousekeepingOverview(signal?: AbortSignal): Promise<HousekeepingOverview> {
  const response = await requestJson<HousekeepingResponse>("/api/housekeeping", signal);

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Housekeeping data is unavailable");
  }

  return response.data;
}

export async function loadHousekeepingAssignableUsers(signal?: AbortSignal): Promise<HousekeepingAssignableUser[]> {
  const response = await requestJson<HousekeepingAssignableUsersResponse>("/api/housekeeping/assignable-users", signal);

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Housekeeping users are unavailable");
  }

  return response.data;
}

export async function updateHousekeepingRoom(unitId: number, status: HousekeepingWorkflowStatus, signal?: AbortSignal): Promise<HousekeepingOverview> {
  return sendJson(`/api/housekeeping/rooms/${unitId}`, { status }, signal);
}

export async function updateHousekeepingChecklist(unitId: number, itemId: HousekeepingChecklistItemId, completed: boolean, signal?: AbortSignal): Promise<HousekeepingOverview> {
  return sendJson(`/api/housekeeping/rooms/${unitId}/checklist`, { itemId, completed }, signal);
}

export async function updateHousekeepingAssignment(unitId: number, assignedUserId: string | null, signal?: AbortSignal): Promise<HousekeepingOverview> {
  return sendJson(`/api/housekeeping/rooms/${unitId}/assignment`, { assignedUserId }, signal);
}
