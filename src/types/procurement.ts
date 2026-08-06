export type ProcurementStatus = "PENDING" | "DONE" | "REJECTED";
export type ProcurementLanguage = "en" | "th";

export type { CurrentUserView } from "./auth";

export interface ProcurementRequest {
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
}

export interface CreateProcurementRequestPayload {
  requestText: string;
}

export interface UpdateProcurementRequestPayload {
  status: "DONE" | "REJECTED";
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
