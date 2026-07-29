export interface AvailabilityReadBindings {
  DB: D1Database;
}

interface AvailabilityRow {
  property_id: number;
  property_name: string;
  room_type_id: number;
  room_type_name: string | null;
  unit_id: number;
  unit_name: string;
  stay_date: string;
  availability: number | null;
  closed: number;
  minimum_stay: number | null;
  maximum_stay: number | null;
  restrictions: string | null;
  synced_at: string;
}

export interface AvailabilityItem {
  property: { id: number; name: string };
  roomType: { id: number; name: string };
  unit: { id: number; name: string };
  date: string;
  status: "available" | "unavailable" | "unknown";
  availability: boolean | null;
  closed: boolean;
  minimumStay: number | null;
  maximumStay: number | null;
  restrictions: unknown | null;
  syncedAt: string;
}

export interface AvailabilityQuery {
  from?: string;
  to?: string;
  unitId?: number;
  date?: string;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseRestrictions(value: string | null): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function status(row: AvailabilityRow): "available" | "unavailable" | "unknown" {
  if (row.availability === null) return "unknown";
  return row.availability === 1 && row.closed === 0 ? "available" : "unavailable";
}

function mapRow(row: AvailabilityRow): AvailabilityItem {
  return {
    property: { id: row.property_id, name: row.property_name },
    roomType: { id: row.room_type_id, name: row.room_type_name ?? "Room type unavailable" },
    unit: { id: row.unit_id, name: row.unit_name },
    date: row.stay_date,
    status: status(row),
    availability: row.availability === null ? null : row.availability === 1,
    closed: row.closed === 1,
    minimumStay: row.minimum_stay,
    maximumStay: row.maximum_stay,
    restrictions: parseRestrictions(row.restrictions),
    syncedAt: row.synced_at,
  };
}

export function validateDateParam(value: string, name: string): void {
  if (!isDateOnly(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format.`);
  }
}

export async function getAvailability(
  env: AvailabilityReadBindings,
  query: AvailabilityQuery = {},
): Promise<AvailabilityItem[]> {
  const filters: string[] = [];
  const values: Array<string | number> = [];

  if (query.from) {
    validateDateParam(query.from, "from");
    filters.push("uac.stay_date >= ?");
    values.push(query.from);
  }

  if (query.to) {
    validateDateParam(query.to, "to");
    filters.push("uac.stay_date <= ?");
    values.push(query.to);
  }

  if (query.date) {
    validateDateParam(query.date, "date");
    filters.push("uac.stay_date = ?");
    values.push(query.date);
  }

  if (query.unitId !== undefined) {
    filters.push("uac.unit_id = ?");
    values.push(query.unitId);
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await env.DB.prepare(`
    SELECT
      uac.property_id,
      p.property_name,
      uac.room_type_id,
      rt.room_type_name,
      uac.unit_id,
      u.unit_name,
      uac.stay_date,
      uac.availability,
      uac.closed,
      uac.minimum_stay,
      uac.maximum_stay,
      uac.restrictions,
      uac.synced_at
    FROM unit_availability_cache uac
    INNER JOIN properties p ON p.property_id = uac.property_id
    INNER JOIN room_types rt ON rt.room_type_id = uac.room_type_id
    INNER JOIN units u ON u.unit_id = uac.unit_id
    ${where}
    ORDER BY uac.stay_date, p.property_name, rt.room_type_name, u.unit_name
    LIMIT 500
  `).bind(...values).all<AvailabilityRow>();

  return (result.results ?? []).map(mapRow);
}
