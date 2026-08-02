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

test("maintenance ticket create input supports the MVP production fields", () => {
  const input = normalizeCreateMaintenanceTicketInput({
    title: "Sink leak",
    description: "Water under the bathroom sink.",
    priority: "Normal",
    roomId: 1,
    assignmentType: "INTERNAL",
    assignedUserId: "maintenance-1",
    outOfService: true,
  });

  assert.equal(input.title, "Sink leak");
  assert.equal(input.category, "Other");
  assert.equal(input.priority, "Normal");
  assert.equal(input.roomId, 1);
  assert.equal(input.assignment?.assignmentType, "INTERNAL");
  assert.equal(input.outOfService, true);
});

test("maintenance priority is limited to low normal high", () => {
  assert.equal(normalizeCreateMaintenanceTicketInput({ title: "Loose handle", description: "Door handle", priority: "Low" }).priority, "Low");
  assert.equal(normalizeCreateMaintenanceTicketInput({ title: "Loose handle", description: "Door handle", priority: "High" }).priority, "High");
  assert.throws(() => normalizeCreateMaintenanceTicketInput({ title: "Loose handle", description: "Door handle", priority: "Critical" }), /Priority is invalid/);
});

test("maintenance status exposes only the four MVP states", () => {
  assert.deepEqual(normalizeMaintenanceStatusInput({ status: "In Progress" }), { status: "In Progress", reason: null });
  assert.deepEqual(normalizeMaintenanceStatusInput({ status: "Completed" }), { status: "Completed", reason: null });
  assert.throws(() => normalizeMaintenanceStatusInput({ status: "Assigned" }), /Status is invalid/);
  assert.throws(() => normalizeMaintenanceStatusInput({ status: "Resolved" }), /Status is invalid/);
  assert.throws(() => normalizeMaintenanceStatusInput({ status: "Closed" }), /Status is invalid/);
  assert.throws(() => normalizeUpdateMaintenanceTicketInput({ status: "Completed" }), /unsupported field/);
});

test("maintenance assignment is optional and internal", () => {
  assert.equal(normalizeMaintenanceAssignmentInput({ assignmentType: null }), null);
  assert.deepEqual(normalizeMaintenanceAssignmentInput({ assignmentType: "INTERNAL", assignedUserId: "maintenance-1" }), {
    assignmentType: "INTERNAL",
    assignedUserId: "maintenance-1",
  });
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
