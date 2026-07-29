import {
  beds24Get,
  type Beds24Bindings,
} from "./beds24-client.service.js";

export interface OfferPricesSyncBindings extends Beds24Bindings {
  DB: D1Database;
}

interface RoomTypeRow {
  room_type_id: number;
  property_id: number;
  beds24_property_id: number;
  beds24_room_id: number;
  currency: string | null;
}

interface Beds24OfferResult {
  offerId: number;
  offerName?: string;
  price?: number;
  unitsAvailable?: number;
  [key: string]: unknown;
}

interface Beds24RoomOfferResult {
  roomId: number;
  propertyId: number;
  offers?: Beds24OfferResult[];
  [key: string]: unknown;
}

interface Beds24OffersResponse {
  success?: boolean;
  data?: Beds24RoomOfferResult[];
  error?: string;
  [key: string]: unknown;
}

export interface OfferPricesSyncOptions {
  batchDays?: number;
  startOffset?: number;
}

export interface OfferPricesSyncResult {
  ok: true;
  horizonDays: number;
  batchDays: number;
  startOffset: number;
  nextOffset: number;
  datesProcessed: number;
  apiRequests: number;
  recordsRead: number;
  recordsWritten: number;
  startedAt: string;
  finishedAt: string;
}

const HORIZON_DAYS = 30;
const DEFAULT_BATCH_DAYS = 30;
const MAX_BATCH_DAYS = 30;
const CURSOR_NAME = "offer_prices_day_offset";
const FULL_SYNC_STATE = "offer_prices_full_sync_state";

function clampBatchDays(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_DAYS;
  return Math.min(MAX_BATCH_DAYS, Math.max(1, Math.trunc(value as number)));
}

function normalizeOffset(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(HORIZON_DAYS, Math.max(0, Math.trunc(value as number)));
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function getRoomTypes(env: OfferPricesSyncBindings): Promise<RoomTypeRow[]> {
  const result = await env.DB.prepare(`
    SELECT
      rt.room_type_id,
      rt.property_id,
      p.beds24_property_id,
      rt.beds24_room_id,
      p.currency
    FROM room_types rt
    INNER JOIN properties p ON p.property_id = rt.property_id
    WHERE rt.active = 1 AND p.active = 1
    ORDER BY p.beds24_property_id, rt.beds24_room_id
  `).all<RoomTypeRow>();
  return result.results ?? [];
}

function groupByProperty(roomTypes: RoomTypeRow[]): Map<number, RoomTypeRow[]> {
  const groups = new Map<number, RoomTypeRow[]>();
  for (const roomType of roomTypes) {
    const current = groups.get(roomType.beds24_property_id) ?? [];
    current.push(roomType);
    groups.set(roomType.beds24_property_id, current);
  }
  return groups;
}

export async function setFullOfferSyncState(
  env: OfferPricesSyncBindings,
  state: "running" | "idle" | "failed",
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO sync_cursors (cursor_name, cursor_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT (cursor_name) DO UPDATE SET
      cursor_value = excluded.cursor_value,
      updated_at = excluded.updated_at
  `).bind(FULL_SYNC_STATE, state, new Date().toISOString()).run();
}

export async function getFullOfferSyncState(
  env: OfferPricesSyncBindings,
): Promise<{ state: string; updatedAt: string | null }> {
  const row = await env.DB.prepare(`
    SELECT cursor_value, updated_at
    FROM sync_cursors
    WHERE cursor_name = ?
  `).bind(FULL_SYNC_STATE).first<{ cursor_value: string; updated_at: string | null }>();
  return { state: row?.cursor_value ?? "idle", updatedAt: row?.updated_at ?? null };
}

export async function syncOfferPrices(
  env: OfferPricesSyncBindings,
  options: OfferPricesSyncOptions = {},
): Promise<OfferPricesSyncResult> {
  const startedAt = new Date().toISOString();
  const startOffset = normalizeOffset(options.startOffset);
  const requestedDays = clampBatchDays(options.batchDays);
  const batchDays = Math.min(requestedDays, HORIZON_DAYS - startOffset);
  let apiRequests = 0;
  let recordsRead = 0;
  let recordsWritten = 0;

  try {
    const roomTypes = await getRoomTypes(env);
    if (roomTypes.length === 0) {
      throw new Error("No active room types found. Run POST /sync/properties first.");
    }

    const properties = groupByProperty(roomTypes);
    const baseDate = todayUtc();

    for (let dayIndex = 0; dayIndex < batchDays; dayIndex += 1) {
      const offset = startOffset + dayIndex;
      const arrival = toDateOnly(addUtcDays(baseDate, offset));
      const departure = toDateOnly(addUtcDays(baseDate, offset + 1));

      for (const [beds24PropertyId, propertyRoomTypes] of properties) {
        const response = await beds24Get<Beds24OffersResponse>(
          env,
          "/inventory/rooms/offers",
          {
            propertyId: beds24PropertyId,
            arrival,
            departure,
            numAdults: 2,
          },
        );
        apiRequests += 1;

        if (response.success === false) {
          throw new Error(
            `Beds24 offers error for property ${beds24PropertyId}, ${arrival} to ${departure}: ` +
            `${response.error ?? "success=false"}`,
          );
        }

        const returnedRooms = Array.isArray(response.data) ? response.data : [];
        const returnedByRoom = new Map(returnedRooms.map((room) => [room.roomId, room]));

        for (const roomType of propertyRoomTypes) {
          const roomResult = returnedByRoom.get(roomType.beds24_room_id);
          const returnedOffers = Array.isArray(roomResult?.offers) ? roomResult.offers : [];
          recordsRead += returnedOffers.length;

          const statements: D1PreparedStatement[] = [];
          const returnedOfferIds = returnedOffers.map((offer) => offer.offerId);

          if (returnedOfferIds.length === 0) {
            statements.push(env.DB.prepare(`
              DELETE FROM offer_prices
              WHERE room_type_id = ? AND arrival_date = ? AND departure_date = ?
            `).bind(roomType.room_type_id, arrival, departure));
          } else {
            const placeholders = returnedOfferIds.map(() => "?").join(", ");
            statements.push(env.DB.prepare(`
              DELETE FROM offer_prices
              WHERE room_type_id = ?
                AND arrival_date = ?
                AND departure_date = ?
                AND beds24_offer_id NOT IN (${placeholders})
            `).bind(roomType.room_type_id, arrival, departure, ...returnedOfferIds));
          }

          for (const offer of returnedOffers) {
            const rawJson = JSON.stringify({
              roomId: roomType.beds24_room_id,
              propertyId: roomType.beds24_property_id,
              ...offer,
            });

            statements.push(env.DB.prepare(`
              INSERT INTO offer_prices (
                room_type_id, offer_id, beds24_offer_id,
                arrival_date, departure_date, price, units_available,
                currency, raw_json, synced_at, created_at, updated_at
              )
              VALUES (
                ?,
                (SELECT offer_id FROM offers WHERE room_type_id = ? AND beds24_offer_id = ?),
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              )
              ON CONFLICT (room_type_id, beds24_offer_id, arrival_date, departure_date)
              DO UPDATE SET
                offer_id = excluded.offer_id,
                price = excluded.price,
                units_available = excluded.units_available,
                currency = excluded.currency,
                raw_json = excluded.raw_json,
                synced_at = excluded.synced_at,
                updated_at = excluded.updated_at
            `).bind(
              roomType.room_type_id,
              roomType.room_type_id,
              offer.offerId,
              offer.offerId,
              arrival,
              departure,
              typeof offer.price === "number" ? offer.price : null,
              typeof offer.unitsAvailable === "number" ? offer.unitsAvailable : null,
              roomType.currency,
              rawJson,
              startedAt,
              startedAt,
              startedAt,
            ));
          }

          const results = await env.DB.batch(statements);
          for (const result of results) recordsWritten += result.meta?.changes ?? 0;
        }
      }
    }

    const nextOffset = startOffset + batchDays;
    const finishedAt = new Date().toISOString();
    const finalResults = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO sync_cursors (cursor_name, cursor_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT (cursor_name) DO UPDATE SET
          cursor_value = excluded.cursor_value,
          updated_at = excluded.updated_at
      `).bind(CURSOR_NAME, String(nextOffset >= HORIZON_DAYS ? 0 : nextOffset), finishedAt),
      env.DB.prepare(`DELETE FROM offer_prices WHERE departure_date <= ?`).bind(toDateOnly(baseDate)),
      env.DB.prepare(`DELETE FROM offer_prices WHERE arrival_date >= ?`).bind(toDateOnly(addUtcDays(baseDate, HORIZON_DAYS))),
      env.DB.prepare(`
        INSERT INTO sync_runs (
          sync_type, started_at, finished_at, status,
          records_read, records_written, records_failed, error_message
        ) VALUES (?, ?, ?, 'success', ?, ?, 0, NULL)
      `).bind("offer_prices", startedAt, finishedAt, recordsRead, recordsWritten),
    ]);
    recordsWritten += finalResults[0]?.meta?.changes ?? 0;
    recordsWritten += finalResults[1]?.meta?.changes ?? 0;
    recordsWritten += finalResults[2]?.meta?.changes ?? 0;

    return {
      ok: true,
      horizonDays: HORIZON_DAYS,
      batchDays,
      startOffset,
      nextOffset,
      datesProcessed: batchDays,
      apiRequests,
      recordsRead,
      recordsWritten,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown offer prices sync error";
    try {
      await env.DB.prepare(`
        INSERT INTO sync_runs (
          sync_type, started_at, finished_at, status,
          records_read, records_written, records_failed, error_message
        ) VALUES (?, ?, ?, 'failed', ?, ?, 1, ?)
      `).bind("offer_prices", startedAt, finishedAt, recordsRead, recordsWritten, message).run();
    } catch (logError) {
      console.error("Unable to record failed offer prices sync:", logError);
    }
    throw error;
  }
}
