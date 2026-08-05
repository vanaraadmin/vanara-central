export type ChatContextType = "general" | "room" | "maintenance" | "housekeeping" | "movement";
export type ChatConversationKind = "GROUP" | "PRIVATE";
export type ChatLanguage = "en" | "th";
export type ChatMessageKind = "TEXT" | "STICKER" | "ATTACHMENT";

export interface ChatConversation {
  id: string;
  kind: ChatConversationKind;
  isMainGroup: boolean;
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
  lastMessagePreview: string;
  lastMessageAuthorId: string | null;
  messageCount: number;
  unreadCount: number;
  mentionCount: number;
  avatarLabel: string;
  avatarPhotoUrl: string | null;
  announcement: ChatAnnouncement | null;
}

export interface ChatAnnouncement {
  messageId: number;
  authorDisplayName: string;
  bodyPreview: string;
  announcedByUserId: string | null;
  announcedAt: string;
}

export type ChatReactionEmoji = "👍" | "😂" | "😍" | "🙏" | "👀" | "🔥";

export interface ChatMessageReaction {
  emoji: ChatReactionEmoji;
  count: number;
  reactedByMe: boolean;
}

export interface ChatMessageReply {
  messageId: number;
  authorDisplayName: string;
  bodyPreview: string;
}

export interface ChatMessage {
  id: number;
  conversationId: string;
  messageKind: ChatMessageKind;
  author: {
    id: string;
    displayName: string;
    role: string;
    profilePhotoUrl: string | null;
  };
  body: string;
  bodyLanguage: ChatLanguage;
  translatedBody: string | null;
  translatedLanguage: ChatLanguage | null;
  stickerId: string | null;
  attachment: ChatAttachment | null;
  replyTo: ChatMessageReply | null;
  reactions: ChatMessageReaction[];
  mentionUsernames: string[];
  createdAt: string;
}

export interface ChatAttachment {
  fileName: string;
  contentType: string;
  byteSize: number;
  expiresAt: string;
  unavailableAt: string | null;
  downloadUrl: string;
  isImage: boolean;
}

export interface ChatUser {
  id: string;
  displayName: string;
  username: string;
  role: string;
  profilePhotoUrl: string | null;
}

export interface ChatUnreadSummary {
  unreadCount: number;
  mentionCount: number;
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

export interface ChatUsersResponse {
  success: boolean;
  data?: ChatUser[];
  error?: string;
}

export interface ChatUnreadSummaryResponse {
  success: boolean;
  data?: ChatUnreadSummary;
  error?: string;
}

export interface CreateChatMessagePayload {
  messageKind?: ChatMessageKind;
  body: string;
  bodyLanguage: ChatLanguage;
  translatedBody?: string | null;
  translatedLanguage?: ChatLanguage | null;
  replyToMessageId?: number | null;
  stickerId?: string | null;
}

export interface OpenPrivateChatPayload {
  userId: string;
}

export interface OpenGroupChatPayload {
  title: string;
  participantIds: string[];
}

export interface ChatReactionPayload {
  emoji: ChatReactionEmoji;
}

export interface ChatAnnouncementPayload {
  messageId: number;
}
