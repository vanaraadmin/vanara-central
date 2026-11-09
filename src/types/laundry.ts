export type LaundryLoadStatus = "SENT" | "RECEIVED" | "DISCREPANCY";

export interface LaundryInventoryItem {
  sku: string;
  nameEn: string;
  nameTh: string;
  purchasedTotal: number;
  inStorage: number;
  outAtLaundry: number;
}

export interface LaundryLoadItem extends LaundryInventoryItem {
  sentQuantity: number;
  receivedQuantity: number | null;
  difference: number | null;
}

export interface LaundryActor {
  id: string;
  name: string;
  profilePhotoUrl: string | null;
}

export interface LaundryLoad {
  id: number;
  code: string;
  status: LaundryLoadStatus;
  sentKg: number;
  receivedKg: number | null;
  sentNote: string | null;
  receivedNote: string | null;
  sentAt: string;
  receivedAt: string | null;
  sentBy: LaundryActor;
  receivedBy: LaundryActor | null;
  discrepancy: boolean;
  items: LaundryLoadItem[];
}

export interface LaundryWorkspace {
  inventory: LaundryInventoryItem[];
  openLoads: LaundryLoad[];
  recentLoads: LaundryLoad[];
}

export interface LaundryQuantityInput { sku: string; quantity: number; }
export interface LaundryLoadInput { totalKg: number; quantities: LaundryQuantityInput[]; note?: string; }
