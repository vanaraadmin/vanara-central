import { requestJson } from "./api.client";
import type { DashboardData, DashboardDateRange, DashboardOverview, DashboardOverviewResponse, DashboardResponse } from "../types/dashboard";

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

export async function loadDashboardOverview(dateRange?: DashboardDateRange | null, signal?: AbortSignal): Promise<DashboardOverview> {
  const params = new URLSearchParams();
  if (dateRange?.fromDate) params.set("fromDate", dateRange.fromDate);
  if (dateRange?.toDate) params.set("toDate", dateRange.toDate);
  const url = params.size > 0 ? `/api/dashboard/overview?${params.toString()}` : "/api/dashboard/overview";
  const response = await requestJson<DashboardOverviewResponse>(url, signal);

  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Dashboard overview is unavailable");
  }

  return response.data;
}
