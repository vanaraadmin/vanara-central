import type { Conversation, Message } from "../types/messages.js";

export interface MessageAssociationInput {
  message: Message;
  candidateBeds24BookingIds: number[];
}

export interface MessageAssociationResult {
  messageId: string;
  bookingId: number | null;
  beds24BookingId: number | null;
  conversation: Conversation | null;
  confidence: number | null;
}

export interface MessageAssociationService {
  // TODO: Sprint 01 will associate provider messages with the authoritative booking records.
  associateMessage(input: MessageAssociationInput): Promise<MessageAssociationResult>;
}
