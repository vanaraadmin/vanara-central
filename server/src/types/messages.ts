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

export type MessageAuthor = "GUEST" | "WARAPORN" | "STAFF" | "PROVIDER";

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
  | "GENERATING"
  | "DRAFT_READY"
  | "REVIEW_PENDING"
  | "SENT"
  | "FAILED"
  | "FAILED_MANUAL_RETRY";

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

export type DraftState = "NOT_STARTED" | "GENERATING" | "READY" | "REJECTED" | "APPROVED" | "SENT" | "FAILED";

export type DeliveryState = "NOT_READY" | "READY" | "SENDING" | "SENT" | "FAILED" | "RETRY_PENDING";

export type MessagePromptKey = "waraporn-general-requests-v4-rc3";

export type AccommodationType = "Bungalow" | "Villa" | "Tent" | "Other";

export type TravelPhase =
  | "prospective guest"
  | "booked guest"
  | "pre-arrival"
  | "arriving soon"
  | "in-house"
  | "checking out"
  | "post-stay"
  | "unknown";

export type AvailabilityPricesContextStatus = "USED" | "NOT_APPLICABLE" | "UNAVAILABLE";

export interface Conversation {
  conversationId: string;
  provider: Provider;
  channel: Channel;
  providerConversationId: string;
  bookingId: number | null;
  beds24BookingId: number | null;
  guestName: string | null;
  state: ConversationState;
  lastMessageAt: string | null;
}

export interface Message {
  messageId: string;
  conversationId: string;
  provider: Provider;
  channel: Channel;
  providerMessageId: string;
  direction: MessageDirection;
  author: MessageAuthor;
  body: string;
  state: MessageState;
  receivedAt: string;
  bookingId: number | null;
  beds24BookingId: number | null;
  associationState: MessageAssociationState;
  idempotencyKey: string;
}

export interface ImportedMessage extends Message {
  numericMessageId: number;
  numericConversationId: number;
  providerBookingId: number | null;
  rawProviderPayload: unknown;
  language: string | null;
  draftExists: boolean;
  draftStatus: DraftState;
  draftId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageIntent {
  messageId: string;
  intent: Intent;
  confidence: number | null;
  extractedAt: string | null;
}

export interface Draft {
  draftId: string;
  messageId: string;
  conversationId: string;
  promptKey: MessagePromptKey;
  promptVersion: string;
  promptChecksum: string;
  state: DraftState;
  body: string | null;
  retrievalFilenames: string[];
  retrievalResultCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MessageReview {
  draftId: string;
  state: ReviewState;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  editedBody: string | null;
  rejectionReason: string | null;
}

export interface MessageDelivery {
  draftId: string;
  provider: Provider;
  channel: Channel;
  state: DeliveryState;
  providerDeliveryId: string | null;
  idempotencyKey: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
}

export interface VerifiedMessageContext {
  messageId: string;
  conversationId: string;
  bookingId: number | null;
  beds24BookingId: number | null;
  guestName: string | null;
  guestFirstName: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  bookingStatus: string | null;
  bookingSource: string | null;
  accommodationType: AccommodationType | null;
  physicalUnit: string | null;
  roomSummary: string | null;
  language: string | null;
  provider: Provider;
  channel: Channel;
  currentBangkokDate: string;
  currentBangkokTime: string;
  travelPhase: TravelPhase;
  availabilityPricesStatus: AvailabilityPricesContextStatus;
  availabilityPricesContext: string;
  conversationContext: string;
  currentGuestMessage: string;
  verifiedAt: string;
}
