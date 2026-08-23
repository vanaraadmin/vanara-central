import { ApiError, requestJson } from "./api.client";
import type {
  PayrollAttendanceInput,
  PayrollAttendanceResponse,
  PayrollAttendanceResult,
  PayrollContractDocument,
  PayrollContractDocumentsResponse,
  PayrollEvent,
  PayrollEventResponse,
  PayrollEventType,
  PayrollOverview,
  PayrollOverviewResponse,
  PayrollRecord,
  PayrollRecordResponse,
  PayrollSettings,
  PayrollSettingsResponse,
  PayrollWorker,
  PayrollWorkerResponse,
} from "../types/payroll";

function apiMonth(month: string): string {
  return encodeURIComponent(month);
}

async function parseResponse<T extends { success: boolean; error?: string }>(response: Response, fallback: string): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("The server returned an invalid response", response.status);
  }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : fallback;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export async function loadPayrollOverview(month: string, signal?: AbortSignal): Promise<PayrollOverview> {
  const response = await requestJson<PayrollOverviewResponse>(`/api/payroll/overview?month=${apiMonth(month)}`, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Payroll is unavailable");
  return response.data;
}

export async function loadPayrollWorker(employeeId: string, month: string, signal?: AbortSignal): Promise<PayrollWorker> {
  const response = await requestJson<PayrollWorkerResponse>(`/api/payroll/workers/${encodeURIComponent(employeeId)}?month=${apiMonth(month)}`, signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Payroll worker is unavailable");
  return response.data;
}

export async function savePayrollSettings(employeeId: string, settings: PayrollSettings, signal?: AbortSignal): Promise<PayrollSettings> {
  const response = await fetch(`/api/payroll/workers/${encodeURIComponent(employeeId)}/settings`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(settings),
    signal,
  });
  const parsed = await parseResponse<PayrollSettingsResponse>(response, "Payroll settings could not be saved");
  if (!parsed.success || !parsed.data) throw new Error(parsed.error ?? "Payroll settings could not be saved");
  return parsed.data;
}

export async function addPayrollEvent(employeeId: string, payload: { payrollMonth: string; eventDate: string; eventType: PayrollEventType; quantity: number; amount: number; note: string | null }, signal?: AbortSignal): Promise<PayrollEvent> {
  const response = await fetch(`/api/payroll/workers/${encodeURIComponent(employeeId)}/events`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const parsed = await parseResponse<PayrollEventResponse>(response, "Payroll event could not be saved");
  if (!parsed.success || !parsed.data) throw new Error(parsed.error ?? "Payroll event could not be saved");
  return parsed.data;
}

export async function savePayrollAttendance(
  employeeId: string,
  payload: PayrollAttendanceInput,
  signal?: AbortSignal,
): Promise<PayrollAttendanceResult> {
  const response = await fetch(`/api/payroll/workers/${encodeURIComponent(employeeId)}/events`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ command: "SAVE_ATTENDANCE", ...payload }),
    signal,
  });
  const parsed = await parseResponse<PayrollAttendanceResponse>(response, "Attendance could not be saved");
  if (!parsed.success || !parsed.data) throw new Error(parsed.error ?? "Attendance could not be saved");
  return parsed.data;
}

export async function savePayrollDraft(employeeId: string, payrollMonth: string, notes: string | null, signal?: AbortSignal): Promise<PayrollRecord> {
  const response = await fetch(`/api/payroll/workers/${encodeURIComponent(employeeId)}/draft`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ payrollMonth, notes }),
    signal,
  });
  const parsed = await parseResponse<PayrollRecordResponse>(response, "Payroll draft could not be saved");
  if (!parsed.success || !parsed.data) throw new Error(parsed.error ?? "Payroll draft could not be saved");
  return parsed.data;
}

export async function finalizePayroll(employeeId: string, payrollMonth: string, notes: string | null, signal?: AbortSignal): Promise<PayrollRecord> {
  const response = await fetch(`/api/payroll/workers/${encodeURIComponent(employeeId)}/finalize`, {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ payrollMonth, notes }),
    signal,
  });
  const parsed = await parseResponse<PayrollRecordResponse>(response, "Payroll could not be finalized");
  if (!parsed.success || !parsed.data) throw new Error(parsed.error ?? "Payroll could not be finalized");
  return parsed.data;
}

export function payrollPdfUrl(employeeId: string, payrollMonth: string): string {
  return `/api/payroll/workers/${encodeURIComponent(employeeId)}/statement.pdf?month=${apiMonth(payrollMonth)}`;
}

export async function loadPayrollContractDocuments(signal?: AbortSignal): Promise<PayrollContractDocument[]> {
  const response = await requestJson<PayrollContractDocumentsResponse>("/api/payroll/contracts", signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Contract documents are unavailable");
  return response.data;
}

export function payrollContractDocumentUrl(documentId: string, mode: "inline" | "download"): string {
  return `/api/payroll/contracts/${encodeURIComponent(documentId)}/file?mode=${mode}`;
}

async function payrollContractDocumentError(response: Response): Promise<ApiError> {
  let message = "Contract document could not be opened";
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) message = body.error;
  } catch {
    // The status code still provides a useful failure when the body is not JSON.
  }
  return new ApiError(message, response.status);
}

export async function loadPayrollContractDocumentFile(
  document: PayrollContractDocument,
  mode: "inline" | "download",
  signal?: AbortSignal,
): Promise<File> {
  const response = await fetch(payrollContractDocumentUrl(document.documentId, mode), {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/pdf" },
    signal,
  });
  if (!response.ok) throw await payrollContractDocumentError(response);

  const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (contentType !== "application/pdf" || (contentLength !== null && contentLength !== document.byteSize)) {
    throw new ApiError("Contract document returned invalid file metadata", 409);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== document.byteSize) {
    throw new ApiError("Contract document returned an incomplete file", 409);
  }
  return new File([bytes], document.fileName, { type: "application/pdf" });
}
