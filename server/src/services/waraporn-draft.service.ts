import type { Draft, Message, MessageIntent, VerifiedMessageContext } from "../types/messages.js";

export interface WarapornDraftInput {
  message: Message;
  intent: MessageIntent;
  context: VerifiedMessageContext;
}

export interface WarapornDraftService {
  // TODO: Sprint 02 will call the AI composer using the frozen prompt asset.
  createDraft(input: WarapornDraftInput): Promise<Draft>;
}
