import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeMaintenanceAssignmentInput,
  normalizeCreateMaintenanceTicketInput,
  normalizeMaintenanceNoteInput,
  normalizeMaintenancePhotoInput,
  normalizeMaintenanceStatusInput,
  normalizeUpdateMaintenanceTicketInput,
} from "../src/services/maintenance.service.ts";

test("maintenance ticket create input supports the required production fields", () => {
  const input = normalizeCreateMaintenanceTicketInput({
    title: "Pool pump noise",
    description: "Pump is louder than usual near the restaurant side.",
    category: "Appliance",
    priority: "High",
    roomId: null,
    accommodationId: null,
    locationArea: "Pond",
    assignmentType: "EXTERNAL",
    externalAssigneeLabel: "General contractor",
  });

  assert.equal(input.title, "Pool pump noise");
  assert.equal(input.category, "Appliance");
  assert.equal(input.priority, "High");
  assert.equal(input.assignment?.assignmentType, "EXTERNAL");
});

test("maintenance ticket rejects invalid lifecycle status", () => {
  assert.throws(() => normalizeMaintenanceStatusInput({ status: "Almost Done" }), /Status is invalid/);
  assert.throws(() => normalizeUpdateMaintenanceTicketInput({ status: "Closed" }), /unsupported field/);
});

test("maintenance assignment separates internal and external assignees", () => {
  assert.deepEqual(normalizeMaintenanceAssignmentInput({ assignmentType: "INTERNAL", assignedUserId: "maintenance-1" }), {
    assignmentType: "INTERNAL",
    assignedUserId: "maintenance-1",
  });
  assert.deepEqual(normalizeMaintenanceAssignmentInput({ assignmentType: "EXTERNAL", externalAssigneeLabel: "Electrician", externalAssigneeNote: "Called" }), {
    assignmentType: "EXTERNAL",
    externalAssigneeLabel: "Electrician",
    externalAssigneeNote: "Called",
  });
  assert.throws(() => normalizeMaintenanceAssignmentInput({ assignmentType: "EXTERNAL", assignedUserId: "fake", externalAssigneeLabel: "Electrician" }), /cannot include assignedUserId/);
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
