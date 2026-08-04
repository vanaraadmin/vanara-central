import { beds24PostAbsolute, type Beds24Bindings, type Beds24RequestOptions } from "./beds24-client.service.js";
import type { DeliveryState, Draft, MessageDelivery } from "../types/messages.js";

export interface MessageDeliveryBindings extends Beds24Bindings {
  DB: D1Database;
}

export interface MessageDeliveryInput {
  draft: Draft;
  beds24BookingId: number;
  approvedBody: string;
  idempotencyKey: string;
}

export interface MessageDeliveryOptions {
  requestOptions?: Beds24RequestOptions;
}

export interface MessageDeliveryResult {
  delivery: MessageDelivery;
  state: DeliveryState;
  beds24MessageId: string | null;
  providerResponseId: string | null;
  rawProviderResponse: unknown;
}

export interface MessageDeliveryService {
  deliverMessage(input: MessageDeliveryInput, options?: MessageDeliveryOptions): Promise<MessageDeliveryResult>;
}

const BEDS24_MESSAGES_ENDPOINT = "https://beds24.com/api/v2/bookings/messages";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function findIdentifier(payload: unknown, keys: readonly string[], depth = 0): string | null {
  if (depth > 4) return null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findIdentifier(item, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(payload)) return null;

  for (const key of keys) {
    const found = identifier(payload[key]);
    if (found) return found;
  }
  for (const child of Object.values(payload)) {
    const found = findIdentifier(child, keys, depth + 1);
    if (found) return found;
  }
  return null;
}

export async function deliverMessageToBeds24(
  env: MessageDeliveryBindings,
  input: MessageDeliveryInput,
  options: MessageDeliveryOptions = {},
): Promise<MessageDeliveryResult> {
  const body = [{
    bookingId: input.beds24BookingId,
    message: input.approvedBody,
  }];
  const payload = await beds24PostAbsolute<unknown>(
    env,
    BEDS24_MESSAGES_ENDPOINT,
    body,
    { maxRetries: 0, pauseAfterMs: 0, ...options.requestOptions },
  );
  const beds24MessageId = findIdentifier(payload, ["messageId", "message_id", "id"]);
  const providerResponseId = findIdentifier(payload, ["requestId", "responseId", "response_id"]);

  return {
    delivery: {
      draftId: input.draft.draftId,
      provider: "BEDS24",
      channel: "UNKNOWN",
      state: "SENT",
      providerDeliveryId: beds24MessageId,
      idempotencyKey: input.idempotencyKey,
      attemptCount: 1,
      lastAttemptAt: null,
      sentAt: null,
    },
    state: "SENT",
    beds24MessageId,
    providerResponseId,
    rawProviderResponse: payload,
  };
}
