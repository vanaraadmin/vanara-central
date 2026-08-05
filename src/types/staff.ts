import type { ModuleKey } from "./auth";

export type StaffCardId = "reception" | "rooms" | "availability" | "messages" | "housekeeping" | "maintenance" | "procurement" | "social" | "payroll";

export interface StaffOverviewMetric {
  label: string;
  value: number;
  tone: "neutral" | "good" | "attention" | "urgent";
}

export interface StaffOverviewCard {
  id: StaffCardId;
  module: ModuleKey;
  title: string;
  description: string;
  href: string;
  cta: string;
  metrics: StaffOverviewMetric[];
  summaryLine1?: string;
  summaryLine2?: string;
}

export type BookingPulseEventType = "NEW" | "UPDATED" | "CANCELLED";

export interface BookingPulseItem {
  eventId: string;
  bookingId: string;
  eventType: BookingPulseEventType;
  eventTimestamp: string;
  guestName: string;
  nationality?: string | null;
  countryCode?: string | null;
  unitId?: number | null;
  unitName?: string | null;
  unitNames: string[];
  roomQuantity: number;
  compactUnitLabel: string;
  assignmentComplete: boolean;
  source: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
  stayNights?: number | null;
  bookingStatus?: string | null;
  guestCount?: number | null;
  totalPrice?: number | null;
}

export interface StaffOverview {
  user: {
    id: string;
    displayName: string;
    role: string;
  };
  bookingPulseCapabilities: {
    canViewBookingValue: boolean;
  };
  bookingEvents: BookingPulseItem[];
  cards: StaffOverviewCard[];
}

export interface StaffOverviewResponse {
  success: boolean;
  data?: StaffOverview;
  error?: string;
}
