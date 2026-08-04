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
  price: 12000,
  apiSource: "Beds24",
  channel: "Booking.com",
  apiReference: "OTA-9001",
  reference: "REF-9001",
  voucher: "VOUCHER-9001",
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeBookingEventsDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

type FakeBookingEventRow = {
  booking_event_id: number;
  booking_id: number;
  event_type: "new" | "updated" | "cancelled";
  beds24_booking_id: number;
  master_beds24_booking_id: number | null;
  pulse_group_beds24_booking_id: number | null;
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
  booking_sub_status: string | null;
  adults: number | null;
  children: number | null;
  price: number | null;
  api_source: string | null;
  channel: string | null;
  unit_type: string | null;
  room_type_name: string | null;
  room_name: string | null;
};

type FakeGroupMemberRow = {
  beds24_booking_id: number;
  master_beds24_booking_id: number | null;
  unit_id: number | null;
  unit_name: string | null;
  unit_type: string | null;
  room_type_name: string | null;
  room_name: string | null;
  arrival_date: string | null;
  departure_date: string | null;
};

function eventRow(overrides: Partial<FakeBookingEventRow>): FakeBookingEventRow {
  return {
    booking_event_id: 1,
    booking_id: 1,
    event_type: "new",
    beds24_booking_id: 9001,
    master_beds24_booking_id: null,
    pulse_group_beds24_booking_id: null,
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
    booking_sub_status: null,
    adults: 2,
    children: 0,
    price: 12000,
    api_source: "Beds24",
    channel: "Direct",
    unit_type: "villa",
    room_type_name: "Villa",
    room_name: "Villa",
    ...overrides,
  };
}

function groupMember(overrides: Partial<FakeGroupMemberRow>): FakeGroupMemberRow {
  return {
    beds24_booking_id: 9001,
    master_beds24_booking_id: null,
    unit_id: 10,
    unit_name: "Villa 10",
    unit_type: "villa",
    room_type_name: "Villa",
    room_name: "Villa",
    arrival_date: "2026-08-04",
    departure_date: "2026-08-06",
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
  groupMembers = new Map<number, FakeGroupMemberRow[]>();
  inserted: unknown[][] = [];
  private insertedSignatures = new Set<string>();
  deleteStatements = 0;

  prepare(sql: string) { return new FakeStmt(this, sql); }

  async all<T>(sql: string, params: unknown[]) {
    if (sql.includes("FROM bookings b") && !sql.includes("FROM booking_events")) {
      const groupKey = Number(params[0]);
      const configured = this.groupMembers.get(groupKey);
      if (configured) return { results: configured as T[] };

      const row = this.rows.find((candidate) =>
        candidate.beds24_booking_id === groupKey ||
        candidate.master_beds24_booking_id === groupKey ||
        candidate.pulse_group_beds24_booking_id === groupKey
      );

      return {
        results: row ? [groupMember({
          beds24_booking_id: row.beds24_booking_id,
          master_beds24_booking_id: row.master_beds24_booking_id,
          unit_id: row.unit_id,
          unit_name: row.unit_name,
          unit_type: row.unit_type,
          room_type_name: row.room_type_name,
          room_name: row.room_name,
          arrival_date: row.arrival_date,
          departure_date: row.departure_date,
        }) as T] : [],
      };
    }

    return {
      results: this.rows
        .slice()
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.booking_event_id - a.booking_event_id)
        .slice(0, Number(params[0]))
        .map((row) => row as T),
    };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("FROM booking_events") && sql.includes("event_type = 'new'")) {
      const bookingId = Number(params[0]);
      const cutoff = String(params[1]);
      const occurredAt = String(params[2]);
      const row = this.rows
        .filter((candidate) =>
          candidate.booking_id === bookingId &&
          candidate.event_type === "new" &&
          candidate.occurred_at > cutoff &&
          candidate.occurred_at <= occurredAt
        )
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.booking_event_id - a.booking_event_id)[0];
      return (row as T | undefined) ?? null;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT OR IGNORE INTO booking_events")) {
      const signature = String(params[5]);
      if (this.insertedSignatures.has(signature)) {
        return { meta: { changes: 0, last_row_id: this.inserted.length } };
      }
      this.insertedSignatures.add(signature);
      this.inserted.push(params);
      this.rows.push(eventRow({
        booking_event_id: this.rows.length + 1,
        booking_id: Number(params[1]),
        event_type: params[0] as "new" | "updated" | "cancelled",
        beds24_booking_id: Number(params[2]),
        event_accommodation: String(params[3]),
        event_source: params[4] as string | null,
        occurred_at: String(params[6]),
      }));
    }
    if (sql.includes("DELETE")) this.deleteStatements += 1;
    return { meta: { changes: 1, last_row_id: this.inserted.length } };
  }
}

test("new booking generates a NEW business event", () => {
  assert.equal(bookingEventType(null, baseSnapshot), "new");
});

test("repeated synchronization keeps NEW and never creates UPDATED", async () => {
  const db = new FakeBookingEventsDB();

  await recordBookingEvent(
    { DB: db as unknown as D1Database },
    null,
    baseSnapshot,
    "2026-07-31T10:00:00.000Z",
  );
  await recordBookingEvent(
    { DB: db as unknown as D1Database },
    baseSnapshot,
    { ...baseSnapshot },
    "2026-07-31T10:10:00.000Z",
  );

  assert.deepEqual(db.inserted.map((params) => params[0]), ["new"]);
});

test("database timestamp changes alone do not generate UPDATED", () => {
  const previous = { ...baseSnapshot, updatedAt: "2026-07-31T10:00:00.000Z" } as BookingEventSnapshot & { updatedAt: string };
  const current = { ...baseSnapshot, updatedAt: "2026-07-31T10:10:00.000Z" } as BookingEventSnapshot & { updatedAt: string };

  assert.equal(bookingEventType(previous, current), null);
});

test("arrival date changes generate UPDATED", () => {
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, arrivalDate: "2026-08-02" }), "updated");
});

test("departure date changes generate UPDATED", () => {
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, departureDate: "2026-08-04" }), "updated");
});

test("room changes generate UPDATED", () => {
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, unitId: 1002 }), "updated");
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, roomTypeId: 11 }), "updated");
});

test("guest count changes generate UPDATED", () => {
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, adults: 3 }), "updated");
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, children: 1 }), "updated");
});

test("guest name booking value and source payload changes generate UPDATED", () => {
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, guestName: "Mali Updated" }), "updated");
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, price: 13000 }), "updated");
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, apiReference: "OTA-9001-REV-2" }), "updated");
});

test("cancellation generates CANCELLED and restored booking generates UPDATED", () => {
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, status: "Cancelled" }), "cancelled");
  assert.equal(bookingEventType({ ...baseSnapshot, status: "Cancelled" }, { ...baseSnapshot, status: "Confirmed" }), "updated");
});

test("unchanged active and unchanged cancelled bookings generate no event", () => {
  assert.equal(bookingEventType(baseSnapshot, { ...baseSnapshot, status: "Confirmed" }), null);
  assert.equal(bookingEventType({ ...baseSnapshot, status: "Cancelled" }, { ...baseSnapshot, status: "Cancelled" }), null);
});

test("booking event signature prevents duplicate replay inserts", () => {
  const first = bookingEventSignature("updated", { ...baseSnapshot, departureDate: "2026-08-04" });
  const replay = bookingEventSignature("updated", { ...baseSnapshot, departureDate: "2026-08-04" });
  const changed = bookingEventSignature("updated", { ...baseSnapshot, departureDate: "2026-08-05" });
  const restored = bookingEventSignature(
    "updated",
    { ...baseSnapshot, status: "Confirmed" },
    { ...baseSnapshot, status: "Cancelled" },
  );

  assert.equal(first, replay);
  assert.notEqual(first, changed);
  assert.notEqual(first, restored);
});

test("identical payload twice does not duplicate UPDATED", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [];
  const updatedSnapshot = { ...baseSnapshot, departureDate: "2026-08-04" };

  await recordBookingEvent(
    { DB: db as unknown as D1Database },
    baseSnapshot,
    updatedSnapshot,
    "2026-07-31T10:30:00.000Z",
  );
  await recordBookingEvent(
    { DB: db as unknown as D1Database },
    baseSnapshot,
    updatedSnapshot,
    "2026-07-31T10:35:00.000Z",
  );

  assert.deepEqual(db.inserted.map((params) => params[0]), ["updated"]);
});

test("active NEW retention suppresses UPDATED event creation", async () => {
  const db = new FakeBookingEventsDB();

  await recordBookingEvent(
    { DB: db as unknown as D1Database },
    baseSnapshot,
    { ...baseSnapshot, departureDate: "2026-08-04" },
    "2026-07-31T10:30:00.000Z",
  );

  assert.deepEqual(db.inserted, []);
});

test("booking event persistence appends the sync-generated event envelope", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [];
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

test("single booking remains unchanged in Booking Pulse", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [
    eventRow({
      booking_event_id: 1,
      beds24_booking_id: 9101,
      event_accommodation: "Villa 10",
      unit_id: 10,
      unit_name: "Villa 10",
      unit_type: "villa",
      occurred_at: "2026-08-02T10:00:00.000Z",
    }),
  ];

  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 3, new Date("2026-08-02T11:00:00.000Z"));

  assert.equal(events.length, 1);
  assert.equal(events[0]?.bookingId, "9101");
  assert.equal(events[0]?.eventId, "9101:NEW:2026-08-02T10:00:00.000Z");
  assert.equal(events[0]?.unitName, "Villa 10");
  assert.deepEqual(events[0]?.unitNames, ["Villa 10"]);
  assert.equal(events[0]?.compactUnitLabel, "Villa 10");
  assert.equal(events[0]?.roomQuantity, 1);
  assert.equal(events[0]?.assignmentComplete, true);
});

test("master booking with three bungalows returns one Booking Pulse event", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [90858176, 90858177, 90858178].map((beds24BookingId, index) => eventRow({
    booking_event_id: index + 1,
    booking_id: index + 1,
    beds24_booking_id: beds24BookingId,
    master_beds24_booking_id: beds24BookingId === 90858176 ? null : 90858176,
    pulse_group_beds24_booking_id: 90858176,
    guest_name: "Daniel Padurariu",
    event_accommodation: `Bungalow ${index + 1}`,
    unit_id: index + 1,
    unit_name: `Bungalow ${index + 1}`,
    unit_type: "bungalow",
    room_type_name: "Bungalow",
    room_name: "Bungalow",
    arrival_date: "2026-12-28",
    departure_date: "2027-01-01",
    occurred_at: `2026-08-02T10:00:0${index}.000Z`,
  }));
  db.groupMembers.set(90858176, [1, 2, 3].map((roomNumber, index) => groupMember({
    beds24_booking_id: 90858176 + index,
    master_beds24_booking_id: index === 0 ? null : 90858176,
    unit_id: roomNumber,
    unit_name: `Bungalow ${roomNumber}`,
    unit_type: "bungalow",
    room_type_name: "Bungalow",
    room_name: "Bungalow",
    arrival_date: "2026-12-28",
    departure_date: "2027-01-01",
  })));

  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 10, new Date("2026-08-02T11:00:00.000Z"));

  assert.equal(events.length, 1);
  assert.equal(events[0]?.bookingId, "90858176");
  assert.equal(events[0]?.guestName, "Daniel Padurariu");
  assert.equal(events[0]?.unitName, "Bungalow 1, Bungalow 2, Bungalow 3");
  assert.deepEqual(events[0]?.unitNames, ["Bungalow 1", "Bungalow 2", "Bungalow 3"]);
  assert.equal(events[0]?.compactUnitLabel, "Bungalow 1, Bungalow 2 +1");
  assert.equal(events[0]?.roomQuantity, 3);
  assert.equal(events[0]?.assignmentComplete, true);
  assert.equal(events[0]?.arrivalDate, "2026-12-28");
  assert.equal(events[0]?.departureDate, "2027-01-01");
});

test("master booking with villa and tent returns mixed accommodation summary", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [
    eventRow({
      booking_event_id: 1,
      beds24_booking_id: 9201,
      pulse_group_beds24_booking_id: 9201,
      unit_id: 10,
      unit_name: "Villa 10",
      unit_type: "villa",
    }),
    eventRow({
      booking_event_id: 2,
      booking_id: 2,
      beds24_booking_id: 9202,
      master_beds24_booking_id: 9201,
      pulse_group_beds24_booking_id: 9201,
      unit_id: 102,
      unit_name: "Tent 2",
      unit_type: "yurt",
    }),
  ];
  db.groupMembers.set(9201, [
    groupMember({ beds24_booking_id: 9201, unit_id: 10, unit_name: "Villa 10", unit_type: "villa" }),
    groupMember({ beds24_booking_id: 9202, master_beds24_booking_id: 9201, unit_id: 102, unit_name: "Tent 2", unit_type: "yurt" }),
  ]);

  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 10, new Date("2026-08-02T11:00:00.000Z"));

  assert.equal(events.length, 1);
  assert.equal(events[0]?.unitName, "Villa 10, Tent 2");
  assert.deepEqual(events[0]?.unitNames, ["Villa 10", "Tent 2"]);
  assert.equal(events[0]?.compactUnitLabel, "Villa 10, Tent 2");
  assert.equal(events[0]?.roomQuantity, 2);
});

test("master booking with two bungalows and one tent returns mixed plural summary", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [9301, 9302, 9303].map((beds24BookingId, index) => eventRow({
    booking_event_id: index + 1,
    booking_id: index + 1,
    beds24_booking_id: beds24BookingId,
    master_beds24_booking_id: index === 0 ? null : 9301,
    pulse_group_beds24_booking_id: 9301,
    unit_id: index + 1,
    unit_name: index < 2 ? `Bungalow ${index + 1}` : "Tent 1",
    unit_type: index < 2 ? "bungalow" : "yurt",
  }));
  db.groupMembers.set(9301, [
    groupMember({ beds24_booking_id: 9301, unit_id: 1, unit_name: "Bungalow 1", unit_type: "bungalow" }),
    groupMember({ beds24_booking_id: 9302, master_beds24_booking_id: 9301, unit_id: 2, unit_name: "Bungalow 2", unit_type: "bungalow" }),
    groupMember({ beds24_booking_id: 9303, master_beds24_booking_id: 9301, unit_id: 101, unit_name: "Tent 1", unit_type: "yurt" }),
  ]);

  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 10, new Date("2026-08-02T11:00:00.000Z"));

  assert.equal(events.length, 1);
  assert.equal(events[0]?.unitName, "Bungalow 1, Bungalow 2, Tent 1");
  assert.deepEqual(events[0]?.unitNames, ["Bungalow 1", "Bungalow 2", "Tent 1"]);
  assert.equal(events[0]?.compactUnitLabel, "Bungalow 1, Bungalow 2 +1");
  assert.equal(events[0]?.roomQuantity, 3);
});

test("missing Booking Pulse unit assignment uses explicit pending fallback", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [
    eventRow({
      booking_event_id: 1,
      beds24_booking_id: 9401,
      unit_id: null,
      unit_name: null,
      event_accommodation: "Bungalow",
      occurred_at: "2026-08-02T10:00:00.000Z",
    }),
  ];
  db.groupMembers.set(9401, [groupMember({ beds24_booking_id: 9401, unit_id: null, unit_name: null })]);

  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 10, new Date("2026-08-02T11:00:00.000Z"));

  assert.equal(events[0]?.unitName, "Unit assignment pending");
  assert.equal(events[0]?.compactUnitLabel, "Unit assignment pending");
  assert.deepEqual(events[0]?.unitNames, []);
  assert.equal(events[0]?.assignmentComplete, false);
});

test("recent booking event query returns newest first with a maximum limit", async () => {
  const db = new FakeBookingEventsDB();
  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 2, new Date("2026-07-31T11:00:00.000Z"));

  assert.deepEqual(events.map((event) => event.eventType), ["CANCELLED", "UPDATED"]);
  assert.deepEqual(events.map((event) => event.unitName), ["Bungalow 6", "Villa 12"]);
  assert.equal(events[0]?.eventId, "9003:CANCELLED:2026-07-31T10:20:00.000Z");
  assert.equal(events[0]?.bookingId, "9003");
});

test("booking pulse booking value is included only when explicitly requested", async () => {
  const db = new FakeBookingEventsDB();
  const staffEvents = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 1, new Date("2026-07-31T11:00:00.000Z"));
  const financeEvents = await listRecentBookingEvents(
    { DB: db as unknown as D1Database },
    1,
    new Date("2026-07-31T11:00:00.000Z"),
    { includeBookingValue: true },
  );

  assert.equal(staffEvents[0]?.totalPrice, null);
  assert.equal(financeEvents[0]?.totalPrice, 12000);
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

test("booking pulse keeps NEW visible for 24 hours unless CANCELLED is the latest event", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [
    eventRow({ booking_event_id: 21, event_type: "updated", beds24_booking_id: 9021, occurred_at: "2026-08-02T11:30:00.000Z" }),
    eventRow({ booking_event_id: 20, event_type: "new", beds24_booking_id: 9021, occurred_at: "2026-08-02T10:30:00.000Z" }),
    eventRow({ booking_event_id: 22, event_type: "cancelled", beds24_booking_id: 9022, occurred_at: "2026-08-02T11:00:00.000Z" }),
    eventRow({ booking_event_id: 23, event_type: "new", beds24_booking_id: 9022, occurred_at: "2026-08-02T10:45:00.000Z" }),
  ];

  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 10, new Date("2026-08-02T12:00:00.000Z"));

  assert.deepEqual(events.map((event) => `${event.bookingId}:${event.eventType}`), ["9022:CANCELLED", "9021:NEW"]);
});

test("Booking Pulse active feed hides provider-deleted reconciliation events while preserving stored history", async () => {
  const db = new FakeBookingEventsDB();
  db.rows = [
    eventRow({
      booking_event_id: 31,
      event_type: "cancelled",
      beds24_booking_id: 9031,
      booking_status: "cancelled",
      booking_sub_status: "provider_deleted",
      occurred_at: "2026-08-02T11:30:00.000Z",
    }),
    eventRow({
      booking_event_id: 30,
      event_type: "new",
      beds24_booking_id: 9030,
      occurred_at: "2026-08-02T11:00:00.000Z",
    }),
  ];

  const events = await listRecentBookingEvents({ DB: db as unknown as D1Database }, 10, new Date("2026-08-02T12:00:00.000Z"));

  assert.deepEqual(events.map((event) => event.bookingId), ["9030"]);
  assert.equal(db.deleteStatements, 0);
});

test("booking pulse uses the resort local timezone convention", () => {
  assert.equal(BOOKING_PULSE_RESORT_TIME_ZONE, "Asia/Bangkok");
});
