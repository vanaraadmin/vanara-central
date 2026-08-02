import { operationalBookingStatusSql } from "./booking-status.service.js";
import type { CurrentUser } from "./current-user.service.js";

export type HousekeepingWorkflowStatus = "Dirty" | "Cleaning" | "Ready";
export type HousekeepingFutureStatus = "Inspection";
export type HousekeepingChecklistItemId = "bathroom" | "floor" | "towels" | "bed" | "amenities" | "final-check";
export type RoomOccupancyStatus = "Occupied" | "Checked Out" | "Ready for Guest";
export type OperationalGroupId = "clean-first" | "clean-today" | "ready" | "occupied";
export type CheckoutCompletionSource = "reception" | "automatic-fallback" | "none";
export type HousekeepingPriority = "High" | "Normal" | "None";

export interface HousekeepingBindings {
  DB: D1Database;
}

interface HousekeepingRow {
  unit_id: number;
  unit_name: string | null;
  housekeeping_id: number | null;
  housekeeping_status: string | null;
  assigned_to: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  checklist_json: string | null;
  has_today_arrival: number;
  has_current_occupancy: number;
  has_scheduled_checkout_today: number;
}

interface UnitExistsRow {
  unit_id: number;
}

interface TodayHousekeepingRow {
  housekeeping_id: number;
  status: string;
  assigned_to: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  checklist_json: string | null;
}

interface CurrentBookingRow {
  booking_id: number;
}

interface AssignableUserRow {
  user_id: string;
  full_name: string;
  status: string;
  can_access: number | null;
}

export interface AssignableHousekeepingUser {
  id: string;
  displayName: string;
}

export interface HousekeepingChecklistItem {
  id: HousekeepingChecklistItemId;
  label: string;
  completed: boolean;
}

export interface HousekeepingChecklist {
  version: 1;
  items: HousekeepingChecklistItem[];
  completed: number;
  total: number;
  missing: string[];
}

export interface HousekeepingRoom {
  id: string;
  unitId: number;
  unitName: string;
  group: OperationalGroupId;
  operationalPriority: "Clean First" | "Clean Today" | "Ready" | "Occupied";
  priority: HousekeepingPriority;
  occupancyStatus: RoomOccupancyStatus;
  housekeepingStatus: HousekeepingWorkflowStatus;
  checkoutCompleted: boolean;
  checkoutCompletionSource: CheckoutCompletionSource;
  newGuestToday: boolean;
  assignedTo: string | null;
  assignedUserId: string | null;
  assignedAt: string | null;
  lastUpdated: string | null;
  minutesSinceUpdate: number | null;
  checklist: HousekeepingChecklist;
  blocked: boolean;
}

export interface HousekeepingGroup {
  id: OperationalGroupId;
  title: string;
  icon: string;
  rooms: HousekeepingRoom[];
}

export interface HousekeepingOverview {
  date: string;
  groups: HousekeepingGroup[];
  rooms: HousekeepingRoom[];
  summary: {
    cleanFirst: number;
    cleanToday: number;
    cleaningInProgress: number;
    dirty: number;
    ready: number;
    occupied: number;
    assigned: number;
    total: number;
  };
  capabilities: {
    checkoutCompletionSource: "missing-reception-flag";
    automaticFallbackAfter: "14:30";
    inspectionPrepared: true;
  };
}

export interface UpdateHousekeepingWorkflowInput {
  status: HousekeepingWorkflowStatus;
}

export interface UpdateHousekeepingAssignmentInput {
  assignedUserId: string | null;
}

export interface UpdateHousekeepingChecklistInput {
  itemId: HousekeepingChecklistItemId;
  completed: boolean;
}

const GROUP_ORDER: OperationalGroupId[] = ["clean-first", "clean-today", "ready", "occupied"];

const GROUP_META: Record<OperationalGroupId, { title: string; icon: string }> = {
  "clean-first": { title: "Clean First", icon: "🔥" },
  "clean-today": { title: "Clean Today", icon: "🧹" },
  ready: { title: "Ready", icon: "✅" },
  occupied: { title: "Occupied", icon: "🏠" },
};

const DEFAULT_CHECKLIST_ITEMS: Array<Omit<HousekeepingChecklistItem, "completed">> = [
  { id: "bathroom", label: "Bathroom" },
  { id: "floor", label: "Floor" },
  { id: "towels", label: "Towels" },
  { id: "bed", label: "Bed" },
  { id: "amenities", label: "Amenities" },
  { id: "final-check", label: "Final Check" },
];

function bangkokNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function isManagement(user: CurrentUser): boolean {
  return user.role === "Owner" || user.role === "Manager" || user.role === "Operations";
}

export function normalizeHousekeepingWorkflowStatus(status: string | null): HousekeepingWorkflowStatus {
  const normalized = status?.trim().toLowerCase() ?? "";

  if (normalized === "cleaning" || normalized === "in progress" || normalized === "cleaning in progress") return "Cleaning";
  if (normalized === "ready" || normalized === "clean" || normalized === "completed") return "Ready";
  if (normalized === "dirty" || normalized === "to clean" || normalized === "pending") return "Dirty";

  return "Ready";
}

function assertPayloadKeys(payload: object, allowed: string[], label: string): void {
  const keys = Object.keys(payload);
  const unknown = keys.find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} contains unsupported field: ${unknown}.`);
}

function emptyChecklist(completed = false): HousekeepingChecklist {
  const items = DEFAULT_CHECKLIST_ITEMS.map((item) => ({ ...item, completed }));
  return withChecklistStats(items);
}

function withChecklistStats(items: HousekeepingChecklistItem[]): HousekeepingChecklist {
  const completed = items.filter((item) => item.completed).length;
  return {
    version: 1,
    items,
    completed,
    total: items.length,
    missing: items.filter((item) => !item.completed).map((item) => item.label),
  };
}

function parseChecklist(raw: string | null, status: HousekeepingWorkflowStatus): HousekeepingChecklist {
  if (!raw) return emptyChecklist(status === "Ready");
  try {
    const parsed = JSON.parse(raw) as { items?: Array<{ id?: unknown; label?: unknown; completed?: unknown }> };
    const byId = new Map((parsed.items ?? []).map((item) => [item.id, item]));
    return withChecklistStats(DEFAULT_CHECKLIST_ITEMS.map((item) => {
      const stored = byId.get(item.id);
      return {
        ...item,
        completed: typeof stored?.completed === "boolean" ? stored.completed : status === "Ready",
      };
    }));
  } catch {
    return emptyChecklist(status === "Ready");
  }
}

function checklistJson(checklist: HousekeepingChecklist): string {
  return JSON.stringify({
    version: 1,
    items: checklist.items.map((item) => ({ id: item.id, label: item.label, completed: item.completed })),
  });
}

function completedChecklistJson(): string {
  return checklistJson(emptyChecklist(true));
}

function checkoutSource(row: HousekeepingRow, bangkokMinutes: number): CheckoutCompletionSource {
  const receptionConfirmed = false;
  if (receptionConfirmed) return "reception";

  const scheduledCheckoutToday = row.has_scheduled_checkout_today === 1;
  const noStayExtensionRegistered = scheduledCheckoutToday;
  const afterSafetyCutoff = bangkokMinutes >= 14 * 60 + 30;

  if (scheduledCheckoutToday && noStayExtensionRegistered && afterSafetyCutoff) {
    return "automatic-fallback";
  }

  return "none";
}

function priority(group: OperationalGroupId, blocked: boolean): HousekeepingPriority {
  if (blocked) return "None";
  return group === "clean-first" || group === "clean-today" ? "High" : group === "ready" ? "None" : "Normal";
}

function minutesSince(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / 60_000));
}

function toRoom(row: HousekeepingRow, bangkokMinutes: number): HousekeepingRoom {
  const housekeepingStatus = normalizeHousekeepingWorkflowStatus(row.housekeeping_status);
  const source = checkoutSource(row, bangkokMinutes);
  const checkoutCompleted = source !== "none";
  const newGuestToday = row.has_today_arrival === 1;
  const occupancyStatus: RoomOccupancyStatus = checkoutCompleted
    ? "Checked Out"
    : housekeepingStatus === "Ready" && row.has_current_occupancy === 0
      ? "Ready for Guest"
      : "Occupied";
  const group: OperationalGroupId = housekeepingStatus === "Ready" && occupancyStatus === "Ready for Guest"
    ? "ready"
    : checkoutCompleted && newGuestToday
      ? "clean-first"
      : checkoutCompleted
        ? "clean-today"
        : occupancyStatus === "Ready for Guest" ? "ready" : "occupied";
  const blocked = false;

  return {
    id: `unit:${row.unit_id}`,
    unitId: row.unit_id,
    unitName: row.unit_name || "Unit not assigned",
    group,
    operationalPriority: GROUP_META[group].title as HousekeepingRoom["operationalPriority"],
    priority: priority(group, blocked),
    occupancyStatus,
    housekeepingStatus,
    checkoutCompleted,
    checkoutCompletionSource: source,
    newGuestToday,
    assignedTo: row.assigned_user_name || row.assigned_to || null,
    assignedUserId: row.assigned_user_id,
    assignedAt: row.assigned_at,
    lastUpdated: row.updated_at,
    minutesSinceUpdate: minutesSince(row.updated_at),
    checklist: parseChecklist(row.checklist_json, housekeepingStatus),
    blocked,
  };
}

function groupRooms(rooms: HousekeepingRoom[]): HousekeepingGroup[] {
  return GROUP_ORDER.map((id) => ({
    id,
    ...GROUP_META[id],
    rooms: rooms.filter((room) => room.group === id),
  }));
}

export function normalizeHousekeepingWorkflowInput(payload: unknown): UpdateHousekeepingWorkflowInput {
  if (!payload || typeof payload !== "object") throw new Error("Housekeeping payload is required.");
  assertPayloadKeys(payload, ["status"], "Housekeeping payload");
  const status = "status" in payload ? payload.status : undefined;
  if (status === "Dirty" || status === "Cleaning" || status === "Ready") return { status };
  if (status === "To Clean") return { status: "Dirty" };
  if (status === "Cleaning In Progress") return { status: "Cleaning" };
  throw new Error("Housekeeping status is invalid.");
}

export function normalizeHousekeepingAssignmentInput(payload: unknown): UpdateHousekeepingAssignmentInput {
  if (!payload || typeof payload !== "object") throw new Error("Assignment payload is required.");
  assertPayloadKeys(payload, ["assignedUserId"], "Assignment payload");
  const assignedUserId = "assignedUserId" in payload ? payload.assignedUserId : undefined;
  if (assignedUserId === null) return { assignedUserId: null };
  if (typeof assignedUserId !== "string" || assignedUserId.trim().length === 0) throw new Error("assignedUserId is invalid.");
  return { assignedUserId: assignedUserId.trim() };
}

export function normalizeHousekeepingChecklistInput(payload: unknown): UpdateHousekeepingChecklistInput {
  if (!payload || typeof payload !== "object") throw new Error("Checklist payload is required.");
  assertPayloadKeys(payload, ["itemId", "completed"], "Checklist payload");
  const itemId = "itemId" in payload ? payload.itemId : undefined;
  if (!DEFAULT_CHECKLIST_ITEMS.some((item) => item.id === itemId)) throw new Error("Checklist item is invalid.");
  const completed = "completed" in payload ? payload.completed : undefined;
  if (typeof completed !== "boolean") throw new Error("Checklist completed flag is required.");
  return { itemId: itemId as HousekeepingChecklistItemId, completed };
}

async function unitExists(env: HousekeepingBindings, unitId: number): Promise<boolean> {
  const row = await env.DB.prepare("SELECT unit_id FROM units WHERE unit_id = ? AND active = 1").bind(unitId).first<UnitExistsRow>();
  return row !== null;
}

async function loadCurrentBooking(env: HousekeepingBindings, unitId: number, today: string): Promise<CurrentBookingRow | null> {
  return env.DB.prepare(`
    SELECT booking_id
    FROM bookings
    WHERE unit_id = ?
      AND arrival_date <= ?
      AND departure_date > ?
      AND ${operationalBookingStatusSql("status")}
    ORDER BY arrival_date DESC
    LIMIT 1
  `).bind(unitId, today, today).first<CurrentBookingRow>();
}

async function loadTodayHousekeeping(env: HousekeepingBindings, unitId: number, today: string): Promise<TodayHousekeepingRow | null> {
  return env.DB.prepare(`
    SELECT housekeeping_id, status, assigned_to, assigned_user_id, assigned_user_name, assigned_at,
           started_at, completed_at, checklist_json
    FROM housekeeping
    WHERE unit_id = ? AND work_date = ?
    ORDER BY updated_at DESC, housekeeping_id DESC
    LIMIT 1
  `).bind(unitId, today).first<TodayHousekeepingRow>();
}

async function loadAssignableHousekeepingUser(env: HousekeepingBindings, userId: string): Promise<AssignableUserRow | null> {
  return env.DB.prepare(`
    SELECT u.user_id, u.full_name, u.status, p.can_access
    FROM users u
    LEFT JOIN user_module_permissions p
      ON p.user_id = u.user_id
     AND p.module_key = 'housekeeping'
    WHERE u.user_id = ?
    LIMIT 1
  `).bind(userId).first<AssignableUserRow>();
}

export async function listAssignableHousekeepingUsers(env: HousekeepingBindings, user: CurrentUser): Promise<AssignableHousekeepingUser[]> {
  if (!isManagement(user)) throw new Error("Management Housekeeping access is required.");

  const rows = await env.DB.prepare(`
    SELECT u.user_id, u.full_name, u.status, p.can_access
    FROM users u
    INNER JOIN user_module_permissions p
      ON p.user_id = u.user_id
     AND p.module_key = 'housekeeping'
     AND p.can_access = 1
    WHERE u.status = 'active'
    ORDER BY u.full_name
  `).all<AssignableUserRow>();

  return (rows.results ?? []).map((row) => ({
    id: row.user_id,
    displayName: row.full_name,
  }));
}

function ensureAssignableUser(row: AssignableUserRow | null): AssignableUserRow {
  if (!row) throw new Error("Assignable user not found.");
  if (row.status !== "active") throw new Error("Assignable user is not active.");
  if (row.can_access !== 1) throw new Error("Assignable user cannot access Housekeeping.");
  return row;
}

function requireWorkflowAccess(user: CurrentUser, input: UpdateHousekeepingWorkflowInput, current: TodayHousekeepingRow | null): void {
  if (isManagement(user)) return;
  const currentStatus = normalizeHousekeepingWorkflowStatus(current?.status ?? "Dirty");
  const assignedUserId = current?.assigned_user_id ?? null;

  if (input.status === "Cleaning") {
    if (currentStatus !== "Dirty" || assignedUserId !== null) throw new Error("Housekeeping room is already assigned.");
    return;
  }

  if (input.status === "Ready") {
    if (currentStatus !== "Cleaning") throw new Error("Housekeeping room is not being cleaned.");
    if (assignedUserId !== user.id) throw new Error("Only the assigned housekeeper can update this room.");
    return;
  }

  if (input.status === "Dirty" && currentStatus === "Cleaning") {
    if (assignedUserId !== user.id) throw new Error("Only the assigned housekeeper can update this room.");
  }
}

export function housekeepingWorkflowErrorStatus(error: unknown): 400 | 403 | 409 {
  const message = error instanceof Error ? error.message : "";
  if (message === "Housekeeping room is already assigned." || message === "Housekeeping room is not being cleaned.") return 409;
  if (message === "Only the assigned housekeeper can update this room." || message === "Management Housekeeping access is required.") return 403;
  return 400;
}

export async function updateHousekeepingWorkflow(env: HousekeepingBindings, unitId: number, input: UpdateHousekeepingWorkflowInput, user: CurrentUser): Promise<HousekeepingOverview | null> {
  if (!(await unitExists(env, unitId))) return null;

  const today = bangkokNow().date;
  const [existing, booking] = await Promise.all([
    loadTodayHousekeeping(env, unitId, today),
    loadCurrentBooking(env, unitId, today),
  ]);
  const now = nowIso();
  requireWorkflowAccess(user, input, existing);
  const isCleaning = input.status === "Cleaning";
  const isReady = input.status === "Ready";
  const isDirty = input.status === "Dirty";
  const sameAssignee = existing?.assigned_user_id === user.id;
  const assignedUserId = isCleaning ? user.id : isDirty ? null : existing?.assigned_user_id ?? null;
  const assignedUserName = isCleaning ? user.displayName : isDirty ? null : existing?.assigned_user_name ?? existing?.assigned_to ?? null;
  const assignedAt = isCleaning ? sameAssignee ? existing?.assigned_at ?? now : now : isDirty ? null : existing?.assigned_at ?? null;
  const startedAt = isCleaning ? existing?.started_at ?? now : isDirty ? null : existing?.started_at ?? null;
  const completedAt = isReady ? now : null;
  const checklist = isReady ? completedChecklistJson() : existing?.checklist_json ?? checklistJson(emptyChecklist(false));

  if (existing) {
    const result = await env.DB.prepare(`
      UPDATE housekeeping
      SET status = ?, assigned_to = ?, assigned_user_id = ?, assigned_user_name = ?, assigned_at = ?,
          started_at = ?, completed_at = ?, checklist_json = ?, updated_by = ?, updated_by_name = ?, updated_at = ?
      WHERE housekeeping_id = ?
        AND (
          ? != 'Cleaning'
          OR ? = 1
          OR (status IN ('Dirty', 'To Clean', 'Pending') AND assigned_user_id IS NULL)
        )
        AND (
          ? NOT IN ('Ready', 'Dirty')
          OR ? = 1
          OR assigned_user_id = ?
        )
    `).bind(
      input.status,
      assignedUserName,
      assignedUserId,
      assignedUserName,
      assignedAt,
      startedAt,
      completedAt,
      checklist,
      user.id,
      user.displayName,
      now,
      existing.housekeeping_id,
      input.status,
      isManagement(user) ? 1 : 0,
      input.status,
      isManagement(user) ? 1 : 0,
      user.id,
    ).run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new Error(input.status === "Cleaning" ? "Housekeeping room is already assigned." : "Only the assigned housekeeper can update this room.");
    }
  } else {
    if (input.status === "Ready") throw new Error("Housekeeping room is not being cleaned.");
    const result = await env.DB.prepare(`
      INSERT INTO housekeeping (
        unit_id, booking_id, work_date, status, assigned_to, started_at, completed_at, notes, created_at, updated_at,
        assigned_user_id, assigned_user_name, assigned_at, updated_by, updated_by_name, checklist_json
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1
        FROM housekeeping
        WHERE unit_id = ? AND work_date = ?
      )
    `).bind(
      unitId,
      booking?.booking_id ?? null,
      today,
      input.status,
      assignedUserName,
      startedAt,
      completedAt,
      now,
      now,
      assignedUserId,
      assignedUserName,
      assignedAt,
      user.id,
      user.displayName,
      checklist,
      unitId,
      today,
    ).run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new Error(input.status === "Cleaning" ? "Housekeeping room is already assigned." : "Housekeeping room is not being cleaned.");
    }
  }

  return getHousekeepingOverview(env);
}

export async function updateHousekeepingAssignment(env: HousekeepingBindings, unitId: number, input: UpdateHousekeepingAssignmentInput, user: CurrentUser): Promise<HousekeepingOverview | null> {
  if (!(await unitExists(env, unitId))) return null;
  if (!isManagement(user)) throw new Error("Management Housekeeping access is required.");

  const today = bangkokNow().date;
  const [existing, booking, assignee] = await Promise.all([
    loadTodayHousekeeping(env, unitId, today),
    loadCurrentBooking(env, unitId, today),
    input.assignedUserId ? loadAssignableHousekeepingUser(env, input.assignedUserId) : Promise.resolve(null),
  ]);
  const now = nowIso();

  if (input.assignedUserId === null) {
    if (existing) {
      await env.DB.prepare(`
        UPDATE housekeeping
        SET status = 'Dirty', assigned_to = NULL, assigned_user_id = NULL, assigned_user_name = NULL,
            assigned_at = NULL, started_at = NULL, completed_at = NULL,
            updated_by = ?, updated_by_name = ?, updated_at = ?
        WHERE housekeeping_id = ?
      `).bind(user.id, user.displayName, now, existing.housekeeping_id).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO housekeeping (
          unit_id, booking_id, work_date, status, assigned_to, started_at, completed_at, notes, created_at, updated_at,
          assigned_user_id, assigned_user_name, assigned_at, updated_by, updated_by_name, checklist_json
        ) VALUES (?, ?, ?, 'Dirty', NULL, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, ?, ?, ?)
      `).bind(unitId, booking?.booking_id ?? null, today, now, now, user.id, user.displayName, checklistJson(emptyChecklist(false))).run();
    }
    return getHousekeepingOverview(env);
  }

  const target = ensureAssignableUser(assignee);
  const assignedAt = existing?.assigned_user_id === target.user_id ? existing.assigned_at ?? now : now;
  const checklist = existing?.checklist_json ?? checklistJson(emptyChecklist(false));

  if (existing) {
    await env.DB.prepare(`
      UPDATE housekeeping
      SET status = 'Cleaning', assigned_to = ?, assigned_user_id = ?, assigned_user_name = ?, assigned_at = ?,
          started_at = COALESCE(started_at, ?), completed_at = NULL, checklist_json = ?,
          updated_by = ?, updated_by_name = ?, updated_at = ?
      WHERE housekeeping_id = ?
    `).bind(target.full_name, target.user_id, target.full_name, assignedAt, now, checklist, user.id, user.displayName, now, existing.housekeeping_id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO housekeeping (
        unit_id, booking_id, work_date, status, assigned_to, started_at, completed_at, notes, created_at, updated_at,
        assigned_user_id, assigned_user_name, assigned_at, updated_by, updated_by_name, checklist_json
      ) VALUES (?, ?, ?, 'Cleaning', ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(unitId, booking?.booking_id ?? null, today, target.full_name, now, now, now, target.user_id, target.full_name, assignedAt, user.id, user.displayName, checklist).run();
  }

  return getHousekeepingOverview(env);
}

export async function updateHousekeepingChecklist(env: HousekeepingBindings, unitId: number, input: UpdateHousekeepingChecklistInput, user: CurrentUser): Promise<HousekeepingOverview | null> {
  if (!(await unitExists(env, unitId))) return null;

  const today = bangkokNow().date;
  const [existing, booking] = await Promise.all([
    loadTodayHousekeeping(env, unitId, today),
    loadCurrentBooking(env, unitId, today),
  ]);
  const status = normalizeHousekeepingWorkflowStatus(existing?.status ?? "Dirty");
  const currentChecklist = parseChecklist(existing?.checklist_json ?? null, status);
  const nextChecklist = withChecklistStats(currentChecklist.items.map((item) => item.id === input.itemId ? { ...item, completed: input.completed } : item));
  const now = nowIso();

  if (existing) {
    await env.DB.prepare(`
      UPDATE housekeeping
      SET checklist_json = ?, updated_by = ?, updated_by_name = ?, updated_at = ?
      WHERE housekeeping_id = ?
    `).bind(checklistJson(nextChecklist), user.id, user.displayName, now, existing.housekeeping_id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO housekeeping (
        unit_id, booking_id, work_date, status, assigned_to, started_at, completed_at, notes, created_at, updated_at,
        assigned_user_id, assigned_user_name, assigned_at, updated_by, updated_by_name, checklist_json
      ) VALUES (?, ?, ?, 'Dirty', NULL, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, ?, ?, ?)
    `).bind(unitId, booking?.booking_id ?? null, today, now, now, user.id, user.displayName, checklistJson(nextChecklist)).run();
  }

  return getHousekeepingOverview(env);
}

export async function getHousekeepingOverview(env: HousekeepingBindings): Promise<HousekeepingOverview> {
  const now = bangkokNow();

  const rows = await env.DB.prepare(`
    WITH latest_housekeeping AS (
      SELECT h.*
      FROM housekeeping h
      INNER JOIN (
        SELECT unit_id, MAX(work_date || ' ' || updated_at || ' ' || housekeeping_id) AS latest_key
        FROM housekeeping
        GROUP BY unit_id
      ) latest
        ON latest.unit_id = h.unit_id
       AND latest.latest_key = h.work_date || ' ' || h.updated_at || ' ' || h.housekeeping_id
    ), today_arrivals AS (
      SELECT DISTINCT unit_id
      FROM bookings
      WHERE arrival_date = ?1
        AND unit_id IS NOT NULL
        AND ${operationalBookingStatusSql("status")}
    ), current_occupancy AS (
      SELECT DISTINCT unit_id
      FROM bookings
      WHERE arrival_date <= ?1
        AND departure_date > ?1
        AND unit_id IS NOT NULL
        AND ${operationalBookingStatusSql("status")}
    ), scheduled_checkouts AS (
      SELECT DISTINCT unit_id
      FROM bookings
      WHERE departure_date = ?1
        AND unit_id IS NOT NULL
        AND ${operationalBookingStatusSql("status")}
    )
    SELECT
      u.unit_id,
      u.unit_name,
      lh.housekeeping_id,
      lh.status AS housekeeping_status,
      lh.assigned_to,
      lh.assigned_user_id,
      lh.assigned_user_name,
      lh.assigned_at,
      lh.updated_at,
      lh.updated_by,
      lh.updated_by_name,
      lh.checklist_json,
      CASE WHEN ta.unit_id IS NULL THEN 0 ELSE 1 END AS has_today_arrival,
      CASE WHEN co.unit_id IS NULL THEN 0 ELSE 1 END AS has_current_occupancy,
      CASE WHEN sc.unit_id IS NULL THEN 0 ELSE 1 END AS has_scheduled_checkout_today
    FROM units u
    LEFT JOIN room_operational_availability roa ON roa.unit_id = u.unit_id
    LEFT JOIN latest_housekeeping lh ON lh.unit_id = u.unit_id
    LEFT JOIN today_arrivals ta ON ta.unit_id = u.unit_id
    LEFT JOIN current_occupancy co ON co.unit_id = u.unit_id
    LEFT JOIN scheduled_checkouts sc ON sc.unit_id = u.unit_id
    WHERE u.active = 1
      AND COALESCE(roa.status, 'OPERATING') = 'OPERATING'
    ORDER BY u.position, u.unit_name
  `).bind(now.date).all<HousekeepingRow>();

  const rooms = (rows.results ?? [])
    .map((row) => toRoom(row, now.minutes))
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || (a.priority === b.priority ? 0 : a.priority === "High" ? -1 : 1) || a.unitName.localeCompare(b.unitName));
  const groups = groupRooms(rooms);

  return {
    date: now.date,
    groups,
    rooms,
    summary: {
      cleanFirst: groups.find((group) => group.id === "clean-first")?.rooms.length ?? 0,
      cleanToday: groups.find((group) => group.id === "clean-today")?.rooms.length ?? 0,
      cleaningInProgress: rooms.filter((room) => room.housekeepingStatus === "Cleaning").length,
      dirty: rooms.filter((room) => room.housekeepingStatus === "Dirty").length,
      ready: groups.find((group) => group.id === "ready")?.rooms.length ?? 0,
      occupied: groups.find((group) => group.id === "occupied")?.rooms.length ?? 0,
      assigned: rooms.filter((room) => room.assignedTo !== null).length,
      total: rooms.length,
    },
    capabilities: {
      checkoutCompletionSource: "missing-reception-flag",
      automaticFallbackAfter: "14:30",
      inspectionPrepared: true,
    },
  };
}
