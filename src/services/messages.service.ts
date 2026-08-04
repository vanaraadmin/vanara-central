import { requestJson } from "./api.client";
import type {
  GuestMessageConversationDetail,
  GuestMessageConversationResponse,
  GuestMessageInbox,
  GuestMessageInboxResponse,
} from "../types/messages";

async function sendJson<T>(
  path: string,
  method: "POST" | "PATCH",
  payload?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal,
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response");
  }

  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
      ? data.error
      : "The message review action could not be completed";
    throw new Error(message);
  }

  return data as T;
}

export async function loadGuestMessageInbox(search = "", signal?: AbortSignal): Promise<GuestMessageInbox> {
  const params = new URLSearchParams();
  const query = search.trim();
  if (query) params.set("search", query);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await requestJson<GuestMessageInboxResponse>(`/api/messages/conversations${suffix}`, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Guest messages are unavailable");
  return response.data;
}

export async function loadGuestMessageConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<GuestMessageConversationDetail> {
  const response = await requestJson<GuestMessageConversationResponse>(
    `/api/messages/conversations/${encodeURIComponent(conversationId)}`,
    signal,
  );
  if (!response.success || !response.data) throw new Error(response.error ?? "Conversation is unavailable");
  return response.data;
}

async function unwrapConversation(response: GuestMessageConversationResponse): Promise<GuestMessageConversationDetail> {
  if (!response.success || !response.data) throw new Error(response.error ?? "Conversation is unavailable");
  return response.data;
}

export async function approveGuestMessageDraft(draftId: string): Promise<GuestMessageConversationDetail> {
  return unwrapConversation(await sendJson<GuestMessageConversationResponse>(
    `/api/messages/drafts/${encodeURIComponent(draftId)}/approve`,
    "POST",
    {},
  ));
}

export async function rejectGuestMessageDraft(draftId: string, reason?: string): Promise<GuestMessageConversationDetail> {
  return unwrapConversation(await sendJson<GuestMessageConversationResponse>(
    `/api/messages/drafts/${encodeURIComponent(draftId)}/reject`,
    "POST",
    { reason: reason ?? null },
  ));
}

export async function saveGuestMessageDraft(draftId: string, draftText: string): Promise<GuestMessageConversationDetail> {
  return unwrapConversation(await sendJson<GuestMessageConversationResponse>(
    `/api/messages/drafts/${encodeURIComponent(draftId)}`,
    "PATCH",
    { draftText },
  ));
}
