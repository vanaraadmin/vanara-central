import { ForbiddenError, type CurrentUser } from "./current-user.service.js";

export type OperationalAvailabilityStatus = "OPERATING" | "NOT_OPERATING";

export interface RoomOperationalAvailability {
  status: OperationalAvailabilityStatus;
  reason: string | null;
  seasonalStart: string | null;
  seasonalEnd: string | null;
  seasonalLabel: string | null;
  updatedAt: string | null;
}

export interface RoomOperationalAvailabilityInput {
  status: OperationalAvailabilityStatus;
  reason: string | null;
  seasonalStart: string | null;
  seasonalEnd: string | null;
  idempotencyKey: string | null;
}

interface RoomOperationalAvailabilityRow {
  unit_id: number;
  status: OperationalAvailabilityStatus;
  reason: string | null;
  seasonal_start: string | null;
  seasonal_end: string | null;
  updated_at: string;
}

interface UnitExistsRow {
  unit_id: number;
}

export interface RoomOperationalStateBindings {
  DB: D1Database;
}

const DATE_PART_RE = /^\d{2}-\d{2}$/;

export function canChangeOperationalAvailability(user: CurrentUser): boolean {
  return user.role === "Owner" || user.role === "Manager";
}

function monthDayLabel(value: string | null): string | null {
  if (!value || !DATE_PART_RE.test(value)) return null;
  const [month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(2026, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(date);
}

export function defaultOperationalAvailability(): RoomOperationalAvailability {
  return {
    status: "OPERATING",
    reason: null,
    seasonalStart: null,
    seasonalEnd: null,
    seasonalLabel: null,
    updatedAt: null,
  };
}

function mapAvailability(row: RoomOperationalAvailabilityRow | null | undefined): RoomOperationalAvailability {
  if (!row) return defaultOperationalAvailability();
  const start = monthDayLabel(row.seasonal_start);
  const end = monthDayLabel(row.seasonal_end);
  return {
    status: row.status,
    reason: row.reason,
    seasonalStart: row.seasonal_start,
    seasonalEnd: row.seasonal_end,
    seasonalLabel: start && end ? `${start} - ${end}` : null,
    updatedAt: row.updated_at,
  };
}

export async function loadOperationalAvailabilityForUnit(env: RoomOperationalStateBindings, unitId: number): Promise<RoomOperationalAvailability> {
  const row = await env.DB.prepare(`
    SELECT unit_id, status, reason, seasonal_start, seasonal_end, updated_at
    FROM room_operational_availability
    WHERE unit_id = ?
  `).bind(unitId).first<RoomOperationalAvailabilityRow>();
  return mapAvailability(row);
}

export async function loadOperationalAvailabilityMap(env: RoomOperationalStateBindings): Promise<Map<number, RoomOperationalAvailability>> {
  const rows = await env.DB.prepare(`
    SELECT unit_id, status, reason, seasonal_start, seasonal_end, updated_at
    FROM room_operational_availability
  `).all<RoomOperationalAvailabilityRow>();
  return new Map((rows.results ?? []).map((row) => [row.unit_id, mapAvailability(row)]));
}

export function normalizeRoomOperationalAvailabilityInput(payload: unknown): RoomOperationalAvailabilityInput {
  if (!payload || typeof payload !== "object") throw new Error("Operational availability payload is required.");
  const allowed = ["status", "reason", "seasonalStart", "seasonalEnd", "idempotencyKey"];
  const unknown = Object.keys(payload).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Operational availability payload contains unsupported field: ${unknown}.`);
  const data = payload as Record<string, unknown>;
  const rawStatus = typeof data.status === "string" ? data.status.trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_") : "";
  if (rawStatus !== "OPERATING" && rawStatus !== "NOT_OPERATING") throw new Error("Operational availability status is invalid.");
  const reason = typeof data.reason === "string" && data.reason.trim() ? data.reason.trim().slice(0, 500) : null;
  const seasonalStart = normalizeSeasonalDatePart(data.seasonalStart, "seasonalStart");
  const seasonalEnd = normalizeSeasonalDatePart(data.seasonalEnd, "seasonalEnd");
  const idempotencyKey = typeof data.idempotencyKey === "string" && data.idempotencyKey.trim() ? data.idempotencyKey.trim().slice(0, 200) : null;
  return { status: rawStatus, reason, seasonalStart, seasonalEnd, idempotencyKey };
}

function normalizeSeasonalDatePart(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE_PART_RE.test(value.trim())) throw new Error(`${label} must use MM-DD format.`);
  const [month, day] = value.trim().split("-").map(Number);
  const parsed = new Date(Date.UTC(2026, month - 1, day));
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error(`${label} is invalid.`);
  return value.trim();
}

export async function updateRoomOperationalAvailability(env: RoomOperationalStateBindings, unitId: number, input: RoomOperationalAvailabilityInput, user: CurrentUser): Promise<RoomOperationalAvailability | null> {
  if (!canChangeOperationalAvailability(user)) throw new ForbiddenError("Owner or Manager access is required.");

  const unit = await env.DB.prepare("SELECT unit_id FROM units WHERE unit_id = ? AND active = 1").bind(unitId).first<UnitExistsRow>();
  if (!unit) return null;

  const previous = await loadOperationalAvailabilityForUnit(env, unitId);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO room_operational_availability (
      unit_id, status, reason, seasonal_start, seasonal_end,
      updated_by, updated_by_name, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(unit_id) DO UPDATE SET
      status = excluded.status,
      reason = excluded.reason,
      seasonal_start = excluded.seasonal_start,
      seasonal_end = excluded.seasonal_end,
      updated_by = excluded.updated_by,
      updated_by_name = excluded.updated_by_name,
      updated_at = excluded.updated_at
  `).bind(
    unitId,
    input.status,
    input.reason,
    input.seasonalStart,
    input.seasonalEnd,
    user.id,
    user.displayName,
    now,
    now,
  ).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO room_operational_availability_events (
      unit_id, event_type, actor_user_id, actor_name,
      previous_status, new_status, previous_reason, new_reason,
      previous_seasonal_start, new_seasonal_start, previous_seasonal_end, new_seasonal_end,
      idempotency_key, created_at
    )
    VALUES (?, 'availability_changed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    unitId,
    user.id,
    user.displayName,
    previous.status,
    input.status,
    previous.reason,
    input.reason,
    previous.seasonalStart,
    input.seasonalStart,
    previous.seasonalEnd,
    input.seasonalEnd,
    input.idempotencyKey ?? `room-operational-availability:${unitId}:${now}`,
    now,
  ).run();

  return loadOperationalAvailabilityForUnit(env, unitId);
}
