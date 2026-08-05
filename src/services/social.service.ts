import { ApiError, requestJson } from "./api.client";
import type { SocialAutomationOverview, SocialAutomationOverviewResponse, SocialPostQueueItem, SocialPostQueueItemResponse } from "../types/social";

export async function loadSocialAutomationOverview(signal?: AbortSignal): Promise<SocialAutomationOverview> {
  const response = await requestJson<SocialAutomationOverviewResponse>("/api/social/overview", signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Social Automation is unavailable");
  }
  return response.data;
}

export async function uploadSocialPhoto(file: File, signal?: AbortSignal): Promise<SocialPostQueueItem> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch("/api/social/posts", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    body: formData,
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
      : "Photo could not be queued";
    throw new ApiError(message, response.status);
  }

  const parsed = body as SocialPostQueueItemResponse;
  if (!parsed.success || !parsed.data) {
    throw new Error(parsed.error ?? "Photo could not be queued");
  }
  return parsed.data;
}
