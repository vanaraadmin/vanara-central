export type ManualEntryType = "income" | "expense";

export interface AccountingOtaRecord {
  id: number;
  channel: string;
  otaBookingId: string | null;
  beds24BookingId: number;
  bookingGroupId: string | null;
  isGroupMaster: boolean;
  checkIn: string;
  checkOut: string;
  roomCount: number;
  grossBookingAmount: number | null;
  taxAndServiceChargeAmount: number | null;
  otaFees: number | null;
  expectedNetPayout: number | null;
  paymentMethod: string | null;
  guestPaymentStatus: string | null;
  sourceConfidence: "high" | "medium" | "low";
  rawRateDescription: string | null;
  rawChannelInfo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingEntry {
  id: number;
  type: ManualEntryType;
  date: string;
  amount: number;
  description: string;
  note: string | null;
  receipt: {
    fileName: string;
    contentType: string;
    uploadedAt: string;
    downloadUrl: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingOverview {
  generatedAt: string;
  totals: {
    expectedNetIncomeToDate: number;
    expectedFutureNetIncome: number;
    manualIncome: number;
    manualExpenses: number;
    netManualPosition: number;
  };
  otaRecords: AccountingOtaRecord[];
  manualEntries: AccountingEntry[];
}

export interface AccountingResponse {
  success: boolean;
  data?: AccountingOverview;
  error?: string;
}

export interface AccountingEntryResponse {
  success: boolean;
  data?: AccountingEntry;
  error?: string;
}
