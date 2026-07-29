import { requestJson } from "./api.client";
import type { HousekeepingOverview, HousekeepingResponse } from "../types/housekeeping";

export async function loadHousekeepingOverview(signal?: AbortSignal): Promise<HousekeepingOverview> {
  const response = await requestJson<HousekeepingResponse>("/api/housekeeping", signal);

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Housekeeping data is unavailable");
  }

  return response.data;
}