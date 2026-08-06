import { isOwner, requireOwner, type CurrentUser } from "./current-user.service.js";

export type ProcurementStatus = "PENDING" | "DONE" | "REJECTED";
export type ProcurementLanguage = "en" | "th";

export interface ProcurementBindings {
  DB: D1Database;
}

interface RequestRow {
  request_id: number;
  requested_by: string;
  requested_by_name: string;
  status: string;
  custom_item_text: string | null;
  note: string | null;
  request_text_original?: string | null;
  original_language?: string | null;
  translated_text?: string | null;
  translated_language?: string | null;
  translated_at?: string | null;
  translation_provider?: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  ordered_at: string | null;
  received_at: string | null;
  rejected_at: string | null;
  closed_by?: string | null;
  closed_by_name?: string | null;
  closed_at?: string | null;
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
  requestTextOriginal: string;
  originalLanguage: ProcurementLanguage;
  translatedText: string | null;
  translatedLanguage: ProcurementLanguage | null;
  translatedAt: string | null;
  translationProvider: string | null;
  viewerLanguage: ProcurementLanguage;
  translationAvailable: boolean;
  translationPending: boolean;
  requestedBy: string;
  requestedByName: string;
  status: ProcurementStatus;
  createdAt: string;
  updatedAt: string;
  closedBy: string | null;
  closedByName: string | null;
  closedAt: string | null;
  items: ProcurementItem[];
}

export type ProcurementRequestDetail = ProcurementRequestSummary;

export interface CreateProcurementRequestInput {
  requestText: string;
}

export interface UpdateProcurementRequestInput {
  status: "DONE" | "REJECTED";
}

const STATUSES = new Set<ProcurementStatus>(["PENDING", "DONE", "REJECTED"]);
const CLOSED_STATUSES = new Set<ProcurementStatus>(["DONE", "REJECTED"]);
const STAFF_CLOSED_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeLanguage(value: unknown, fallback: ProcurementLanguage): ProcurementLanguage {
  return value === "th" ? "th" : value === "en" ? "en" : fallback;
}

function normalizeStatus(value: unknown): ProcurementStatus {
  if (value === "DONE" || value === "received") return "DONE";
  if (value === "REJECTED" || value === "rejected") return "REJECTED";
  return "PENDING";
}

function requestTextFromRow(row: RequestRow): string {
  return row.request_text_original ?? row.custom_item_text ?? row.note ?? "";
}

function closedAtFromRow(row: RequestRow, status: ProcurementStatus): string | null {
  if (!CLOSED_STATUSES.has(status)) return null;
  return row.closed_at ?? (status === "DONE" ? row.received_at : row.rejected_at) ?? row.updated_at;
}

function staffCutoff(now: Date): string {
  return new Date(now.getTime() - STAFF_CLOSED_VISIBLE_MS).toISOString();
}

export function normalizeCreateProcurementRequestInput(payload: unknown): CreateProcurementRequestInput {
  if (!payload || typeof payload !== "object") throw new Error("Procurement request payload is required.");
  const requestText =
    cleanString("requestText" in payload ? payload.requestText : undefined, 2000)
    ?? cleanString("request_text" in payload ? payload.request_text : undefined, 2000)
    ?? cleanString("customItemText" in payload ? payload.customItemText : undefined, 2000);
  if (!requestText) throw new Error("Write what needs to be bought.");
  return { requestText };
}

export function normalizeUpdateProcurementRequestInput(payload: unknown): UpdateProcurementRequestInput {
  if (!payload || typeof payload !== "object") throw new Error("Status payload is required.");
  const status = "status" in payload ? payload.status : undefined;
  if (status === "DONE" || status === "REJECTED") return { status };
  if (status === "received") return { status: "DONE" };
  if (status === "rejected") return { status: "REJECTED" };
  throw new Error("Status is invalid.");
}

function mapRequest(row: RequestRow, user: CurrentUser): ProcurementRequestSummary {
  const status = normalizeStatus(row.status);
  const originalLanguage = normalizeLanguage(row.original_language, "en");
  const translatedLanguage = row.translated_text ? normalizeLanguage(row.translated_language, user.preferredLanguage) : null;
  const viewerLanguage = normalizeLanguage(user.preferredLanguage, "en");
  return {
    id: row.request_id,
    requestTextOriginal: requestTextFromRow(row),
    originalLanguage,
    translatedText: row.translated_text ?? null,
    translatedLanguage,
    translatedAt: row.translated_at ?? null,
    translationProvider: row.translation_provider ?? null,
    viewerLanguage,
    translationAvailable: Boolean(row.translated_text && translatedLanguage === viewerLanguage),
    translationPending: viewerLanguage !== originalLanguage && !row.translated_text,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedBy: row.closed_by ?? row.updated_by ?? null,
    closedByName: row.closed_by_name ?? row.updated_by_name ?? null,
    closedAt: closedAtFromRow(row, status),
    items: [],
  };
}

export async function listActiveProcurementItems(env: ProcurementBindings): Promise<ProcurementItem[]> {
  void env;
  return [];
}

export async function createProcurementRequest(env: ProcurementBindings, input: CreateProcurementRequestInput, user: CurrentUser): Promise<ProcurementRequestDetail> {
  const now = new Date().toISOString();
  const originalLanguage = normalizeLanguage(user.preferredLanguage, "en");
  const created = await env.DB.prepare(`
    INSERT INTO procurement_requests (
      requested_by,
      requested_by_name,
      status,
      custom_item_text,
      note,
      request_text_original,
      original_language,
      translated_text,
      translated_language,
      translated_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, 'PENDING', ?, NULL, ?, ?, NULL, NULL, NULL, ?, ?)
  `).bind(user.id, user.displayName, input.requestText, input.requestText, originalLanguage, now, now).run();
  const detail = await getProcurementRequest(env, Number(created.meta.last_row_id), user);
  if (!detail) throw new Error("Procurement request was created but could not be loaded.");
  return detail;
}

export async function listProcurementRequests(env: ProcurementBindings, user: CurrentUser, status?: ProcurementStatus | "all", now = new Date()): Promise<ProcurementRequestSummary[]> {
  const params: unknown[] = [];
  let where = "";
  if (isOwner(user)) {
    if (status && status !== "all") {
      where = "WHERE status = ?";
      params.push(status);
    }
  } else {
    const closedCutoff = staffCutoff(now);
    where = `
      WHERE requested_by = ?
        AND (
          status = 'PENDING'
          OR (status IN ('DONE', 'REJECTED') AND COALESCE(closed_at, received_at, rejected_at, updated_at) >= ?)
        )
    `;
    params.push(user.id, closedCutoff);
    if (status && status !== "all") {
      where += " AND status = ?";
      params.push(status);
    }
  }
  const rows = await env.DB.prepare(`
    SELECT *
    FROM procurement_requests
    ${where}
    ORDER BY
      CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,
      COALESCE(closed_at, received_at, rejected_at, created_at) DESC,
      created_at DESC
    LIMIT 200
  `).bind(...params).all<RequestRow>();
  return (rows.results ?? []).map((row) => mapRequest(row, user));
}

export async function getProcurementRequest(env: ProcurementBindings, requestId: number, user?: CurrentUser): Promise<ProcurementRequestDetail | null> {
  const row = await env.DB.prepare("SELECT * FROM procurement_requests WHERE request_id = ?").bind(requestId).first<RequestRow>();
  if (!row) return null;
  const viewer = user ?? {
    id: row.requested_by,
    firstName: "",
    lastName: "",
    displayName: row.requested_by_name,
    fullName: row.requested_by_name,
    profilePhotoUrl: null,
    role: "Operations",
    preferredLanguage: normalizeLanguage(row.original_language, "en"),
    username: row.requested_by,
    email: null,
    status: "active",
    views: ["staff"],
    permissions: [],
    actionPermissions: [],
    lastLoginAt: null,
  } satisfies CurrentUser;
  return mapRequest(row, viewer);
}

export async function getOwnerProcurementRequest(env: ProcurementBindings, requestId: number, user: CurrentUser): Promise<ProcurementRequestDetail | null> {
  requireOwner(user);
  return getProcurementRequest(env, requestId, user);
}

export async function updateProcurementRequestStatus(env: ProcurementBindings, requestId: number, input: UpdateProcurementRequestInput, user: CurrentUser): Promise<ProcurementRequestDetail | null> {
  requireOwner(user);
  const current = await getProcurementRequest(env, requestId, user);
  if (!current) return null;
  if (!STATUSES.has(current.status)) throw new Error("Status is invalid.");
  const now = new Date().toISOString();
  const legacyColumn = input.status === "DONE" ? "received_at" : "rejected_at";
  await env.DB.prepare(`
    UPDATE procurement_requests
    SET
      status = ?,
      updated_at = ?,
      ${legacyColumn} = COALESCE(${legacyColumn}, ?),
      closed_at = COALESCE(closed_at, ?),
      closed_by = ?,
      closed_by_name = ?,
      updated_by = ?,
      updated_by_name = ?
    WHERE request_id = ?
  `).bind(input.status, now, now, now, user.id, user.displayName, user.id, user.displayName, requestId).run();
  return getProcurementRequest(env, requestId, user);
}

export function procurementUserContext(user: CurrentUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role,
    isOwner: isOwner(user),
    preferredLanguage: user.preferredLanguage,
  };
}
