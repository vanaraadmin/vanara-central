import type { CurrentUser } from "./current-user.service.js";

export type RoomReadyState = "READY" | "NOT_READY";

export interface RoomHousekeepingState {
  readyState: RoomReadyState;
  reason: string | null;
  source: string | null;
  updatedAt: string | null;
}

export interface RoomHousekeepingStateBindings {
  DB: D1Database;
}

type RoomHousekeepingActor = Pick<CurrentUser, "id" | "displayName"> | { id: string | null; displayName: string | null };

interface RoomHousekeepingStateRow {
  unit_id: number;
  ready_state: RoomReadyState;
  reason: string | null;
  source: string | null;
  updated_at: string;
}

export function defaultRoomHousekeepingState(): RoomHousekeepingState {
  return {
    readyState: "READY",
    reason: null,
    source: null,
    updatedAt: null,
  };
}

function mapRoomHousekeepingState(row: RoomHousekeepingStateRow | null | undefined): RoomHousekeepingState {
  if (!row) return defaultRoomHousekeepingState();
  return {
    readyState: row.ready_state,
    reason: row.reason,
    source: row.source,
    updatedAt: row.updated_at,
  };
}

function actorId(actor?: RoomHousekeepingActor | null): string | null {
  return actor?.id ?? null;
}

function actorName(actor?: RoomHousekeepingActor | null): string | null {
  return actor?.displayName ?? null;
}

export async function loadRoomHousekeepingStateForUnit(env: RoomHousekeepingStateBindings, unitId: number): Promise<RoomHousekeepingState> {
  const row = await env.DB.prepare(`
    SELECT unit_id, ready_state, reason, source, updated_at
    FROM room_housekeeping_state
    WHERE unit_id = ?
  `).bind(unitId).first<RoomHousekeepingStateRow>();
  return mapRoomHousekeepingState(row);
}

export async function setRoomHousekeepingState(
  env: RoomHousekeepingStateBindings,
  unitId: number,
  readyState: RoomReadyState,
  reason: string | null,
  source: string,
  actor?: RoomHousekeepingActor | null,
  idempotencyKey?: string | null,
  now = new Date().toISOString(),
): Promise<RoomHousekeepingState> {
  const previous = await loadRoomHousekeepingStateForUnit(env, unitId);
  await env.DB.prepare(`
    INSERT INTO room_housekeeping_state (
      unit_id, ready_state, reason, source, updated_by, updated_by_name, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(unit_id) DO UPDATE SET
      ready_state = excluded.ready_state,
      reason = excluded.reason,
      source = excluded.source,
      updated_by = excluded.updated_by,
      updated_by_name = excluded.updated_by_name,
      updated_at = excluded.updated_at
  `).bind(
    unitId,
    readyState,
    reason,
    source,
    actorId(actor),
    actorName(actor),
    now,
    now,
  ).run();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO room_housekeeping_state_events (
      unit_id, event_type, actor_user_id, actor_name,
      previous_ready_state, new_ready_state, previous_reason, new_reason,
      source, idempotency_key, created_at
    )
    VALUES (?, 'ready_state_changed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    unitId,
    actorId(actor),
    actorName(actor),
    previous.readyState,
    readyState,
    previous.reason,
    reason,
    source,
    idempotencyKey,
    now,
  ).run();

  return loadRoomHousekeepingStateForUnit(env, unitId);
}
