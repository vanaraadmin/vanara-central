import type { CurrentChatUser } from "./chat.service.js";

export type MaintenanceStatus = "Open" | "In Progress" | "Waiting Parts" | "Completed";
type StoredMaintenanceStatus = "Open" | "Assigned" | "In Progress" | "Waiting Parts" | "Resolved" | "Closed";
export type MaintenancePriority = "Low" | "Normal" | "High";
type StoredMaintenancePriority = "Low" | "Medium" | "High" | "Critical";
export type MaintenanceCategory =
  | "Electrical"
  | "Air Conditioning"
  | "Water"
  | "Furniture"
  | "Bathroom"
  | "Garden"
  | "Cleaning Equipment"
  | "Internet / Network"
  | "Appliance"
  | "Other";
export type MaintenanceAssignmentType = "INTERNAL" | "EXTERNAL";

export interface MaintenanceBindings {
  DB: D1Database;
}

export class MaintenanceConflictError extends Error {}
export class MaintenancePermissionError extends Error {}

const PRODUCT_STATUSES: MaintenanceStatus[] = ["Open", "In Progress", "Waiting Parts", "Completed"];
const PRODUCT_PRIORITIES: MaintenancePriority[] = ["Low", "Normal", "High"];
const CATEGORIES: MaintenanceCategory[] = [
  "Electrical",
  "Air Conditioning",
  "Water",
  "Furniture",
  "Bathroom",
  "Garden",
  "Cleaning Equipment",
  "Internet / Network",
  "Appliance",
  "Other",
];
const LOCATION_AREAS = ["Reception", "Restaurant", "Kitchen", "Garden", "Pond", "Entrance", "Storage", "Staff Area", "General Resort Area", "Other"] as const;
const EXTERNAL_ASSIGNEES = ["Electrician", "Air-conditioning technician", "Plumber", "Internet technician", "Appliance repair", "General contractor", "External maintenance company", "Other external technician"] as const;
const MAINTENANCE_EDIT_ROLES = new Set(["Owner", "Manager", "Maintenance"]);

interface MaintenanceTicketRow {
  ticket_id: number;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: StoredMaintenancePriority;
  status: StoredMaintenanceStatus;
  room_id: number | null;
  room_name: string | null;
  accommodation_id: number | null;
  accommodation_name: string | null;
  location_area: string | null;
  assignment_type: MaintenanceAssignmentType | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  external_assignee_label: string | null;
  external_assignee_note: string | null;
  reported_by: string;
  reported_by_name: string;
  created_at: string;
  updated_at: string;
  assigned_at: string | null;
  started_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  out_of_service: number;
  waiting_reason: string | null;
  note_count?: number | null;
  photo_count?: number | null;
}

interface MaintenanceNoteRow {
  note_id: number;
  ticket_id: number;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
}

interface MaintenancePhotoRow {
  photo_id: number;
  ticket_id: number;
  storage_status: "local-reference" | "uploaded";
  local_reference: string | null;
  url: string | null;
  caption: string | null;
  added_by: string;
  added_by_name: string;
  created_at: string;
}

interface MaintenanceEventRow {
  event_id: number;
  ticket_id: number;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  actor_id: string;
  actor_name: string;
  created_at: string;
}

interface AssignableUserRow {
  user_id: string;
  full_name: string;
  role: string;
  status: string;
  can_access: number | null;
}

interface UnitRow {
  unit_id: number;
  room_type_id: number | null;
}

export interface MaintenanceAssignment {
  type: MaintenanceAssignmentType | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  externalAssigneeLabel: string | null;
  externalAssigneeNote: string | null;
  assignedAt: string | null;
}

export interface MaintenanceTicketSummary {
  id: number;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  roomId: number | null;
  roomName: string | null;
  accommodationId: number | null;
  accommodationName: string | null;
  locationArea: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignment: MaintenanceAssignment;
  reportedBy: string;
  reportedByName: string;
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  closedBy: string | null;
  closedByName: string | null;
  outOfService: boolean;
  waitingReason: string | null;
  noteCount: number;
  photoCount: number;
}

export interface MaintenanceNote {
  id: number;
  ticketId: number;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

export interface MaintenancePhoto {
  id: number;
  ticketId: number;
  storageStatus: "local-reference" | "uploaded";
  localReference: string | null;
  url: string | null;
  caption: string | null;
  addedBy: string;
  addedByName: string;
  createdAt: string;
}

export interface MaintenanceEvent {
  id: number;
  ticketId: number;
  eventType: string;
  fromValue: string | null;
  toValue: string | null;
  actorId: string;
  actorName: string;
  createdAt: string;
}

export interface MaintenanceTicketDetail extends MaintenanceTicketSummary {
  notes: MaintenanceNote[];
  photos: MaintenancePhoto[];
  timeline: MaintenanceEvent[];
}

export interface MaintenanceFilters {
  search?: string;
  status?: MaintenanceStatus | "All";
}

export interface MaintenanceAssignableUser {
  id: string;
  displayName: string;
  role: string;
}

export interface MaintenanceAssignableOptions {
  users: MaintenanceAssignableUser[];
  externalAssignees: string[];
  externalFallbackAvailable: boolean;
}

export interface CreateMaintenanceTicketInput {
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  roomId: number | null;
  accommodationId: number | null;
  locationArea: string | null;
  assignment: MaintenanceAssignmentInput | null;
  outOfService: boolean;
}

export interface UpdateMaintenanceTicketInput {
  title?: string;
  description?: string;
  category?: MaintenanceCategory;
  priority?: MaintenancePriority;
  roomId?: number | null;
  accommodationId?: number | null;
  locationArea?: string | null;
}

export type MaintenanceAssignmentInput =
  | { assignmentType: "INTERNAL"; assignedUserId: string; externalAssigneeLabel?: never; externalAssigneeNote?: never }
  | { assignmentType: "EXTERNAL"; assignedUserId?: never; externalAssigneeLabel: string; externalAssigneeNote: string | null };

export interface MaintenanceStatusInput {
  status: MaintenanceStatus;
  reason: string | null;
}

export interface MaintenanceOutOfServiceInput {
  outOfService: boolean;
}

export interface CreateMaintenanceNoteInput {
  body: string;
}

export interface CreateMaintenancePhotoInput {
  localReference: string | null;
  url: string | null;
  caption: string | null;
}

function canEditMaintenance(user: CurrentChatUser): boolean {
  return MAINTENANCE_EDIT_ROLES.has(user.role);
}

function assertPayloadKeys(payload: object, allowed: string[], label: string): void {
  const unknown = Object.keys(payload).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} contains unsupported field: ${unknown}.`);
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`${label} is invalid.`);
}

function optionalString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function requiredString(value: unknown, label: string, max: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed.slice(0, max);
}

function optionalId(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function parseAssignment(payload: object): MaintenanceAssignmentInput | null {
  if (!("assignmentType" in payload) || payload.assignmentType === null || payload.assignmentType === "") return null;
  const assignmentType = assertEnum(payload.assignmentType, ["INTERNAL", "EXTERNAL"], "Assignment type");

  if (assignmentType === "INTERNAL") {
    if ("externalAssigneeLabel" in payload || "externalAssigneeNote" in payload) throw new Error("Internal assignment cannot include external assignee fields.");
    return {
      assignmentType,
      assignedUserId: requiredString("assignedUserId" in payload ? payload.assignedUserId : undefined, "assignedUserId", 80),
    };
  }

  if ("assignedUserId" in payload) throw new Error("External assignment cannot include assignedUserId.");
  return {
    assignmentType,
    externalAssigneeLabel: requiredString("externalAssigneeLabel" in payload ? payload.externalAssigneeLabel : undefined, "External assignee", 120),
    externalAssigneeNote: optionalString("externalAssigneeNote" in payload ? payload.externalAssigneeNote : undefined, 500),
  };
}

function normalizeArea(value: unknown): string | null {
  const area = optionalString(value, 120);
  if (area && !(LOCATION_AREAS as readonly string[]).includes(area)) throw new Error("Location area is invalid.");
  return area;
}

function normalizePriority(value: unknown): MaintenancePriority {
  if (value === undefined || value === null || value === "") return "Normal";
  if (value === "Medium" || value === "NORMAL" || value === "Normal") return "Normal";
  if (value === "LOW" || value === "Low") return "Low";
  if (value === "HIGH" || value === "High") return "High";
  throw new Error("Priority is invalid.");
}

function toStoredPriority(priority: MaintenancePriority): StoredMaintenancePriority {
  if (priority === "Normal") return "Medium";
  return priority;
}

function toPublicPriority(priority: StoredMaintenancePriority): MaintenancePriority {
  if (priority === "Medium") return "Normal";
  if (priority === "Critical") return "High";
  return priority;
}

function toPublicStatus(status: StoredMaintenanceStatus): MaintenanceStatus {
  if (status === "Assigned") return "Open";
  if (status === "Resolved" || status === "Closed") return "Completed";
  return status;
}

function toStoredStatus(status: MaintenanceStatus): StoredMaintenanceStatus {
  if (status === "Completed") return "Closed";
  return status;
}

function storedStatusFilter(status: MaintenanceStatus): StoredMaintenanceStatus[] {
  if (status === "Open") return ["Open", "Assigned"];
  if (status === "Completed") return ["Resolved", "Closed"];
  return [status];
}

function isCompletedStatus(status: MaintenanceStatus): boolean {
  return status === "Completed";
}

export function normalizeCreateMaintenanceTicketInput(payload: unknown): CreateMaintenanceTicketInput {
  if (!payload || typeof payload !== "object") throw new Error("Ticket payload is required.");
  assertPayloadKeys(payload, ["title", "description", "category", "priority", "roomId", "accommodationId", "locationArea", "assignmentType", "assignedUserId", "externalAssigneeLabel", "externalAssigneeNote", "outOfService"], "Ticket payload");
  const roomId = optionalId("roomId" in payload ? payload.roomId : undefined, "roomId");
  return {
    title: requiredString("title" in payload ? payload.title : undefined, "Title", 140),
    description: requiredString("description" in payload ? payload.description : undefined, "Description", 2000),
    category: "category" in payload && payload.category !== undefined && payload.category !== null && payload.category !== ""
      ? assertEnum(payload.category, CATEGORIES, "Category")
      : "Other",
    priority: normalizePriority("priority" in payload ? payload.priority : undefined),
    roomId,
    accommodationId: optionalId("accommodationId" in payload ? payload.accommodationId : undefined, "accommodationId"),
    locationArea: normalizeArea("locationArea" in payload ? payload.locationArea : undefined),
    assignment: parseAssignment(payload),
    outOfService: "outOfService" in payload ? (payload as { outOfService?: unknown }).outOfService === true : false,
  };
}

export function normalizeUpdateMaintenanceTicketInput(payload: unknown): UpdateMaintenanceTicketInput {
  if (!payload || typeof payload !== "object") throw new Error("Ticket payload is required.");
  assertPayloadKeys(payload, ["title", "description", "category", "priority", "roomId", "accommodationId", "locationArea"], "Ticket payload");
  const input: UpdateMaintenanceTicketInput = {};
  if ("title" in payload) input.title = requiredString(payload.title, "Title", 140);
  if ("description" in payload) input.description = requiredString(payload.description, "Description", 2000);
  if ("category" in payload) input.category = assertEnum(payload.category, CATEGORIES, "Category");
  if ("priority" in payload) input.priority = normalizePriority(payload.priority);
  if ("roomId" in payload) input.roomId = optionalId(payload.roomId, "roomId");
  if ("accommodationId" in payload) input.accommodationId = optionalId(payload.accommodationId, "accommodationId");
  if ("locationArea" in payload) input.locationArea = optionalString(payload.locationArea, 120);
  if (Object.keys(input).length === 0) throw new Error("At least one ticket field is required.");
  return input;
}

export function normalizeMaintenanceAssignmentInput(payload: unknown): MaintenanceAssignmentInput | null {
  if (!payload || typeof payload !== "object") throw new Error("Assignment payload is required.");
  assertPayloadKeys(payload, ["assignmentType", "assignedUserId", "externalAssigneeLabel", "externalAssigneeNote"], "Assignment payload");
  return parseAssignment(payload);
}

export function normalizeMaintenanceStatusInput(payload: unknown): MaintenanceStatusInput {
  if (!payload || typeof payload !== "object") throw new Error("Status payload is required.");
  assertPayloadKeys(payload, ["status", "reason"], "Status payload");
  const status = assertEnum("status" in payload ? payload.status : undefined, PRODUCT_STATUSES, "Status");
  const reason = optionalString("reason" in payload ? payload.reason : undefined, 500);
  if (status === "Waiting Parts" && !reason) throw new Error("Waiting reason is required.");
  return { status, reason };
}

export function normalizeMaintenanceOutOfServiceInput(payload: unknown): MaintenanceOutOfServiceInput {
  if (!payload || typeof payload !== "object") throw new Error("Out of Service payload is required.");
  assertPayloadKeys(payload, ["outOfService"], "Out of Service payload");
  const outOfService = (payload as { outOfService?: unknown }).outOfService;
  if (typeof outOfService !== "boolean") throw new Error("outOfService is required.");
  return { outOfService };
}

export function normalizeMaintenanceNoteInput(payload: unknown): CreateMaintenanceNoteInput {
  if (!payload || typeof payload !== "object") throw new Error("Note payload is required.");
  assertPayloadKeys(payload, ["body"], "Note payload");
  return { body: requiredString("body" in payload ? payload.body : undefined, "Note", 2000) };
}

export function normalizeMaintenancePhotoInput(payload: unknown): CreateMaintenancePhotoInput {
  if (!payload || typeof payload !== "object") throw new Error("Photo payload is required.");
  assertPayloadKeys(payload, ["localReference", "url", "caption"], "Photo payload");
  const localReference = optionalString("localReference" in payload ? payload.localReference : undefined, 500);
  const url = optionalString("url" in payload ? payload.url : undefined, 500);
  if (!localReference && !url) throw new Error("Photo reference or URL is required.");
  return {
    localReference,
    url,
    caption: optionalString("caption" in payload ? payload.caption : undefined, 240),
  };
}

function mapTicket(row: MaintenanceTicketRow): MaintenanceTicketSummary {
  const assignment = {
    type: row.assignment_type,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    externalAssigneeLabel: row.external_assignee_label,
    externalAssigneeNote: row.external_assignee_note,
    assignedAt: row.assigned_at,
  };
  return {
    id: row.ticket_id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: toPublicPriority(row.priority),
    status: toPublicStatus(row.status),
    roomId: row.room_id,
    roomName: row.room_name,
    accommodationId: row.accommodation_id,
    accommodationName: row.accommodation_name,
    locationArea: row.location_area,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    assignment,
    reportedBy: row.reported_by,
    reportedByName: row.reported_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignedAt: row.assigned_at,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    resolvedBy: row.resolved_by,
    resolvedByName: row.resolved_by_name,
    closedBy: row.closed_by,
    closedByName: row.closed_by_name,
    outOfService: row.out_of_service === 1,
    waitingReason: row.waiting_reason,
    noteCount: row.note_count ?? 0,
    photoCount: row.photo_count ?? 0,
  };
}

function mapNote(row: MaintenanceNoteRow): MaintenanceNote {
  return {
    id: row.note_id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapPhoto(row: MaintenancePhotoRow): MaintenancePhoto {
  return {
    id: row.photo_id,
    ticketId: row.ticket_id,
    storageStatus: row.storage_status,
    localReference: row.local_reference,
    url: row.url,
    caption: row.caption,
    addedBy: row.added_by,
    addedByName: row.added_by_name,
    createdAt: row.created_at,
  };
}

function mapEvent(row: MaintenanceEventRow): MaintenanceEvent {
  return {
    id: row.event_id,
    ticketId: row.ticket_id,
    eventType: row.event_type,
    fromValue: row.from_value,
    toValue: row.to_value,
    actorId: row.actor_id,
    actorName: row.actor_name,
    createdAt: row.created_at,
  };
}

async function recordEvent(env: MaintenanceBindings, ticketId: number, type: string, from: string | null, to: string | null, user: CurrentChatUser, now: string) {
  await env.DB.prepare(`
    INSERT INTO maintenance_ticket_events (ticket_id, event_type, from_value, to_value, actor_id, actor_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(ticketId, type, from, to, user.id, user.displayName, now).run();
}

async function loadTicketRow(env: MaintenanceBindings, ticketId: number): Promise<MaintenanceTicketRow | null> {
  return env.DB.prepare(`
    SELECT t.*, u.unit_name AS room_name, rt.room_type_name AS accommodation_name,
      (SELECT COUNT(*) FROM maintenance_ticket_notes n WHERE n.ticket_id = t.ticket_id) AS note_count,
      (SELECT COUNT(*) FROM maintenance_ticket_photos p WHERE p.ticket_id = t.ticket_id) AS photo_count
    FROM maintenance_tickets t
    LEFT JOIN units u ON u.unit_id = t.room_id
    LEFT JOIN room_types rt ON rt.room_type_id = t.accommodation_id
    WHERE t.ticket_id = ?
  `).bind(ticketId).first<MaintenanceTicketRow>();
}

async function requireUnit(env: MaintenanceBindings, roomId: number | null): Promise<UnitRow | null> {
  if (roomId === null) return null;
  const row = await env.DB.prepare("SELECT unit_id, room_type_id FROM units WHERE unit_id = ? AND active = 1").bind(roomId).first<UnitRow>();
  if (!row) throw new Error("Room not found.");
  return row;
}

async function loadAssignableMaintenanceUser(env: MaintenanceBindings, userId: string): Promise<AssignableUserRow | null> {
  return env.DB.prepare(`
    SELECT u.user_id, u.full_name, u.role, u.status, p.can_access
    FROM users u
    LEFT JOIN user_module_permissions p
      ON p.user_id = u.user_id
     AND p.module_key = 'maintenance'
    WHERE u.user_id = ?
    LIMIT 1
  `).bind(userId).first<AssignableUserRow>();
}

function ensureAssignableUser(row: AssignableUserRow | null): AssignableUserRow {
  if (!row) throw new Error("Assignable user not found.");
  if (row.status !== "active") throw new Error("Assignable user is not active.");
  if (row.role !== "Maintenance") throw new Error("Assignable user must be Maintenance staff.");
  if (row.can_access !== 1) throw new Error("Assignable user cannot access Maintenance.");
  return row;
}

async function resolveAssignment(env: MaintenanceBindings, input: MaintenanceAssignmentInput | null): Promise<{
  assignmentType: MaintenanceAssignmentType | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  externalAssigneeLabel: string | null;
  externalAssigneeNote: string | null;
  assignedAt: string | null;
}> {
  if (!input) {
    return { assignmentType: null, assignedUserId: null, assignedUserName: null, externalAssigneeLabel: null, externalAssigneeNote: null, assignedAt: null };
  }
  const now = new Date().toISOString();
  if (input.assignmentType === "INTERNAL") {
    const target = ensureAssignableUser(await loadAssignableMaintenanceUser(env, input.assignedUserId));
    return { assignmentType: "INTERNAL", assignedUserId: target.user_id, assignedUserName: target.full_name, externalAssigneeLabel: null, externalAssigneeNote: null, assignedAt: now };
  }
  return { assignmentType: "EXTERNAL", assignedUserId: null, assignedUserName: null, externalAssigneeLabel: input.externalAssigneeLabel, externalAssigneeNote: input.externalAssigneeNote, assignedAt: now };
}

function canActOnTicket(user: CurrentChatUser, ticket: MaintenanceTicketSummary): boolean {
  if (canEditMaintenance(user)) return true;
  if (ticket.assignment.type === "INTERNAL") return ticket.assignedUserId === user.id;
  if (ticket.assignment.type === "EXTERNAL") return ticket.reportedBy === user.id;
  return false;
}

function assertTransition(user: CurrentChatUser, current: MaintenanceTicketSummary, next: MaintenanceStatus): void {
  if (current.status === next) throw new MaintenanceConflictError("Ticket is already in that status.");
  if (isCompletedStatus(current.status)) throw new MaintenanceConflictError("Completed maintenance tickets are closed.");
  if (next === "Completed" && !canEditMaintenance(user)) throw new MaintenancePermissionError("Only Maintenance, Manager or Owner may close a ticket.");

  if (!canActOnTicket(user, current)) throw new MaintenancePermissionError("Only the assigned or reporting operator can update this ticket.");

  const allowed: Record<MaintenanceStatus, MaintenanceStatus[]> = {
    Open: ["In Progress"],
    "In Progress": ["Waiting Parts", "Completed"],
    "Waiting Parts": ["In Progress", "Completed"],
    Completed: [],
  };
  if (!allowed[current.status].includes(next)) throw new MaintenanceConflictError("Maintenance status transition is invalid.");
}

export function maintenanceErrorStatus(error: unknown): 400 | 403 | 409 {
  if (error instanceof MaintenancePermissionError) return 403;
  if (error instanceof MaintenanceConflictError) return 409;
  return 400;
}

export async function listAssignableMaintenanceUsers(env: MaintenanceBindings): Promise<MaintenanceAssignableOptions> {
  const rows = await env.DB.prepare(`
    SELECT u.user_id, u.full_name, u.role, u.status, p.can_access
    FROM users u
    INNER JOIN user_module_permissions p
      ON p.user_id = u.user_id
     AND p.module_key = 'maintenance'
     AND p.can_access = 1
    WHERE u.status = 'active'
      AND u.role = 'Maintenance'
    ORDER BY u.full_name
  `).all<AssignableUserRow>();
  const users = (rows.results ?? []).map((row) => ({ id: row.user_id, displayName: row.full_name, role: row.role }));
  return {
    users,
    externalAssignees: [...EXTERNAL_ASSIGNEES],
    externalFallbackAvailable: users.length === 0,
  };
}

export async function listMaintenanceTickets(env: MaintenanceBindings, filters: MaintenanceFilters): Promise<MaintenanceTicketSummary[]> {
  const conditions: string[] = [];
  const params: Array<string> = [];
  if (filters.status && filters.status !== "All") {
    const stored = storedStatusFilter(filters.status);
    conditions.push(`t.status IN (${stored.map(() => "?").join(", ")})`);
    params.push(...stored);
  }
  if (filters.search?.trim()) {
    conditions.push("(t.title LIKE ? OR t.description LIKE ? OR u.unit_name LIKE ? OR t.assigned_user_name LIKE ? OR t.location_area LIKE ? OR t.external_assignee_label LIKE ?)");
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q, q, q, q);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await env.DB.prepare(`
    SELECT t.*, u.unit_name AS room_name, rt.room_type_name AS accommodation_name,
      (SELECT COUNT(*) FROM maintenance_ticket_notes n WHERE n.ticket_id = t.ticket_id) AS note_count,
      (SELECT COUNT(*) FROM maintenance_ticket_photos p WHERE p.ticket_id = t.ticket_id) AS photo_count
    FROM maintenance_tickets t
    LEFT JOIN units u ON u.unit_id = t.room_id
    LEFT JOIN room_types rt ON rt.room_type_id = t.accommodation_id
    ${where}
    ORDER BY
      CASE WHEN t.status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END,
      t.created_at DESC,
      t.ticket_id DESC
    LIMIT 200
  `).bind(...params).all<MaintenanceTicketRow>();
  return (rows.results ?? []).map(mapTicket);
}

export async function getMaintenanceTicket(env: MaintenanceBindings, ticketId: number): Promise<MaintenanceTicketDetail | null> {
  const ticketRow = await loadTicketRow(env, ticketId);
  if (!ticketRow) return null;

  const [notes, photos, events] = await Promise.all([
    env.DB.prepare("SELECT * FROM maintenance_ticket_notes WHERE ticket_id = ? ORDER BY created_at ASC, note_id ASC").bind(ticketId).all<MaintenanceNoteRow>(),
    env.DB.prepare("SELECT * FROM maintenance_ticket_photos WHERE ticket_id = ? ORDER BY created_at ASC, photo_id ASC").bind(ticketId).all<MaintenancePhotoRow>(),
    env.DB.prepare("SELECT * FROM maintenance_ticket_events WHERE ticket_id = ? ORDER BY created_at ASC, event_id ASC").bind(ticketId).all<MaintenanceEventRow>(),
  ]);

  return {
    ...mapTicket(ticketRow),
    notes: (notes.results ?? []).map(mapNote),
    photos: (photos.results ?? []).map(mapPhoto),
    timeline: (events.results ?? []).map(mapEvent),
  };
}

export async function listOpenMaintenanceTicketDetailsForRoom(env: MaintenanceBindings, roomId: number): Promise<MaintenanceTicketDetail[]> {
  const rows = await env.DB.prepare(`
    SELECT ticket_id
    FROM maintenance_tickets
    WHERE room_id = ?
      AND status NOT IN ('Resolved', 'Closed')
    ORDER BY
      out_of_service DESC,
      CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
      CASE status WHEN 'Open' THEN 1 WHEN 'Assigned' THEN 2 WHEN 'In Progress' THEN 3 WHEN 'Waiting Parts' THEN 4 WHEN 'Resolved' THEN 5 ELSE 6 END,
      updated_at DESC
    LIMIT 20
  `).bind(roomId).all<{ ticket_id: number }>();

  const tickets = await Promise.all((rows.results ?? []).map((row) => getMaintenanceTicket(env, row.ticket_id)));
  return tickets.filter((ticket): ticket is MaintenanceTicketDetail => ticket !== null);
}

export async function createMaintenanceTicket(env: MaintenanceBindings, input: CreateMaintenanceTicketInput, user: CurrentChatUser): Promise<MaintenanceTicketDetail> {
  const unit = await requireUnit(env, input.roomId);
  const assignment = await resolveAssignment(env, input.assignment);
  const now = new Date().toISOString();
  const accommodationId = input.roomId ? unit?.room_type_id ?? input.accommodationId : input.accommodationId;
  const result = await env.DB.prepare(`
    INSERT INTO maintenance_tickets (
      title, description, category, priority, status, room_id, accommodation_id, location_area,
      assignment_type, assigned_user_id, assigned_user_name, external_assignee_label, external_assignee_note,
      reported_by, reported_by_name, created_at, updated_at, assigned_at, out_of_service, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')
  `).bind(
    input.title,
    input.description,
    input.category,
    toStoredPriority(input.priority),
    "Open",
    input.roomId,
    accommodationId,
    input.locationArea,
    assignment.assignmentType,
    assignment.assignedUserId,
    assignment.assignedUserName,
    assignment.externalAssigneeLabel,
    assignment.externalAssigneeNote,
    user.id,
    user.displayName,
    now,
    now,
    assignment.assignedAt,
    input.outOfService ? 1 : 0,
  ).run();
  const id = result.meta.last_row_id;
  await recordEvent(env, id, "created", null, "Open", user, now);
  if (assignment.assignmentType) await recordEvent(env, id, "assigned", null, assignment.assignmentType === "INTERNAL" ? assignment.assignedUserName : assignment.externalAssigneeLabel, user, now);
  if (input.outOfService) await recordEvent(env, id, "out_of_service_changed", "false", "true", user, now);
  const ticket = await getMaintenanceTicket(env, id);
  if (!ticket) throw new Error("Ticket was created but could not be loaded.");
  return ticket;
}

export async function updateMaintenanceTicket(env: MaintenanceBindings, ticketId: number, input: UpdateMaintenanceTicketInput, user: CurrentChatUser): Promise<MaintenanceTicketDetail | null> {
  const current = await getMaintenanceTicket(env, ticketId);
  if (!current) return null;
  if (isCompletedStatus(current.status)) throw new MaintenancePermissionError("Completed tickets cannot be modified.");
  if (!canEditMaintenance(user) && current.reportedBy !== user.id) throw new MaintenancePermissionError("Only Maintenance or the reporter can edit ticket details.");
  const unit = await requireUnit(env, input.roomId !== undefined ? input.roomId : current.roomId);
  const nextRoomId = input.roomId !== undefined ? input.roomId : current.roomId;
  const nextArea = input.locationArea !== undefined ? normalizeArea(input.locationArea) : current.locationArea;
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE maintenance_tickets
    SET title = ?, description = ?, category = ?, priority = ?, room_id = ?, accommodation_id = ?, location_area = ?, updated_at = ?
    WHERE ticket_id = ? AND updated_at = ?
  `).bind(
    input.title ?? current.title,
    input.description ?? current.description,
    input.category ?? current.category,
    input.priority ? toStoredPriority(input.priority) : toStoredPriority(current.priority),
    nextRoomId,
    nextRoomId ? unit?.room_type_id ?? input.accommodationId ?? current.accommodationId : input.accommodationId !== undefined ? input.accommodationId : current.accommodationId,
    nextArea,
    now,
    ticketId,
    current.updatedAt,
  ).run();
  if ((result.meta.changes ?? 0) !== 1) throw new MaintenanceConflictError("Ticket was updated by another client.");
  await recordEvent(env, ticketId, "updated", null, null, user, now);
  return getMaintenanceTicket(env, ticketId);
}

export async function assignMaintenanceTicket(env: MaintenanceBindings, ticketId: number, input: MaintenanceAssignmentInput | null, user: CurrentChatUser): Promise<MaintenanceTicketDetail | null> {
  const current = await getMaintenanceTicket(env, ticketId);
  if (!current) return null;
  if (isCompletedStatus(current.status)) throw new MaintenancePermissionError("Completed tickets cannot be modified.");
  if (!canEditMaintenance(user)) throw new MaintenancePermissionError("Only Maintenance, Manager or Owner may assign tickets.");
  const assignment = await resolveAssignment(env, input);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE maintenance_tickets
    SET assignment_type = ?, assigned_user_id = ?, assigned_user_name = ?,
        external_assignee_label = ?, external_assignee_note = ?, assigned_at = ?,
        updated_at = ?
    WHERE ticket_id = ? AND updated_at = ?
  `).bind(
    assignment.assignmentType,
    assignment.assignedUserId,
    assignment.assignedUserName,
    assignment.externalAssigneeLabel,
    assignment.externalAssigneeNote,
    assignment.assignedAt,
    now,
    ticketId,
    current.updatedAt,
  ).run();
  if ((result.meta.changes ?? 0) !== 1) throw new MaintenanceConflictError("Ticket assignment is stale.");
  await recordEvent(env, ticketId, "assigned", current.assignment.assignedUserName ?? current.assignment.externalAssigneeLabel, assignment.assignedUserName ?? assignment.externalAssigneeLabel, user, now);
  return getMaintenanceTicket(env, ticketId);
}

export async function transitionMaintenanceTicket(env: MaintenanceBindings, ticketId: number, input: MaintenanceStatusInput, user: CurrentChatUser): Promise<MaintenanceTicketDetail | null> {
  const current = await getMaintenanceTicket(env, ticketId);
  if (!current) return null;
  assertTransition(user, current, input.status);
  const now = new Date().toISOString();
  const startedAt = input.status === "In Progress" && !current.startedAt ? now : current.startedAt;
  const closedAt = input.status === "Completed" ? now : current.closedAt;
  const closedBy = input.status === "Completed" ? user.id : current.closedBy;
  const closedByName = input.status === "Completed" ? user.displayName : current.closedByName;
  const waitingReason = input.status === "Waiting Parts" ? input.reason : input.status === "In Progress" || input.status === "Completed" ? null : current.waitingReason;
  const result = await env.DB.prepare(`
    UPDATE maintenance_tickets
    SET status = ?, started_at = ?, resolved_at = ?, closed_at = ?, resolved_by = ?, resolved_by_name = ?,
        closed_by = ?, closed_by_name = ?, waiting_reason = ?, updated_at = ?
    WHERE ticket_id = ? AND updated_at = ?
  `).bind(toStoredStatus(input.status), startedAt, current.resolvedAt, closedAt, current.resolvedBy, current.resolvedByName, closedBy, closedByName, waitingReason, now, ticketId, current.updatedAt).run();
  if ((result.meta.changes ?? 0) !== 1) throw new MaintenanceConflictError("Ticket status is stale.");
  await recordEvent(env, ticketId, "status_changed", current.status, input.status, user, now);
  if (input.status === "Waiting Parts" && input.reason) await recordEvent(env, ticketId, "waiting_reason", null, input.reason, user, now);
  return getMaintenanceTicket(env, ticketId);
}

export async function updateMaintenanceOutOfService(env: MaintenanceBindings, ticketId: number, input: MaintenanceOutOfServiceInput, user: CurrentChatUser): Promise<MaintenanceTicketDetail | null> {
  if (!canEditMaintenance(user)) throw new MaintenancePermissionError("Only Maintenance, Manager or Owner can change Out of Service.");
  const current = await getMaintenanceTicket(env, ticketId);
  if (!current) return null;
  if (!current.roomId) throw new Error("Out of Service requires a room-related ticket.");
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    UPDATE maintenance_tickets
    SET out_of_service = ?, updated_at = ?
    WHERE ticket_id = ? AND updated_at = ?
  `).bind(input.outOfService ? 1 : 0, now, ticketId, current.updatedAt).run();
  if ((result.meta.changes ?? 0) !== 1) throw new MaintenanceConflictError("Ticket Out of Service state is stale.");
  await recordEvent(env, ticketId, "out_of_service_changed", current.outOfService ? "true" : "false", input.outOfService ? "true" : "false", user, now);
  return getMaintenanceTicket(env, ticketId);
}

export async function addMaintenanceNote(env: MaintenanceBindings, ticketId: number, input: CreateMaintenanceNoteInput, user: CurrentChatUser): Promise<MaintenanceNote | null> {
  const ticket = await getMaintenanceTicket(env, ticketId);
  if (!ticket) return null;
  if (!canEditMaintenance(user) && ticket.reportedBy !== user.id) throw new MaintenancePermissionError("Only the reporter or Maintenance can update this ticket.");
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO maintenance_ticket_notes (ticket_id, author_id, author_name, author_role, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(ticketId, user.id, user.displayName, user.role, input.body, now).run();
  await env.DB.prepare("UPDATE maintenance_tickets SET updated_at = ? WHERE ticket_id = ?").bind(now, ticketId).run();
  await recordEvent(env, ticketId, "note_added", null, null, user, now);
  const row = await env.DB.prepare("SELECT * FROM maintenance_ticket_notes WHERE note_id = ?").bind(result.meta.last_row_id).first<MaintenanceNoteRow>();
  return row ? mapNote(row) : null;
}

export async function addMaintenancePhoto(env: MaintenanceBindings, ticketId: number, input: CreateMaintenancePhotoInput, user: CurrentChatUser): Promise<MaintenancePhoto | null> {
  const ticket = await getMaintenanceTicket(env, ticketId);
  if (!ticket) return null;
  if (!canEditMaintenance(user) && ticket.reportedBy !== user.id) throw new MaintenancePermissionError("Only the reporter or Maintenance can update this ticket.");
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO maintenance_ticket_photos (ticket_id, storage_status, local_reference, url, caption, added_by, added_by_name, created_at)
    VALUES (?, 'local-reference', ?, ?, ?, ?, ?, ?)
  `).bind(ticketId, input.localReference, input.url, input.caption, user.id, user.displayName, now).run();
  await env.DB.prepare("UPDATE maintenance_tickets SET updated_at = ? WHERE ticket_id = ?").bind(now, ticketId).run();
  await recordEvent(env, ticketId, "photo_added", null, input.caption ?? input.localReference ?? input.url, user, now);
  const row = await env.DB.prepare("SELECT * FROM maintenance_ticket_photos WHERE photo_id = ?").bind(result.meta.last_row_id).first<MaintenancePhotoRow>();
  return row ? mapPhoto(row) : null;
}

export const maintenanceOptions = {
  statuses: PRODUCT_STATUSES,
  priorities: PRODUCT_PRIORITIES,
  categories: CATEGORIES,
  locationAreas: LOCATION_AREAS,
  externalAssignees: EXTERNAL_ASSIGNEES,
};
