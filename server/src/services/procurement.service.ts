import { isOwner, requireOwner, type CurrentUser } from "./current-user.service.js";

export type ProcurementStatus = "requested" | "reviewed" | "ordered" | "received" | "rejected";

export interface ProcurementBindings {
  DB: D1Database;
}

const STATUSES: ProcurementStatus[] = ["requested", "reviewed", "ordered", "received", "rejected"];

interface ItemRow {
  item_id: number;
  code: string;
  name_en: string;
  name_th: string | null;
  category: string;
  active: number;
  default_unit: string | null;
  default_quantity: string | null;
  notes: string | null;
}

interface RequestRow {
  request_id: number;
  requested_by: string;
  requested_by_name: string;
  status: ProcurementStatus;
  custom_item_text: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  ordered_at: string | null;
  received_at: string | null;
  rejected_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
}

export interface ProcurementItem {
  id: number;
  code: string;
  nameEn: string;
  nameTh: string | null;
  category: string;
  active: boolean;
  defaultUnit: string | null;
  defaultQuantity: string | null;
  notes: string | null;
}

export interface ProcurementRequestSummary {
  id: number;
  requestedBy: string;
  requestedByName: string;
  status: ProcurementStatus;
  customItemText: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  rejectedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  items: ProcurementItem[];
}

export type ProcurementRequestDetail = ProcurementRequestSummary;

export interface CreateProcurementRequestInput {
  itemIds: number[];
  customItemText: string | null;
  note: string | null;
}

export interface UpdateProcurementRequestInput {
  status: ProcurementStatus;
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function positiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  for (const item of value) {
    const parsed = Number(item);
    if (Number.isInteger(parsed) && parsed > 0) seen.add(parsed);
  }
  return [...seen];
}

export function normalizeCreateProcurementRequestInput(payload: unknown): CreateProcurementRequestInput {
  if (!payload || typeof payload !== "object") throw new Error("Supply request payload is required.");
  const itemIds = positiveIds("itemIds" in payload ? payload.itemIds : undefined);
  const customItemText = cleanString("customItemText" in payload ? payload.customItemText : undefined, 240);
  const note = cleanString("note" in payload ? payload.note : undefined, 500);
  if (itemIds.length === 0 && !customItemText) throw new Error("Choose at least one item or add another item.");
  return { itemIds, customItemText, note };
}

export function normalizeUpdateProcurementRequestInput(payload: unknown): UpdateProcurementRequestInput {
  if (!payload || typeof payload !== "object") throw new Error("Status payload is required.");
  const status = "status" in payload ? payload.status : undefined;
  if (typeof status === "string" && (STATUSES as string[]).includes(status)) return { status: status as ProcurementStatus };
  throw new Error("Status is invalid.");
}

function mapItem(row: ItemRow): ProcurementItem {
  return {
    id: row.item_id,
    code: row.code,
    nameEn: row.name_en,
    nameTh: row.name_th,
    category: row.category,
    active: row.active === 1,
    defaultUnit: row.default_unit,
    defaultQuantity: row.default_quantity,
    notes: row.notes,
  };
}

function mapRequest(row: RequestRow, items: ProcurementItem[]): ProcurementRequestSummary {
  return {
    id: row.request_id,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    status: row.status,
    customItemText: row.custom_item_text,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    orderedAt: row.ordered_at,
    receivedAt: row.received_at,
    rejectedAt: row.rejected_at,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name,
    items,
  };
}

export async function listActiveProcurementItems(env: ProcurementBindings): Promise<ProcurementItem[]> {
  const rows = await env.DB.prepare(`
    SELECT item_id, code, name_en, name_th, category, active, default_unit, default_quantity, notes
    FROM procurement_items
    WHERE active = 1
    ORDER BY category, name_en
  `).all<ItemRow>();
  return (rows.results ?? []).map(mapItem);
}

async function getRequestItems(env: ProcurementBindings, requestIds: number[]): Promise<Map<number, ProcurementItem[]>> {
  const result = new Map<number, ProcurementItem[]>();
  if (requestIds.length === 0) return result;
  const placeholders = requestIds.map(() => "?").join(", ");
  const rows = await env.DB.prepare(`
    SELECT ri.request_id, i.item_id, i.code, i.name_en, i.name_th, i.category, i.active, i.default_unit, i.default_quantity, i.notes
    FROM procurement_request_items ri
    JOIN procurement_items i ON i.item_id = ri.item_id
    WHERE ri.request_id IN (${placeholders})
    ORDER BY i.category, i.name_en
  `).bind(...requestIds).all<ItemRow & { request_id: number }>();
  for (const row of rows.results ?? []) {
    const existing = result.get(row.request_id) ?? [];
    existing.push(mapItem(row));
    result.set(row.request_id, existing);
  }
  return result;
}

export async function createProcurementRequest(env: ProcurementBindings, input: CreateProcurementRequestInput, user: CurrentUser): Promise<ProcurementRequestDetail> {
  if (input.itemIds.length > 0) {
    const placeholders = input.itemIds.map(() => "?").join(", ");
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM procurement_items WHERE active = 1 AND item_id IN (${placeholders})`)
      .bind(...input.itemIds)
      .first<{ total: number }>();
    if ((count?.total ?? 0) !== input.itemIds.length) throw new Error("One or more selected items are invalid.");
  }
  const now = new Date().toISOString();
  const created = await env.DB.prepare(`
    INSERT INTO procurement_requests (requested_by, requested_by_name, status, custom_item_text, note, created_at, updated_at)
    VALUES (?, ?, 'requested', ?, ?, ?, ?)
  `).bind(user.id, user.displayName, input.customItemText, input.note, now, now).run();
  const requestId = created.meta.last_row_id;
  if (input.itemIds.length > 0) {
    await env.DB.batch(input.itemIds.map((itemId) => env.DB.prepare(`
      INSERT OR IGNORE INTO procurement_request_items (request_id, item_id, created_at)
      VALUES (?, ?, ?)
    `).bind(requestId, itemId, now)));
  }
  const detail = await getProcurementRequest(env, requestId);
  if (!detail) throw new Error("Supply request was created but could not be loaded.");
  return detail;
}

export async function listProcurementRequests(env: ProcurementBindings, user: CurrentUser, status?: ProcurementStatus | "all"): Promise<ProcurementRequestSummary[]> {
  requireOwner(user);
  const params: string[] = [];
  const where = status && status !== "all" ? "WHERE status = ?" : "";
  if (status && status !== "all") params.push(status);
  const rows = await env.DB.prepare(`
    SELECT * FROM procurement_requests
    ${where}
    ORDER BY created_at DESC
    LIMIT 200
  `).bind(...params).all<RequestRow>();
  const requests = rows.results ?? [];
  const itemsByRequest = await getRequestItems(env, requests.map((row) => row.request_id));
  return requests.map((row) => mapRequest(row, itemsByRequest.get(row.request_id) ?? []));
}

export async function getProcurementRequest(env: ProcurementBindings, requestId: number): Promise<ProcurementRequestDetail | null> {
  const row = await env.DB.prepare("SELECT * FROM procurement_requests WHERE request_id = ?").bind(requestId).first<RequestRow>();
  if (!row) return null;
  const itemsByRequest = await getRequestItems(env, [requestId]);
  return mapRequest(row, itemsByRequest.get(requestId) ?? []);
}

export async function getOwnerProcurementRequest(env: ProcurementBindings, requestId: number, user: CurrentUser): Promise<ProcurementRequestDetail | null> {
  requireOwner(user);
  return getProcurementRequest(env, requestId);
}

export async function updateProcurementRequestStatus(env: ProcurementBindings, requestId: number, input: UpdateProcurementRequestInput, user: CurrentUser): Promise<ProcurementRequestDetail | null> {
  requireOwner(user);
  const current = await getProcurementRequest(env, requestId);
  if (!current) return null;
  const now = new Date().toISOString();
  const timestampColumn = `${input.status}_at`;
  const allowedTimestampColumns: Record<ProcurementStatus, string> = {
    requested: "updated_at",
    reviewed: "reviewed_at",
    ordered: "ordered_at",
    received: "received_at",
    rejected: "rejected_at",
  };
  const column = allowedTimestampColumns[input.status] ?? timestampColumn;
  if (column === "updated_at") {
    await env.DB.prepare(`
      UPDATE procurement_requests
      SET status = ?, updated_at = ?, updated_by = ?, updated_by_name = ?
      WHERE request_id = ?
    `).bind(input.status, now, user.id, user.displayName, requestId).run();
  } else {
    await env.DB.prepare(`
      UPDATE procurement_requests
      SET status = ?, updated_at = ?, ${column} = COALESCE(${column}, ?), updated_by = ?, updated_by_name = ?
      WHERE request_id = ?
    `).bind(input.status, now, now, user.id, user.displayName, requestId).run();
  }
  return getProcurementRequest(env, requestId);
}

export function procurementUserContext(user: CurrentUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    isOwner: isOwner(user),
  };
}
