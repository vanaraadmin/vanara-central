import { requestJson } from "./api.client";
import type { AccountingEntry, AccountingEntryResponse, AccountingOverview, AccountingResponse, ManualEntryType } from "../types/accounting";

async function parseResponse<T>(response: Response, fallback: string): Promise<T> {
  const parsed = await response.json().catch(() => null) as T & { success?: boolean; error?: string } | null;
  if (!response.ok || !parsed?.success) throw new Error(parsed?.error ?? fallback);
  return parsed;
}

export async function loadAccountingOverview(signal?: AbortSignal): Promise<AccountingOverview> {
  const response = await requestJson<AccountingResponse>("/api/accounting/overview", signal);
  if (!response.success || !response.data) throw new Error(response.error ?? "Accounting is unavailable");
  return response.data;
}

export async function createAccountingEntry(payload: {
  entryType: ManualEntryType;
  entryDate: string;
  amount: number;
  description: string;
  note: string | null;
  receiptDataUrl?: string | null;
  receiptFileName?: string | null;
}, signal?: AbortSignal): Promise<AccountingEntry> {
  const response = await fetch("/api/accounting/entries", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const parsed = await parseResponse<AccountingEntryResponse>(response, "Accounting entry could not be saved");
  if (!parsed.data) throw new Error("Accounting entry could not be saved");
  return parsed.data;
}

export function accountingExportUrl(from: string, to: string): string {
  return `/api/accounting/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}
