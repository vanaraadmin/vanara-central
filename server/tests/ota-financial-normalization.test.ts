import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOtaFinancialRecord } from "../src/services/ota-financial-normalization.service.ts";

function booking(overrides: Record<string, unknown>) {
  return {
    booking_id: 1,
    beds24_booking_id: 9001,
    master_beds24_booking_id: null,
    room_quantity: 1,
    channel: "Booking.com",
    api_source: null,
    api_reference: "OTA-1",
    reference: null,
    arrival_date: "2026-08-01",
    departure_date: "2026-08-03",
    price: 0,
    tax: null,
    commission: null,
    deposit: null,
    currency: "THB",
    rate_description: null,
    raw_json: null,
    ...overrides,
  } as never;
}

test("Booking.com maps gross from Total Charges and net from gross minus commission and payment charge", () => {
  const record = normalizeOtaFinancialRecord(booking({
    channel: "Booking.com",
    raw_json: JSON.stringify({ "Total Charges": 10000, "VAT": 700, "city tax": 100, "Total Commission": 1500, "Payment Charge": 200 }),
  }));
  assert.equal(record.grossBookingAmount, 10000);
  assert.equal(record.taxAndServiceChargeAmount, 800);
  assert.equal(record.otaFees, 1700);
  assert.equal(record.expectedNetPayout, 8300);
});

test("Airbnb uses Price as gross and Total Charges as expected net payout", () => {
  const record = normalizeOtaFinancialRecord(booking({
    channel: "Airbnb",
    price: 9000,
    tax: 600,
    commission: 1200,
    raw_json: JSON.stringify({ "Total Charges": 7800 }),
  }));
  assert.equal(record.grossBookingAmount, 9000);
  assert.equal(record.taxAndServiceChargeAmount, 600);
  assert.equal(record.otaFees, 1200);
  assert.equal(record.expectedNetPayout, 7800);
});

test("Agoda treats Beds24 net values as payout and extracts retail/net from channel info", () => {
  const record = normalizeOtaFinancialRecord(booking({
    channel: "Agoda",
    price: 7000,
    commission: 0,
  }), [{ booking_id: 1, info_name: "Channel Info", info_value: "refsell_amt: 10000 net_inclusive_amt: 7200", raw_json: null }]);
  assert.equal(record.grossBookingAmount, 10000);
  assert.equal(record.expectedNetPayout, 7200);
  assert.equal(record.otaFees, 2800);
});

test("Trip.com keeps net-rate operational value without reconstructing retail price", () => {
  const record = normalizeOtaFinancialRecord(booking({ channel: "Ctrip", price: 6400, raw_json: JSON.stringify({ "Total Charges": 6400 }) }));
  assert.equal(record.channel, "Trip.com");
  assert.equal(record.grossBookingAmount, 6400);
  assert.equal(record.otaFees, null);
  assert.equal(record.expectedNetPayout, 6400);
});

test("Traveloka expected payout is Price minus Commission", () => {
  const record = normalizeOtaFinancialRecord(booking({ channel: "Traveloka", price: 5000, tax: 350, commission: 650 }));
  assert.equal(record.grossBookingAmount, 5000);
  assert.equal(record.taxAndServiceChargeAmount, 350);
  assert.equal(record.otaFees, 650);
  assert.equal(record.expectedNetPayout, 4350);
});

test("Expedia treats Beds24 Price as expected net payout and reconstructs gross from commission", () => {
  const record = normalizeOtaFinancialRecord(booking({ channel: "Expedia", price: 8000, tax: 560, commission: 1600 }));
  assert.equal(record.grossBookingAmount, 9600);
  assert.equal(record.taxAndServiceChargeAmount, 560);
  assert.equal(record.otaFees, 1600);
  assert.equal(record.expectedNetPayout, 8000);
});

test("group master can carry room count without duplicating child bookings", () => {
  const record = normalizeOtaFinancialRecord(booking({ beds24_booking_id: 9100, master_beds24_booking_id: null, channel: "Booking.com", raw_json: JSON.stringify({ "Total Charges": 20000, "Total Commission": 3000 }) }), [], 3);
  assert.equal(record.isGroupMaster, true);
  assert.equal(record.roomCount, 3);
  assert.equal(record.expectedNetPayout, 17000);
});
