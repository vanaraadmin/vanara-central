import { requestJson } from "./api.client";
import type {
  GuestMessageConversationDetail,
  GuestMessageConversationResponse,
  GuestMessageInbox,
  GuestMessageInboxResponse,
} from "../types/messages";

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
