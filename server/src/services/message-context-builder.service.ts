import { getAvailabilityPrices, mapAccommodationType, type AvailabilityPricesResult } from "./availability-prices.service.js";
import type { AccommodationType, AvailabilityPricesContextStatus, Channel, MessageIntent, Provider, TravelPhase, VerifiedMessageContext } from "../types/messages.js";

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
  provider: Provider;
  booking_id: number | null;
  beds24_booking_id: number | null;
  guest_message: string;
  received_at: string;
  language: string | null;
  channel: Channel;
  booking_status: string | null;
  booking_source: string | null;
  booking_channel: string | null;
  booking_language_code: string | null;
  guest_name: string | null;
  first_name: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  unit_name: string | null;
  unit_type: string | null;
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

function accommodationTypeFrom(row: Pick<MessageContextRow, "unit_type" | "unit_name" | "room_type_name" | "room_name">): AccommodationType | null {
  const unitName = clean(row.unit_name) ?? clean(row.room_name);
  const roomTypeName = clean(row.room_type_name) ?? clean(row.room_name);
  if (!unitName || !roomTypeName) return null;
  return mapAccommodationType(clean(row.unit_type), unitName, roomTypeName);
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

function bangkokRuntime(now: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(now));

  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? "00";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function dateOnlyTime(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) ? time : null;
}

function inferTravelPhase(arrivalDate: string | null, departureDate: string | null, today: string, bookingLinked: boolean): TravelPhase {
  if (!bookingLinked) return "prospective guest";
  const arrival = dateOnlyTime(arrivalDate);
  const departure = dateOnlyTime(departureDate);
  const current = dateOnlyTime(today);
  if (arrival === null || departure === null || current === null) return "booked guest";

  if (current < arrival) {
    const daysUntilArrival = Math.round((arrival - current) / 86_400_000);
    return daysUntilArrival <= 1 ? "arriving soon" : "pre-arrival";
  }
  if (current === arrival) return "arriving soon";
  if (current > arrival && current < departure) return "in-house";
  if (current === departure) return "checking out";
  if (current > departure) return "post-stay";
  return "unknown";
}

function bookingSourceFrom(row: Pick<MessageContextRow, "booking_source" | "booking_channel" | "channel">): string | null {
  return clean(row.booking_source) ?? clean(row.booking_channel) ?? clean(row.channel);
}

function availabilityPricesRelevant(input: MessageContextBuilderInput, currentGuestMessage: string, conversationContext: string): boolean {
  const intent = input.intent?.intent;
  if (intent === "AVAILABILITY" || intent === "STAY_EXTENSION") return true;

  const text = `${currentGuestMessage}\n${conversationContext}`.toLowerCase();
  return [
    /\bavailable\b/,
    /\bavailability\b/,
    /\bprice\b/,
    /\bprices\b/,
    /\brate\b/,
    /\brates\b/,
    /\bcost\b/,
    /\bbook\b/,
    /\breserve\b/,
    /\breservation\b/,
    /\bstay longer\b/,
    /\bextend\b/,
    /\bextension\b/,
    /\bextra night\b/,
    /\banother night\b/,
    /\bmore night\b/,
    /\badd.+night\b/,
    /\bbungalow\b/,
    /\bvilla\b/,
    /\byurt\b/,
    /\btent\b/,
  ].some((pattern) => pattern.test(text));
}

function money(value: number | null): string {
  return value === null ? "price unavailable" : `${Math.round(value).toLocaleString("en-US")} THB`;
}

function formatAvailabilityPrices(result: AvailabilityPricesResult): string {
  if (result.cacheStatus === "UNAVAILABLE" || result.groups.length === 0) {
    return `Beds24 commercial cache has no availability rows for ${result.arrivalDate} to ${result.departureDate}.`;
  }

  const lines = result.groups.map((group) => {
    const units = group.availableUnits.map((unit) => unit.unitName).join(", ") || "none";
    const pricing = group.pricing.status === "AVAILABLE"
      ? `${money(group.pricing.averageNightlyPrice)} average per night, ${money(group.pricing.totalPrice)} stay total`
      : "price unavailable in Beds24 cache";
    return `${group.accommodationType}: ${group.availableCount}/${group.totalUnits} available; ${pricing}; available units: ${units}`;
  });

  return [
    `Beds24 verified commercial cache for ${result.arrivalDate} to ${result.departureDate} (${result.nights} night${result.nights === 1 ? "" : "s"}, THB).`,
    ...lines,
  ].join("\n");
}

async function buildAvailabilityPricesContext(
  env: MessageContextBuilderBindings,
  input: MessageContextBuilderInput,
  row: MessageContextRow,
  conversationContext: string,
): Promise<{ status: AvailabilityPricesContextStatus; text: string }> {
  if (!availabilityPricesRelevant(input, row.guest_message, conversationContext)) {
    return {
      status: "NOT_APPLICABLE",
      text: "Not applicable to the current guest message.",
    };
  }

  const arrivalDate = clean(row.arrival_date);
  const departureDate = clean(row.departure_date);
  if (!arrivalDate || !departureDate) {
    return {
      status: "UNAVAILABLE",
      text: "Availability or prices are relevant, but the linked booking dates are unavailable in Vanara.",
    };
  }

  try {
    const result = await getAvailabilityPrices(env.DB, { arrival: arrivalDate, departure: departureDate });
    return {
      status: result.cacheStatus === "AVAILABLE" ? "USED" : "UNAVAILABLE",
      text: formatAvailabilityPrices(result),
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      text: "Availability or prices are relevant, but the Beds24 commercial cache could not produce a verified result for these dates.",
    };
  }
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
      m.provider,
      m.booking_id,
      m.beds24_booking_id,
      m.guest_message,
      m.received_at,
      m.language,
      m.channel,
      b.status AS booking_status,
      b.api_source AS booking_source,
      b.channel AS booking_channel,
      b.language_code AS booking_language_code,
      b.guest_name,
      b.first_name,
      b.arrival_date,
      b.departure_date,
      u.unit_name,
      u.unit_type,
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

  const conversationContext = historyText(historyRows.results ?? [], row.message_id);
  const availabilityPrices = await buildAvailabilityPricesContext(env, input, row, conversationContext);
  const bangkok = bangkokRuntime(now);
  const context: VerifiedMessageContext = {
    messageId: String(row.message_id),
    conversationId: String(row.message_conversation_id),
    bookingId: row.booking_id,
    beds24BookingId: row.beds24_booking_id,
    guestName: clean(row.guest_name),
    guestFirstName: firstNameFrom(row),
    arrivalDate: clean(row.arrival_date),
    departureDate: clean(row.departure_date),
    bookingStatus: clean(row.booking_status),
    bookingSource: bookingSourceFrom(row),
    accommodationType: accommodationTypeFrom(row),
    physicalUnit: clean(row.unit_name),
    roomSummary: roomSummaryFrom(row),
    language: clean(row.language) ?? clean(row.booking_language_code),
    provider: row.provider,
    channel: row.channel,
    currentBangkokDate: bangkok.date,
    currentBangkokTime: bangkok.time,
    travelPhase: inferTravelPhase(clean(row.arrival_date), clean(row.departure_date), bangkok.date, row.booking_id !== null),
    availabilityPricesStatus: availabilityPrices.status,
    availabilityPricesContext: availabilityPrices.text,
    conversationContext,
    currentGuestMessage: row.guest_message,
    verifiedAt: now,
  };

  return {
    context,
    contextHash: await stableHash(context),
  };
}
