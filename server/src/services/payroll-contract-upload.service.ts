import { isOwner, type CurrentUser } from "./current-user.service.js";
import type { PayrollContractDocumentBindings } from "./payroll-contract-document.service.js";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_ID_BYTES = 10 * 1024 * 1024;

export class PayrollContractUploadError extends Error {
  constructor(message: string, readonly status: 400 | 409 | 500) {
    super(message);
    this.name = "PayrollContractUploadError";
  }
}

export interface PayrollContractUploadInput {
  employeeKey: string;
  effectiveFromBangkok: string;
  effectiveToBangkok: string | null;
  contract: File;
  identityAttachment: File | null;
}

export interface PayrollContractUploadResult {
  documentId: string;
  employeeKey: string;
  fileName: string;
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function safePdfName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._ -]{0,154}\.pdf$/iu.test(value) && !value.includes("..");
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
}

function requiredFile(value: FormDataEntryValue | null, field: string): File {
  if (!(value instanceof File)) throw new PayrollContractUploadError(`${field} is required.`, 400);
  return value;
}

function optionalFile(value: FormDataEntryValue | null, field: string): File | null {
  if (value === null) return null;
  if (!(value instanceof File)) throw new PayrollContractUploadError(`${field} is invalid.`, 400);
  return value;
}

export function normalizePayrollContractUploadFormData(form: FormData): PayrollContractUploadInput {
  const employeeKey = String(form.get("employeeKey") ?? "").trim();
  const effectiveFromBangkok = String(form.get("effectiveFromBangkok") ?? "").trim();
  const effectiveToRaw = String(form.get("effectiveToBangkok") ?? "").trim();
  const effectiveToBangkok = effectiveToRaw || null;
  const contract = requiredFile(form.get("contract"), "Contract PDF");
  const identityAttachment = optionalFile(form.get("identityAttachment"), "Identity attachment");
  if (!/^EMPLOYEE-\d{4}$/u.test(employeeKey)) throw new PayrollContractUploadError("Employee is invalid.", 400);
  if (!isDate(effectiveFromBangkok) || (effectiveToBangkok && !isDate(effectiveToBangkok)) || (effectiveToBangkok && effectiveToBangkok < effectiveFromBangkok)) {
    throw new PayrollContractUploadError("Contract effective dates are invalid.", 400);
  }
  if (contract.type !== "application/pdf" || contract.size <= 0 || contract.size > MAX_PDF_BYTES || !safePdfName(contract.name)) {
    throw new PayrollContractUploadError("Contract must be a PDF smaller than 10 MB with a safe file name.", 400);
  }
  if (identityAttachment && (!new Set(["image/jpeg", "image/png"]).has(identityAttachment.type) || identityAttachment.size <= 0 || identityAttachment.size > MAX_ID_BYTES)) {
    throw new PayrollContractUploadError("Identity attachment must be a JPEG or PNG smaller than 10 MB.", 400);
  }
  return { employeeKey, effectiveFromBangkok, effectiveToBangkok, contract, identityAttachment };
}

export async function uploadPayrollContractDocument(
  env: PayrollContractDocumentBindings,
  user: CurrentUser,
  input: PayrollContractUploadInput,
): Promise<PayrollContractUploadResult> {
  if (!isOwner(user)) throw new PayrollContractUploadError("Owner access is required.", 409);
  const employee = await env.DB.prepare("SELECT employee_key FROM payroll_employees WHERE employee_key = ? AND employee_status = 'ACTIVE' LIMIT 1")
    .bind(input.employeeKey).first<{ employee_key: string }>();
  if (!employee) throw new PayrollContractUploadError("Active Payroll employee was not found.", 400);
  const active = await env.DB.prepare("SELECT document_id FROM payroll_contract_documents WHERE employee_key = ? AND document_status = 'ACTIVE' LIMIT 1")
    .bind(input.employeeKey).first<{ document_id: string }>();
  if (active) throw new PayrollContractUploadError("An active contract is already registered for this employee.", 409);
  const version = await env.DB.prepare("SELECT COALESCE(MAX(version_number), 0) AS version_number FROM payroll_contract_documents WHERE employee_key = ?")
    .bind(input.employeeKey).first<{ version_number: number }>();
  const versionNumber = Number(version?.version_number ?? 0) + 1;
  const contractBytes = await input.contract.arrayBuffer();
  const pdfHeader = new TextDecoder().decode(contractBytes.slice(0, 5));
  if (pdfHeader !== "%PDF-") throw new PayrollContractUploadError("Contract file is not a valid PDF.", 400);
  const documentId = `CONTRACT-${crypto.randomUUID().replaceAll("-", "")}`;
  const objectKey = `contracts/${crypto.randomUUID()}.pdf`;
  const idObjectKey = input.identityAttachment ? `staff-private-id/${input.employeeKey.toLowerCase()}/${crypto.randomUUID()}.${input.identityAttachment.type === "image/png" ? "png" : "jpg"}` : null;
  const now = new Date().toISOString();
  const uploadedKeys: string[] = [];
  try {
    const sha256 = await sha256Hex(contractBytes);
    await env.R2_STORAGE.put(objectKey, contractBytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { sha256, byteSize: String(contractBytes.byteLength), employeeKey: input.employeeKey, documentType: "employment-contract" },
    });
    uploadedKeys.push(objectKey);
    if (input.identityAttachment && idObjectKey) {
      const idBytes = await input.identityAttachment.arrayBuffer();
      await env.R2_STORAGE.put(idObjectKey, idBytes, {
        httpMetadata: { contentType: input.identityAttachment.type },
        customMetadata: { sha256: await sha256Hex(idBytes), byteSize: String(idBytes.byteLength), employeeKey: input.employeeKey, documentType: "identity-attachment" },
      });
      uploadedKeys.push(idObjectKey);
    }
    await env.DB.prepare(`INSERT INTO payroll_contract_documents (
      document_id, employee_key, version_key, version_number, effective_from_bangkok, effective_to_bangkok,
      document_status, object_key, sha256_hex, byte_size, mime_type, download_filename,
      supersedes_document_id, uploaded_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, 'application/pdf', ?, NULL, ?, ?)`)
      .bind(documentId, input.employeeKey, `${input.employeeKey}-CONTRACT-${input.effectiveFromBangkok}-V${versionNumber}`, versionNumber,
        input.effectiveFromBangkok, input.effectiveToBangkok, objectKey, sha256, contractBytes.byteLength, input.contract.name, user.id, now).run();
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => env.R2_STORAGE.delete(key)));
    throw error;
  }
  return { documentId, employeeKey: input.employeeKey, fileName: input.contract.name };
}
