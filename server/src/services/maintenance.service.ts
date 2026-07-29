import type { CurrentChatUser } from "./chat.service.js";

export type MaintenanceStatus = "Open" | "Assigned" | "In Progress" | "Waiting Parts" | "Resolved" | "Closed";
export type MaintenancePriority = "Low" | "Medium" | "High" | "Critical";
export type MaintenanceCategory =
  | "Electrical"
  | "Plumbing"
  | "Cleaning"
  | "Furniture"
  | "Air Conditioning"
  | "Garden"
  | "Pool"
  | "Restaurant"
  | "IT"
  | "Other";

export interface MaintenanceBindings {
  DB: D1Database;
}

const STATUSES: MaintenanceStatus[] = ["Open", "Assigned", "In Progress", "Waiting Parts", "Resolved", "Closed"];
const PRIORITIES: MaintenancePriority[] = ["Low", "Medium", "High", "Critical"];
const CATEGORIES: MaintenanceCategory[] = [
  "Electrical",
  "Plumbing",
  "Cleaning",
  "Furniture",
  "Air Conditioning",
  "Garden",
  "Pool",
  "Restaurant",
  "IT",
  "Other",
];

interface MaintenanceTicketRow {
  ticket_id: number;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  room_id: number | null;
  room_name: string | null;
  accommodation_id: number | null;
  accommodation_name: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  reported_by: string;
  reported_by_name: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
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
  assignedUserId: string | null;
  assignedUserName: string | null;
  reportedBy: string;
  reportedByName: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
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

export interface CreateMaintenanceTicketInput {
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  roomId: number | null;
  accommodationId: number | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
}

export interface UpdateMaintenanceTicketInput {
  title?: string;
  description?: string;
  category?: MaintenanceCategory;
  priority?: MaintenancePriority;
  status?: MaintenanceStatus;
  roomId?: number | null;
  accommodationId?: number | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
}

export interface CreateMaintenanceNoteInput {
  body: string;
}

export interface CreateMaintenancePhotoInput {
  localReference: string | null;
  url: string | null;
  caption: string | null;
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
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

export function normalizeCreateMaintenanceTicketInput(payload: unknown): CreateMaintenanceTicketInput {
  if (!payload || typeof payload !== "object") throw new Error("Ticket payload is required.");
  return {
    title: requiredString("title" in payload ? payload.title : undefined, "Title", 140),
    description: requiredString("description" in payload ? payload.description : undefined, "Description", 2000),
    category: assertEnum("category" in payload ? payload.category : undefined, CATEGORIES, "Category"),
    priority: assertEnum("priority" in payload ? payload.priority : undefined, PRIORITIES, "Priority"),
    roomId: optionalId("roomId" in payload ? payload.roomId : undefined, "roomId"),
    accommodationId: optionalId("accommodationId" in payload ? payload.accommodationId : undefined, "accommodationId"),
    assignedUserId: optionalString("assignedUserId" in payload ? payload.assignedUserId : undefined, 80),
    assignedUserName: optionalString("assignedUserName" in payload ? payload.assignedUserName : undefined, 120),
  };
}

export function normalizeUpdateMaintenanceTicketInput(payload: unknown): UpdateMaintenanceTicketInput {
  if (!payload || typeof payload !== "object") throw new Error("Ticket payload is required.");
  const input: UpdateMaintenanceTicketInput = {};
  if ("title" in payload) input.title = requiredString(payload.title, "Title", 140);
  if ("description" in payload) input.description = requiredString(payload.description, "Description", 2000);
  if ("category" in payload) input.category = assertEnum(payload.category, CATEGORIES, "Category");
  if ("priority" in payload) input.priority = assertEnum(payload.priority, PRIORITIES, "Priority");
  if ("status" in payload) input.status = assertEnum(payload.status, STATUSES, "Status");
  if ("roomId" in payload) input.roomId = optionalId(payload.roomId, "roomId");
  if ("accommodationId" in payload) input.accommodationId = optionalId(payload.accommodationId, "accommodationId");
  if ("assignedUserId" in payload) input.assignedUserId = optionalString(payload.assignedUserId, 80);
  if ("assignedUserName" in payload) input.assignedUserName = optionalString(payload.assignedUserName, 120);
  if (Object.keys(input).length === 0) throw new Error("At least one ticket field is required.");
  return input;
}

export function normalizeMaintenanceNoteInput(payload: unknown): CreateMaintenanceNoteInput {
  if (!payload || typeof payload !== "object") throw new Error("Note payload is required.");
  return { body: requiredString("body" in payload ? payload.body : undefined, "Note", 2000) };
}

export function normalizeMaintenancePhotoInput(payload: unknown): CreateMaintenancePhotoInput {
  if (!payload || typeof payload !== "object") throw new Error("Photo payload is required.");
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
  return {
    id: row.ticket_id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    roomId: row.room_id,
    roomName: row.room_name,
    accommodationId: row.accommodation_id,
    accommodationName: row.accommodation_name,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    reportedBy: row.reported_by,
    reportedByName: row.reported_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
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

export async function listMaintenanceTickets(env: MaintenanceBindings, filters: MaintenanceFilters): Promise<MaintenanceTicketSummary[]> {
  const conditions: string[] = [];
  const params: Array<string> = [];
  if (filters.status && filters.status !== "All") {
    conditions.push("t.status = ?");
    params.push(filters.status);
  }
  if (filters.search?.trim()) {
    conditions.push("(t.title LIKE ? OR t.description LIKE ? OR u.unit_name LIKE ? OR t.assigned_user_name LIKE ?)");
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q, q);
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
      CASE t.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
      CASE t.status WHEN 'Open' THEN 1 WHEN 'Assigned' THEN 2 WHEN 'In Progress' THEN 3 WHEN 'Waiting Parts' THEN 4 WHEN 'Resolved' THEN 5 ELSE 6 END,
      t.updated_at DESC
    LIMIT 200
  `).bind(...params).all<MaintenanceTicketRow>();
  return (rows.results ?? []).map(mapTicket);
}

export async function getMaintenanceTicket(env: MaintenanceBindings, ticketId: number): Promise<MaintenanceTicketDetail | null> {
  const ticketRow = await env.DB.prepare(`
    SELECT t.*, u.unit_name AS room_name, rt.room_type_name AS accommodation_name,
      (SELECT COUNT(*) FROM maintenance_ticket_notes n WHERE n.ticket_id = t.ticket_id) AS note_count,
      (SELECT COUNT(*) FROM maintenance_ticket_photos p WHERE p.ticket_id = t.ticket_id) AS photo_count
    FROM maintenance_tickets t
    LEFT JOIN units u ON u.unit_id = t.room_id
    LEFT JOIN room_types rt ON rt.room_type_id = t.accommodation_id
    WHERE t.ticket_id = ?
  `).bind(ticketId).first<MaintenanceTicketRow>();
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

export async function createMaintenanceTicket(env: MaintenanceBindings, input: CreateMaintenanceTicketInput, user: CurrentChatUser): Promise<MaintenanceTicketDetail> {
  const now = new Date().toISOString();
  const status: MaintenanceStatus = input.assignedUserId ? "Assigned" : "Open";
  const result = await env.DB.prepare(`
    INSERT INTO maintenance_tickets (
      title, description, category, priority, status, room_id, accommodation_id,
      assigned_user_id, assigned_user_name, reported_by, reported_by_name, created_at, updated_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')
  `).bind(
    input.title,
    input.description,
    input.category,
    input.priority,
    status,
    input.roomId,
    input.accommodationId,
    input.assignedUserId,
    input.assignedUserName,
    user.id,
    user.displayName,
    now,
    now,
  ).run();
  const id = result.meta.last_row_id;
  await recordEvent(env, id, "created", null, status, user, now);
  const ticket = await getMaintenanceTicket(env, id);
  if (!ticket) throw new Error("Ticket was created but could not be loaded.");
  return ticket;
}

export async function updateMaintenanceTicket(env: MaintenanceBindings, ticketId: number, input: UpdateMaintenanceTicketInput, user: CurrentChatUser): Promise<MaintenanceTicketDetail | null> {
  const current = await getMaintenanceTicket(env, ticketId);
  if (!current) return null;
  const now = new Date().toISOString();
  const nextStatus = input.status ?? current.status;
  const resolvedAt = nextStatus === "Resolved" && current.status !== "Resolved" ? now : nextStatus === "Closed" ? current.resolvedAt ?? now : current.resolvedAt;

  await env.DB.prepare(`
    UPDATE maintenance_tickets
    SET title = ?, description = ?, category = ?, priority = ?, status = ?, room_id = ?, accommodation_id = ?,
        assigned_user_id = ?, assigned_user_name = ?, resolved_at = ?, updated_at = ?
    WHERE ticket_id = ?
  `).bind(
    input.title ?? current.title,
    input.description ?? current.description,
    input.category ?? current.category,
    input.priority ?? current.priority,
    nextStatus,
    input.roomId !== undefined ? input.roomId : current.roomId,
    input.accommodationId !== undefined ? input.accommodationId : current.accommodationId,
    input.assignedUserId !== undefined ? input.assignedUserId : current.assignedUserId,
    input.assignedUserName !== undefined ? input.assignedUserName : current.assignedUserName,
    resolvedAt,
    now,
    ticketId,
  ).run();

  if (input.status && input.status !== current.status) await recordEvent(env, ticketId, "status_changed", current.status, input.status, user, now);
  if (input.assignedUserId !== undefined && input.assignedUserId !== current.assignedUserId) await recordEvent(env, ticketId, "assigned", current.assignedUserName, input.assignedUserName ?? input.assignedUserId, user, now);

  return getMaintenanceTicket(env, ticketId);
}

export async function addMaintenanceNote(env: MaintenanceBindings, ticketId: number, input: CreateMaintenanceNoteInput, user: CurrentChatUser): Promise<MaintenanceNote | null> {
  const ticket = await getMaintenanceTicket(env, ticketId);
  if (!ticket) return null;
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
  statuses: STATUSES,
  priorities: PRIORITIES,
  categories: CATEGORIES,
};
