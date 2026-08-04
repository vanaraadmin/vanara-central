import type { Message, Provider } from "../types/messages.js";

export interface MessagesSyncBindings {
  DB: D1Database;
}

export interface SyncMessagesOptions {
  provider?: Provider;
  cursor?: string | null;
  limit?: number;
}

export interface SyncMessagesResult {
  provider: Provider;
  cursor: string | null;
  importedMessages: Message[];
  deduplicatedCount: number;
  associatedCount: number;
}

export interface MessagesSyncService {
  // TODO: Sprint 01 will poll Beds24, deduplicate messages and persist D1 records.
  syncMessages(bindings: MessagesSyncBindings, options: SyncMessagesOptions): Promise<SyncMessagesResult>;
}
