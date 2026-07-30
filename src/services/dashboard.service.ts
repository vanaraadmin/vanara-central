import { requestJson } from "./api.client";
import type { DashboardData, DashboardOverview, DashboardOverviewResponse, DashboardResponse } from "../types/dashboard";

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

export async function loadDashboardOverview(signal?: AbortSignal): Promise<DashboardOverview> {
  const response = await requestJson<DashboardOverviewResponse>("/api/dashboard/overview", signal);

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Dashboard overview is unavailable");
  }

  return response.data;
}
