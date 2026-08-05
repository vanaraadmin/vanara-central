import { ApiError, requestJson } from "./api.client";
import type { PrepareSocialCaptionResponse, PrepareSocialCaptionResult, PrepareSocialImageResponse, PrepareSocialImageResult, SocialAutomationOverview, SocialAutomationOverviewResponse, SocialPostQueueItem, SocialPostQueueItemResponse } from "../types/social";

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

export async function prepareSocialImage(postId: number, signal?: AbortSignal): Promise<PrepareSocialImageResult> {
  const response = await fetch(`/api/social/posts/${postId}/prepare-image`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json" },
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
      : "Image could not be prepared";
    throw new ApiError(message, response.status);
  }

  const parsed = body as PrepareSocialImageResponse;
  if (!parsed.success || !parsed.data) {
    throw new Error(parsed.error ?? "Image could not be prepared");
  }
  return parsed.data;
}

export async function prepareSocialCaption(postId: number, signal?: AbortSignal): Promise<PrepareSocialCaptionResult> {
  const response = await fetch(`/api/social/posts/${postId}/prepare-caption`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json" },
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
      : "Caption could not be prepared";
    throw new ApiError(message, response.status);
  }

  const parsed = body as PrepareSocialCaptionResponse;
  if (!parsed.success || !parsed.data) {
    throw new Error(parsed.error ?? "Caption could not be prepared");
  }
  return parsed.data;
}
