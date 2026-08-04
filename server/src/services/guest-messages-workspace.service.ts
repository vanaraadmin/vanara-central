import { getBangkokDate } from "./today.service.js";
import { canReviewGuestMessages } from "./message-review.service.js";
import type { CurrentUser } from "./current-user.service.js";

export interface GuestMessagesWorkspaceBindings {
  DB: D1Database;
}

export type GuestMessageInboxGroup = "needsReply" | "waitingGuest" | "closed";
export type GuestMessageTimelineKind = "guest" | "draft" | "review" | "sent";

interface ConversationListRow {
  message_conversation_id: number;
  provider: string;
  provider_conversation_id: string;
  channel: string | null;
  conversation_state: string;
  last_message_at: string | null;
  booking_id: number | null;
  beds24_booking_id: number | null;
  guest_name: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  booking_status: string | null;
  unit_name: string | null;
  room_type_name: string | null;
  room_name: string | null;
  unit_type: string | null;
  latest_message_id: number | null;
  latest_direction: string | null;
  latest_author: string | null;
  latest_message: string | null;
  latest_state: string | null;
  latest_received_at: string | null;
  ready_draft_id: number | null;
  unread_count: number | null;
}

interface ConversationHeaderRow extends ConversationListRow {
  booking_channel: string | null;
  booking_source: string | null;
}

interface TimelineMessageRow {
  message_id: number;
  direction: string;
  author: string;
  received_at: string;
  guest_message: string;
  state: string;
}

interface TimelineDraftRow {
  message_draft_id: number;
  message_id: number;
  draft_text: string;
  status: "READY" | "REJECTED" | "APPROVED" | "SENT";
  failure_code: string | null;
  original_draft_text: string | null;
  edited_draft_text: string | null;
  edited_by_name: string | null;
  edited_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface GuestMessageInboxItem {
  conversationId: string;
  group: GuestMessageInboxGroup;
  guestName: string;
  provider: string;
  channel: string;
  otaLabel: string;
  room: string;
  bookingId: string | null;
  lastMessagePreview: string;
  lastActivityAt: string | null;
  unreadCount: number;
  hasReadyDraft: boolean;
}

export interface GuestMessageTimelineItem {
  id: string;
  kind: GuestMessageTimelineKind;
  sender: string;
  timestamp: string;
  message: string;
  status?: "READY" | "REJECTED" | "DELIVERY_FAILED" | "SENT";
  draftId?: string;
  canReview?: boolean;
}

export interface GuestMessageBookingContext {
  guest: string;
  arrival: string | null;
  departure: string | null;
  room: string;
  travelPhase: string;
  provider: string;
  channel: string;
  accommodation: string;
  bookingStatus: string;
}

export interface GuestMessageConversationDetail {
  conversation: GuestMessageInboxItem;
  timeline: GuestMessageTimelineItem[];
  bookingContext: GuestMessageBookingContext;
  capabilities: {
    canReviewDrafts: boolean;
  };
}

export interface GuestMessageInbox {
  groups: Record<GuestMessageInboxGroup, GuestMessageInboxItem[]>;
  conversations: GuestMessageInboxItem[];
}

const DEFAULT_LIMIT = 120;
const GROUP_ORDER: GuestMessageInboxGroup[] = ["needsReply", "waitingGuest", "closed"];

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function textOr(value: string | null | undefined, fallback: string): string {
  return clean(value) ?? fallback;
}

function preview(value: string | null | undefined): string {
  const text = textOr(value, "No message yet").replace(/\s+/g, " ");
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

function roomName(row: Pick<ConversationListRow, "unit_name" | "room_type_name" | "room_name">): string {
  return clean(row.unit_name) ?? clean(row.room_type_name) ?? clean(row.room_name) ?? "Room not assigned";
}

function accommodationName(row: Pick<ConversationListRow, "room_type_name" | "room_name" | "unit_type">): string {
  return clean(row.room_type_name) ?? clean(row.room_name) ?? clean(row.unit_type) ?? "Accommodation unavailable";
}

function channelLabel(channel: string | null | undefined): string {
  const value = textOr(channel, "UNKNOWN").toUpperCase();
  switch (value) {
    case "BOOKING_COM":
      return "Booking.com";
    case "AIRBNB":
      return "Airbnb";
    case "AGODA":
      return "Agoda";
    case "TRIP_COM":
      return "Trip.com";
    case "EXPEDIA":
      return "Expedia";
    case "DIRECT":
      return "Direct";
    default:
      return value === "UNKNOWN" ? "OTA" : value.replaceAll("_", " ");
  }
}

function deriveGroup(row: ConversationListRow): GuestMessageInboxGroup {
  if (row.conversation_state === "ARCHIVED") return "closed";
  if (row.latest_direction === "OUTBOUND" && row.latest_state === "SENT") return "waitingGuest";
  if (row.ready_draft_id !== null || row.latest_direction === "INBOUND") return "needsReply";
  if (row.conversation_state === "SENT") return "waitingGuest";
  return "closed";
}

function travelPhase(arrival: string | null, departure: string | null, today = getBangkokDate()): string {
  if (!arrival || !departure) return "Unknown";
  if (today < arrival) return "Pre-arrival";
  if (today === arrival) return "Arriving today";
  if (today > arrival && today < departure) return "In-house";
  if (today === departure) return "Checking out";
  return "Post-stay";
}

function toInboxItem(row: ConversationListRow): GuestMessageInboxItem {
  const group = deriveGroup(row);
  return {
    conversationId: String(row.message_conversation_id),
    group,
    guestName: textOr(row.guest_name, "Guest"),
    provider: textOr(row.provider, "BEDS24"),
    channel: textOr(row.channel, "UNKNOWN"),
    otaLabel: channelLabel(row.channel),
    room: roomName(row),
    bookingId: row.beds24_booking_id !== null ? String(row.beds24_booking_id) : null,
    lastMessagePreview: preview(row.latest_message),
    lastActivityAt: row.latest_received_at ?? row.last_message_at,
    unreadCount: Math.max(Math.trunc(row.unread_count ?? 0), 0),
    hasReadyDraft: row.ready_draft_id !== null,
  };
}

function emptyGroups(): Record<GuestMessageInboxGroup, GuestMessageInboxItem[]> {
  return {
    needsReply: [],
    waitingGuest: [],
    closed: [],
  };
}

function normalizeSearch(value: string | null | undefined): string | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return `%${cleaned.replace(/[%_]/g, "\\$&")}%`;
}

export async function listGuestMessageConversations(
  env: GuestMessagesWorkspaceBindings,
  input: { search?: string | null; limit?: number } = {},
): Promise<GuestMessageInbox> {
  const search = normalizeSearch(input.search);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_LIMIT), 1), 300);
  const filters: string[] = [];
  const params: unknown[] = [];

  if (search) {
    filters.push(`(
      b.guest_name LIKE ? ESCAPE '\\'
      OR u.unit_name LIKE ? ESCAPE '\\'
      OR rt.room_type_name LIKE ? ESCAPE '\\'
      OR CAST(c.beds24_booking_id AS TEXT) LIKE ? ESCAPE '\\'
      OR c.provider LIKE ? ESCAPE '\\'
      OR c.channel LIKE ? ESCAPE '\\'
    )`);
    params.push(search, search, search, search, search, search);
  }

  params.push(limit);

  const rows = await env.DB.prepare(`
    SELECT
      c.message_conversation_id,
      c.provider,
      c.provider_conversation_id,
      c.channel,
      c.state AS conversation_state,
      c.last_message_at,
      c.booking_id,
      c.beds24_booking_id,
      b.guest_name,
      b.arrival_date,
      b.departure_date,
      b.status AS booking_status,
      u.unit_name,
      u.unit_type,
      rt.room_type_name,
      rt.room_name,
      latest.message_id AS latest_message_id,
      latest.direction AS latest_direction,
      latest.author AS latest_author,
      latest.guest_message AS latest_message,
      latest.state AS latest_state,
      latest.received_at AS latest_received_at,
      (
        SELECT d.message_draft_id
        FROM message_drafts d
        WHERE d.message_conversation_id = c.message_conversation_id
          AND d.status = 'READY'
        ORDER BY d.created_at DESC, d.message_draft_id DESC
        LIMIT 1
      ) AS ready_draft_id,
      (
        SELECT COUNT(*)
        FROM messages unread
        WHERE unread.message_conversation_id = c.message_conversation_id
          AND unread.direction = 'INBOUND'
          AND unread.author = 'GUEST'
          AND unread.received_at > COALESCE((
            SELECT MAX(sent.received_at)
            FROM messages sent
            WHERE sent.message_conversation_id = c.message_conversation_id
              AND sent.direction = 'OUTBOUND'
              AND sent.state = 'SENT'
          ), '0000-01-01T00:00:00.000Z')
      ) AS unread_count
    FROM message_conversations c
    LEFT JOIN bookings b
      ON b.booking_id = c.booking_id
    LEFT JOIN units u
      ON u.unit_id = b.unit_id
    LEFT JOIN room_types rt
      ON rt.room_type_id = b.room_type_id
    LEFT JOIN messages latest
      ON latest.message_id = (
        SELECT m.message_id
        FROM messages m
        WHERE m.message_conversation_id = c.message_conversation_id
        ORDER BY m.received_at DESC, m.message_id DESC
        LIMIT 1
      )
    ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY COALESCE(latest.received_at, c.last_message_at, c.updated_at) DESC, c.message_conversation_id DESC
    LIMIT ?
  `).bind(...params).all<ConversationListRow>();

  const conversations = (rows.results ?? []).map(toInboxItem);
  const groups = emptyGroups();
  for (const group of GROUP_ORDER) {
    groups[group] = conversations.filter((conversation) => conversation.group === group);
  }

  return { groups, conversations };
}

async function loadConversationHeader(
  env: GuestMessagesWorkspaceBindings,
  conversationId: number,
): Promise<ConversationHeaderRow | null> {
  return env.DB.prepare(`
    SELECT
      c.message_conversation_id,
      c.provider,
      c.provider_conversation_id,
      c.channel,
      c.state AS conversation_state,
      c.last_message_at,
      c.booking_id,
      c.beds24_booking_id,
      b.guest_name,
      b.arrival_date,
      b.departure_date,
      b.status AS booking_status,
      b.channel AS booking_channel,
      b.api_source AS booking_source,
      u.unit_name,
      u.unit_type,
      rt.room_type_name,
      rt.room_name,
      latest.message_id AS latest_message_id,
      latest.direction AS latest_direction,
      latest.author AS latest_author,
      latest.guest_message AS latest_message,
      latest.state AS latest_state,
      latest.received_at AS latest_received_at,
      (
        SELECT d.message_draft_id
        FROM message_drafts d
        WHERE d.message_conversation_id = c.message_conversation_id
          AND d.status = 'READY'
        ORDER BY d.created_at DESC, d.message_draft_id DESC
        LIMIT 1
      ) AS ready_draft_id,
      (
        SELECT COUNT(*)
        FROM messages unread
        WHERE unread.message_conversation_id = c.message_conversation_id
          AND unread.direction = 'INBOUND'
          AND unread.author = 'GUEST'
      ) AS unread_count
    FROM message_conversations c
    LEFT JOIN bookings b
      ON b.booking_id = c.booking_id
    LEFT JOIN units u
      ON u.unit_id = b.unit_id
    LEFT JOIN room_types rt
      ON rt.room_type_id = b.room_type_id
    LEFT JOIN messages latest
      ON latest.message_id = (
        SELECT m.message_id
        FROM messages m
        WHERE m.message_conversation_id = c.message_conversation_id
        ORDER BY m.received_at DESC, m.message_id DESC
        LIMIT 1
      )
    WHERE c.message_conversation_id = ?
  `).bind(conversationId).first<ConversationHeaderRow>();
}

function toMessageTimelineItem(row: TimelineMessageRow): GuestMessageTimelineItem {
  const isOutbound = row.direction === "OUTBOUND";
  const sender = isOutbound
    ? row.author === "WARAPORN" ? "Waraporn" : "Staff"
    : "Guest";
  return {
    id: `message:${row.message_id}`,
    kind: isOutbound ? "sent" : "guest",
    sender,
    timestamp: row.received_at,
    message: row.guest_message,
    status: isOutbound ? "SENT" : undefined,
  };
}

function toDraftTimelineItems(row: TimelineDraftRow, canReviewDrafts: boolean): GuestMessageTimelineItem[] {
  const isFailedDelivery = row.status === "APPROVED" && row.failure_code === "beds24_delivery_failed";
  const presentationStatus = isFailedDelivery ? "DELIVERY_FAILED" : row.status === "APPROVED" ? "READY" : row.status;
  const items: GuestMessageTimelineItem[] = [{
    id: `draft:${row.message_draft_id}`,
    kind: "draft",
    sender: "Waraporn Draft",
    timestamp: row.created_at,
    message: row.original_draft_text ?? row.draft_text,
    status: presentationStatus,
    draftId: String(row.message_draft_id),
    canReview: canReviewDrafts && (row.status === "READY" || isFailedDelivery),
  }];

  if (row.edited_at) {
    items.push({
      id: `draft:${row.message_draft_id}:edited`,
      kind: "review",
      sender: `Edited by ${textOr(row.edited_by_name, "Staff")}`,
      timestamp: row.edited_at,
      message: row.edited_draft_text ?? row.draft_text,
      status: presentationStatus,
      draftId: String(row.message_draft_id),
    });
  }

  if (row.rejected_at) {
    items.push({
      id: `draft:${row.message_draft_id}:rejected`,
      kind: "review",
      sender: "Draft Rejected",
      timestamp: row.rejected_at,
      message: row.rejection_reason ?? `Rejected by ${textOr(row.rejected_by_name, "Staff")}.`,
      status: "REJECTED",
      draftId: String(row.message_draft_id),
    });
  }

  if (row.approved_at) {
    items.push({
      id: `draft:${row.message_draft_id}:approved`,
      kind: "review",
      sender: "Human Approved",
      timestamp: row.approved_at,
      message: `Approved by ${textOr(row.approved_by_name, "Staff")}.`,
      status: presentationStatus,
      draftId: String(row.message_draft_id),
    });
  }

  return items;
}

function sortTimeline(left: GuestMessageTimelineItem, right: GuestMessageTimelineItem): number {
  const time = left.timestamp.localeCompare(right.timestamp);
  if (time !== 0) return time;
  const rank: Record<GuestMessageTimelineKind, number> = { guest: 1, draft: 2, review: 3, sent: 4 };
  return rank[left.kind] - rank[right.kind];
}

export async function getGuestMessageConversation(
  env: GuestMessagesWorkspaceBindings,
  conversationId: number,
  user?: CurrentUser | null,
): Promise<GuestMessageConversationDetail | null> {
  const header = await loadConversationHeader(env, conversationId);
  if (!header) return null;
  const canReviewDrafts = user ? canReviewGuestMessages(user) : false;

  const [messages, drafts] = await Promise.all([
    env.DB.prepare(`
      SELECT message_id, direction, author, received_at, guest_message, state
      FROM messages
      WHERE message_conversation_id = ?
        AND (
          (direction = 'INBOUND' AND author = 'GUEST')
          OR (direction = 'OUTBOUND' AND state = 'SENT')
        )
      ORDER BY received_at ASC, message_id ASC
    `).bind(conversationId).all<TimelineMessageRow>(),
    env.DB.prepare(`
      SELECT
        message_draft_id,
        message_id,
        draft_text,
        status,
        failure_code,
        original_draft_text,
        edited_draft_text,
        edited_by_name,
        edited_at,
        approved_by_name,
        approved_at,
        rejected_by_name,
        rejected_at,
        rejection_reason,
        sent_at,
        created_at
      FROM message_drafts
      WHERE message_conversation_id = ?
        AND (
          status IN ('READY', 'REJECTED', 'SENT')
          OR (status = 'APPROVED' AND failure_code = 'beds24_delivery_failed')
        )
      ORDER BY created_at ASC, message_draft_id ASC
    `).bind(conversationId).all<TimelineDraftRow>(),
  ]);

  const timeline = [
    ...(messages.results ?? []).map(toMessageTimelineItem),
    ...(drafts.results ?? []).flatMap((draft) => toDraftTimelineItems(draft, canReviewDrafts)),
  ].sort(sortTimeline);

  return {
    conversation: toInboxItem(header),
    timeline,
    bookingContext: {
      guest: textOr(header.guest_name, "Guest"),
      arrival: header.arrival_date,
      departure: header.departure_date,
      room: roomName(header),
      travelPhase: travelPhase(header.arrival_date, header.departure_date),
      provider: textOr(header.provider, "BEDS24"),
      channel: channelLabel(header.booking_channel ?? header.channel),
      accommodation: accommodationName(header),
      bookingStatus: textOr(header.booking_status, "Unknown"),
    },
    capabilities: {
      canReviewDrafts,
    },
  };
}
