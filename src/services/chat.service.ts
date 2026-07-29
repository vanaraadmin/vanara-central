import { ApiError, requestJson } from "./api.client";
import type {
  ChatConversation,
  ChatConversationResponse,
  ChatConversationsResponse,
  ChatMessage,
  ChatMessagesResponse,
  CreateChatMessagePayload,
} from "../types/chat";

async function sendJson<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
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
