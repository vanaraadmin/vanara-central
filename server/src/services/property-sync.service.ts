import {
  beds24Get,
  type Beds24Bindings,
} from "./beds24-client.service.js";
import { sanitizeLogMessage } from "./log-safety.service.js";
import {
  acquireSyncLock,
  recordSkippedSyncRun,
  releaseSyncLock,
} from "./sync-lock.service.js";

export interface PropertySyncBindings extends Beds24Bindings {
  DB: D1Database;
}

interface Beds24Unit {
  id: number;
  name: string;
  statusText?: string;
  statusColor?: string | null;
  notes?: string;
  [key: string]: unknown;
}

interface Beds24OfferRule {
  type?: string;
  days?: number;
  daysBeforeArrivalValue?: number;
  [key: string]: unknown;
}

interface Beds24Offer {
  offerId: number;
  enable?: string;
  name?: string;
  position?: number;
  bookingType?: string;
  minimumStay?: Beds24OfferRule;
  allowCancellation?: Beds24OfferRule;
  [key: string]: unknown;
}

interface Beds24RoomType {
  id: number;
  propertyId: number;
  name: string;
  roomType?: string;
  maxPeople?: number;
  units?: Beds24Unit[];
  offers?: Beds24Offer[];
  [key: string]: unknown;
}

interface Beds24Property {
  id: number;
  name: string;
  currency?: string;
  timezone?: string;
  roomTypes?: Beds24RoomType[];
  [key: string]: unknown;
}

interface Beds24PropertiesResponse {
  success?: boolean;
  data?: Beds24Property[];
  [key: string]: unknown;
}

export interface PropertySyncResult {
  ok: true;
  propertyCount: number;
  roomTypeCount: number;
  unitCount: number;
  offerCount: number;
  recordsWritten: number;
  startedAt: string;
  finishedAt: string;
  skipped?: boolean;
  skippedReason?: string;
}

function normalizeUnitType(
  roomType: string | undefined,
): "bungalow" | "villa" | "yurt" | "other" {
  switch (roomType) {
    case "bungalow":
      return "bungalow";
    case "villa":
      return "villa";
    case "tent":
      return "yurt";
    default:
      return "other";
  }
}

function getRuleDays(rule: Beds24OfferRule | undefined): number | null {
  if (!rule) {
    return null;
  }

  const value = rule.days ?? rule.daysBeforeArrivalValue;

  return typeof value === "number" ? value : null;
}

export async function fetchProperties(
  env: PropertySyncBindings,
): Promise<Beds24PropertiesResponse> {
  return beds24Get<Beds24PropertiesResponse>(
    env,
    "/properties",
    {
      includeAllRooms: true,
      includeOffers: true,
    },
  );
}

export async function syncProperties(
  env: PropertySyncBindings,
): Promise<PropertySyncResult> {
  const startedAt = new Date().toISOString();
  const lock = await acquireSyncLock(env, "properties", startedAt, 5 * 60 * 1_000);
  if (!lock) {
    const reason = "Properties synchronization already running.";
    await recordSkippedSyncRun(env, "properties", startedAt, reason);
    return {
      ok: true,
      propertyCount: 0,
      roomTypeCount: 0,
      unitCount: 0,
      offerCount: 0,
      recordsWritten: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      skipped: true,
      skippedReason: reason,
    };
  }

  try {
    const response = await fetchProperties(env);

    if (response.success === false) {
      throw new Error("Beds24 returned success=false for /properties.");
    }

    const properties = Array.isArray(response.data)
      ? response.data
      : [];

    if (properties.length === 0) {
      throw new Error("Beds24 /properties returned no properties.");
    }

    const statements: D1PreparedStatement[] = [];
    let roomTypeCount = 0;
    let unitCount = 0;
    let offerCount = 0;

    for (const property of properties) {
      statements.push(
        env.DB.prepare(`
          INSERT INTO properties (
            beds24_property_id,
            property_name,
            timezone,
            currency,
            active,
            raw_json,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, 1, ?, ?, ?)
          ON CONFLICT (beds24_property_id) DO UPDATE SET
            property_name = excluded.property_name,
            timezone = excluded.timezone,
            currency = excluded.currency,
            active = 1,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
        `).bind(
          property.id,
          property.name,
          property.timezone ?? null,
          property.currency ?? null,
          JSON.stringify(property),
          startedAt,
          startedAt,
        ),
      );

      const roomTypes = Array.isArray(property.roomTypes)
        ? property.roomTypes
        : [];

      for (const roomType of roomTypes) {
        roomTypeCount += 1;

        statements.push(
          env.DB.prepare(`
            INSERT INTO room_types (
              property_id,
              beds24_room_id,
              room_name,
              room_type_code,
              room_type_name,
              max_people,
              active,
              raw_json,
              created_at,
              updated_at
            )
            VALUES (
              (
                SELECT property_id
                FROM properties
                WHERE beds24_property_id = ?
              ),
              ?, ?, ?, ?, ?, 1, ?, ?, ?
            )
            ON CONFLICT (beds24_room_id) DO UPDATE SET
              property_id = excluded.property_id,
              room_name = excluded.room_name,
              room_type_code = excluded.room_type_code,
              room_type_name = excluded.room_type_name,
              max_people = excluded.max_people,
              active = 1,
              raw_json = excluded.raw_json,
              updated_at = excluded.updated_at
          `).bind(
            property.id,
            roomType.id,
            roomType.name,
            roomType.roomType ?? null,
            roomType.name,
            roomType.maxPeople ?? null,
            JSON.stringify(roomType),
            startedAt,
            startedAt,
          ),
        );

        const units = Array.isArray(roomType.units)
          ? roomType.units
          : [];

        units.forEach((unit, index) => {
          unitCount += 1;

          statements.push(
            env.DB.prepare(`
              INSERT INTO units (
                room_type_id,
                beds24_unit_id,
                unit_name,
                unit_type,
                position,
                active,
                raw_json,
                created_at,
                updated_at
              )
              VALUES (
                (
                  SELECT room_type_id
                  FROM room_types
                  WHERE beds24_room_id = ?
                ),
                ?, ?, ?, ?, 1, ?, ?, ?
              )
              ON CONFLICT (room_type_id, beds24_unit_id) DO UPDATE SET
                unit_name = excluded.unit_name,
                unit_type = excluded.unit_type,
                position = excluded.position,
                active = 1,
                raw_json = excluded.raw_json,
                updated_at = excluded.updated_at
            `).bind(
              roomType.id,
              unit.id,
              unit.name,
              normalizeUnitType(roomType.roomType),
              index + 1,
              JSON.stringify(unit),
              startedAt,
              startedAt,
            ),
          );
        });

        const offers = Array.isArray(roomType.offers)
          ? roomType.offers
          : [];

        for (const offer of offers) {
          offerCount += 1;

          statements.push(
            env.DB.prepare(`
              INSERT INTO offers (
                room_type_id,
                beds24_offer_id,
                offer_name,
                enabled_mode,
                position,
                booking_type,
                minimum_stay_type,
                minimum_stay_days,
                cancellation_type,
                cancellation_days_before_arrival,
                active,
                raw_json,
                created_at,
                updated_at
              )
              VALUES (
                (
                  SELECT room_type_id
                  FROM room_types
                  WHERE beds24_room_id = ?
                ),
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              )
              ON CONFLICT (room_type_id, beds24_offer_id) DO UPDATE SET
                offer_name = excluded.offer_name,
                enabled_mode = excluded.enabled_mode,
                position = excluded.position,
                booking_type = excluded.booking_type,
                minimum_stay_type = excluded.minimum_stay_type,
                minimum_stay_days = excluded.minimum_stay_days,
                cancellation_type = excluded.cancellation_type,
                cancellation_days_before_arrival =
                  excluded.cancellation_days_before_arrival,
                active = excluded.active,
                raw_json = excluded.raw_json,
                updated_at = excluded.updated_at
            `).bind(
              roomType.id,
              offer.offerId,
              offer.name || null,
              offer.enable ?? null,
              offer.position ?? null,
              offer.bookingType ?? null,
              offer.minimumStay?.type ?? null,
              getRuleDays(offer.minimumStay),
              offer.allowCancellation?.type ?? null,
              getRuleDays(offer.allowCancellation),
              offer.enable === "no" ? 0 : 1,
              JSON.stringify(offer),
              startedAt,
              startedAt,
            ),
          );
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const recordsWritten =
      properties.length +
      roomTypeCount +
      unitCount +
      offerCount;

    statements.push(
      env.DB.prepare(`
        INSERT INTO sync_runs (
          sync_type,
          started_at,
          finished_at,
          status,
          records_read,
          records_written,
          records_failed,
          error_message
        )
        VALUES (?, ?, ?, 'success', ?, ?, 0, NULL)
      `).bind(
        "properties",
        startedAt,
        finishedAt,
        recordsWritten,
        recordsWritten,
      ),
    );

    await env.DB.batch(statements);

    return {
      ok: true,
      propertyCount: properties.length,
      roomTypeCount,
      unitCount,
      offerCount,
      recordsWritten,
      startedAt,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = sanitizeLogMessage(error, "Unknown properties sync error");

    try {
      await env.DB.prepare(`
        INSERT INTO sync_runs (
          sync_type,
          started_at,
          finished_at,
          status,
          records_read,
          records_written,
          records_failed,
          error_message
        )
        VALUES (?, ?, ?, 'failed', 0, 0, 1, ?)
      `).bind(
        "properties",
        startedAt,
        finishedAt,
        message,
      ).run();
    } catch (logError) {
      console.error("Unable to record failed properties sync:", sanitizeLogMessage(logError, "Unknown D1 logging error"));
    }

    throw error;
  } finally {
    if (lock) {
      await releaseSyncLock(env, lock);
    }
  }
}
