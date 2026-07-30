import assert from "node:assert/strict";
import test from "node:test";

import { ForbiddenError, type CurrentUser } from "../src/services/current-user.service.ts";
import {
  createProcurementRequest,
  listActiveProcurementItems,
  listProcurementRequests,
  getOwnerProcurementRequest,
  normalizeCreateProcurementRequestInput,
  updateProcurementRequestStatus,
} from "../src/services/procurement.service.ts";

function user(overrides: Partial<CurrentUser>): CurrentUser {
  return {
    id: "nun",
    displayName: "Nun",
    fullName: "Nun",
    profilePhotoUrl: null,
    role: "Housekeeping",
    preferredLanguage: "th",
    username: "nun",
    email: null,
    status: "active",
    views: ["staff"],
    permissions: [],
    lastLoginAt: null,
    ...overrides,
  };
}

const employee: CurrentUser = user({});
const owner: CurrentUser = user({
  id: "stefano",
  displayName: "Stefano",
  fullName: "Stefano",
  role: "Owner",
  preferredLanguage: "en",
  username: "owner",
  views: ["owner", "staff"],
});

type RequestRecord = {
  request_id: number; requested_by: string; requested_by_name: string; status: string; custom_item_text: string | null; note: string | null;
  created_at: string; updated_at: string; reviewed_at: string | null; ordered_at: string | null; received_at: string | null; rejected_at: string | null; updated_by: string | null; updated_by_name: string | null;
};

class FakeStmt {
  constructor(private db: FakeDB, private sql: string) {}
  bind(...params: unknown[]) { return { all: () => this.db.all(this.sql, params), first: () => this.db.first(this.sql, params), run: () => this.db.run(this.sql, params) }; }
  all() { return this.db.all(this.sql, []); }
}

class FakeDB {
  items = [
    { item_id: 1, code: "laundry_detergent", name_en: "Laundry detergent", name_th: null, category: "Housekeeping", active: 1, default_unit: null, default_quantity: null, notes: null },
    { item_id: 2, code: "inactive", name_en: "Inactive item", name_th: null, category: "Other", active: 0, default_unit: null, default_quantity: null, notes: null },
    { item_id: 3, code: "cat_food", name_en: "Cat food", name_th: null, category: "Animals", active: 1, default_unit: null, default_quantity: null, notes: null },
  ];
  requests: RequestRecord[] = [];
  relations: Array<{ request_id: number; item_id: number; created_at: string }> = [];
  nextId = 1;
  prepare(sql: string) { return new FakeStmt(this, sql); }
  batch(stmts: Array<{ run: () => unknown }>) { return Promise.all(stmts.map((stmt) => stmt.run())); }
  async all(sql: string, params: unknown[]) {
    if (sql.includes("FROM procurement_items") && sql.includes("active = 1") && !sql.includes("COUNT")) return { results: this.items.filter((item) => item.active === 1) };
    if (sql.includes("FROM procurement_request_items")) {
      const ids = params as number[];
      return { results: this.relations.filter((rel) => ids.includes(rel.request_id)).map((rel) => ({ request_id: rel.request_id, ...this.items.find((item) => item.item_id === rel.item_id)! })) };
    }
    if (sql.includes("FROM procurement_requests")) {
      const status = params[0] as string | undefined;
      return { results: status ? this.requests.filter((request) => request.status === status) : this.requests };
    }
    return { results: [] };
  }
  async first(sql: string, params: unknown[]) {
    if (sql.includes("COUNT(*) AS total FROM procurement_items")) return { total: this.items.filter((item) => item.active === 1 && (params as number[]).includes(item.item_id)).length };
    if (sql.includes("SELECT * FROM procurement_requests WHERE request_id")) return this.requests.find((request) => request.request_id === params[0]) ?? null;
    return null;
  }
  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO procurement_requests")) {
      const now = String(params[4]);
      this.requests.push({ request_id: this.nextId, requested_by: String(params[0]), requested_by_name: String(params[1]), status: "requested", custom_item_text: params[2] as string | null, note: params[3] as string | null, created_at: now, updated_at: now, reviewed_at: null, ordered_at: null, received_at: null, rejected_at: null, updated_by: null, updated_by_name: null });
      return { meta: { last_row_id: this.nextId++ } };
    }
    if (sql.includes("INSERT OR IGNORE INTO procurement_request_items")) {
      const request_id = Number(params[0]); const item_id = Number(params[1]);
      if (!this.relations.some((rel) => rel.request_id === request_id && rel.item_id === item_id)) this.relations.push({ request_id, item_id, created_at: String(params[2]) });
      return { meta: { last_row_id: this.relations.length } };
    }
    if (sql.includes("UPDATE procurement_requests")) {
      const request = this.requests.find((row) => row.request_id === params.at(-1));
      if (request) {
        request.status = String(params[0]); request.updated_at = String(params[1]); request.updated_by = String(params.at(-3)); request.updated_by_name = String(params.at(-2));
        if (request.status === "reviewed") request.reviewed_at = String(params[2]);
        if (request.status === "ordered") request.ordered_at = String(params[2]);
        if (request.status === "received") request.received_at = String(params[2]);
        if (request.status === "rejected") request.rejected_at = String(params[2]);
      }
    }
    return { meta: { last_row_id: 0 } };
  }
}

function env() { return { DB: new FakeDB() as unknown as D1Database }; }

test("procurement returns active catalogue items only", async () => {
  const data = env();
  const items = await listActiveProcurementItems(data);
  assert.deepEqual(items.map((item) => item.code), ["laundry_detergent", "cat_food"]);
});

test("procurement creates catalogue-item requests, deduplicates item IDs, and stores requester server-side", async () => {
  const data = env();
  const request = await createProcurementRequest(data, normalizeCreateProcurementRequestInput({ itemIds: [1, 1, 3], requestedBy: "spoof" }), employee);
  assert.equal(request.requestedBy, "nun");
  assert.equal(request.items.length, 2);
});

test("procurement creates custom text only requests", async () => {
  const request = await createProcurementRequest(env(), normalizeCreateProcurementRequestInput({ itemIds: [], customItemText: "Mosquito coils" }), employee);
  assert.equal(request.customItemText, "Mosquito coils");
});

test("procurement rejects empty and invalid item requests", async () => {
  assert.throws(() => normalizeCreateProcurementRequestInput({ itemIds: [] }), /Choose at least one item/);
  await assert.rejects(() => createProcurementRequest(env(), normalizeCreateProcurementRequestInput({ itemIds: [999] }), employee), /invalid/);
});

test("procurement owner endpoints reject employees and allow owners", async () => {
  const data = env();
  await createProcurementRequest(data, normalizeCreateProcurementRequestInput({ itemIds: [1] }), employee);
  await assert.rejects(() => listProcurementRequests(data, employee), ForbiddenError);
  const requests = await listProcurementRequests(data, owner);
  assert.equal(requests.length, 1);
  const detail = await getOwnerProcurementRequest(data, requests[0]!.id, owner);
  assert.equal(detail?.id, requests[0]!.id);
});

test("procurement owner can update status and persist timestamps", async () => {
  const data = env();
  const created = await createProcurementRequest(data, normalizeCreateProcurementRequestInput({ itemIds: [1] }), employee);
  await assert.rejects(() => updateProcurementRequestStatus(data, created.id, { status: "reviewed" }, employee), ForbiddenError);
  const reviewed = await updateProcurementRequestStatus(data, created.id, { status: "reviewed" }, owner);
  assert.equal(reviewed?.status, "reviewed");
  assert.ok(reviewed?.reviewedAt);
});
