import type { Channel, MessageIntent, VerifiedMessageContext } from "../types/messages.js";

export interface MessageContextBuilderBindings {
  DB: D1Database;
}

export interface MessageContextBuilderInput {
  messageId: number;
  intent?: MessageIntent | null;
  now?: string;
}

export interface MessageContextBuilderResult {
  context: VerifiedMessageContext;
  contextHash: string;
}

interface MessageContextRow {
  message_id: number;
  message_conversation_id: number;
  booking_id: number | null;
  beds24_booking_id: number | null;
  guest_message: string;
  received_at: string;
  language: string | null;
  channel: Channel;
  guest_name: string | null;
  first_name: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  unit_name: string | null;
  room_type_name: string | null;
  room_name: string | null;
}

interface ConversationHistoryRow {
  message_id: number;
  received_at: string;
  guest_message: string;
  draft_text: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function firstNameFrom(row: Pick<MessageContextRow, "first_name" | "guest_name">): string | null {
  const explicit = clean(row.first_name);
  if (explicit) return explicit;
  const name = clean(row.guest_name);
  if (!name) return null;
  return name.split(/\s+/)[0] ?? null;
}

function roomSummaryFrom(row: Pick<MessageContextRow, "unit_name" | "room_type_name" | "room_name">): string | null {
  return clean(row.unit_name) ?? clean(row.room_type_name) ?? clean(row.room_name);
}

function historyText(rows: ConversationHistoryRow[], currentMessageId: number): string {
  const previous = rows.filter((row) => row.message_id !== currentMessageId);
  if (previous.length === 0) return "No previous conversation history stored in Vanara.";

  return previous.map((row) => {
    const parts = [`${row.received_at} | Guest: ${row.guest_message}`];
    if (clean(row.draft_text)) parts.push(`Waraporn draft: ${row.draft_text}`);
    return parts.join(" | ");
  }).join("\n---\n");
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function stableHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return bytesToHex(digest);
}

export async function buildMessageContext(
  env: MessageContextBuilderBindings,
  input: MessageContextBuilderInput,
): Promise<MessageContextBuilderResult | null> {
  const now = input.now ?? new Date().toISOString();
  const row = await env.DB.prepare(`
    SELECT
      m.message_id,
      m.message_conversation_id,
      m.booking_id,
      m.beds24_booking_id,
      m.guest_message,
      m.received_at,
      m.language,
      m.channel,
      b.guest_name,
      b.first_name,
      b.arrival_date,
      b.departure_date,
      u.unit_name,
      rt.room_type_name,
      rt.room_name
    FROM messages m
    LEFT JOIN bookings b
      ON b.booking_id = m.booking_id
    LEFT JOIN units u
      ON u.unit_id = b.unit_id
    LEFT JOIN room_types rt
      ON rt.room_type_id = b.room_type_id
    WHERE m.message_id = ?
  `).bind(input.messageId).first<MessageContextRow>();

  if (!row) return null;

  const historyRows = await env.DB.prepare(`
    SELECT
      m.message_id,
      m.received_at,
      m.guest_message,
      d.draft_text
    FROM messages m
    LEFT JOIN message_drafts d
      ON d.message_id = m.message_id
      AND d.status = 'READY'
    WHERE m.message_conversation_id = ?
      AND (m.received_at < ? OR (m.received_at = ? AND m.message_id <= ?))
    ORDER BY m.received_at ASC, m.message_id ASC
    LIMIT 25
  `).bind(row.message_conversation_id, row.received_at, row.received_at, row.message_id).all<ConversationHistoryRow>();

  const context: VerifiedMessageContext = {
    messageId: String(row.message_id),
    conversationId: String(row.message_conversation_id),
    bookingId: row.booking_id,
    beds24BookingId: row.beds24_booking_id,
    guestName: clean(row.guest_name),
    guestFirstName: firstNameFrom(row),
    arrivalDate: clean(row.arrival_date),
    departureDate: clean(row.departure_date),
    roomSummary: roomSummaryFrom(row),
    language: clean(row.language),
    channel: row.channel,
    conversationContext: historyText(historyRows.results ?? [], row.message_id),
    currentGuestMessage: row.guest_message,
    verifiedAt: now,
  };

  return {
    context,
    contextHash: await stableHash(context),
  };
}
