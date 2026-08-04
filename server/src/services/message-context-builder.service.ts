import type { Message, MessageIntent, VerifiedMessageContext } from "../types/messages.js";

export interface MessageContextBuilderInput {
  message: Message;
  intent: MessageIntent;
}

export interface MessageContextBuilderResult {
  context: VerifiedMessageContext;
  contextHash: string;
}

export interface MessageContextBuilderService {
  // TODO: Sprint 02 will build verified resort context before the Waraporn prompt is used.
  buildContext(input: MessageContextBuilderInput): Promise<MessageContextBuilderResult>;
}
