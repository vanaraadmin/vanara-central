export type AvailabilityPricesQuery = {
  arrival: string;
  departure: string;
};

export type AvailabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";

export type PricingStatus = "AVAILABLE" | "MISSING";

export type AvailabilityPricesUnit = {
  unitId: number;
  unitName: string;
  beds24UnitId: number | null;
};

export type AvailabilityPricesNight = {
  date: string;
  amount: number;
};

export type AvailabilityPricesPricing = {
  status: PricingStatus;
  offerId: number | null;
  beds24OfferId: number | null;
  averageNightlyPrice: number | null;
  totalPrice: number | null;
  nightlyPrices: AvailabilityPricesNight[];
  missingDates: string[];
};

export type AvailabilityPricesGroup = {
  accommodationType: "Bungalow" | "Villa" | "Tent" | "Other";
  roomTypeId: number;
  roomTypeName: string;
  beds24RoomId: number | null;
  availabilityStatus: AvailabilityStatus;
  availableCount: number;
  totalUnits: number;
  availableUnits: AvailabilityPricesUnit[];
  pricing: AvailabilityPricesPricing;
};

export type AvailabilityPricesResult = {
  arrivalDate: string;
  departureDate: string;
  nights: number;
  currency: "THB";
  generatedAt: string;
  groups: AvailabilityPricesGroup[];
};

export type ValidatedStayRange = {
  arrivalDate: string;
  departureDate: string;
  stayDates: string[];
  nights: number;
};

type AccommodationType = AvailabilityPricesGroup["accommodationType"];

interface UnitSourceRow {
  unit_id: number;
  unit_name: string;
  beds24_unit_id: number | null;
  unit_type: string | null;
  position: number | null;
  room_type_id: number;
  room_type_name: string;
  room_name: string | null;
  beds24_room_id: number | null;
  stay_date: string;
  availability: number | null;
  closed: number | null;
}

interface OfferPriceRow {
  room_type_id: number;
  offer_id: number | null;
  beds24_offer_id: number;
  arrival_date: string;
  departure_date: string;
  price: number | null;
}

interface OfferCandidate {
  offerId: number | null;
  beds24OfferId: number;
  nightlyPrices: AvailabilityPricesNight[];
  missingDates: string[];
  totalPrice: number | null;
}

export class AvailabilityPricesError extends Error {
  constructor(public readonly code: "availability_prices_missing_dates" | "availability_prices_invalid_date_range") {
    super(code);
  }
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLIS_PER_DAY = 86_400_000;
const GROUP_ORDER: Record<AccommodationType, number> = {
  Bungalow: 1,
  Villa: 2,
  Tent: 3,
  Other: 4,
};

function parseDateOnly(value: string): { year: number; month: number; day: number; time: number } | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return { year, month, day, time };
}

function formatDateOnly(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function addDateOnlyDays(value: string, days: number): string {
  const parsed = parseDateOnly(value);
  if (!parsed) throw new AvailabilityPricesError("availability_prices_invalid_date_range");
  return formatDateOnly(parsed.time + days * MILLIS_PER_DAY);
}

export function validateStayRange(arrival: string, departure: string): ValidatedStayRange {
  const arrivalDate = parseDateOnly(arrival);
  const departureDate = parseDateOnly(departure);
  if (!arrivalDate || !departureDate) throw new AvailabilityPricesError("availability_prices_invalid_date_range");
  if (departureDate.time <= arrivalDate.time) throw new AvailabilityPricesError("availability_prices_invalid_date_range");

  const nights = Math.round((departureDate.time - arrivalDate.time) / MILLIS_PER_DAY);
  const stayDates = Array.from({ length: nights }, (_, index) => formatDateOnly(arrivalDate.time + index * MILLIS_PER_DAY));

  return {
    arrivalDate: arrival,
    departureDate: departure,
    stayDates,
    nights,
  };
}

export function mapAccommodationType(
  unitType: string | null,
  unitName: string,
  roomTypeName: string,
): AccommodationType {
  const source = `${unitType ?? ""} ${unitName} ${roomTypeName}`.toLowerCase();
  if (source.includes("bungalow")) return "Bungalow";
  if (source.includes("villa")) return "Villa";
  if (source.includes("yurt") || source.includes("tent")) return "Tent";
  return "Other";
}

function placeholders(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

function naturalUnitNumber(unitName: string): number {
  const match = /\d+/.exec(unitName);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function compareUnits(left: UnitSourceRow, right: UnitSourceRow): number {
  return (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)
    || naturalUnitNumber(left.unit_name) - naturalUnitNumber(right.unit_name)
    || left.unit_name.localeCompare(right.unit_name, undefined, { numeric: true, sensitivity: "base" })
    || left.unit_id - right.unit_id;
}

function cacheKey(unitId: number, stayDate: string): string {
  return `${unitId}:${stayDate}`;
}

function priceKey(roomTypeId: number, arrivalDate: string): string {
  return `${roomTypeId}:${arrivalDate}`;
}

function offerCandidateKey(row: OfferPriceRow): string {
  return `${row.offer_id ?? "none"}:${row.beds24_offer_id}`;
}

async function loadAvailabilityUnitRows(db: D1Database, stayDates: string[]): Promise<UnitSourceRow[]> {
  if (stayDates.length === 0) return [];
  const rows = await db.prepare(`
    SELECT
      u.unit_id,
      u.unit_name,
      u.beds24_unit_id,
      u.unit_type,
      u.position,
      rt.room_type_id,
      COALESCE(rt.room_type_name, rt.room_name, 'Accommodation') AS room_type_name,
      rt.room_name,
      rt.beds24_room_id,
      uac.stay_date,
      uac.availability,
      uac.closed
    FROM unit_availability_cache uac
    INNER JOIN units u
      ON u.unit_id = uac.unit_id
    INNER JOIN room_types rt
      ON rt.room_type_id = u.room_type_id
    INNER JOIN properties p
      ON p.property_id = rt.property_id
    WHERE uac.stay_date IN (${placeholders(stayDates)})
      AND u.active = 1
      AND rt.active = 1
      AND p.active = 1
    ORDER BY
      rt.room_type_name,
      rt.room_type_id,
      uac.stay_date,
      u.position,
      u.unit_name,
      u.unit_id
  `).bind(...stayDates).all<UnitSourceRow>();

  return rows.results ?? [];
}

async function loadOfferPriceRows(db: D1Database, roomTypeIds: number[], stayDates: string[]): Promise<OfferPriceRow[]> {
  if (roomTypeIds.length === 0 || stayDates.length === 0) return [];
  const values = [...roomTypeIds, ...stayDates];
  const rows = await db.prepare(`
    SELECT
      room_type_id,
      offer_id,
      beds24_offer_id,
      arrival_date,
      departure_date,
      price
    FROM offer_prices
    WHERE room_type_id IN (${placeholders(roomTypeIds)})
      AND arrival_date IN (${placeholders(stayDates)})
    ORDER BY room_type_id, beds24_offer_id, arrival_date
  `).bind(...values).all<OfferPriceRow>();

  return rows.results ?? [];
}

function selectPricingForRoomType(rows: OfferPriceRow[], stayDates: string[], nights: number): AvailabilityPricesPricing {
  const rowsByOffer = new Map<string, { offerId: number | null; beds24OfferId: number; byDate: Map<string, OfferPriceRow> }>();

  for (const row of rows) {
    if (row.price === null) continue;
    if (row.departure_date !== addDateOnlyDays(row.arrival_date, 1)) continue;
    const key = offerCandidateKey(row);
    const current = rowsByOffer.get(key) ?? {
      offerId: row.offer_id,
      beds24OfferId: row.beds24_offer_id,
      byDate: new Map<string, OfferPriceRow>(),
    };
    current.byDate.set(row.arrival_date, row);
    rowsByOffer.set(key, current);
  }

  const candidates: OfferCandidate[] = [...rowsByOffer.values()].map((candidate) => {
    const nightlyPrices: AvailabilityPricesNight[] = [];
    const missingDates: string[] = [];

    for (const stayDate of stayDates) {
      const row = candidate.byDate.get(stayDate);
      if (!row || row.price === null) {
        missingDates.push(stayDate);
      } else {
        nightlyPrices.push({ date: stayDate, amount: row.price });
      }
    }

    return {
      offerId: candidate.offerId,
      beds24OfferId: candidate.beds24OfferId,
      nightlyPrices,
      missingDates,
      totalPrice: missingDates.length === 0 ? nightlyPrices.reduce((sum, night) => sum + night.amount, 0) : null,
    };
  });

  const completeCandidates = candidates
    .filter((candidate) => candidate.missingDates.length === 0 && candidate.totalPrice !== null)
    .sort((left, right) =>
      (left.totalPrice ?? Number.MAX_SAFE_INTEGER) - (right.totalPrice ?? Number.MAX_SAFE_INTEGER)
      || left.beds24OfferId - right.beds24OfferId
    );

  const selected = completeCandidates[0];
  if (selected && selected.totalPrice !== null) {
    return {
      status: "AVAILABLE",
      offerId: selected.offerId,
      beds24OfferId: selected.beds24OfferId,
      averageNightlyPrice: selected.totalPrice / nights,
      totalPrice: selected.totalPrice,
      nightlyPrices: selected.nightlyPrices,
      missingDates: [],
    };
  }

  const closestPartial = candidates
    .sort((left, right) =>
      left.missingDates.length - right.missingDates.length
      || left.beds24OfferId - right.beds24OfferId
    )[0];

  return {
    status: "MISSING",
    offerId: null,
    beds24OfferId: null,
    averageNightlyPrice: null,
    totalPrice: null,
    nightlyPrices: [],
    missingDates: closestPartial?.missingDates.length ? closestPartial.missingDates : stayDates,
  };
}

function unitCacheIsAvailable(unit: UnitSourceRow, range: ValidatedStayRange, availabilityByUnitDate: Map<string, UnitSourceRow>): { available: boolean; unknown: boolean } {
  let unknown = false;

  for (const stayDate of range.stayDates) {
    const row = availabilityByUnitDate.get(cacheKey(unit.unit_id, stayDate));
    if (!row || row.availability === null) {
      unknown = true;
      continue;
    }
    if (row.availability !== 1 || row.closed === 1) return { available: false, unknown };
  }

  return { available: !unknown, unknown };
}

function groupRoomTypeRows(rows: UnitSourceRow[]): Map<number, UnitSourceRow[]> {
  const grouped = new Map<number, UnitSourceRow[]>();
  const seenUnits = new Set<number>();
  for (const row of rows) {
    if (seenUnits.has(row.unit_id)) continue;
    seenUnits.add(row.unit_id);
    grouped.set(row.room_type_id, [...(grouped.get(row.room_type_id) ?? []), row]);
  }
  return grouped;
}

export async function getAvailabilityPrices(
  db: D1Database,
  query: AvailabilityPricesQuery,
): Promise<AvailabilityPricesResult> {
  if (!query.arrival || !query.departure) throw new AvailabilityPricesError("availability_prices_missing_dates");

  const range = validateStayRange(query.arrival, query.departure);
  const units = await loadAvailabilityUnitRows(db, range.stayDates);
  const availabilityByUnitDate = new Map(units.map((row) => [cacheKey(row.unit_id, row.stay_date), row]));

  const roomTypeIds = [...new Set(units.map((unit) => unit.room_type_id))];
  const offerRows = await loadOfferPriceRows(db, roomTypeIds, range.stayDates);
  const offerRowsByRoomTypeDate = new Map<string, OfferPriceRow[]>();
  for (const row of offerRows) {
    const key = priceKey(row.room_type_id, row.arrival_date);
    offerRowsByRoomTypeDate.set(key, [...(offerRowsByRoomTypeDate.get(key) ?? []), row]);
  }

  const groups: AvailabilityPricesGroup[] = [];
  for (const [roomTypeId, roomTypeUnits] of groupRoomTypeRows(units)) {
    const orderedUnits = roomTypeUnits.slice().sort(compareUnits);
    const firstUnit = orderedUnits[0]!;
    const availableUnits: AvailabilityPricesUnit[] = [];
    let missingRelevantCacheRows = false;

    for (const unit of orderedUnits) {
      const folded = unitCacheIsAvailable(unit, range, availabilityByUnitDate);
      if (folded.unknown) missingRelevantCacheRows = true;
      if (!folded.available) continue;

      availableUnits.push({
        unitId: unit.unit_id,
        unitName: unit.unit_name,
        beds24UnitId: unit.beds24_unit_id,
      });
    }

    const roomTypeOfferRows = range.stayDates.flatMap((stayDate) => offerRowsByRoomTypeDate.get(priceKey(roomTypeId, stayDate)) ?? []);
    const availabilityStatus: AvailabilityStatus = availableUnits.length > 0
      ? "AVAILABLE"
      : missingRelevantCacheRows
        ? "UNKNOWN"
        : "UNAVAILABLE";

    groups.push({
      accommodationType: mapAccommodationType(firstUnit.unit_type, firstUnit.unit_name, firstUnit.room_type_name),
      roomTypeId,
      roomTypeName: firstUnit.room_type_name,
      beds24RoomId: firstUnit.beds24_room_id,
      availabilityStatus,
      availableCount: availableUnits.length,
      totalUnits: orderedUnits.length,
      availableUnits,
      pricing: selectPricingForRoomType(roomTypeOfferRows, range.stayDates, range.nights),
    });
  }

  groups.sort((left, right) =>
    GROUP_ORDER[left.accommodationType] - GROUP_ORDER[right.accommodationType]
    || left.roomTypeName.localeCompare(right.roomTypeName, undefined, { numeric: true, sensitivity: "base" })
    || left.roomTypeId - right.roomTypeId
  );

  return {
    arrivalDate: range.arrivalDate,
    departureDate: range.departureDate,
    nights: range.nights,
    currency: "THB",
    generatedAt: new Date().toISOString(),
    groups,
  };
}
