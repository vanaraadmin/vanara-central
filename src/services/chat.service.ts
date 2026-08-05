import { ApiError, requestJson } from "./api.client";
import type {
  ChatConversation,
  ChatConversationResponse,
  ChatConversationsResponse,
  ChatMessage,
  ChatMessagesResponse,
  ChatUnreadSummary,
  ChatUnreadSummaryResponse,
  ChatUser,
  ChatUsersResponse,
  CreateChatMessagePayload,
  OpenGroupChatPayload,
  OpenPrivateChatPayload,
} from "../types/chat";

async function sendJson<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("The server returned an invalid response", response.status);
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "The request could not be completed";

    throw new ApiError(message, response.status);
  }

  return body as T;
}

export async function loadChatConversations(signal?: AbortSignal): Promise<ChatConversation[]> {
  const response = await requestJson<ChatConversationsResponse>("/api/chat/conversations", signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Chat conversations are unavailable");
  }
  return response.data;
}

export async function loadChatConversation(id: string, signal?: AbortSignal): Promise<ChatConversation> {
  const response = await requestJson<ChatConversationResponse>(`/api/chat/conversations/${id}`, signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Chat conversation is unavailable");
  }
  return response.data;
}

export async function loadChatMessages(id: string, signal?: AbortSignal): Promise<ChatMessage[]> {
  const response = await requestJson<ChatMessagesResponse>(`/api/chat/conversations/${id}/messages`, signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Chat messages are unavailable");
  }
  return response.data;
}

export async function createChatMessage(
  id: string,
  payload: CreateChatMessagePayload,
  signal?: AbortSignal,
): Promise<ChatMessage> {
  const response = await sendJson<{ success: boolean; data?: ChatMessage; error?: string }>(
    `/api/chat/conversations/${id}/messages`,
    payload,
    signal,
  );
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Message could not be created");
  }
  return response.data;
}

export async function loadChatUsers(signal?: AbortSignal): Promise<ChatUser[]> {
  const response = await requestJson<ChatUsersResponse>("/api/chat/users", signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Team members are unavailable");
  }
  return response.data;
}

export async function openPrivateChat(
  payload: OpenPrivateChatPayload,
  signal?: AbortSignal,
): Promise<ChatConversation> {
  const response = await sendJson<ChatConversationResponse>("/api/chat/private", payload, signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Private chat could not be opened");
  }
  return response.data;
}

export async function openGroupChat(
  payload: OpenGroupChatPayload,
  signal?: AbortSignal,
): Promise<ChatConversation> {
  const response = await sendJson<ChatConversationResponse>("/api/chat/groups", payload, signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Group chat could not be created");
  }
  return response.data;
}

export async function markChatConversationRead(id: string, signal?: AbortSignal): Promise<ChatConversation> {
  const response = await sendJson<ChatConversationResponse>(`/api/chat/conversations/${id}/read`, {}, signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Chat conversation could not be marked read");
  }
  return response.data;
}

export async function loadChatUnreadSummary(signal?: AbortSignal): Promise<ChatUnreadSummary> {
  const response = await requestJson<ChatUnreadSummaryResponse>("/api/chat/summary", signal);
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Chat summary is unavailable");
  }
  return response.data;
}
