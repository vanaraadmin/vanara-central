export const OPERATIONAL_BOOKING_STATUSES = ["confirmed", "new"] as const;

export type OperationalBookingStatus = typeof OPERATIONAL_BOOKING_STATUSES[number];

export function operationalBookingStatusSql(column: string): string {
  return `lower(trim(${column})) IN ('confirmed', 'new')`;
}

export function isOperationalBookingStatus(value: string | null | undefined): value is OperationalBookingStatus {
  const normalized = value?.trim().toLowerCase();
  return normalized === "confirmed" || normalized === "new";
}
