export type Provider = "BEDS24";

export type Channel =
  | "AIRBNB"
  | "AGODA"
  | "BOOKING_COM"
  | "DIRECT"
  | "EXPEDIA"
  | "VRBO"
  | "UNKNOWN";

export type MessageDirection = "INBOUND" | "OUTBOUND";

export type ConversationState =
  | "NEW"
  | "OPEN"
  | "DRAFT_READY"
  | "IN_REVIEW"
  | "SENT"
  | "ARCHIVED";

export type MessageState =
  | "RECEIVED"
  | "DEDUPED"
  | "ASSOCIATED"
  | "UNLINKED"
  | "DRAFT_PENDING"
  | "DRAFT_READY"
  | "REVIEW_PENDING"
  | "SENT"
  | "FAILED";

export type MessageAssociationState = "LINKED" | "UNLINKED";

export type Intent =
  | "AVAILABILITY"
  | "STAY_EXTENSION"
  | "CHECK_IN"
  | "CHECK_OUT"
  | "TRANSPORT"
  | "AMENITIES"
  | "PAYMENT"
  | "POLICY"
  | "LOCAL_RECOMMENDATION"
  | "GENERAL"
  | "UNKNOWN";

export type ReviewState = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "EDITED";

export type DeliveryState = "NOT_READY" | "READY" | "SENDING" | "SENT" | "FAILED" | "RETRY_PENDING";

export interface Conversation {
  conversationId: string;
  provider: Provider;
  channel: Channel;
  bookingId: number | null;
  beds24BookingId: number | null;
  guestName: string | null;
  state: ConversationState;
  lastMessageAt: string | null;
}

export interface Message {
  messageId: string;
  conversationId: string;
  direction: MessageDirection;
  body: string;
  state: MessageState;
  receivedAt: string;
  associationState: MessageAssociationState;
  draftExists?: boolean;
  draftStatus?: "NOT_STARTED" | "GENERATING" | "READY" | "REJECTED" | "APPROVED" | "FAILED";
  draftId?: string | null;
}

export interface Draft {
  draftId: string;
  messageId: string;
  state: "NOT_STARTED" | "GENERATING" | "READY" | "REJECTED" | "APPROVED" | "FAILED";
  body: string | null;
}

export interface MessageReview {
  draftId: string;
  state: ReviewState;
  editedBody: string | null;
  rejectionReason: string | null;
}

export interface MessageDelivery {
  draftId: string;
  state: DeliveryState;
  sentAt: string | null;
}
