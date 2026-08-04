import type { Channel, DeliveryState, Intent, Provider, ReviewState } from "../types/messages";

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

export const MESSAGE_REVIEW_STATES = [
  "NOT_REQUIRED",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EDITED",
] as const satisfies readonly ReviewState[];

export const MESSAGE_DELIVERY_STATES = [
  "NOT_READY",
  "READY",
  "SENDING",
  "SENT",
  "FAILED",
  "RETRY_PENDING",
] as const satisfies readonly DeliveryState[];
