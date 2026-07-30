import { ApiError, requestJson } from "./api.client";
import type { ApiResponse, CurrentUserView, LoginPayload, ManagedUser, SaveUserPayload } from "../types/auth";

async function sendJson<T>(path: string, method: "POST" | "PATCH", payload?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal,
  });
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new ApiError("The server returned an invalid response", response.status); }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : "The request could not be completed";
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export async function loadCurrentUser(signal?: AbortSignal): Promise<CurrentUserView> {
  const response = await requestJson<ApiResponse<CurrentUserView>>("/api/current-user", signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Current user is unavailable");
  return response.data;
}

export async function login(payload: LoginPayload, signal?: AbortSignal): Promise<CurrentUserView> {
  const response = await sendJson<ApiResponse<CurrentUserView>>("/api/auth/login", "POST", payload, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Login failed");
  return response.data;
}

export async function logout(signal?: AbortSignal): Promise<void> {
  await sendJson<ApiResponse<null>>("/api/auth/logout", "POST", undefined, signal);
}

export async function listUsers(signal?: AbortSignal): Promise<ManagedUser[]> {
  const response = await requestJson<ApiResponse<ManagedUser[]>>("/api/users", signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Users are unavailable");
  return response.data;
}

export async function createUser(payload: SaveUserPayload, signal?: AbortSignal): Promise<ManagedUser> {
  const response = await sendJson<ApiResponse<ManagedUser>>("/api/users", "POST", payload, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "User could not be created");
  return response.data;
}

export async function updateUser(id: string, payload: Partial<SaveUserPayload>, signal?: AbortSignal): Promise<ManagedUser> {
  const response = await sendJson<ApiResponse<ManagedUser>>(`/api/users/${encodeURIComponent(id)}`, "PATCH", payload, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "User could not be updated");
  return response.data;
}

export async function disableUser(id: string, signal?: AbortSignal): Promise<ManagedUser> {
  const response = await sendJson<ApiResponse<ManagedUser>>(`/api/users/${encodeURIComponent(id)}/disable`, "POST", undefined, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "User could not be disabled");
  return response.data;
}
