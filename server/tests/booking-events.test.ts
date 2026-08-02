import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOKING_PULSE_RESORT_TIME_ZONE,
  bookingEventSignature,
  bookingEventType,
  isBookingPulseEventVisible,
  listRecentBookingEvents,
  recordBookingEvent,
  type BookingEventSnapshot,
} from "../src/services/booking-events.service.ts";

const baseSnapshot: BookingEventSnapshot = {
  bookingId: 1,
  beds24BookingId: 9001,
  status: "Confirmed",
  arrivalDate: "2026-08-01",
  departureDate: "2026-08-03",
  roomTypeId: 10,
  unitId: 1001,
  accommodation: "Villa 10",
  guestName: "Mali Guest",
  adults: 2,
  children: 0,
  source: "Booking.com",
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeBookingEventsDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

type FakeBookingEventRow = {
  booking_event_id: number;
  event_type: "new" | "updated" | "cancelled";
  beds24_booking_id: number;
  event_accommodation: string;
  event_source: string | null;
  occurred_at: string;
  guest_name: string | null;
  country: string | null;
  country_code: string | null;
  unit_id: number | null;
  unit_name: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  booking_status: string | null;
  adults: number | null;
  children: number | null;
  api_source: string | null;
  channel: string | null;
};

function eventRow(overrides: Partial<FakeBookingEventRow>): FakeBookingEventRow {
  return {
    booking_event_id: 1,
    event_type: "new",
    beds24_booking_id: 9001,
    event_accommodation: "Villa 10",
    event_source: "Booking.com",
    occurred_at: "2026-08-02T10:00:00.000Z",
    guest_name: "Mali Guest",
    country: "Thailand",
    country_code: "TH",
    unit_id: 10,
    unit_name: "Villa 10",
    arrival_date: "2026-08-04",
    departure_date: "2026-08-06",
    booking_status: "Confirmed",
    adults: 2,
    children: 0,
    api_source: "Beds24",
    channel: "Direct",
    ...overrides,
  };
}

class FakeBookingEventsDB {
  rows: FakeBookingEventRow[] = [
    eventRow({
      booking_event_id: 3,
      event_type: "cancelled",
      beds24_booking_id: 9003,
      event_accommodation: "Bungalow 6",
      event_source: "Booking.com",
      guest_name: "Cancelled Guest",
      unit_id: 6,
      unit_name: "Bungalow 6",
      occurred_at: "2026-07-31T10:20:00.000Z",
    }),
    eventRow({
      booking_event_id: 2,
      event_type: "updated",
      beds24_booking_id: 9002,
      event_accommodation: "Villa 12",
      event_source: "Agoda",
      guest_name: "Updated Guest",
      unit_id: 12,
      unit_name: "Villa 12",
      occurred_at: "2026-07-31T10:10:00.000Z",
    }),
    eventRow({
      booking_event_id: 1,
      event_type: "new",
      beds24_booking_id: 9001,
      event_accommodation: "Villa 10",
      event_source: "Booking.com",
      occurred_at: "2026-07-31T10:00:00.000Z",
    }),
  ];
  inserted: unknown[][] = [];
  deleteStatements = 0;

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async all<T>(_sql: string, params: unknown[]) {
    return {
      results: this.rows
        .slice()
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.booking_event_id - a.booking_event_id)
        .slice(0, Number(params[0]))
        .map((row) => row as T),
    };
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT OR IGNORE INTO booking_events")) {
      this.inserted.push(params);
    }
    if (sql.includes("DELETE")) this.deleteStatements += 1;
    return { meta: { changes: 1, last_row_id: this.inserted.length } };
  }
}

test("booking event classification follows sync state transitions", () => {
  assert.equal(bookingEventType(null, baseSnapshot), "new");
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, departureDate: "2026-08-04" }), "updated");
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, status: "Cancelled" }), "cancelled");
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, status: "Confirmed" }), null);
  assert.equal(bookingEventType({ ...baseSnapshot, status: "Cancelled" }, { ...baseSnapshot, status: "Cancelled" }), null);
});

test("booking event signature prevents duplicate replay inserts", () => {
  const first = bookingEventSignature("updated", { ...baseSnapshot, departureDate: "2026-08-04" });
  const replay = bookingEventSignature("updated", { ...baseSnapshot, departureDate: "2026-08-04" });
  const changed = bookingEventSignature("updated", { ...baseSnapshot, departureDate: "2026-08-05" });

  assert.equal(first, replay);
  assert.notEqual(first, changed);
});

test("booking event persistence appends the sync-generated event envelope", async () => {
  const db = new FakeBookingEventsDB();
  await recordBookingEvent(
    { DB: db as unknown as D1Database },
    baseSnapshot,
    { ...baseSnapshot, guestName: "Mali Updated" },
    "2026-07-31T10:30:00.000Z",
  );

  assert.equal(db.inserted.length, 1);
  assert.equal(db.inserted[0]?.[0], "updated");
  assert.equal(db.inserted[0]?.[1], baseSnapshot.bookingId);
  assert.equal(db.inserted[0]?.[3], "Villa 10");
});

test("booking pulse read model returns NEW UPDATED and CANCELLED events", async () => {
  const db = new FakeBookingEventsDB();
  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 3, new Date("2026-07-31T11:00:00.000Z"));

  assert.deepEqual(events.map((event) => event.eventType), ["CANCELLED", "UPDATED", "NEW"]);
  assert.deepEqual(events.map((event) => event.guestName), ["Cancelled Guest", "Updated Guest", "Mali Guest"]);
});

test("recent booking event query returns newest first with a maximum limit", async () => {
  const db = new FakeBookingEventsDB();
  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 2, new Date("2026-07-31T11:00:00.000Z"));

  assert.deepEqual(events.map((event) => event.eventType), ["CANCELLED", "UPDATED"]);
  assert.deepEqual(events.map((event) => event.unitName), ["Bungalow 6", "Villa 12"]);
  assert.equal(events[0]?.eventId, "9003:CANCELLED:2026-07-31T10:20:00.000Z");
  assert.equal(events[0]?.bookingId, "9003");
});

test("booking pulse visibility uses the 24 hour boundary safely", async () => {
  const now = new Date("2026-08-02T12:00:00.000Z");
  assert.equal(isBookingPulseEventVisible("2026-08-01T12:01:00.000Z", now), true);
  assert.equal(isBookingPulseEventVisible("2026-08-01T12:00:00.000Z", now), false);
  assert.equal(isBookingPulseEventVisible("2026-08-01T11:59:59.000Z", now), false);
  assert.equal(isBookingPulseEventVisible("not-a-date", now), false);
  assert.equal(isBookingPulseEventVisible("2026-08-02T12:01:00.000Z", now), false);
});

test("booking pulse excludes expired invalid and future events without deleting booking data", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [
    eventRow({ booking_event_id: 10, beds24_booking_id: 9010, occurred_at: "2026-08-01T12:01:00.000Z" }),
    eventRow({ booking_event_id: 11, beds24_booking_id: 9011, occurred_at: "2026-08-01T12:00:00.000Z" }),
    eventRow({ booking_event_id: 12, beds24_booking_id: 9012, occurred_at: "2026-08-01T11:59:00.000Z" }),
    eventRow({ booking_event_id: 13, beds24_booking_id: 9013, occurred_at: "not-a-date" }),
    eventRow({ booking_event_id: 14, beds24_booking_id: 9014, occurred_at: "2026-08-02T12:01:00.000Z" }),
  ];

  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 10, new Date("2026-08-02T12:00:00.000Z"));

  assert.deepEqual(events.map((event) => event.bookingId), ["9010"]);
  assert.equal(db.deleteStatements, 0);
});

test("booking pulse keeps the most recent meaningful event per booking", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [
    eventRow({ booking_event_id: 21, event_type: "updated", beds24_booking_id: 9021, occurred_at: "2026-08-02T11:30:00.000Z" }),
    eventRow({ booking_event_id: 20, event_type: "new", beds24_booking_id: 9021, occurred_at: "2026-08-02T10:30:00.000Z" }),
    eventRow({ booking_event_id: 22, event_type: "cancelled", beds24_booking_id: 9022, occurred_at: "2026-08-02T11:00:00.000Z" }),
  ];

  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 10, new Date("2026-08-02T12:00:00.000Z"));

  assert.deepEqual(events.map((event) => `${event.bookingId}:${event.eventType}`), ["9021:UPDATED", "9022:CANCELLED"]);
});

test("booking pulse uses the resort local timezone convention", () => {
  assert.equal(BOOKING_PULSE_RESORT_TIME_ZONE, "Asia/Bangkok");
});
