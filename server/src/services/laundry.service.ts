import type { CurrentUser } from "./current-user.service.js";
import { emitNotification, notificationPayload, type NotificationBindings } from "./notifications.service.js";

export interface LaundryBindings extends NotificationBindings { DB: D1Database; LAUNDRY_MAKE_WEBHOOK_URL?: string; }
export type LaundryStatus = "SENT" | "RECEIVED" | "DISCREPANCY";
export interface LaundryQuantityInput { sku: string; quantity: number; }
export interface LaundryLoadInput { totalKg: number; quantities: LaundryQuantityInput[]; note?: string | null; }
export interface LaundryReceiveInput { totalKg: number; quantities: LaundryQuantityInput[]; note?: string | null; }

interface ItemRow { sku: string; name_en: string; name_th: string; purchased_total: number; display_order: number; }
interface LoadRow { laundry_load_id: number; load_code: string; status: LaundryStatus; sent_kg: number; received_kg: number | null; sent_note: string | null; received_note: string | null; sent_by_user_id: string; sent_by_name: string; sent_at: string; received_by_user_id: string | null; received_by_name: string | null; received_at: string | null; sent_photo_url?: string | null; received_photo_url?: string | null; }
interface LoadItemRow { laundry_load_id: number; sku: string; sent_quantity: number; received_quantity: number | null; }

const MAX_NOTE_LENGTH = 600;
const WEIGHT_TOLERANCE_RATIO = 0.15;
const MIN_WEIGHT_TOLERANCE_KG = 0.5;

function allowedWeightVariance(sentKg: number): number {
  return Math.max(MIN_WEIGHT_TOLERANCE_KG, Math.round(sentKg * WEIGHT_TOLERANCE_RATIO * 100) / 100);
}

function weightHasDiscrepancy(sentKg: number, receivedKg: number): boolean {
  return Math.abs(receivedKg - sentKg) > allowedWeightVariance(sentKg);
}

function cleanNote(value: unknown): string | null { return typeof value === "string" ? (value.trim().slice(0, MAX_NOTE_LENGTH) || null) : null; }
function numberValue(value: unknown, label: string, allowZero = false): number { const n = typeof value === "number" ? value : Number(value); if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error(`${label} must be greater than zero.`); return Math.round(n * 100) / 100; }
function quantitiesFrom(value: unknown): LaundryQuantityInput[] { if (!Array.isArray(value)) throw new Error("Laundry item quantities are required."); const seen = new Set<string>(); return value.map((entry) => { if (!entry || typeof entry !== "object") throw new Error("Laundry item is invalid."); const sku = typeof (entry as { sku?: unknown }).sku === "string" ? (entry as { sku: string }).sku.trim().slice(0, 64) : ""; const raw = (entry as { quantity?: unknown }).quantity; const quantity = Number(raw); if (!sku || !Number.isInteger(quantity) || quantity < 0 || seen.has(sku)) throw new Error("Laundry quantity is invalid."); seen.add(sku); return { sku, quantity }; }).filter((entry) => entry.quantity > 0); }
export function normalizeLaundryLoadInput(payload: unknown): LaundryLoadInput { if (!payload || typeof payload !== "object") throw new Error("Laundry dispatch details are required."); const quantities = quantitiesFrom((payload as { quantities?: unknown }).quantities); if (!quantities.length) throw new Error("Add at least one laundry item."); return { totalKg: numberValue((payload as { totalKg?: unknown }).totalKg, "Total kilograms"), quantities, note: cleanNote((payload as { note?: unknown }).note) }; }
export function normalizeLaundryReceiveInput(payload: unknown): LaundryReceiveInput { if (!payload || typeof payload !== "object") throw new Error("Laundry return details are required."); return { totalKg: numberValue((payload as { totalKg?: unknown }).totalKg, "Returned kilograms", true), quantities: quantitiesFrom((payload as { quantities?: unknown }).quantities), note: cleanNote((payload as { note?: unknown }).note) }; }

async function inventoryRows(env: LaundryBindings): Promise<ItemRow[]> { const rows = await env.DB.prepare("SELECT sku, name_en, name_th, purchased_total, display_order FROM laundry_inventory_items ORDER BY display_order").all<ItemRow>(); return rows.results ?? []; }
async function calculatedInventory(env: LaundryBindings) {
  const items = await inventoryRows(env);
  const movements = await env.DB.prepare(`SELECT i.sku, COALESCE(SUM(i.sent_quantity), 0) AS sent_total, COALESCE(SUM(i.received_quantity), 0) AS received_total, COALESCE(SUM(CASE WHEN l.status = 'SENT' THEN i.sent_quantity ELSE 0 END), 0) AS out_total FROM laundry_load_items i JOIN laundry_loads l ON l.laundry_load_id = i.laundry_load_id GROUP BY i.sku`).all<{ sku: string; sent_total: number; received_total: number; out_total: number }>();
  const bySku = new Map((movements.results ?? []).map((row) => [row.sku, row]));
  return items.map((item) => { const m = bySku.get(item.sku); const sent = Number(m?.sent_total ?? 0); const received = Number(m?.received_total ?? 0); return { sku: item.sku, nameEn: item.name_en, nameTh: item.name_th, purchasedTotal: item.purchased_total, inStorage: Math.max(0, item.purchased_total - sent + received), outAtLaundry: Number(m?.out_total ?? 0) }; });
}
function loadItems(rows: LoadItemRow[], inventory: Awaited<ReturnType<typeof calculatedInventory>>) { const map = new Map(rows.map((row) => [row.sku, row])); return inventory.map((item) => { const row = map.get(item.sku); const sent = row?.sent_quantity ?? 0; const received = row?.received_quantity ?? null; return { ...item, sentQuantity: sent, receivedQuantity: received, difference: received === null ? null : received - sent }; }); }
async function loadList(env: LaundryBindings, inventory: Awaited<ReturnType<typeof calculatedInventory>>) {
  const result = await env.DB.prepare(`SELECT l.*, sender.profile_photo_url AS sent_photo_url, receiver.profile_photo_url AS received_photo_url FROM laundry_loads l LEFT JOIN users sender ON sender.user_id = l.sent_by_user_id LEFT JOIN users receiver ON receiver.user_id = l.received_by_user_id ORDER BY CASE l.status WHEN 'SENT' THEN 0 ELSE 1 END, l.sent_at DESC LIMIT 60`).all<LoadRow>();
  const loads = result.results ?? []; if (!loads.length) return [];
  const ids = loads.map((item) => item.laundry_load_id); const placeholders = ids.map(() => "?").join(",");
  const itemRows = await env.DB.prepare(`SELECT laundry_load_id, sku, sent_quantity, received_quantity FROM laundry_load_items WHERE laundry_load_id IN (${placeholders})`).bind(...ids).all<LoadItemRow>();
  return loads.map((row) => { const items = loadItems((itemRows.results ?? []).filter((item) => item.laundry_load_id === row.laundry_load_id), inventory); const discrepancy = row.status === "DISCREPANCY"; return { id: row.laundry_load_id, code: row.load_code, status: row.status, sentKg: row.sent_kg, receivedKg: row.received_kg, sentNote: row.sent_note, receivedNote: row.received_note, sentAt: row.sent_at, receivedAt: row.received_at, sentBy: { id: row.sent_by_user_id, name: row.sent_by_name, profilePhotoUrl: row.sent_photo_url ?? null }, receivedBy: row.received_by_user_id ? { id: row.received_by_user_id, name: row.received_by_name, profilePhotoUrl: row.received_photo_url ?? null } : null, discrepancy, items }; });
}
export async function getLaundryWorkspace(env: LaundryBindings) { const inventory = await calculatedInventory(env); const loads = await loadList(env, inventory); return { inventory, openLoads: loads.filter((load) => load.status === "SENT"), recentLoads: loads.filter((load) => load.status !== "SENT") }; }
async function notifyLaundry(env: LaundryBindings, input: { type: "sent" | "received" | "discrepancy"; id: number; code: string; actor: string }) { const isSent = input.type === "sent"; const mismatch = input.type === "discrepancy"; await emitNotification(env, { type: isSent ? "laundry.load.sent" : mismatch ? "laundry.load.discrepancy" : "laundry.load.received", entityType: "laundry_load", entityId: input.id, dedupeKey: `laundry:${input.type}:${input.id}`, audience: "all-active", data: { laundryLoadId: input.id, code: input.code }, payload: { en: notificationPayload(mismatch ? `Laundry discrepancy - ${input.code}` : isSent ? `Laundry sent - ${input.code}` : `Laundry returned - ${input.code}`, mismatch ? "Returned quantities differ. Review the load now." : isSent ? `${input.actor} recorded a load for external laundry.` : `${input.actor} completed the return check.`, `laundry-${input.id}`, "/housekeeping"), th: notificationPayload(mismatch ? `ผ้าซักมีจำนวนไม่ตรง - ${input.code}` : isSent ? `ส่งผ้าซักแล้ว - ${input.code}` : `รับผ้าซักแล้ว - ${input.code}`, mismatch ? "จำนวนที่รับกลับไม่ตรง กรุณาตรวจสอบทันที" : isSent ? `${input.actor} บันทึกการส่งผ้าไปซักแล้ว` : `${input.actor} ตรวจรับผ้าซักเรียบร้อยแล้ว`, `laundry-${input.id}`, "/housekeeping") } }); }

async function requestLaundryPickup(env: LaundryBindings, input: { code: string; totalKg: number; items: Array<{ sku: string; nameTh: string; quantity: number }> }) {
  const endpoint = env.LAUNDRY_MAKE_WEBHOOK_URL?.trim();
  if (!endpoint) throw new Error("Laundry pickup messaging is not configured.");
  const lines = input.items.map((item) => `${item.nameTh} ${item.quantity} ชิ้น`);
  const messageTh = [
    "VANARA BUNGALOWS · BAILAN BAY",
    "",
    "ขอให้เข้ารับผ้าสำหรับซักและรีด",
    "",
    `เลขที่รายการ: ${input.code}`,
    "",
    ...lines,
    "",
    `น้ำหนักรวม ${input.totalKg} กก.`,
    "",
    "กรุณานัดรับผ้าที่ Vanara Bungalows, Bailan Bay",
    "",
    "หากมีข้อสงสัยหรือปัญหา ติดต่อ Vanara: 080 695 0139",
  ].join("\n");
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "laundry_pickup_requested",
        shipment_code: input.code,
        property: "Vanara Bungalows",
        location: "Bailan Bay, Koh Chang",
        contact_phone: "0806950139",
        total_kg: input.totalKg,
        items: input.items.map((item) => ({ key: item.sku, label_th: item.nameTh, quantity: item.quantity })),
        message_th: messageTh,
      }),
    });
  } catch (error) {
    console.error("Laundry Make webhook network failure", { code: input.code, error });
    throw new Error("Laundry pickup request could not be sent. Please try again.", { cause: error });
  }
  if (!response.ok) {
    console.error("Laundry Make webhook rejected request", { code: input.code, status: response.status });
    throw new Error("Laundry pickup request could not be sent. Please try again.");
  }
}

export async function createLaundryLoad(env: LaundryBindings, user: CurrentUser, input: LaundryLoadInput) {
  const inventory = await calculatedInventory(env); const known = new Map(inventory.map((item) => [item.sku, item]));
  for (const item of input.quantities) { const current = known.get(item.sku); if (!current) throw new Error("Laundry item is not recognised."); if (item.quantity > current.inStorage) throw new Error(`${current.nameEn}: only ${current.inStorage} available in storage.`); }
  const now = new Date().toISOString(); const temporaryCode = `pending-${crypto.randomUUID()}`;
  const inserted = await env.DB.prepare(`INSERT INTO laundry_loads (load_code, status, sent_kg, sent_note, sent_by_user_id, sent_by_name, sent_at, created_at, updated_at) VALUES (?, 'SENT', ?, ?, ?, ?, ?, ?, ?)`).bind(temporaryCode, input.totalKg, input.note, user.id, user.displayName, now, now, now).run();
  const id = Number(inserted.meta.last_row_id); const code = `L-${now.slice(0, 10).replaceAll("-", "")}-${String(id).padStart(4, "0")}`;
  await env.DB.batch([env.DB.prepare("UPDATE laundry_loads SET load_code = ?, updated_at = ? WHERE laundry_load_id = ?").bind(code, now, id), ...input.quantities.map((item) => env.DB.prepare("INSERT INTO laundry_load_items (laundry_load_id, sku, sent_quantity) VALUES (?, ?, ?)").bind(id, item.sku, item.quantity)), env.DB.prepare("INSERT INTO laundry_load_events (laundry_load_id, event_type, actor_user_id, actor_name, details_json, created_at) VALUES (?, 'SENT', ?, ?, ?, ?)").bind(id, user.id, user.displayName, JSON.stringify({ totalKg: input.totalKg }), now)]);
  try {
    await requestLaundryPickup(env, { code, totalKg: input.totalKg, items: input.quantities.map((item) => ({ sku: item.sku, nameTh: known.get(item.sku)!.nameTh, quantity: item.quantity })) });
  } catch (error) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM laundry_load_events WHERE laundry_load_id = ?").bind(id),
      env.DB.prepare("DELETE FROM laundry_load_items WHERE laundry_load_id = ?").bind(id),
      env.DB.prepare("DELETE FROM laundry_loads WHERE laundry_load_id = ?").bind(id),
    ]);
    throw error;
  }
  await notifyLaundry(env, { type: "sent", id, code, actor: user.displayName }).catch((error) => console.warn("Laundry notification failed", error)); return getLaundryWorkspace(env);
}
export async function receiveLaundryLoad(env: LaundryBindings, user: CurrentUser, loadId: number, input: LaundryReceiveInput) {
  const current = await env.DB.prepare("SELECT laundry_load_id, load_code, status FROM laundry_loads WHERE laundry_load_id = ?").bind(loadId).first<{ laundry_load_id: number; load_code: string; status: LaundryStatus }>(); if (!current) throw new Error("Laundry load was not found."); if (current.status !== "SENT") throw new Error("This laundry load has already been closed.");
  const sentRows = await env.DB.prepare("SELECT sku, sent_quantity FROM laundry_load_items WHERE laundry_load_id = ?").bind(loadId).all<{ sku: string; sent_quantity: number }>(); const sent = sentRows.results ?? []; const received = new Map(input.quantities.map((item) => [item.sku, item.quantity]));
  for (const item of input.quantities) if (!sent.some((row) => row.sku === item.sku)) throw new Error("A returned item does not belong to this load.");
  const sentKg = (await env.DB.prepare("SELECT sent_kg FROM laundry_loads WHERE laundry_load_id = ?").bind(loadId).first<{ sent_kg: number }>())!.sent_kg;
  const discrepancy = weightHasDiscrepancy(sentKg, input.totalKg) || sent.some((item) => (received.get(item.sku) ?? 0) !== item.sent_quantity);
  const now = new Date().toISOString(); const status: LaundryStatus = discrepancy ? "DISCREPANCY" : "RECEIVED";
  await env.DB.batch([env.DB.prepare("UPDATE laundry_loads SET status = ?, received_kg = ?, received_note = ?, received_by_user_id = ?, received_by_name = ?, received_at = ?, updated_at = ? WHERE laundry_load_id = ?").bind(status, input.totalKg, input.note, user.id, user.displayName, now, now, loadId), ...sent.map((item) => env.DB.prepare("UPDATE laundry_load_items SET received_quantity = ? WHERE laundry_load_id = ? AND sku = ?").bind(received.get(item.sku) ?? 0, loadId, item.sku)), env.DB.prepare("INSERT INTO laundry_load_events (laundry_load_id, event_type, actor_user_id, actor_name, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(loadId, discrepancy ? "DISCREPANCY" : "RECEIVED", user.id, user.displayName, JSON.stringify({ totalKg: input.totalKg }), now)]);
  await notifyLaundry(env, { type: discrepancy ? "discrepancy" : "received", id: loadId, code: current.load_code, actor: user.displayName }).catch((error) => console.warn("Laundry notification failed", error)); return getLaundryWorkspace(env);
}
