import type { ModuleKey } from "./auth";

export type StaffCardId = "reception" | "rooms" | "housekeeping" | "availability" | "maintenance" | "procurement";

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

export type StaffBookingEventType = "new" | "updated" | "cancelled";

export interface StaffBookingEvent {
  id: string;
  type: StaffBookingEventType;
  title: "NEW BOOKING" | "BOOKING UPDATED" | "BOOKING CANCELLED";
  accommodation: string;
  source: string | null;
  occurredAt: string;
}

export interface StaffOverview {
  user: {
    id: string;
    displayName: string;
    role: string;
  };
  bookingEvents: StaffBookingEvent[];
  cards: StaffOverviewCard[];
}

export interface StaffOverviewResponse {
  success: boolean;
  data?: StaffOverview;
  error?: string;
}
