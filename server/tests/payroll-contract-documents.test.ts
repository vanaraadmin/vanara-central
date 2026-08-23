import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { loadPayrollContractDocumentFile } from "../../src/services/payroll.service.ts";
import { payrollContractDocumentRoutes } from "../src/routes/payroll-contract-document.routes.ts";

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7 private contract");
const SHA = "a".repeat(64);

interface ContractRow {
  document_id: string;
  employee_key: string;
  version_number: number;
  effective_from_bangkok: string;
  effective_to_bangkok: string | null;
  document_status: "ACTIVE" | "SUPERSEDED" | "REVOKED";
  object_key: string;
  sha256_hex: string;
  byte_size: number;
  mime_type: string;
  download_filename: string;
  created_at: string;
}

class FakeStatement {
  constructor(private readonly db: FakeDb, private readonly sql: string, private readonly values: unknown[] = []) {}

  bind(...values: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    const sql = this.sql.replace(/\s+/g, " ").trim();
    if (sql.includes("FROM user_sessions")) return this.db.userRow() as T;
    if (sql.includes("FROM user_password_requirements")) return null;
    if (sql.includes("FROM payroll_employees")) {
      return (this.db.linkedEmployeeKey ? { employee_key: this.db.linkedEmployeeKey } : null) as T | null;
    }
    if (sql.includes("FROM payroll_contract_documents")) {
      const documentId = String(this.values[0]);
      const employeeKey = this.values.length > 1 ? String(this.values[1]) : null;
      return (this.db.documents.find((row) => row.document_id === documentId
        && row.document_status === "ACTIVE"
        && (!employeeKey || row.employee_key === employeeKey)) ?? null) as T | null;
    }
    throw new Error(`Unexpected first SQL: ${sql}`);
  }

  async all<T>(): Promise<D1Result<T>> {
    const sql = this.sql.replace(/\s+/g, " ").trim();
    if (sql.includes("FROM user_views")) {
      return { success: true, results: [{ view_key: this.db.role === "Owner" ? "owner" : "staff" }] as T[], meta: {} } as D1Result<T>;
    }
    if (sql.includes("FROM user_module_permissions")) {
      return { success: true, results: [{ module_key: "payroll", can_access: this.db.payrollAccess ? 1 : 0, can_edit: 0 }] as T[], meta: {} } as D1Result<T>;
    }
    if (sql.includes("FROM user_action_permissions")) {
      return { success: true, results: [] as T[], meta: {} } as D1Result<T>;
    }
    if (sql.includes("FROM payroll_contract_documents")) {
      const employeeKey = this.values.length > 0 ? String(this.values[0]) : null;
      const rows = this.db.documents.filter((row) => row.document_status === "ACTIVE" && (!employeeKey || row.employee_key === employeeKey));
      return { success: true, results: rows as T[], meta: {} } as D1Result<T>;
    }
    throw new Error(`Unexpected all SQL: ${sql}`);
  }

  async run(): Promise<D1Result> {
    const sql = this.sql.replace(/\s+/g, " ").trim();
    if (sql.startsWith("INSERT INTO payroll_contract_document_access_audit")) {
      this.db.audit.push({ documentId: String(this.values[0]), action: String(this.values[4]) });
      return { success: true, meta: { changes: 1 } } as D1Result;
    }
    if (sql.startsWith("DELETE FROM user_sessions")) return { success: true, meta: { changes: 1 } } as D1Result;
    throw new Error(`Unexpected run SQL: ${sql}`);
  }
}

class FakeDb {
  audit: Array<{ documentId: string; action: string }> = [];
  documents: ContractRow[] = [];
  linkedEmployeeKey: string | null = "EMPLOYEE-0001";
  payrollAccess = true;
  role: "Owner" | "Housekeeping" = "Owner";

  prepare(sql: string): D1PreparedStatement {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }

  userRow() {
    const now = new Date().toISOString();
    return {
      session_id: "session-1",
      expires_at: "2099-01-01T00:00:00.000Z",
      user_id: this.role === "Owner" ? "owner-1" : "staff-1",
      first_name: "Test",
      last_name: "User",
      full_name: "Test User",
      display_name: "Test",
      profile_photo_url: null,
      role: this.role,
      preferred_language: this.role === "Owner" ? "en" : "th",
      username: "test",
      email: null,
      password_hash: "unused",
      status: "active",
      created_at: now,
      updated_at: now,
      last_login_at: now,
    };
  }
}

class FakeR2 {
  integrity = true;
  sizeMetadataKey: "byteSize" | "size" = "byteSize";

  async get(key: string): Promise<R2ObjectBody | null> {
    if (!/^contracts\/employee-000[1-4]\/final\.pdf$/u.test(key)) return null;
    const customMetadata: Record<string, string> = {
      sha256: this.integrity ? SHA : "b".repeat(64),
      [this.sizeMetadataKey]: String(PDF_BYTES.byteLength),
    };
    return {
      body: new Blob([PDF_BYTES]).stream(),
      size: PDF_BYTES.byteLength,
      customMetadata,
      httpMetadata: { contentType: "application/pdf" },
    } as unknown as R2ObjectBody;
  }
}

function row(documentId: string, employeeKey: string, status: ContractRow["document_status"] = "ACTIVE"): ContractRow {
  return {
    document_id: documentId,
    employee_key: employeeKey,
    version_number: 1,
    effective_from_bangkok: "2026-09-01",
    effective_to_bangkok: null,
    document_status: status,
    object_key: `contracts/${employeeKey.toLowerCase()}/final.pdf`,
    sha256_hex: SHA,
    byte_size: PDF_BYTES.byteLength,
    mime_type: "application/pdf",
    download_filename: `${employeeKey}-Employment-Contract-FINAL.pdf`,
    created_at: "2026-08-22T00:00:00.000Z",
  };
}

function request(db: FakeDb, r2: FakeR2, path = "/") {
  return payrollContractDocumentRoutes.request(`https://central.test${path}`, {
    headers: { Cookie: "vanara_session=test-token" },
  }, { DB: db as unknown as D1Database, R2_STORAGE: r2 as unknown as R2Bucket });
}

test("migration 0057 is idempotent and keeps document metadata and access audit immutable", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON; CREATE TABLE users (user_id TEXT PRIMARY KEY); CREATE TABLE payroll_employees (employee_key TEXT PRIMARY KEY);");
  db.exec(readFileSync(new URL("../migrations/0057_payroll_contract_documents.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../migrations/0057_payroll_contract_documents.sql", import.meta.url), "utf8"));
  db.exec("INSERT INTO users VALUES ('owner-1'); INSERT INTO payroll_employees VALUES ('EMPLOYEE-0001');");
  const insert = db.prepare(`INSERT INTO payroll_contract_documents (
    document_id, employee_key, version_key, version_number, effective_from_bangkok, effective_to_bangkok,
    document_status, object_key, sha256_hex, byte_size, mime_type, download_filename,
    supersedes_document_id, uploaded_by_user_id, created_at
  ) VALUES (?, ?, ?, ?, ?, NULL, 'ACTIVE', ?, ?, ?, 'application/pdf', ?, NULL, ?, ?)`);
  insert.run("doc-1", "EMPLOYEE-0001", "v1", 1, "2026-09-01", "contracts/1.pdf", SHA, PDF_BYTES.byteLength, "contract.pdf", "owner-1", "2026-08-22T00:00:00.000Z");
  assert.throws(() => insert.run("doc-2", "EMPLOYEE-0001", "v2", 2, "2026-10-01", "contracts/2.pdf", SHA, PDF_BYTES.byteLength, "contract-2.pdf", "owner-1", "2026-08-22T00:00:00.000Z"), /UNIQUE/);
  assert.throws(() => db.exec("UPDATE payroll_contract_documents SET object_key = 'changed.pdf' WHERE document_id = 'doc-1'"), /immutable/);
  assert.throws(() => db.exec("DELETE FROM payroll_contract_documents WHERE document_id = 'doc-1'"), /immutable/);
  db.exec("INSERT INTO payroll_contract_document_access_audit (document_id, employee_key, actor_user_id, actor_role, access_action, accessed_at) VALUES ('doc-1', 'EMPLOYEE-0001', 'owner-1', 'Owner', 'VIEW', '2026-08-22T00:00:00.000Z')");
  assert.throws(() => db.exec("UPDATE payroll_contract_document_access_audit SET access_action = 'DOWNLOAD'"), /append-only/);
  assert.throws(() => db.exec("DELETE FROM payroll_contract_document_access_audit"), /append-only/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'payroll_contract_%'").get().count, 5);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("only Owners receive active contract metadata or files", async () => {
  const db = new FakeDb();
  const r2 = new FakeR2();
  db.documents = [
    row("doc-1", "EMPLOYEE-0001"),
    row("doc-2", "EMPLOYEE-0002"),
    row("doc-3", "EMPLOYEE-0003"),
    row("doc-4", "EMPLOYEE-0004"),
    row("doc-old", "EMPLOYEE-0001", "SUPERSEDED"),
  ];

  const owner = await request(db, r2);
  assert.equal(owner.status, 200);
  assert.match(owner.headers.get("cache-control") ?? "", /no-store/);
  const ownerBody = await owner.json() as { data: Array<Record<string, unknown>> };
  assert.deepEqual(ownerBody.data.map((document) => document.documentId), ["doc-1", "doc-2", "doc-3", "doc-4"]);
  assert.doesNotMatch(JSON.stringify(ownerBody), /object_key|sha256|contracts\//);

  db.role = "Housekeeping";
  assert.equal((await request(db, r2)).status, 403);
  assert.equal((await request(db, r2, "/doc-1/file?mode=inline")).status, 403);
  assert.equal(db.audit.length, 0);

  db.role = "Owner";
  db.payrollAccess = false;
  assert.equal((await request(db, r2)).status, 403);
});

test("authorized PDF responses verify R2 integrity and append exactly one audit row", async () => {
  const db = new FakeDb();
  const r2 = new FakeR2();
  db.documents = [1, 2, 3, 4].map((index) => row(`doc-${index}`, `EMPLOYEE-000${index}`));

  for (const [index, document] of db.documents.entries()) {
    r2.sizeMetadataKey = index % 2 === 0 ? "size" : "byteSize";
    const inline = await request(db, r2, `/${document.document_id}/file?mode=inline`);
    assert.equal(inline.status, 200);
    assert.equal(inline.headers.get("content-type"), "application/pdf");
    assert.match(inline.headers.get("content-disposition") ?? "", /^inline;/);
    assert.equal(await inline.text(), new TextDecoder().decode(PDF_BYTES));
  }
  assert.deepEqual(db.audit, [
    { documentId: "doc-1", action: "VIEW" },
    { documentId: "doc-2", action: "VIEW" },
    { documentId: "doc-3", action: "VIEW" },
    { documentId: "doc-4", action: "VIEW" },
  ]);

  const download = await request(db, r2, "/doc-1/file?mode=download");
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-disposition") ?? "", /^attachment;/);
  await download.arrayBuffer();
  assert.equal(db.audit.at(-1)?.action, "DOWNLOAD");

  r2.integrity = false;
  const failed = await request(db, r2, "/doc-1/file?mode=inline");
  assert.equal(failed.status, 409);
  assert.equal(db.audit.length, 5);
  assert.equal((await request(db, r2, "/doc-1/file?mode=preview")).status, 400);
});

test("client fetches one authenticated PDF and preserves a readable server error", async () => {
  const document = {
    documentId: "doc-1",
    employeeKey: "EMPLOYEE-0001",
    versionNumber: 1,
    effectiveFromBangkok: "2026-09-01",
    effectiveToBangkok: null,
    status: "ACTIVE" as const,
    fileName: "employee-contract.pdf",
    byteSize: PDF_BYTES.byteLength,
    createdAt: "2026-08-22T00:00:00.000Z",
  };
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  try {
    globalThis.fetch = async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(PDF_BYTES, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
    };
    const file = await loadPayrollContractDocumentFile(document, "inline");
    assert.equal(file.name, document.fileName);
    assert.equal(file.type, "application/pdf");
    assert.equal(file.size, document.byteSize);
    assert.equal(await file.text(), new TextDecoder().decode(PDF_BYTES));
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.input, "/api/payroll/contracts/doc-1/file?mode=inline");
    assert.equal(requests[0]?.init?.credentials, "same-origin");
    assert.equal(requests[0]?.init?.cache, "no-store");

    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, error: "Contract access forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
    await assert.rejects(
      () => loadPayrollContractDocumentFile(document, "download"),
      (error: unknown) => error instanceof Error
        && error.message === "Contract access forbidden"
        && "status" in error
        && error.status === 403,
    );

    globalThis.fetch = async () => new Response(PDF_BYTES.slice(0, -1), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    });
    await assert.rejects(
      () => loadPayrollContractDocumentFile(document, "inline"),
      /incomplete file/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("source guard keeps employment contracts Owner-only and contract storage private", () => {
  const page = readFileSync(new URL("../../src/pages/PayrollPage.tsx", import.meta.url), "utf8");
  const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/routes/payroll-contract-document.routes.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/services/payroll-contract-document.service.ts", import.meta.url), "utf8");
  const staffHome = readFileSync(new URL("../../src/pages/StaffPage.tsx", import.meta.url), "utf8");
  const staffOverview = readFileSync(new URL("../src/services/staff-overview.service.ts", import.meta.url), "utf8");
  const ignore = readFileSync(new URL("../../.gitignore", import.meta.url), "utf8");

  assert.match(page, /queryKey: \["current-user"\]/);
  assert.match(page, /if \(!user\.data\.isOwner\) return <Navigate replace to="\/staff" \/>/);
  assert.match(page, /function OwnerPayrollWorkspace/);
  assert.match(page, /queryKey: \["payroll", "contract-documents"\]/);
  assert.match(page, /selected\?\.employeeKey[\s\S]*documents\.data\?\.find/);
  assert.match(page, /aria-label="Employment contract document"/);
  assert.match(page, /loadPayrollContractDocumentFile\(contractDocument, mode\)/);
  assert.match(page, /window\.open\("", "_blank"\)/);
  assert.match(page, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(page, /navigator\.share\(\{ files: \[prepared\.file\]/);
  assert.match(page, /URL\.createObjectURL\(file\)/);
  assert.match(page, /URL\.revokeObjectURL/);
  assert.match(page, /createPortal\(preview, document\.body\)/);
  assert.doesNotMatch(page, /href=\{payrollContractDocumentUrl/);
  const shareHandler = page.slice(page.indexOf("async function sharePreparedContract"), page.indexOf("const preview =", page.indexOf("async function sharePreparedContract")));
  assert.doesNotMatch(shareHandler, /loadPayrollContractDocumentFile|fetch\(/);
  assert.doesNotMatch(page, /StaffPayrollContractWorkspace|payroll-page--staff/);
  assert.doesNotMatch(staffHome, /staffPayroll|myEmploymentContract|viewContractPdf|downloadContractPdf/);
  assert.match(staffOverview, /function canUsePayroll[\s\S]*isOwner\(user\) && canAccess\(user, "payroll"\)/);
  assert.doesNotMatch(staffOverview, /loadPayrollOverview/);
  assert.equal(index.match(/payrollContractDocumentRoutes/g)?.length, 2);
  assert.match(route, /if \(!isOwner\(user\)\) throw new ForbiddenError/);
  assert.match(route, /mode !== "inline" && mode !== "download"/);
  assert.match(route, /Cache-Control": "private, no-store/);
  assert.match(service, /R2_STORAGE\.get/);
  assert.match(service, /object\?\.customMetadata\?\.byteSize \?\? object\?\.customMetadata\?\.size/);
  assert.match(service, /customMetadata\?\.sha256 === row\.sha256_hex/);
  assert.doesNotMatch(route + service, /presign|publicUrl|signedUrl/i);
  assert.match(ignore, /^docs\/staff-contracts\/$/m);
});
