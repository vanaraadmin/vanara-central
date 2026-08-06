import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../../src/components/RecentBookings.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../src/styles/RecentBookings.css", import.meta.url), "utf8");
const staffPage = readFileSync(new URL("../../src/pages/StaffPage.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../../src/hooks/useOutsidePointerDown.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/booking-events.service.ts", import.meta.url), "utf8");

test("Booking Pulse keeps the approved shell and Staff Home placement", () => {
  assert.match(component, /className="recent-bookings booking-pulse"/);
  assert.match(component, /translate\("bookingPulse"\)/);
  assert.match(component, /translate\("recentBookings"\)/);
  assert.match(component, /recent-bookings__surface booking-pulse__surface/);
  assert.match(staffPage, /<RecentBookings/);
  assert.doesNotMatch(component, /GenericCard|DashboardCard|booking-pulse-card/);
});

test("Booking Pulse collapsed rows keep guest source status and event timing visible", () => {
  assert.match(component, /booking-pulse__guest/);
  assert.match(component, /event\.guestName/);
  assert.match(component, /bookingSourceLabel\(event\.source, translate\)/);
  assert.match(component, /const detail = source/);
  assert.match(component, /formatRelativeEventTime\(event\.eventTimestamp, language, translate\)/);
  assert.match(component, /const timing = eventTime/);
  assert.match(component, /eventLabel\(event\.eventType, translate\)/);
  assert.doesNotMatch(component, /formatArrival\(event\.arrivalDate\)/);
  assert.doesNotMatch(component, /const detail = \[source, stayDates\]/);
});

test("Booking Pulse status treatments are distinct local accents", () => {
  assert.match(css, /\.booking-pulse__status--new/);
  assert.match(css, /rgba\(139, 196, 147/);
  assert.match(css, /\.booking-pulse__status--updated/);
  assert.match(css, /rgba\(139, 180, 202/);
  assert.match(css, /\.booking-pulse__status--cancelled/);
  assert.match(css, /rgba\(210, 139, 126/);
  assert.doesNotMatch(css, /\.booking-pulse__item--new\s*{[^}]*background:\s*rgba\(139, 196, 147/s);
});

test("Booking Pulse expansion is one local row with toggle switch and safe data refresh", () => {
  assert.match(component, /useState<string \| null>\(null\)/);
  assert.match(component, /expandedEventId/);
  assert.match(component, /current === eventId \? null : eventId/);
  assert.match(component, /activeExpandedEventId === event\.eventId/);
  assert.match(component, /expandedEventStillVisible/);
  assert.match(component, /window\.setTimeout/);
  assert.doesNotMatch(component, /URLSearchParams|useSearchParams|localStorage|sessionStorage/);
});

test("Booking Pulse outside pointer and Escape close expansion without a visible Close button", () => {
  assert.match(component, /useOutsidePointerDown\(containerRef, collapse, activeExpandedEventId !== null\)/);
  assert.match(hook, /document\.addEventListener\("pointerdown", handlePointerDown, true\)/);
  assert.match(hook, /element\.contains\(target\)/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /document\.removeEventListener\("keydown", handleKeyDown\)/);
  assert.doesNotMatch(component, />\s*Close\s*</);
});

test("Booking Pulse accessibility uses native trigger and conditional detail region", () => {
  assert.match(component, /type="button"/);
  assert.match(component, /aria-expanded=\{expanded\}/);
  assert.match(component, /aria-controls=\{detailsId\}/);
  assert.match(component, /role="region"/);
  assert.match(component, /aria-label=\{translate\("bookingDetailsFor", \{ guestName: item\.guestName \}\)\}/);
  assert.match(component, /if \(value == null \|\| value === ""\) return null/);
});

test("Booking Pulse is self-contained and has no booking navigation action", () => {
  assert.doesNotMatch(component, /Open Booking|navigationTarget|from "react-router-dom"|<Link/);
  assert.doesNotMatch(service, /navigationTarget|\/rooms\/|\/reception/);
});

test("Booking Pulse expanded details keep only the compact informational set", () => {
  for (const key of ["guest", "room", "roomQuantity", "source", "checkIn", "checkOut", "stay", "guestCountLabel"]) {
    assert.match(component, new RegExp(`label=\\{translate\\("${key}"\\)`));
  }
  for (const removedLabel of ["Status", "Event", "Event time", "Nationality", "Total"]) {
    assert.doesNotMatch(component, new RegExp(`label="${removedLabel}"`));
  }
  assert.match(component, /guestCount/);
  assert.match(component, /guestCountLabel/);
});

test("Booking Pulse compact preview excludes room names and maps Direct to Front Desk", () => {
  const row = component.match(/function BookingEventRow[\s\S]*?function RecentBookingsEmpty/)?.[0] ?? "";
  assert.match(component, /function bookingSourceLabel/);
  assert.match(component, /cleaned\.toLowerCase\(\) === "direct" \? translate\("frontDesk"\) : cleaned/);
  assert.match(row, /const detail = source/);
  assert.match(row, /const timing = eventTime/);
  assert.doesNotMatch(row, /stayDates|formatArrival|Arrives today|Arrives tomorrow/);
  assert.doesNotMatch(row, /compactUnitLabel|event\.unitName/);
});

test("Booking Pulse booking value is gated by the server capability and rendered in THB", () => {
  assert.match(component, /canViewBookingValue\?: boolean/);
  assert.match(component, /canViewBookingValue = false/);
  assert.match(component, /canViewBookingValue \?/);
  assert.match(component, /label=\{translate\("bookingValue"\)\}/);
  assert.match(component, /\} THB`/);
  assert.doesNotMatch(component, /label="Currency"/);
  assert.match(staffPage, /canViewBookingValue=\{canViewBookingValue\}/);
  assert.doesNotMatch(component, /OwnerRecentBookings|StaffRecentBookings/);
});

test("Booking Pulse expanded typography has scoped readable label and value classes", () => {
  assert.match(component, /className="booking-pulse__detail-label"/);
  assert.match(component, /className="booking-pulse__detail-value"/);
  assert.match(css, /\.booking-pulse__detail-label/);
  assert.match(css, /font-size:\s*0\.64rem/);
  assert.match(css, /line-height:\s*1\.25/);
  assert.match(css, /\.booking-pulse__detail-value/);
  assert.match(css, /font-size:\s*0\.82rem/);
  assert.match(css, /line-height:\s*1\.35/);
});

test("Booking Pulse read model enforces retention without deleting source data", () => {
  assert.match(service, /BOOKING_PULSE_RETENTION_HOURS = 24/);
  assert.match(service, /isBookingPulseEventVisible/);
  assert.match(service, /ageMs >= 0 && ageMs < retentionMs/);
  assert.match(service, /rowsByGroup/);
  assert.match(service, /bookingPulseRowFor/);
  assert.doesNotMatch(service, /DELETE FROM booking_events|DELETE FROM bookings/);
});

test("Booking Pulse groups Beds24 master booking children without guest-date heuristics", () => {
  assert.match(service, /booking_group_members/);
  assert.match(service, /master_beds24_booking_id/);
  assert.match(service, /pulseGroupKeyFor/);
  assert.match(service, /bookingPulseUnitSummaryFor/);
  assert.match(service, /unitNames/);
  assert.match(service, /roomQuantity/);
  assert.match(service, /compactUnitLabel/);
  assert.doesNotMatch(service, /guest_name[\s\S]*GROUP BY|arrival_date[\s\S]*GROUP BY|departure_date[\s\S]*GROUP BY/);
});

test("Booking Pulse source does not touch Passport or Housekeeping implementation", () => {
  assert.doesNotMatch(component, /passport|housekeeping/i);
  assert.doesNotMatch(service, /passport|housekeeping/i);
});
