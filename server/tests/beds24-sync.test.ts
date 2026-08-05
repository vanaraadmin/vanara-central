import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { beds24Get, Beds24ApiError } from "../src/services/beds24-client.service.ts";
import {
  bookingSyncQueries,
  cancellationPropagationTargets,
  deduplicateBookingGuestsForPersistence,
  deduplicateBookingInfoItemsForPersistence,
  isCancelledBeds24BookingStatus,
  normalizeBookingFields,
  normalizeBookingGroupMembers,
  providerDeletedBookingIds,
  shouldAdvanceBookingsCursor,
} from "../src/services/bookings-sync.service.ts";
import { sanitizeLogMessage } from "../src/services/log-safety.service.ts";
import { SyncMetrics } from "../src/services/sync-metrics.service.ts";
import { buildAvailabilityCacheRows } from "../src/services/availability-cache.service.ts";

const env = {
  BEDS24_BASE_URL: "https://beds24.test/v2",
  BEDS24_LONG_LIFE_TOKEN: "test-token-value-not-real",
};

const syncIssueMigration = await readFile(new URL("../migrations/0024_sync_record_issues.sql", import.meta.url), "utf8");
const syncServiceSource = await readFile(new URL("../src/services/bookings-sync.service.ts", import.meta.url), "utf8");
const wranglerConfig = await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8");

function jsonResponse(status: number, payload: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

function requestPath(input: RequestInfo | URL): string {
  return new URL(input instanceof Request ? input.url : String(input)).pathname;
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

test("nested bookingGroup object uses the root group id for child rows", () => {
  const members = normalizeBookingGroupMembers({
    id: 88628736,
    propertyId: 1,
    roomId: 2,
    bookingGroup: {
      id: 88628736,
      bookings: [
        { bookingId: 88628736, isMaster: true },
        { bookingId: 88628737 },
        { bookingId: 88628738 },
        { bookingId: 88628739 },
        { bookingId: 88628740 },
      ],
    },
  });

  assert.deepEqual(
    members.map((member) => ({
      master: member.masterBeds24BookingId,
      member: member.memberBeds24BookingId,
      isMaster: member.isMaster,
    })),
    [
      { master: 88628736, member: 88628736, isMaster: true },
      { master: 88628736, member: 88628737, isMaster: false },
      { master: 88628736, member: 88628738, isMaster: false },
      { master: 88628736, member: 88628739, isMaster: false },
      { master: 88628736, member: 88628740, isMaster: false },
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

test("cancelled master booking propagates only through Beds24 group identifiers", () => {
  const booking = {
    id: 88628736,
    masterId: 88628736,
    propertyId: 1,
    roomId: 2,
    status: "Cancelled",
    arrival: "2026-12-27",
    departure: "2027-01-02",
    firstName: "Cristiana",
    lastName: "Colac",
    email: "colac.297165@guest.booking.com",
    bookingGroup: [
      { bookingId: 88628736, masterId: 88628736, isMaster: true },
      { bookingId: 88628737, masterId: 88628736 },
      { bookingId: 88628738, masterId: 88628736 },
      { bookingId: 88628739, masterId: 88628736 },
      { bookingId: 88628740, masterId: 88628736 },
    ],
  };

  const targets = cancellationPropagationTargets(booking);

  assert.equal(isCancelledBeds24BookingStatus(" Cancelled "), true);
  assert.deepEqual(targets.masterBeds24BookingIds, [88628736]);
  assert.deepEqual(targets.memberBeds24BookingIds, [
    88628736,
    88628737,
    88628738,
    88628739,
    88628740,
  ]);
});

test("cancelled child booking does not fan out to siblings only because it shares a master id", () => {
  const targets = cancellationPropagationTargets({
    id: 88628737,
    masterId: 88628736,
    propertyId: 1,
    roomId: 2,
    status: "Cancelled",
    arrival: "2026-12-27",
    departure: "2027-01-02",
  });

  assert.deepEqual(targets.masterBeds24BookingIds, [88628737]);
  assert.deepEqual(targets.memberBeds24BookingIds, [88628737]);
});

test("temporary Beds24 errors retry with Retry-After and then succeed", async () => {
  let dataCalls = 0;
  let authCalls = 0;
  const sleeps: number[] = [];
  const fetcher: typeof fetch = async (input) => {
    if (requestPath(input).endsWith("/authentication/token")) {
      authCalls += 1;
      return jsonResponse(200, { token: "current-access-token" });
    }
    dataCalls += 1;
    if (dataCalls === 1) {
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
  assert.equal(authCalls, 1);
  assert.equal(dataCalls, 2);
  assert.deepEqual(sleeps, [1000]);
});

test("permanent Beds24 4xx errors are not retried", async () => {
  let dataCalls = 0;
  const fetcher: typeof fetch = async (input) => {
    if (requestPath(input).endsWith("/authentication/token")) {
      return jsonResponse(200, { token: "current-access-token" });
    }
    dataCalls += 1;
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
  assert.equal(dataCalls, 1);
});

test("Beds24 GET exchanges the long-life token before reading booking data", async () => {
  const seen: Array<{ path: string; token: string | null; refreshToken: string | null }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const path = requestPath(input);
    const headers = new Headers(init?.headers);
    seen.push({
      path,
      token: headers.get("token"),
      refreshToken: headers.get("refreshToken"),
    });
    if (path.endsWith("/authentication/token")) {
      return jsonResponse(200, { token: "current-access-token" });
    }
    return jsonResponse(200, { success: true, data: [{ id: 90999999 }] });
  };

  const result = await beds24Get<{ success: boolean; data: Array<{ id: number }> }>(
    env,
    "/bookings",
    { modifiedFrom: "2026-08-05T00:00:00.000Z", includeGuests: true },
    { fetcher, pauseAfterMs: 0 },
  );

  assert.equal(result.data[0]?.id, 90999999);
  assert.deepEqual(seen, [
    { path: "/v2/authentication/token", token: null, refreshToken: env.BEDS24_LONG_LIFE_TOKEN },
    { path: "/v2/bookings", token: "current-access-token", refreshToken: null },
  ]);
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

test("bookings cursor advances after successful and partially successful runs", () => {
  assert.equal(shouldAdvanceBookingsCursor("success"), true);
  assert.equal(shouldAdvanceBookingsCursor("partial_success"), true);
  assert.equal(shouldAdvanceBookingsCursor("failed"), false);
});

test("duplicate guest child records inside one Beds24 payload are deduplicated by provider guest id", () => {
  const guests = deduplicateBookingGuestsForPersistence({
    id: 90811066,
    guests: [
      { id: 101, firstName: "Paolo" },
      { id: 101, firstName: "Paolo", lastName: "Duplicate" },
      { id: 102, firstName: "Guest" },
      { firstName: "Anonymous" },
      { firstName: "Anonymous duplicate without provider id" },
    ],
  });

  assert.deepEqual(
    guests.map((guest) => ({ id: guest.id, firstName: guest.firstName, lastName: guest.lastName })),
    [
      { id: 101, firstName: "Paolo", lastName: undefined },
      { id: 102, firstName: "Guest", lastName: undefined },
      { id: undefined, firstName: "Anonymous", lastName: undefined },
      { id: undefined, firstName: "Anonymous duplicate without provider id", lastName: undefined },
    ],
  );
});

test("duplicate booking info child records inside one Beds24 payload are deduplicated by info code", () => {
  const infoItems = deduplicateBookingInfoItemsForPersistence({
    id: 90811005,
    infoItems: [
      { code: "door-code", name: "Door code", value: "1111" },
      { code: "door-code", name: "Door code", value: "2222" },
      { code: "flight", name: "Flight", value: "PG123" },
      { name: "Missing code", value: "kept for existing skip handling" },
    ],
  });

  assert.deepEqual(
    infoItems.map((item) => ({ code: item.code, value: item.value })),
    [
      { code: "door-code", value: "1111" },
      { code: "flight", value: "PG123" },
      { code: undefined, value: "kept for existing skip handling" },
    ],
  );
});

test("normalizeBookingFields exposes duplicate-safe child payloads for persistence", () => {
  const normalized = normalizeBookingFields({
    id: 90858176,
    propertyId: 1,
    roomId: 2,
    guests: [
      { id: 2001, firstName: "Daniel" },
      { id: 2001, firstName: "Daniel" },
    ],
    infoItems: [
      { code: "source-ref", value: "A" },
      { code: "source-ref", value: "A" },
    ],
  });

  assert.equal(normalized.guests.length, 1);
  assert.equal(normalized.infoItems.length, 1);
});

test("deleted provider bookings are identified without deleting local booking history", () => {
  assert.deepEqual(
    providerDeletedBookingIds([90858176, 90858177], [90858176, 90811066, 90811005, 90811005]),
    [90811066, 90811005],
  );
});

test("record-level sync issues are retryable and automatically resolvable", () => {
  assert.match(syncIssueMigration, /provider_record_id TEXT NOT NULL/);
  assert.match(syncIssueMigration, /first_failure_at TEXT NOT NULL/);
  assert.match(syncIssueMigration, /latest_failure_at TEXT NOT NULL/);
  assert.match(syncIssueMigration, /attempt_count INTEGER NOT NULL DEFAULT 1/);
  assert.match(syncIssueMigration, /status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(syncIssueMigration, /resolved_at TEXT/);
  assert.match(syncIssueMigration, /UNIQUE \(sync_type, provider_record_id, issue_type\)/);
  assert.match(syncServiceSource, /loadPendingIssueBookingIds/);
  assert.match(syncServiceSource, /resolveSyncRecordIssues/);
  assert.match(syncServiceSource, /currentProviderBookings\.get\(bookingId\)/);
});

test("sync endpoints are routed to the Worker in production assets mode", () => {
  assert.match(wranglerConfig, /"run_worker_first"\s*:\s*\[/);
  assert.match(wranglerConfig, /"\/api\/\*"/);
  assert.match(wranglerConfig, /"\/health"/);
  assert.match(wranglerConfig, /"\/sync\/\*"/);
});

test("booking sync includes cancelled updates with a focused recovery lookback", () => {
  assert.deepEqual(bookingSyncQueries("2026-07-30T11:00:00.000Z"), [
    {
      modifiedFrom: "2026-07-30T11:00:00.000Z",
      includeBookingGroup: true,
      includeGuests: true,
      includeInfoItems: true,
    },
    {
      modifiedFrom: "2026-07-28T11:00:00.000Z",
      includeBookingGroup: true,
      includeGuests: true,
      includeInfoItems: true,
      status: "cancelled",
    },
  ]);
});

test("initial booking sync does not shift the cancelled query before the bootstrap floor", () => {
  assert.deepEqual(bookingSyncQueries("2000-01-01T00:00:00Z"), [
    {
      modifiedFrom: "2000-01-01T00:00:00Z",
      includeBookingGroup: true,
      includeGuests: true,
      includeInfoItems: true,
    },
    {
      modifiedFrom: "2000-01-01T00:00:00Z",
      includeBookingGroup: true,
      includeGuests: true,
      includeInfoItems: true,
      status: "cancelled",
    },
  ]);
});

test("sanitized logs and Beds24 API errors do not expose secrets or response bodies", async () => {
  const secret = "sk_live_this_is_a_long_secret_token_value";
  const sanitized = sanitizeLogMessage(new Error(`failed ${secret}`), "fallback");
  assert.equal(sanitized.includes(secret), false);
  assert.equal(sanitized.includes("[redacted]"), true);

  const fetcher: typeof fetch = async (input) => {
    if (requestPath(input).endsWith("/authentication/token")) {
      return jsonResponse(200, { token: "current-access-token" });
    }
    return jsonResponse(500, { error: secret });
  };
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
