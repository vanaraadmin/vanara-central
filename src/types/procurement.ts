export type ProcurementStatus = "requested" | "reviewed" | "ordered" | "received" | "rejected";

export type { CurrentUserView } from "./auth";

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

export interface ProcurementRequest {
  id: number;
  requestedBy: string;
  requestedByName: string;
  status: ProcurementStatus;
  customItemText: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  rejectedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  items: ProcurementItem[];
}

export interface CreateProcurementRequestPayload {
  itemIds: number[];
  customItemText?: string | null;
  note?: string | null;
}

export interface UpdateProcurementRequestPayload {
  status: ProcurementStatus;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
