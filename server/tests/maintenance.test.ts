import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCreateMaintenanceTicketInput,
  normalizeMaintenanceNoteInput,
  normalizeMaintenancePhotoInput,
  normalizeUpdateMaintenanceTicketInput,
} from "../src/services/maintenance.service.ts";

test("maintenance ticket create input supports the required production fields", () => {
  const input = normalizeCreateMaintenanceTicketInput({
    title: "Pool pump noise",
    description: "Pump is louder than usual near the restaurant side.",
    category: "Pool",
    priority: "High",
    roomId: null,
    accommodationId: null,
    assignedUserId: "pon",
    assignedUserName: "Pon",
  });

  assert.equal(input.title, "Pool pump noise");
  assert.equal(input.category, "Pool");
  assert.equal(input.priority, "High");
  assert.equal(input.assignedUserName, "Pon");
});

test("maintenance ticket rejects invalid lifecycle status", () => {
  assert.throws(() => normalizeUpdateMaintenanceTicketInput({ status: "Almost Done" }), /Status is invalid/);
});

test("maintenance note requires a real body", () => {
  assert.throws(() => normalizeMaintenanceNoteInput({ body: " " }), /Note is required/);
});

test("maintenance photo stores a real reference while upload storage is deferred", () => {
  const input = normalizeMaintenancePhotoInput({
    localReference: "local-photo-001.jpg",
    caption: "Leak under sink",
  });

  assert.deepEqual(input, {
    localReference: "local-photo-001.jpg",
    url: null,
    caption: "Leak under sink",
  });
});
