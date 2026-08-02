import assert from "node:assert/strict";
import test from "node:test";

import {
  bookingEventSignature,
  bookingEventType,
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

class FakeBookingEventsDB {
  rows = [
    {
      booking_event_id: 3,
      event_type: "cancelled",
      accommodation: "Bungalow 6",
      source: "Booking.com",
      occurred_at: "2026-07-31T10:20:00.000Z",
    },
    {
      booking_event_id: 2,
      event_type: "updated",
      accommodation: "Villa 12",
      source: "Agoda",
      occurred_at: "2026-07-31T10:10:00.000Z",
    },
    {
      booking_event_id: 1,
      event_type: "new",
      accommodation: "Villa 10",
      source: "Booking.com",
      occurred_at: "2026-07-31T10:00:00.000Z",
    },
  ];
  inserted: unknown[][] = [];

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async all<T>(_sql: string, params: unknown[]) {
    return { results: this.rows.slice(0, Number(params[0])).map((row) => row as T) };
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT OR IGNORE INTO booking_events")) {
      this.inserted.push(params);
    }
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

test("recent booking event query returns newest first with a maximum limit", async () => {
  const db = new FakeBookingEventsDB();
  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 2);

  assert.deepEqual(events.map((event) => event.title), ["BOOKING CANCELLED", "BOOKING UPDATED"]);
  assert.deepEqual(events.map((event) => event.accommodation), ["Bungalow 6", "Villa 12"]);
});
