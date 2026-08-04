import type {
  Channel,
  ConversationState,
  DeliveryState,
  DraftState,
  Intent,
  MessageState,
  Provider,
  ReviewState,
} from "../types/messages.js";

export const MESSAGE_PROVIDERS = ["BEDS24"] as const satisfies readonly Provider[];

export const MESSAGE_CHANNELS = [
  "AIRBNB",
  "AGODA",
  "BOOKING_COM",
  "DIRECT",
  "EXPEDIA",
  "VRBO",
  "UNKNOWN",
] as const satisfies readonly Channel[];

export const MESSAGE_INTENTS = [
  "AVAILABILITY",
  "STAY_EXTENSION",
  "CHECK_IN",
  "CHECK_OUT",
  "TRANSPORT",
  "AMENITIES",
  "PAYMENT",
  "POLICY",
  "LOCAL_RECOMMENDATION",
  "GENERAL",
  "UNKNOWN",
] as const satisfies readonly Intent[];

export const CONVERSATION_STATES = [
  "NEW",
  "OPEN",
  "DRAFT_READY",
  "IN_REVIEW",
  "SENT",
  "ARCHIVED",
] as const satisfies readonly ConversationState[];

export const MESSAGE_STATES = [
  "RECEIVED",
  "DEDUPED",
  "ASSOCIATED",
  "UNLINKED",
  "DRAFT_PENDING",
  "GENERATING",
  "DRAFT_READY",
  "REVIEW_PENDING",
  "SENT",
  "FAILED",
  "FAILED_MANUAL_RETRY",
] as const satisfies readonly MessageState[];

export const DRAFT_STATES = [
  "NOT_STARTED",
  "GENERATING",
  "READY",
  "REJECTED",
  "APPROVED",
  "FAILED",
] as const satisfies readonly DraftState[];

export const REVIEW_STATES = [
  "NOT_REQUIRED",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EDITED",
] as const satisfies readonly ReviewState[];

export const DELIVERY_STATES = [
  "NOT_READY",
  "READY",
  "SENDING",
  "SENT",
  "FAILED",
  "RETRY_PENDING",
] as const satisfies readonly DeliveryState[];

export const DEFAULT_MESSAGE_PROVIDER: Provider = "BEDS24";
export const DEFAULT_MESSAGE_CHANNEL: Channel = "UNKNOWN";
