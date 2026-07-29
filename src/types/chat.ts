export type ChatContextType = "general" | "room" | "maintenance" | "housekeeping" | "movement";
export type ChatLanguage = "en" | "th";

export interface ChatConversation {
  id: string;
  contextType: ChatContextType;
  contextId: string | null;
  title: string;
  subtitle: string | null;
  status: string;
  priority: string | null;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
}

export interface ChatMessage {
  id: number;
  conversationId: string;
  author: {
    id: string;
    displayName: string;
    role: string;
  };
  body: string;
  bodyLanguage: ChatLanguage;
  translatedBody: string | null;
  translatedLanguage: ChatLanguage | null;
  createdAt: string;
}

export interface ChatConversationResponse {
  success: boolean;
  data?: ChatConversation;
  error?: string;
}

export interface ChatConversationsResponse {
  success: boolean;
  data?: ChatConversation[];
  error?: string;
}

export interface ChatMessagesResponse {
  success: boolean;
  data?: ChatMessage[];
  error?: string;
}

export interface CreateChatMessagePayload {
  body: string;
  bodyLanguage: ChatLanguage;
  translatedBody?: string | null;
  translatedLanguage?: ChatLanguage | null;
}
