import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import worker from "../src/index.ts";
import {
  getAvailabilityPrices,
  mapAccommodationType,
  validateStayRange,
  type AvailabilityPricesGroup,
} from "../src/services/availability-prices.service.ts";

type UnitFixture = {
  unit_id: number;
  unit_name: string;
  beds24_unit_id: number | null;
  unit_type: string | null;
  position: number | null;
  room_type_id: number;
  room_type_name: string;
  room_name: string | null;
  beds24_room_id: number | null;
  active?: number;
  room_type_active?: number;
  property_active?: number;
};

type AvailabilityFixture = {
  unit_id: number;
  stay_date: string;
  availability: number | null;
  closed?: number | null;
};

type BookingFixture = {
  unit_id: number | null;
  arrival_date: string;
  departure_date: string;
  status: string;
  sub_status?: string | null;
  master_beds24_booking_id?: number | null;
};

type OfferPriceFixture = {
  room_type_id: number;
  offer_id: number | null;
  beds24_offer_id: number;
  arrival_date: string;
  departure_date: string;
  price: number | null;
};

type MaintenanceTicketFixture = {
  room_id: number | null;
  status: string;
  out_of_service: number;
  metadata_json?: string;
};

const ACTIVE_USER = {
  user_id: "user-1",
  full_name: "Availability Tester",
  profile_photo_url: null,
  role: "Operations",
  preferred_language: "en",
  username: "availability",
  email: null,
  password_hash: "not-returned",
  status: "active",
  created_at: "2026-08-03T00:00:00.000Z",
  updated_at: "2026-08-03T00:00:00.000Z",
  last_login_at: null,
};

const DEFAULT_UNITS: UnitFixture[] = [
  {
    unit_id: 1,
    unit_name: "Bungalow 1",
    beds24_unit_id: 1001,
    unit_type: "bungalow",
    position: 1,
    room_type_id: 10,
    room_type_name: "Bungalow",
    room_name: "Bungalow",
    beds24_room_id: 501,
  },
];

class FakeAvailabilityStmt {
  private params: unknown[] = [];

  constructor(private readonly db: FakeAvailabilityDB, private readonly sql: string) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async all<T>() {
    return { results: this.db.all(this.sql, this.params) as T[] };
  }

  async first<T>() {
    return this.db.first(this.sql, this.params) as T | null;
  }

  async run() {
    this.db.writes += 1;
    return { success: true };
  }
}

class FakeAvailabilityDB {
  units: UnitFixture[] = DEFAULT_UNITS.map((unit) => ({ ...unit }));
  availability: AvailabilityFixture[] = [];
  bookings: BookingFixture[] = [];
  offerPrices: OfferPriceFixture[] = [];
  operationalAvailability = new Map<number, string>();
  maintenanceTickets: MaintenanceTicketFixture[] = [];
  authenticated = true;
  failService = false;
  writes = 0;

  constructor(input: Partial<FakeAvailabilityDB> = {}) {
    Object.assign(this, input);
  }

  prepare(sql: string) {
    return new FakeAvailabilityStmt(this, sql);
  }

  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    this.writes += stmts.length;
    return Promise.all(stmts.map((stmt) => stmt.run()));
  }

  all(sql: string, params: unknown[]) {
    if (sql.includes("SELECT view_key FROM user_views")) return [{ view_key: "staff" }];
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) {
      return [{ module_key: "rooms", can_access: 1, can_edit: 0 }];
    }
    if (sql.includes("SELECT action_key, allowed FROM user_action_permissions")) return [];
    if (this.failService && sql.includes("FROM units u")) throw new Error("raw d1 failure with private detail");
    if (sql.includes("FROM units u") && sql.includes("room_operational_availability")) return this.unitRows();
    if (sql.includes("FROM unit_availability_cache")) {
      const dates = new Set(params.filter((item): item is string => typeof item === "string"));
      return this.availability
        .filter((row) => dates.has(row.stay_date))
        .map((row) => ({ ...row, closed: row.closed ?? 0 }));
    }
    if (sql.includes("FROM bookings")) {
      const requestedDeparture = String(params[0]);
      const requestedArrival = String(params[1]);
      const unitIds = new Set<number>();
      for (const booking of this.bookings) {
        const status = booking.status.trim().toLowerCase();
        const subStatus = (booking.sub_status ?? "").trim().toLowerCase();
        if (booking.unit_id === null) continue;
        if (status !== "confirmed" && status !== "new") continue;
        if (subStatus === "provider_deleted") continue;
        if (booking.arrival_date < requestedDeparture && booking.departure_date > requestedArrival) unitIds.add(booking.unit_id);
      }
      return [...unitIds].map((unit_id) => ({ unit_id }));
    }
    if (sql.includes("FROM offer_prices")) {
      const roomTypeIds = new Set(params.filter((item): item is number => typeof item === "number"));
      const stayDates = new Set(params.filter((item): item is string => typeof item === "string"));
      return this.offerPrices.filter((row) => roomTypeIds.has(row.room_type_id) && stayDates.has(row.arrival_date));
    }
    throw new Error(`Unhandled all SQL: ${sql}`);
  }

  first(sql: string, _params: unknown[]) {
    void _params;
    if (sql.includes("SELECT s.session_id, s.expires_at, u.*")) {
      if (!this.authenticated) return null;
      return {
        session_id: "session-1",
        expires_at: "2999-01-01T00:00:00.000Z",
        ...ACTIVE_USER,
      };
    }
    throw new Error(`Unhandled first SQL: ${sql}`);
  }

  private unitRows() {
    return this.units
      .filter((unit) => (unit.active ?? 1) === 1 && (unit.room_type_active ?? 1) === 1 && (unit.property_active ?? 1) === 1)
      .map((unit) => ({
        ...unit,
        operational_status: this.operationalAvailability.get(unit.unit_id) ?? "OPERATING",
        blocking_ticket_count: this.maintenanceTickets.filter((ticket) =>
          ticket.room_id === unit.unit_id
          && !["Resolved", "Closed"].includes(ticket.status)
          && (ticket.out_of_service === 1 || ticket.metadata_json === '{"outOfService":true}')
        ).length,
      }));
  }
}

function db(input: Partial<FakeAvailabilityDB> = {}) {
  return new FakeAvailabilityDB(input) as unknown as D1Database;
}

function available(unitId: number, date: string, value: number | null = 1, closed = 0): AvailabilityFixture {
  return { unit_id: unitId, stay_date: date, availability: value, closed };
}

function price(roomTypeId: number, beds24OfferId: number, date: string, amount: number, offerId = beds24OfferId): OfferPriceFixture {
  const nextDay = date === "2026-08-03" ? "2026-08-04" : date === "2026-08-04" ? "2026-08-05" : "2026-08-06";
  return { room_type_id: roomTypeId, offer_id: offerId, beds24_offer_id: beds24OfferId, arrival_date: date, departure_date: nextDay, price: amount };
}

async function availabilityGroups(database: D1Database, arrival = "2026-08-03", departure = "2026-08-04"): Promise<AvailabilityPricesGroup[]> {
  return (await getAvailabilityPrices(database, { arrival, departure })).groups;
}

test("date validation is strict date-only stay arithmetic", () => {
  assert.throws(() => validateStayRange("2026-8-03", "2026-08-04"), /availability_prices_invalid_date_range/);
  assert.throws(() => validateStayRange("2026-02-30", "2026-03-01"), /availability_prices_invalid_date_range/);
  assert.throws(() => validateStayRange("2026-08-03", "2026-08-03"), /availability_prices_invalid_date_range/);
  assert.throws(() => validateStayRange("2026-08-04", "2026-08-03"), /availability_prices_invalid_date_range/);
  assert.deepEqual(validateStayRange("2026-08-03", "2026-08-04"), {
    arrivalDate: "2026-08-03",
    departureDate: "2026-08-04",
    stayDates: ["2026-08-03"],
    nights: 1,
  });
  assert.deepEqual(validateStayRange("2026-08-03", "2026-08-05").stayDates, ["2026-08-03", "2026-08-04"]);
});

test("availability folds every requested night and distinguishes unavailable from unknown", async () => {
  const fullyAvailable = (await availabilityGroups(db({ availability: [available(1, "2026-08-03"), available(1, "2026-08-04")] }), "2026-08-03", "2026-08-05"))[0]!;
  assert.equal(fullyAvailable.availabilityStatus, "AVAILABLE");
  assert.equal(fullyAvailable.availableCount, 1);

  const oneNightUnavailable = (await availabilityGroups(db({ availability: [available(1, "2026-08-03"), available(1, "2026-08-04", 0)] }), "2026-08-03", "2026-08-05"))[0]!;
  assert.equal(oneNightUnavailable.availabilityStatus, "UNAVAILABLE");
  assert.equal(oneNightUnavailable.availableCount, 0);

  const missingNight = (await availabilityGroups(db({ availability: [available(1, "2026-08-03")] }), "2026-08-03", "2026-08-05"))[0]!;
  assert.equal(missingNight.availabilityStatus, "UNKNOWN");

  const unknownNight = (await availabilityGroups(db({ availability: [available(1, "2026-08-03", null), available(1, "2026-08-04")] }), "2026-08-03", "2026-08-05"))[0]!;
  assert.equal(unknownNight.availabilityStatus, "UNKNOWN");
});

test("booking overlap uses departure-exclusive semantics and ignores cancelled or provider-deleted rows", async () => {
  const availability = [available(1, "2026-08-03")];

  const checkoutReuse = (await availabilityGroups(db({
    availability,
    bookings: [{ unit_id: 1, arrival_date: "2026-08-01", departure_date: "2026-08-03", status: "confirmed" }],
  })))[0]!;
  assert.equal(checkoutReuse.availableCount, 1);

  const arrivalOnDeparture = (await availabilityGroups(db({
    availability,
    bookings: [{ unit_id: 1, arrival_date: "2026-08-04", departure_date: "2026-08-06", status: "confirmed" }],
  })))[0]!;
  assert.equal(arrivalOnDeparture.availableCount, 1);

  const activeOverlap = (await availabilityGroups(db({
    availability,
    bookings: [{ unit_id: 1, arrival_date: "2026-08-02", departure_date: "2026-08-04", status: "confirmed" }],
  })))[0]!;
  assert.equal(activeOverlap.availabilityStatus, "UNAVAILABLE");

  const cancelled = (await availabilityGroups(db({
    availability,
    bookings: [
      { unit_id: 1, arrival_date: "2026-08-02", departure_date: "2026-08-04", status: "cancelled" },
      { unit_id: 1, arrival_date: "2026-08-02", departure_date: "2026-08-04", status: "confirmed", sub_status: "provider_deleted" },
    ],
  })))[0]!;
  assert.equal(cancelled.availableCount, 1);
});

test("group bookings block every mapped physical unit", async () => {
  const database = db({
    units: [
      ...DEFAULT_UNITS,
      { ...DEFAULT_UNITS[0]!, unit_id: 2, unit_name: "Bungalow 2", beds24_unit_id: 1002, position: 2 },
    ],
    availability: [available(1, "2026-08-03"), available(2, "2026-08-03")],
    bookings: [
      { unit_id: 1, arrival_date: "2026-08-02", departure_date: "2026-08-04", status: "confirmed", master_beds24_booking_id: 9001 },
      { unit_id: 2, arrival_date: "2026-08-02", departure_date: "2026-08-04", status: "confirmed", master_beds24_booking_id: 9001 },
    ],
  });

  const group = (await availabilityGroups(database))[0]!;
  assert.equal(group.totalUnits, 2);
  assert.equal(group.availableCount, 0);
  assert.equal(group.availabilityStatus, "UNAVAILABLE");
});

test("operational exclusions remove not-operating and active out-of-service units without reading housekeeping state", async () => {
  const notOperatingDb = db({
    availability: [available(1, "2026-08-03")],
    operationalAvailability: new Map([[1, "NOT_OPERATING"]]),
  });
  const notOperating = (await availabilityGroups(notOperatingDb))[0]!;
  assert.equal(notOperating.availableCount, 0);
  assert.equal(notOperating.availabilityStatus, "UNAVAILABLE");

  const maintenanceBlocked = (await availabilityGroups(db({
    availability: [available(1, "2026-08-03")],
    maintenanceTickets: [{ room_id: 1, status: "Open", out_of_service: 1 }],
  })))[0]!;
  assert.equal(maintenanceBlocked.availableCount, 0);

  const resolvedMaintenance = (await availabilityGroups(db({
    availability: [available(1, "2026-08-03")],
    maintenanceTickets: [{ room_id: 1, status: "Resolved", out_of_service: 1 }],
  })))[0]!;
  assert.equal(resolvedMaintenance.availableCount, 1);
});

test("pricing selects one complete offer, sums nights, and calculates average", async () => {
  const group = (await availabilityGroups(db({
    availability: [available(1, "2026-08-03"), available(1, "2026-08-04")],
    offerPrices: [
      price(10, 200, "2026-08-03", 1000),
      price(10, 200, "2026-08-04", 1500),
    ],
  }), "2026-08-03", "2026-08-05"))[0]!;

  assert.equal(group.pricing.status, "AVAILABLE");
  assert.equal(group.pricing.beds24OfferId, 200);
  assert.equal(group.pricing.totalPrice, 2500);
  assert.equal(group.pricing.averageNightlyPrice, 1250);
  assert.deepEqual(group.pricing.nightlyPrices, [
    { date: "2026-08-03", amount: 1000 },
    { date: "2026-08-04", amount: 1500 },
  ]);
});

test("pricing returns missing without zero or partial totals when a complete offer is unavailable", async () => {
  const missingOneNight = (await availabilityGroups(db({
    availability: [available(1, "2026-08-03"), available(1, "2026-08-04")],
    offerPrices: [price(10, 200, "2026-08-03", 1000)],
  }), "2026-08-03", "2026-08-05"))[0]!;

  assert.equal(missingOneNight.pricing.status, "MISSING");
  assert.equal(missingOneNight.pricing.totalPrice, null);
  assert.deepEqual(missingOneNight.pricing.nightlyPrices, []);
  assert.deepEqual(missingOneNight.pricing.missingDates, ["2026-08-04"]);

  const mixedOffers = (await availabilityGroups(db({
    availability: [available(1, "2026-08-03"), available(1, "2026-08-04")],
    offerPrices: [
      price(10, 200, "2026-08-03", 1000),
      price(10, 201, "2026-08-04", 900),
    ],
  }), "2026-08-03", "2026-08-05"))[0]!;
  assert.equal(mixedOffers.pricing.status, "MISSING");
  assert.equal(mixedOffers.pricing.totalPrice, null);
});

test("pricing chooses lowest complete total and then lowest Beds24 offer id", async () => {
  const lowestTotal = (await availabilityGroups(db({
    availability: [available(1, "2026-08-03"), available(1, "2026-08-04")],
    offerPrices: [
      price(10, 300, "2026-08-03", 1000),
      price(10, 300, "2026-08-04", 1000),
      price(10, 200, "2026-08-03", 900),
      price(10, 200, "2026-08-04", 900),
    ],
  }), "2026-08-03", "2026-08-05"))[0]!;
  assert.equal(lowestTotal.pricing.beds24OfferId, 200);
  assert.equal(lowestTotal.pricing.totalPrice, 1800);

  const tieBreak = (await availabilityGroups(db({
    availability: [available(1, "2026-08-03"), available(1, "2026-08-04")],
    offerPrices: [
      price(10, 301, "2026-08-03", 1000),
      price(10, 301, "2026-08-04", 1000),
      price(10, 200, "2026-08-03", 1000),
      price(10, 200, "2026-08-04", 1000),
    ],
  }), "2026-08-03", "2026-08-05"))[0]!;
  assert.equal(tieBreak.pricing.beds24OfferId, 200);
});

test("grouping maps accommodation labels, preserves room type identity, deterministic order, and privacy", async () => {
  assert.equal(mapAccommodationType("yurt", "Tent 1", "Yurt"), "Tent");
  assert.equal(mapAccommodationType("villa", "Villa 10", "Garden Villa"), "Villa");
  assert.equal(mapAccommodationType("other", "Storage", "Other"), "Other");

  const database = db({
    units: [
      { ...DEFAULT_UNITS[0]!, unit_id: 10, unit_name: "Bungalow 10", beds24_unit_id: 1010, position: null },
      { ...DEFAULT_UNITS[0]!, unit_id: 2, unit_name: "Bungalow 2", beds24_unit_id: 1002, position: null },
      { ...DEFAULT_UNITS[0]!, unit_id: 20, unit_name: "Villa 10", beds24_unit_id: 2010, unit_type: "villa", room_type_id: 20, room_type_name: "Villa", beds24_room_id: 502 },
      { ...DEFAULT_UNITS[0]!, unit_id: 30, unit_name: "Tent 1", beds24_unit_id: 3001, unit_type: "yurt", room_type_id: 30, room_type_name: "Yurt", beds24_room_id: 503 },
      { ...DEFAULT_UNITS[0]!, unit_id: 31, unit_name: "Tent 2", beds24_unit_id: 3002, unit_type: "yurt", room_type_id: 31, room_type_name: "Safari Tent", beds24_room_id: 504 },
    ],
    availability: [available(10, "2026-08-03"), available(2, "2026-08-03"), available(20, "2026-08-03"), available(30, "2026-08-03"), available(31, "2026-08-03")],
  });

  const result = await getAvailabilityPrices(database, { arrival: "2026-08-03", departure: "2026-08-04" });
  assert.deepEqual(result.groups.map((group) => `${group.accommodationType}:${group.roomTypeId}`), [
    "Bungalow:10",
    "Villa:20",
    "Tent:31",
    "Tent:30",
  ]);
  assert.deepEqual(result.groups[0]!.availableUnits.map((unit) => unit.unitName), ["Bungalow 2", "Bungalow 10"]);
  assert.doesNotMatch(JSON.stringify(result), /guest_name|raw_json|Daniel|Paolo|Gaetano/i);
});

test("endpoint validates auth, dates, sanitized failures, and performs no writes", async () => {
  const unauthDb = new FakeAvailabilityDB({ authenticated: false });
  const unauth = await worker.fetch(new Request("https://vanara.test/api/availability-prices?arrival=2026-08-03&departure=2026-08-04", {
    headers: { cookie: "vanara_session=test" },
  }), { DB: unauthDb } as never);
  assert.equal(unauth.status, 401);

  const missing = await worker.fetch(new Request("https://vanara.test/api/availability-prices?departure=2026-08-04", {
    headers: { cookie: "vanara_session=test" },
  }), { DB: new FakeAvailabilityDB() } as never);
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), { success: false, error: "availability_prices_missing_dates" });

  const invalid = await worker.fetch(new Request("https://vanara.test/api/availability-prices?arrival=2026-08-04&departure=2026-08-03", {
    headers: { cookie: "vanara_session=test" },
  }), { DB: new FakeAvailabilityDB() } as never);
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { success: false, error: "availability_prices_invalid_date_range" });

  const validDb = new FakeAvailabilityDB({ availability: [available(1, "2026-08-03"), available(1, "2026-08-04")] });
  const valid = await worker.fetch(new Request("https://vanara.test/api/availability-prices?arrival=2026-08-03&departure=2026-08-05", {
    headers: { cookie: "vanara_session=test" },
  }), { DB: validDb } as never);
  assert.equal(valid.status, 200);
  const body = await valid.json() as { success: boolean; data: { nights: number; groups: AvailabilityPricesGroup[] } };
  assert.equal(body.success, true);
  assert.equal(body.data.nights, 2);
  assert.equal(body.data.groups[0]!.availableCount, 1);
  assert.equal(validDb.writes, 0);

  const failing = await worker.fetch(new Request("https://vanara.test/api/availability-prices?arrival=2026-08-03&departure=2026-08-04", {
    headers: { cookie: "vanara_session=test" },
  }), { DB: new FakeAvailabilityDB({ failService: true }) } as never);
  assert.equal(failing.status, 500);
  assert.deepEqual(await failing.json(), { success: false, error: "availability_prices_unavailable" });
});

test("source guardrails prevent live provider calls, price1, reservation writes, housekeeping exclusion, and frontend coupling", () => {
  const service = readFileSync(new URL("../src/services/availability-prices.service.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

  assert.doesNotMatch(service, /beds24Get|BEDS24_BASE_URL|BEDS24_LONG_LIFE_TOKEN|fetch\s*\(|\/inventory\/rooms/i);
  assert.doesNotMatch(service, /room_calendar|price1/i);
  assert.doesNotMatch(service, /\b(INSERT|UPDATE|DELETE|UPSERT|REPLACE)\b/i);
  assert.doesNotMatch(service, /room_housekeeping_state|ready_state|DIRTY|NOT_READY|housekeeping_tasks/i);
  assert.doesNotMatch(service, /from\s+["']\.\.\/\.\.\/src\/|react|tsx/i);
  assert.match(index, /app\.get\("\/api\/availability-prices"/);
  assert.match(index, /authenticated\(c,\s*"rooms",\s*"access"\)/);
  assert.doesNotMatch(index, /app\.(post|patch|delete)\("\/api\/availability-prices"/i);
});
