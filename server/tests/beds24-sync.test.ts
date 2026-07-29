import assert from "node:assert/strict";
import test from "node:test";

import { beds24Get, Beds24ApiError } from "../src/services/beds24-client.service.ts";
import {
  normalizeBookingFields,
  normalizeBookingGroupMembers,
  shouldAdvanceBookingsCursor,
} from "../src/services/bookings-sync.service.ts";
import { sanitizeLogMessage } from "../src/services/log-safety.service.ts";
import { SyncMetrics } from "../src/services/sync-metrics.service.ts";
import { buildAvailabilityCacheRows } from "../src/services/availability-cache.service.ts";

const env = {
  BEDS24_BASE_URL: "https://beds24.test/v2",
  BEDS24_LONG_LIFE_TOKEN: "test-token-value-not-real",
};

function jsonResponse(status: number, payload: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

test("country2 is normalized as booking country_code fallback", () => {
  const normalized = normalizeBookingFields({
    id: 10,
    propertyId: 1,
    roomId: 2,
    arrival: "2026-07-29",
    departure: "2026-07-30",
    country2: "TH",
  });

  assert.equal(normalized.countryCode, "TH");
});

test("allowCancellation is normalized as cancellation fallback", () => {
  const normalized = normalizeBookingFields({
    id: 10,
    propertyId: 1,
    roomId: 2,
    arrival: "2026-07-29",
    departure: "2026-07-30",
    allowCancellation: {
      type: "free",
      daysBeforeArrivalValue: 7,
    },
  });

  assert.equal(normalized.cancellationType, "free");
  assert.equal(normalized.cancellationDaysBeforeArrival, 7);
});

test("bookingGroup object is normalized without requiring an array", () => {
  const members = normalizeBookingGroupMembers({
    id: 20,
    masterId: 20,
    propertyId: 1,
    roomId: 2,
    bookingGroup: { bookingId: 21, masterId: 20, isMaster: false },
  });

  assert.deepEqual(
    members.map((member) => ({
      master: member.masterBeds24BookingId,
      member: member.memberBeds24BookingId,
      isMaster: member.isMaster,
    })),
    [
      { master: 20, member: 20, isMaster: true },
      { master: 20, member: 21, isMaster: false },
    ],
  );
});

test("bookingGroup null produces no group members unless masterId is present", () => {
  const normalized = normalizeBookingFields({
    id: 30,
    propertyId: 1,
    roomId: 2,
    bookingGroup: null,
  });

  assert.deepEqual(normalized.bookingGroupMembers, []);
});

test("temporary Beds24 errors retry with Retry-After and then succeed", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const fetcher: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse(429, { error: "rate limited" }, { "Retry-After": "1" });
    }
    return jsonResponse(200, { success: true, data: [] });
  };

  const result = await beds24Get<{ success: boolean }>(
    env,
    "/bookings",
    undefined,
    {
      fetcher,
      pauseAfterMs: 0,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    },
  );

  assert.equal(result.success, true);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [1000]);
});

test("permanent Beds24 4xx errors are not retried", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return jsonResponse(400, { error: "bad request" });
  };

  await assert.rejects(
    beds24Get(env, "/bookings", undefined, {
      fetcher,
      pauseAfterMs: 0,
      sleep: async () => undefined,
    }),
    (error: unknown) => error instanceof Beds24ApiError && error.status === 400,
  );
  assert.equal(calls, 1);
});

test("records_failed remains distinct from records_skipped", () => {
  const metrics = new SyncMetrics();
  metrics.read(3);
  metrics.skipped(2);
  metrics.failed(1);

  assert.deepEqual(metrics.snapshot(), {
    recordsRead: 3,
    recordsWritten: 0,
    recordsSkipped: 2,
    recordsFailed: 1,
  });
});

test("bookings cursor advances only after success", () => {
  assert.equal(shouldAdvanceBookingsCursor("success"), true);
  assert.equal(shouldAdvanceBookingsCursor("failed"), false);
});

test("sanitized logs and Beds24 API errors do not expose secrets or response bodies", async () => {
  const secret = "sk_live_this_is_a_long_secret_token_value";
  const sanitized = sanitizeLogMessage(new Error(`failed ${secret}`), "fallback");
  assert.equal(sanitized.includes(secret), false);
  assert.equal(sanitized.includes("[redacted]"), true);

  const fetcher: typeof fetch = async () => jsonResponse(500, { error: secret });
  await assert.rejects(
    beds24Get(env, "/bookings", undefined, {
      fetcher,
      pauseAfterMs: 0,
      sleep: async () => undefined,
      maxRetries: 0,
    }),
    (error: unknown) =>
      error instanceof Error &&
      !error.message.includes(secret) &&
      !error.message.includes(env.BEDS24_LONG_LIFE_TOKEN),
  );
});

test("booking group normalization is deterministic and duplicate-safe", () => {
  const booking = {
    id: 40,
    masterId: 40,
    propertyId: 1,
    roomId: 2,
    bookingGroup: { bookingId: 40, masterId: 40, isMaster: true },
  };

  const first = normalizeBookingGroupMembers(booking);
  const second = normalizeBookingGroupMembers(booking);

  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
});

test("availability cache projects room calendar counts onto deterministic unit rows", () => {
  const records = buildAvailabilityCacheRows(
    [
      {
        property_id: 1,
        property_name: "Local Property",
        room_type_id: 10,
        room_type_name: "Bungalow",
        beds24_property_id: 100,
        beds24_room_id: 200,
        unit_id: 1001,
        unit_name: "Bungalow 1",
        position: 1,
      },
      {
        property_id: 1,
        property_name: "Local Property",
        room_type_id: 10,
        room_type_name: "Bungalow",
        beds24_property_id: 100,
        beds24_room_id: 200,
        unit_id: 1002,
        unit_name: "Bungalow 2",
        position: 2,
      },
    ],
    [
      {
        propertyId: 100,
        roomId: 200,
        calendar: [
          { from: "2026-08-01", to: "2026-08-01", numAvail: 1, minStay: 2, maxStay: 7 },
        ],
      },
    ],
    [],
    "2026-08-01",
    "2026-08-01",
  );

  assert.deepEqual(
    records.map((record) => ({ unitId: record.unitId, availability: record.availability })),
    [
      { unitId: 1001, availability: 1 },
      { unitId: 1002, availability: 0 },
    ],
  );
  assert.equal(records[0].minimumStay, 2);
  assert.equal(records[0].maximumStay, 7);
});

test("availability cache marks booked units unavailable before assigning remaining availability", () => {
  const records = buildAvailabilityCacheRows(
    [
      {
        property_id: 1,
        property_name: "Local Property",
        room_type_id: 10,
        room_type_name: "Bungalow",
        beds24_property_id: 100,
        beds24_room_id: 200,
        unit_id: 1001,
        unit_name: "Bungalow 1",
        position: 1,
      },
      {
        property_id: 1,
        property_name: "Local Property",
        room_type_id: 10,
        room_type_name: "Bungalow",
        beds24_property_id: 100,
        beds24_room_id: 200,
        unit_id: 1002,
        unit_name: "Bungalow 2",
        position: 2,
      },
    ],
    [{ propertyId: 100, roomId: 200, calendar: { "2026-08-01": { numAvail: 1 } } }],
    [{ unit_id: 1001, arrival_date: "2026-08-01", departure_date: "2026-08-02" }],
    "2026-08-01",
    "2026-08-01",
  );

  assert.deepEqual(
    records.map((record) => ({ unitId: record.unitId, availability: record.availability })),
    [
      { unitId: 1001, availability: 0 },
      { unitId: 1002, availability: 1 },
    ],
  );
});

test("availability cache uses unknown when Beds24 calendar data is missing", () => {
  const records = buildAvailabilityCacheRows(
    [
      {
        property_id: 1,
        property_name: "Local Property",
        room_type_id: 10,
        room_type_name: "Bungalow",
        beds24_property_id: 100,
        beds24_room_id: 200,
        unit_id: 1001,
        unit_name: "Bungalow 1",
        position: 1,
      },
    ],
    [],
    [],
    "2026-08-01",
    "2026-08-01",
  );

  assert.equal(records[0].availability, null);
  assert.match(records[0].rawJson, /missing-room-calendar/);
});
