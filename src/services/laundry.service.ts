import { requestJson } from "./api.client";
import type { LaundryLoadInput, LaundryWorkspace } from "../types/laundry";

type LaundryResponse = { success: boolean; data?: LaundryWorkspace; error?: string };

async function mutate(path: string, body: unknown): Promise<LaundryWorkspace> {
  const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as LaundryResponse;
  if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error ?? "Laundry action could not be completed.");
  return payload.data;
}

export async function loadLaundryWorkspace(signal?: AbortSignal): Promise<LaundryWorkspace> {
  const response = await requestJson<LaundryResponse>("/api/housekeeping/laundry", signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Laundry service is unavailable.");
  return response.data;
}

export function sendLaundryLoad(input: LaundryLoadInput): Promise<LaundryWorkspace> { return mutate("/api/housekeeping/laundry/loads", input); }
export function receiveLaundryLoad(loadId: number, input: LaundryLoadInput): Promise<LaundryWorkspace> { return mutate(`/api/housekeeping/laundry/loads/${loadId}/receive`, input); }
