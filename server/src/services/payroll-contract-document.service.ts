import { isOwner, type CurrentUser } from "./current-user.service.js";

export interface PayrollContractDocumentBindings {
  DB: D1Database;
  R2_STORAGE: R2Bucket;
}

export type PayrollContractDocumentAccessAction = "VIEW" | "DOWNLOAD";

export interface PayrollContractDocumentSummary {
  documentId: string;
  employeeKey: string;
  versionNumber: number;
  effectiveFromBangkok: string;
  effectiveToBangkok: string | null;
  status: "ACTIVE";
  fileName: string;
  byteSize: number;
  createdAt: string;
}

interface PayrollContractDocumentRow {
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

export class PayrollContractDocumentError extends Error {
  constructor(
    message: string,
    readonly code: "ACCOUNT_LINK_REQUIRED" | "DOCUMENT_NOT_FOUND" | "DOCUMENT_INTEGRITY_ERROR",
    readonly status: 403 | 404 | 409,
  ) {
    super(message);
    this.name = "PayrollContractDocumentError";
  }
}

function publicDocument(row: PayrollContractDocumentRow): PayrollContractDocumentSummary {
  return {
    documentId: row.document_id,
    employeeKey: row.employee_key,
    versionNumber: row.version_number,
    effectiveFromBangkok: row.effective_from_bangkok,
    effectiveToBangkok: row.effective_to_bangkok,
    status: "ACTIVE",
    fileName: row.download_filename,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  };
}

async function linkedEmployeeKey(env: PayrollContractDocumentBindings, user: CurrentUser): Promise<string> {
  const row = await env.DB.prepare(`
    SELECT employee_key
    FROM payroll_employees
    WHERE auth_user_id = ?
      AND employee_status = 'ACTIVE'
    LIMIT 1
  `).bind(user.id).first<{ employee_key: string }>();
  if (!row) {
    throw new PayrollContractDocumentError(
      "Account link required for contract access.",
      "ACCOUNT_LINK_REQUIRED",
      403,
    );
  }
  return row.employee_key;
}

export async function listPayrollContractDocuments(
  env: PayrollContractDocumentBindings,
  user: CurrentUser,
): Promise<PayrollContractDocumentSummary[]> {
  const employeeKey = isOwner(user) ? null : await linkedEmployeeKey(env, user);
  const query = employeeKey
    ? env.DB.prepare(`
        SELECT document_id, employee_key, version_number,
               effective_from_bangkok, effective_to_bangkok, document_status,
               object_key, sha256_hex, byte_size, mime_type,
               download_filename, created_at
        FROM payroll_contract_documents
        WHERE document_status = 'ACTIVE'
          AND employee_key = ?
        ORDER BY effective_from_bangkok DESC, version_number DESC
      `).bind(employeeKey)
    : env.DB.prepare(`
        SELECT document_id, employee_key, version_number,
               effective_from_bangkok, effective_to_bangkok, document_status,
               object_key, sha256_hex, byte_size, mime_type,
               download_filename, created_at
        FROM payroll_contract_documents
        WHERE document_status = 'ACTIVE'
        ORDER BY employee_key, effective_from_bangkok DESC, version_number DESC
      `);
  const result = await query.all<PayrollContractDocumentRow>();
  return (result.results ?? []).map(publicDocument);
}

async function authorizedDocumentRow(
  env: PayrollContractDocumentBindings,
  user: CurrentUser,
  documentId: string,
): Promise<PayrollContractDocumentRow> {
  const employeeKey = isOwner(user) ? null : await linkedEmployeeKey(env, user);
  const query = employeeKey
    ? env.DB.prepare(`
        SELECT document_id, employee_key, version_number,
               effective_from_bangkok, effective_to_bangkok, document_status,
               object_key, sha256_hex, byte_size, mime_type,
               download_filename, created_at
        FROM payroll_contract_documents
        WHERE document_id = ?
          AND employee_key = ?
          AND document_status = 'ACTIVE'
        LIMIT 1
      `).bind(documentId, employeeKey)
    : env.DB.prepare(`
        SELECT document_id, employee_key, version_number,
               effective_from_bangkok, effective_to_bangkok, document_status,
               object_key, sha256_hex, byte_size, mime_type,
               download_filename, created_at
        FROM payroll_contract_documents
        WHERE document_id = ?
          AND document_status = 'ACTIVE'
        LIMIT 1
      `).bind(documentId);
  const row = await query.first<PayrollContractDocumentRow>();
  if (!row) {
    throw new PayrollContractDocumentError("Contract document not found.", "DOCUMENT_NOT_FOUND", 404);
  }
  return row;
}

function safePdfFileName(fileName: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._ -]{0,154}\.pdf$/i.test(fileName)
    && !fileName.includes("..")
    && !/[\r\n]/.test(fileName);
}

export interface AuthorizedPayrollContractDocument {
  document: PayrollContractDocumentSummary;
  body: ReadableStream;
  contentType: "application/pdf";
  fileName: string;
}

export async function getAuthorizedPayrollContractDocument(
  env: PayrollContractDocumentBindings,
  user: CurrentUser,
  documentId: string,
): Promise<AuthorizedPayrollContractDocument> {
  const row = await authorizedDocumentRow(env, user, documentId);
  const object = await env.R2_STORAGE.get(row.object_key);
  const customSize = object?.customMetadata?.byteSize;
  const contentType = object?.httpMetadata?.contentType?.toLowerCase();
  const metadataMatches = object !== null
    && object.size === row.byte_size
    && customSize === String(row.byte_size)
    && object.customMetadata?.sha256 === row.sha256_hex
    && contentType === row.mime_type
    && row.mime_type === "application/pdf"
    && safePdfFileName(row.download_filename);
  if (!metadataMatches) {
    throw new PayrollContractDocumentError(
      "Contract document failed its storage integrity check.",
      "DOCUMENT_INTEGRITY_ERROR",
      409,
    );
  }
  return {
    document: publicDocument(row),
    body: object.body,
    contentType: "application/pdf",
    fileName: row.download_filename,
  };
}

export async function recordPayrollContractDocumentAccess(
  env: Pick<PayrollContractDocumentBindings, "DB">,
  user: CurrentUser,
  document: PayrollContractDocumentSummary,
  action: PayrollContractDocumentAccessAction,
  now = new Date(),
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO payroll_contract_document_access_audit (
      document_id, employee_key, actor_user_id, actor_role, access_action, accessed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    document.documentId,
    document.employeeKey,
    user.id,
    user.role,
    action,
    now.toISOString(),
  ).run();
}
