import { requestJson } from "./api.client";
import type { DashboardData, DashboardResponse } from "../types/dashboard";

export async function loadDashboard(
  signal?: AbortSignal,
): Promise<DashboardData> {
  const response = await requestJson<DashboardResponse>(
    "/api/dashboard",
    signal,
  );

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Dashboard data is unavailable");
  }

  return response.data;
}
