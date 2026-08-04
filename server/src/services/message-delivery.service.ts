import type { DeliveryState, Draft, MessageDelivery } from "../types/messages.js";

export interface MessageDeliveryInput {
  draft: Draft;
  approvedBody: string;
  idempotencyKey: string;
}

export interface MessageDeliveryResult {
  delivery: MessageDelivery;
  state: DeliveryState;
}

export interface MessageDeliveryService {
  // TODO: Sprint 04 will deliver approved replies through Beds24 with retry and idempotency.
  deliverMessage(input: MessageDeliveryInput): Promise<MessageDeliveryResult>;
}
