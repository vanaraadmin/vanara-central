import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const receptionPage = await readFile(new URL("../../src/pages/ReceptionPage.tsx", import.meta.url), "utf8");

test("booking details sheet reuses the existing reception sheet structure", () => {
  assert.match(receptionPage, /function BookingDetailsSheet/);
  assert.match(receptionPage, /useSheetScrollLock\(Boolean\(stay\)\)/);
  assert.match(receptionPage, /className="reception-sheet reception-details-sheet"/);
  assert.match(receptionPage, /className="reception-sheet__scrim"/);
  assert.match(receptionPage, /className="reception-sheet__panel reception-details-sheet__panel"/);
  assert.match(receptionPage, /className="reception-sheet__handle"/);
});

test("booking cards open booking details without replacing existing contact and completion actions", () => {
  assert.match(receptionPage, /onDetailsRequest\(stay\)/);
  assert.match(receptionPage, /event\.stopPropagation\(\);\s*onContactRequest\(stay\)/);
  assert.match(receptionPage, /event\.stopPropagation\(\);\s*onRequest\(stay, type\)/);
});

test("check-in checklist is visible only for today's arrival", () => {
  assert.match(receptionPage, /const showCheckInChecklist = stay\.arrival === today;/);
  assert.match(receptionPage, /{showCheckInChecklist && \(/);
});

test("passport acquired status is derived from backend data and refreshed after OCR upload", () => {
  assert.match(receptionPage, /loadBookingPassports\(stay\.bookingId, signal\)/);
  assert.match(receptionPage, /const passportCount = passports\.data\?\.length \?\? 0;/);
  assert.match(receptionPage, /uploadBookingPassport\(stay\.bookingId, file\)/);
  assert.match(receptionPage, /queryClient\.invalidateQueries\({ queryKey: passportsQueryKey }\)/);
});

test("deposit collected uses existing reception check-in persistence", () => {
  assert.match(receptionPage, /updateReceptionCheckIn\(stay\.bookingId, "depositCollected", !stay\.checkIn\.depositCollected\)/);
});
