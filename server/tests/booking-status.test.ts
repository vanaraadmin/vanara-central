import assert from "node:assert/strict";
import test from "node:test";

import { isOperationalBookingStatus, operationalBookingStatusSql } from "../src/services/booking-status.service.ts";

test("operational booking status allowlist includes only confirmed and new", () => {
  assert.equal(isOperationalBookingStatus("confirmed"), true);
  assert.equal(isOperationalBookingStatus(" CONFIRMED "), true);
  assert.equal(isOperationalBookingStatus("new"), true);
  assert.equal(isOperationalBookingStatus(" New "), true);
  assert.equal(isOperationalBookingStatus("request"), false);
  assert.equal(isOperationalBookingStatus("cancelled"), false);
  assert.equal(isOperationalBookingStatus("canceled"), false);
  assert.equal(isOperationalBookingStatus("unknown-future-status"), false);
  assert.equal(isOperationalBookingStatus(null), false);
});

test("operational booking SQL uses a strict allowlist", () => {
  assert.equal(operationalBookingStatusSql("b.status"), "lower(trim(b.status)) IN ('confirmed', 'new')");
});
