import { requestJson } from "./api.client";
import type { ApiResponse } from "../types/auth";
import type { WarapornKbBackupsResponse } from "../types/waraporn-kb";

export async function listWarapornKbBackups(signal?: AbortSignal): Promise<WarapornKbBackupsResponse> {
  const response = await requestJson<ApiResponse<WarapornKbBackupsResponse>>("/api/management/waraporn-kb-backups", signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Waraporn KB backups are unavailable");
  return response.data;
}

