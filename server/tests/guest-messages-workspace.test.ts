import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import worker from "../src/index.ts";
import {
  getGuestMessageConversation,
  listGuestMessageConversations,
} from "../src/services/guest-messages-workspace.service.ts";

type ConversationRow = {
  message_conversation_id: number;
  provider: string;
  provider_conversation_id: string;
  booking_id: number | null;
  beds24_booking_id: number | null;
  channel: string;
  state: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  message_id: number;
  message_conversation_id: number;
  direction: "INBOUND" | "OUTBOUND";
  author: "GUEST" | "WARAPORN" | "STAFF" | "PROVIDER";
  received_at: string;
  guest_message: string;
  state: string;
};

type DraftRow = {
  message_draft_id: number;
  message_id: number;
  message_conversation_id: number;
  draft_text: string;
  status: "READY" | "FAILED" | "APPROVED";
  failure_code: string | null;
  created_at: string;
};

type BookingRow = {
  booking_id: number;
  beds24_booking_id: number;
  guest_name: string;
  arrival_date: string;
  departure_date: string;
  status: string;
  channel: string | null;
  api_source: string | null;
  unit_id: number | null;
  room_type_id: number;
};

type UnitRow = {
  unit_id: number;
  unit_name: string;
  unit_type: string | null;
};

type RoomTypeRow = {
  room_type_id: number;
  room_type_name: string | null;
  room_name: string | null;
};

const NOW = "2026-08-04T10:00:00.000Z";
const USER_ROW = {
  session_id: "session-guest-messages",
  expires_at: "2099-01-01T00:00:00.000Z",
  user_id: "staff-1",
  full_name: "Nok Staff",
  profile_photo_url: null,
  role: "Operations",
  preferred_language: "en",
  username: "staff",
  email: null,
  password_hash: "not-used",
  status: "active",
  created_at: NOW,
  updated_at: NOW,
  last_login_at: null,
};

class FakeStmt {
  private params: unknown[] = [];

  constructor(private db: FakeGuestMessagesDB, private sql: string) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return Promise.resolve({ meta: { changes: 0, last_row_id: 0 } }); }
}

class FakeGuestMessagesDB {
  authenticated = true;
  views: string[] = ["staff"];
  conversations: ConversationRow[] = [
    conversationRow(1, 1, "DRAFT_READY", "BOOKING_COM", "2026-08-04T10:00:00.000Z"),
    conversationRow(2, 2, "SENT", "AIRBNB", "2026-08-04T11:00:00.000Z"),
    conversationRow(3, 3, "ARCHIVED", "EXPEDIA", "2026-08-03T10:00:00.000Z"),
  ];
  bookings: BookingRow[] = [
    bookingRow(1, 9001, "Daniel Padurariu", "Villa 10", 10, "BOOKING_COM"),
    bookingRow(2, 9002, "Paolo Rossi", "Bungalow 3", 3, "AIRBNB"),
    bookingRow(3, 9003, "Gaetano Scirea", "Tent 1", 1, "EXPEDIA"),
  ];
  units: UnitRow[] = [
    { unit_id: 10, unit_name: "Villa 10", unit_type: "villa" },
    { unit_id: 3, unit_name: "Bungalow 3", unit_type: "bungalow" },
    { unit_id: 1, unit_name: "Tent 1", unit_type: "yurt" },
  ];
  roomTypes: RoomTypeRow[] = [
    { room_type_id: 10, room_type_name: "Villa", room_name: "Villa" },
    { room_type_id: 3, room_type_name: "Bungalow", room_name: "Bungalow" },
    { room_type_id: 1, room_type_name: "Tent", room_name: "Tent" },
  ];
  messages: MessageRow[] = [
    messageRow(1, 1, "INBOUND", "GUEST", "2026-08-04T09:50:00.000Z", "Can we arrange a transfer from Bangkok?", "ASSOCIATED"),
    messageRow(2, 2, "INBOUND", "GUEST", "2026-08-04T10:30:00.000Z", "Thank you for the details.", "SENT"),
    messageRow(3, 2, "OUTBOUND", "WARAPORN", "2026-08-04T11:00:00.000Z", "You are very welcome.", "SENT"),
    messageRow(4, 3, "INBOUND", "GUEST", "2026-08-03T10:00:00.000Z", "Cancelled booking question.", "ASSOCIATED"),
    messageRow(5, 1, "OUTBOUND", "PROVIDER", "2026-08-04T09:55:00.000Z", "Provider event hidden from UI.", "RECEIVED"),
  ];
  drafts: DraftRow[] = [
    draftRow(1, 1, 1, "Yes, we can help with a private transfer.", "READY", "2026-08-04T09:56:00.000Z"),
    draftRow(2, 1, 1, "Failed internal draft.", "FAILED", "2026-08-04T09:57:00.000Z"),
  ];

  constructor(options: { authenticated?: boolean; views?: string[] } = {}) {
    this.authenticated = options.authenticated ?? true;
    this.views = options.views ?? ["staff"];
  }

  prepare(sql: string) { return new FakeStmt(this, sql); }

  private latestMessage(conversationId: number): MessageRow | null {
    return [...this.messages]
      .filter((message) => message.message_conversation_id === conversationId)
      .sort((left, right) => right.received_at.localeCompare(left.received_at) || right.message_id - left.message_id)[0] ?? null;
  }

  private readyDraft(conversationId: number): DraftRow | null {
    return [...this.drafts]
      .filter((draft) => draft.message_conversation_id === conversationId && draft.status === "READY")
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.message_draft_id - left.message_draft_id)[0] ?? null;
  }

  private rowFor(conversation: ConversationRow) {
    const booking = this.bookings.find((item) => item.booking_id === conversation.booking_id) ?? null;
    const unit = this.units.find((item) => item.unit_id === booking?.unit_id) ?? null;
    const roomType = this.roomTypes.find((item) => item.room_type_id === booking?.room_type_id) ?? null;
    const latest = this.latestMessage(conversation.message_conversation_id);
    const ready = this.readyDraft(conversation.message_conversation_id);
    const latestSentAt = this.messages
      .filter((message) => message.message_conversation_id === conversation.message_conversation_id && message.direction === "OUTBOUND" && message.state === "SENT")
      .map((message) => message.received_at)
      .sort()
      .at(-1) ?? "0000-01-01T00:00:00.000Z";
    const unreadCount = this.messages.filter((message) =>
      message.message_conversation_id === conversation.message_conversation_id
      && message.direction === "INBOUND"
      && message.author === "GUEST"
      && message.received_at > latestSentAt
    ).length;

    return {
      message_conversation_id: conversation.message_conversation_id,
      provider: conversation.provider,
      provider_conversation_id: conversation.provider_conversation_id,
      channel: conversation.channel,
      conversation_state: conversation.state,
      last_message_at: conversation.last_message_at,
      booking_id: conversation.booking_id,
      beds24_booking_id: conversation.beds24_booking_id,
      guest_name: booking?.guest_name ?? null,
      arrival_date: booking?.arrival_date ?? null,
      departure_date: booking?.departure_date ?? null,
      booking_status: booking?.status ?? null,
      booking_channel: booking?.channel ?? null,
      booking_source: booking?.api_source ?? null,
      unit_name: unit?.unit_name ?? null,
      unit_type: unit?.unit_type ?? null,
      room_type_name: roomType?.room_type_name ?? null,
      room_name: roomType?.room_name ?? null,
      latest_message_id: latest?.message_id ?? null,
      latest_direction: latest?.direction ?? null,
      latest_author: latest?.author ?? null,
      latest_message: latest?.guest_message ?? null,
      latest_state: latest?.state ?? null,
      latest_received_at: latest?.received_at ?? null,
      ready_draft_id: ready?.message_draft_id ?? null,
      unread_count: unreadCount,
    };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT s.session_id")) return (this.authenticated ? USER_ROW : null) as T | null;
    if (sql.includes("WHERE c.message_conversation_id = ?")) {
      const conversationId = Number(params[0]);
      const conversation = this.conversations.find((item) => item.message_conversation_id === conversationId);
      return (conversation ? this.rowFor(conversation) : null) as T | null;
    }
    return null;
  }

  async all<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT view_key FROM user_views")) {
      return { results: this.views.map((view_key) => ({ view_key })) as T[] };
    }
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) {
      return { results: [] as T[] };
    }
    if (sql.includes("SELECT action_key, allowed FROM user_action_permissions")) {
      return { results: [] as T[] };
    }
    if (sql.includes("FROM message_conversations c") && sql.includes("ORDER BY COALESCE")) {
      const search = params.length > 1 ? String(params[0]).replaceAll("%", "").replaceAll("\\", "").toLowerCase() : "";
      const rows = this.conversations
        .map((conversation) => this.rowFor(conversation))
        .filter((row) => !search || [
          row.guest_name,
          row.unit_name,
          row.room_type_name,
          String(row.beds24_booking_id ?? ""),
          row.provider,
          row.channel,
        ].some((value) => String(value ?? "").toLowerCase().includes(search)))
        .sort((left, right) => String(right.latest_received_at ?? right.last_message_at).localeCompare(String(left.latest_received_at ?? left.last_message_at)));
      return { results: rows as T[] };
    }
    if (sql.includes("FROM messages") && sql.includes("direction = 'INBOUND'")) {
      const conversationId = Number(params[0]);
      return {
        results: this.messages
          .filter((message) => message.message_conversation_id === conversationId)
          .filter((message) => (message.direction === "INBOUND" && message.author === "GUEST") || (message.direction === "OUTBOUND" && message.state === "SENT"))
          .sort((left, right) => left.received_at.localeCompare(right.received_at) || left.message_id - right.message_id) as T[],
      };
    }
    if (sql.includes("FROM message_drafts")) {
      const conversationId = Number(params[0]);
      return {
        results: this.drafts
          .filter((draft) => draft.message_conversation_id === conversationId && (draft.status === "READY" || (draft.status === "APPROVED" && draft.failure_code === "beds24_delivery_failed")))
          .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.message_draft_id - right.message_draft_id) as T[],
      };
    }
    return { results: [] as T[] };
  }
}

function conversationRow(id: number, bookingId: number, state: string, channel: string, lastMessageAt: string): ConversationRow {
  return {
    message_conversation_id: id,
    provider: "BEDS24",
    provider_conversation_id: `beds24-booking:${9000 + id}`,
    booking_id: bookingId,
    beds24_booking_id: 9000 + id,
    channel,
    state,
    last_message_at: lastMessageAt,
    created_at: "2026-08-04T08:00:00.000Z",
    updated_at: lastMessageAt,
  };
}

function bookingRow(id: number, beds24Id: number, guest: string, unitName: string, roomTypeId: number, channel: string): BookingRow {
  return {
    booking_id: id,
    beds24_booking_id: beds24Id,
    guest_name: guest,
    arrival_date: "2026-12-28",
    departure_date: "2027-01-01",
    status: "Confirmed",
    channel,
    api_source: channel,
    unit_id: roomTypeId === 10 ? 10 : roomTypeId === 3 ? 3 : 1,
    room_type_id: roomTypeId,
  };
}

function messageRow(
  id: number,
  conversationId: number,
  direction: MessageRow["direction"],
  author: MessageRow["author"],
  receivedAt: string,
  body: string,
  state: string,
): MessageRow {
  return {
    message_id: id,
    message_conversation_id: conversationId,
    direction,
    author,
    received_at: receivedAt,
    guest_message: body,
    state,
  };
}

function draftRow(
  id: number,
  messageId: number,
  conversationId: number,
  body: string,
  status: DraftRow["status"],
  createdAt: string,
): DraftRow {
  return {
    message_draft_id: id,
    message_id: messageId,
    message_conversation_id: conversationId,
    draft_text: body,
    status,
    failure_code: null,
    created_at: createdAt,
  };
}

function env(db: FakeGuestMessagesDB) {
  return {
    DB: db,
    BEDS24_BASE_URL: "https://api.beds24.com/v2",
    BEDS24_LONG_LIFE_TOKEN: "secret",
    WARAPORN_KB_ARCHIVE: {},
    ASSETS: { fetch },
  };
}

test("guest message conversation list groups and sorts operational inbox rows", async () => {
  const inbox = await listGuestMessageConversations({ DB: new FakeGuestMessagesDB() } as never);

  assert.equal(inbox.groups.needsReply.length, 1);
  assert.equal(inbox.groups.needsReply[0]!.guestName, "Daniel Padurariu");
  assert.equal(inbox.groups.needsReply[0]!.hasReadyDraft, true);
  assert.equal(inbox.groups.needsReply[0]!.unreadCount, 1);
  assert.equal(inbox.groups.waitingGuest.length, 1);
  assert.equal(inbox.groups.closed.length, 1);
  assert.equal(inbox.conversations[0]!.guestName, "Paolo Rossi");
});

test("guest message conversation list searches guest room booking and provider fields", async () => {
  const db = new FakeGuestMessagesDB();

  assert.deepEqual((await listGuestMessageConversations({ DB: db } as never, { search: "Villa 10" })).conversations.map((item) => item.guestName), ["Daniel Padurariu"]);
  assert.deepEqual((await listGuestMessageConversations({ DB: db } as never, { search: "9002" })).conversations.map((item) => item.guestName), ["Paolo Rossi"]);
  assert.deepEqual((await listGuestMessageConversations({ DB: db } as never, { search: "Expedia" })).conversations.map((item) => item.guestName), ["Gaetano Scirea"]);
});

test("guest message conversation detail exposes only guest messages ready drafts and sent replies", async () => {
  const detail = await getGuestMessageConversation({ DB: new FakeGuestMessagesDB() } as never, 1);

  assert.ok(detail);
  assert.equal(detail.conversation.group, "needsReply");
  assert.deepEqual(detail.timeline.map((item) => item.kind), ["guest", "draft"]);
  assert.equal(detail.timeline[1]!.sender, "Waraporn Draft");
  assert.equal(detail.timeline[1]!.status, "READY");
  assert.doesNotMatch(detail.timeline.map((item) => item.message).join("\n"), /Failed internal draft|Provider event/);
});

test("guest message conversation detail keeps failed delivery drafts visible for retry", async () => {
  const db = new FakeGuestMessagesDB();
  db.drafts[0]!.status = "APPROVED";
  db.drafts[0]!.failure_code = "beds24_delivery_failed";

  const detail = await getGuestMessageConversation({ DB: db } as never, 1, {
    ...USER_ROW,
    id: USER_ROW.user_id,
    displayName: USER_ROW.full_name,
    fullName: USER_ROW.full_name,
    role: "Owner",
    view: "owner",
    views: ["owner"],
    permissions: [],
    actionPermissions: [],
  } as never);

  assert.ok(detail);
  assert.equal(detail.timeline[1]!.kind, "draft");
  assert.equal(detail.timeline[1]!.status, "DELIVERY_FAILED");
  assert.equal(detail.timeline[1]!.canReview, true);
});

test("guest message booking context is read-only and complete for linked bookings", async () => {
  const detail = await getGuestMessageConversation({ DB: new FakeGuestMessagesDB() } as never, 1);

  assert.ok(detail);
  assert.deepEqual(detail.bookingContext, {
    guest: "Daniel Padurariu",
    arrival: "2026-12-28",
    departure: "2027-01-01",
    room: "Villa 10",
    travelPhase: "Pre-arrival",
    provider: "BEDS24",
    channel: "Booking.com",
    accommodation: "Villa",
    bookingStatus: "Confirmed",
  });
});

test("guest message endpoints are read-only and require an authenticated staff or owner view", async () => {
  const ok = await worker.fetch(new Request("https://vanara.test/api/messages/conversations", {
    headers: { cookie: "vanara_session=test" },
  }), env(new FakeGuestMessagesDB()) as never);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json() as { success: boolean }).success, true);

  const unauthenticated = await worker.fetch(new Request("https://vanara.test/api/messages/conversations"), env(new FakeGuestMessagesDB({ authenticated: false })) as never);
  assert.equal(unauthenticated.status, 401);

  const forbidden = await worker.fetch(new Request("https://vanara.test/api/messages/conversations", {
    headers: { cookie: "vanara_session=test" },
  }), env(new FakeGuestMessagesDB({ views: [] })) as never);
  assert.equal(forbidden.status, 403);
});

test("guest messages UI uses only the human review draft endpoints and no AI or sync path", () => {
  const page = readFileSync(new URL("../../src/pages/MessagesPage.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../../src/services/messages.service.ts", import.meta.url), "utf8");

  assert.match(page, /Approve & Send/);
  assert.match(page, /Retry Send/);
  assert.match(page, /Save Draft/);
  assert.match(service, /\/api\/messages\/drafts\/\$\{encodeURIComponent\(draftId\)\}\/approve/);
  assert.match(service, /\/api\/messages\/drafts\/\$\{encodeURIComponent\(draftId\)\}\/reject/);
  assert.doesNotMatch(service, /method:\s*["']DELETE["']/);
  assert.doesNotMatch(page + service, /generateWarapornDraft|sync\/messages|OpenAI|Responses|BEDS24_LONG_LIFE_TOKEN|beds24\.com|api\.beds24/i);
  assert.match(service, /\/api\/messages\/conversations/);
});

test("guest messages workspace keeps production UX polish guardrails", () => {
  const page = readFileSync(new URL("../../src/pages/MessagesPage.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../src/styles/messages.css", import.meta.url), "utf8");

  assert.match(page, /return "";/);
  assert.match(page, /enabled: Boolean\(activeConversationId\)/);
  assert.match(page, /function ConversationSelectionEmpty/);
  assert.match(page, /Select a conversation/);
  assert.match(css, /\.messages-selection-empty/);
  assert.match(css, /\.messages-inbox\s*\{[\s\S]*order:\s*1/);
  assert.match(page, /MessagesSkeleton/);
  assert.match(page, /messages-day-separator/);
  assert.match(page, /aria-current/);
  assert.match(page, /No search results\./);
  assert.match(page, /No drafts waiting\./);
  assert.match(page, /No reply required\./);
  assert.match(css, /\.messages-inbox-row:focus-visible/);
  assert.match(css, /\.messages-skeleton__line/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /scrollbar-width:\s*thin/);
});
