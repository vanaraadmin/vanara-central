import { requestJson } from "./api.client";
import type { StaffOverview, StaffOverviewResponse } from "../types/staff";

export async function loadStaffOverview(signal?: AbortSignal): Promise<StaffOverview> {
  const response = await requestJson<StaffOverviewResponse>("/api/staff/overview", signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Staff home is unavailable");
  return response.data;
}
