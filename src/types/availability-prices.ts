export type AvailabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";

export type PricingStatus = "AVAILABLE" | "MISSING";

export type AvailabilityCacheStatus = "AVAILABLE" | "UNAVAILABLE";

export interface AvailabilityPricesUnit {
  unitId: number;
  unitName: string;
  beds24UnitId: number | null;
}

export interface AvailabilityPricesPricing {
  status: PricingStatus;
  offerId: number | null;
  beds24OfferId: number | null;
  averageNightlyPrice: number | null;
  totalPrice: number | null;
  nightlyPrices: Array<{
    date: string;
    amount: number;
  }>;
  missingDates: string[];
}

export interface AvailabilityPricesGroup {
  accommodationType: "Bungalow" | "Villa" | "Tent" | "Other";
  roomTypeId: number;
  roomTypeName: string;
  beds24RoomId: number | null;
  availabilityStatus: AvailabilityStatus;
  availableCount: number;
  totalUnits: number;
  availableUnits: AvailabilityPricesUnit[];
  pricing: AvailabilityPricesPricing;
}

export interface AvailabilityPricesResult {
  arrivalDate: string;
  departureDate: string;
  nights: number;
  currency: "THB";
  cacheStatus: AvailabilityCacheStatus;
  generatedAt: string;
  groups: AvailabilityPricesGroup[];
}

export interface AvailabilityPricesResponse {
  success: boolean;
  data?: AvailabilityPricesResult;
  error?: string;
}
