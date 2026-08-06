import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ForbiddenError, type CurrentUser } from "../src/services/current-user.service.ts";
import {
  createProcurementRequest,
  getOwnerProcurementRequest,
  listActiveProcurementItems,
  listProcurementRequests,
  normalizeCreateProcurementRequestInput,
  normalizeUpdateProcurementRequestInput,
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
    actionPermissions: [],
    lastLoginAt: null,
    ...overrides,
  };
}

const employee: CurrentUser = user({});
const otherEmployee: CurrentUser = user({ id: "nok", displayName: "Nok", fullName: "Nok", username: "nok", preferredLanguage: "en" });
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
  request_id: number;
  requested_by: string;
  requested_by_name: string;
  status: string;
  custom_item_text: string | null;
  note: string | null;
  request_text_original: string | null;
  original_language: string | null;
  translated_text: string | null;
  translated_language: string | null;
  translated_at: string | null;
  translation_provider: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  ordered_at: string | null;
  received_at: string | null;
  rejected_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  closed_at: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
};

class FakeStmt {
  constructor(private db: FakeDB, private sql: string) {}
  bind(...params: unknown[]) {
    return {
      all: () => this.db.all(this.sql, params),
      first: () => this.db.first(this.sql, params),
      run: () => this.db.run(this.sql, params),
    };
  }
  all() { return this.db.all(this.sql, []); }
}

class FakeDB {
  requests: RequestRecord[] = [];
  nextId = 1;
  prepare(sql: string) { return new FakeStmt(this, sql); }
  async all(sql: string, params: unknown[]) {
    if (sql.includes("FROM procurement_requests")) {
      let results = [...this.requests];
      if (sql.includes("WHERE requested_by = ?")) {
        const [requestedBy, closedCutoff, status] = params as [string, string, string | undefined];
        results = results.filter((request) => request.requested_by === requestedBy)
          .filter((request) => request.status === "PENDING" || (["DONE", "REJECTED"].includes(request.status) && (request.closed_at ?? request.updated_at) >= closedCutoff));
        if (status) results = results.filter((request) => request.status === status);
      } else if (sql.includes("WHERE status = ?")) {
        results = results.filter((request) => request.status === params[0]);
      }
      return { results };
    }
    return { results: [] };
  }
  async first(sql: string, params: unknown[]) {
    if (sql.includes("SELECT * FROM procurement_requests WHERE request_id")) return this.requests.find((request) => request.request_id === params[0]) ?? null;
    return null;
  }
  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO procurement_requests")) {
      const now = String(params[5]);
      this.requests.push({
        request_id: this.nextId,
        requested_by: String(params[0]),
        requested_by_name: String(params[1]),
        status: "PENDING",
        custom_item_text: String(params[2]),
        note: null,
        request_text_original: String(params[3]),
        original_language: String(params[4]),
        translated_text: null,
        translated_language: null,
        translated_at: null,
        translation_provider: null,
        created_at: now,
        updated_at: now,
        reviewed_at: null,
        ordered_at: null,
        received_at: null,
        rejected_at: null,
        closed_by: null,
        closed_by_name: null,
        closed_at: null,
        updated_by: null,
        updated_by_name: null,
      });
      return { meta: { last_row_id: this.nextId++ } };
    }
    if (sql.includes("UPDATE procurement_requests")) {
      const request = this.requests.find((row) => row.request_id === params.at(-1));
      if (request) {
        request.status = String(params[0]);
        request.updated_at = String(params[1]);
        if (request.status === "DONE") request.received_at = String(params[2]);
        if (request.status === "REJECTED") request.rejected_at = String(params[2]);
        request.closed_at = String(params[3]);
        request.closed_by = String(params[4]);
        request.closed_by_name = String(params[5]);
        request.updated_by = String(params[6]);
        request.updated_by_name = String(params[7]);
      }
    }
    return { meta: { last_row_id: 0 } };
  }
}

function env(db = new FakeDB()) { return { DB: db as unknown as D1Database }; }

test("procurement MVP no longer exposes catalogue items", async () => {
  assert.deepEqual(await listActiveProcurementItems(env()), []);
});

test("staff can create a free-text Thai procurement request and original text is saved exactly", async () => {
  const data = env();
  const thaiText = "ขอซื้อน้ำยาซักผ้าสำหรับห้องพัก";
  const request = await createProcurementRequest(data, normalizeCreateProcurementRequestInput({ requestText: thaiText }), employee);
  assert.equal(request.requestTextOriginal, thaiText);
  assert.equal(request.originalLanguage, "th");
  assert.equal(request.viewerLanguage, "th");
  assert.equal(request.translationPending, false);
  assert.equal(request.translatedText, null);
});

test("owner sees pending request exactly as submitted with translation-ready viewer contract", async () => {
  const data = env();
  const thaiText = "ขอซื้อถุงขยะสีดำ";
  const created = await createProcurementRequest(data, normalizeCreateProcurementRequestInput({ requestText: thaiText }), employee);
  const detail = await getOwnerProcurementRequest(data, created.id, owner);
  assert.equal(detail?.requestTextOriginal, thaiText);
  assert.equal(detail?.originalLanguage, "th");
  assert.equal(detail?.viewerLanguage, "en");
  assert.equal(detail?.translationPending, true);
  assert.equal(detail?.translationAvailable, false);
});

test("owner view can display cached translated text when it exists", async () => {
  const db = new FakeDB();
  const data = env(db);
  const created = await createProcurementRequest(data, normalizeCreateProcurementRequestInput({ requestText: "ซื้อสบู่" }), employee);
  db.requests[0]!.translated_text = "Buy soap";
  db.requests[0]!.translated_language = "en";
  db.requests[0]!.translated_at = "2026-08-06T01:00:00.000Z";
  const detail = await getOwnerProcurementRequest(data, created.id, owner);
  assert.equal(detail?.translatedText, "Buy soap");
  assert.equal(detail?.translationAvailable, true);
  assert.equal(detail?.translationPending, false);
});

test("owner can mark a procurement request bought or rejected without editing request text", async () => {
  const data = env();
  const created = await createProcurementRequest(data, normalizeCreateProcurementRequestInput({ requestText: "Mosquito coils" }), employee);
  await assert.rejects(() => updateProcurementRequestStatus(data, created.id, { status: "DONE" }, employee), ForbiddenError);
  const done = await updateProcurementRequestStatus(data, created.id, normalizeUpdateProcurementRequestInput({ status: "DONE", requestText: "changed" }), owner);
  assert.equal(done?.status, "DONE");
  assert.equal(done?.requestTextOriginal, "Mosquito coils");
  assert.ok(done?.closedAt);

  const rejectedCreated = await createProcurementRequest(data, normalizeCreateProcurementRequestInput({ requestText: "Extra towels" }), employee);
  const rejected = await updateProcurementRequestStatus(data, rejectedCreated.id, { status: "REJECTED" }, owner);
  assert.equal(rejected?.status, "REJECTED");
  assert.equal(rejected?.requestTextOriginal, "Extra towels");
});

test("staff sees own pending and recent closed requests but not other staff or closed older than seven days", async () => {
  const db = new FakeDB();
  const data = env(db);
  const pending = await createProcurementRequest(data, { requestText: "Rice bags" }, employee);
  const closedRecent = await createProcurementRequest(data, { requestText: "Cleaning gloves" }, employee);
  const closedOld = await createProcurementRequest(data, { requestText: "Old mop" }, employee);
  await createProcurementRequest(data, { requestText: "Other staff item" }, otherEmployee);
  db.requests.find((request) => request.request_id === closedRecent.id)!.status = "DONE";
  db.requests.find((request) => request.request_id === closedRecent.id)!.closed_at = "2026-08-04T00:00:00.000Z";
  db.requests.find((request) => request.request_id === closedOld.id)!.status = "DONE";
  db.requests.find((request) => request.request_id === closedOld.id)!.closed_at = "2026-07-20T00:00:00.000Z";

  const visible = await listProcurementRequests(data, employee, "all", new Date("2026-08-06T00:00:00.000Z"));
  assert.deepEqual(visible.map((request) => request.id).sort((a, b) => a - b), [pending.id, closedRecent.id]);
});

test("procurement source stays MVP-only and translation-ready without fake AI translation", () => {
  const page = readFileSync(new URL("../../src/pages/ProcurementPage.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../src/styles/ProcurementPage.css", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/services/procurement.service.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../migrations/0039_procurement_mvp_translation_ready.sql", import.meta.url), "utf8");

  assert.match(page, /requestTextOriginal/);
  assert.match(page, /Google Translate is connected/);
  assert.match(migration, /original_language/);
  assert.match(migration, /translated_text/);
  assert.match(migration, /translated_language/);
  assert.match(migration, /translated_at/);
  assert.match(migration, /translation_provider/);
  assert.doesNotMatch(`${page}\n${service}`, /openai|OpenAI|chatCompletion|\/api\/chat|googleapis|GOOGLE_TRANSLATE/i);

  for (const advanced of ["Category", "Quantity", "Budget", "Supplier", "Priority", "Attachment", "Attach file"]) {
    assert.doesNotMatch(page, new RegExp(advanced, "i"));
  }
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /min-width:\s*0/);
});
