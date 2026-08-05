import assert from "node:assert/strict";
import test from "node:test";

import { housekeepingOperationalTaskCapabilities } from "../src/services/housekeeping-task-capabilities.service.ts";
import type { CurrentUser } from "../src/services/current-user.service.ts";
import type { HousekeepingTask } from "../src/services/housekeeping-task-domain.service.ts";

const assignedStaff = user({ id: "hk-assigned", role: "Housekeeping", views: ["staff"] });
const otherStaff = user({ id: "hk-other", role: "Housekeeping", views: ["staff"] });
const noAccessStaff = user({ id: "hk-no-access", role: "Housekeeping", views: ["staff"], permissions: [] });
const owner = user({ id: "owner-1", role: "Owner", views: ["owner", "staff"] });

test("central housekeeping capabilities allow operational staff and Owner to finish an in-progress turnover", () => {
  const turnover = task({
    taskType: "TURNOVER",
    status: "IN_PROGRESS",
    assignedUserId: assignedStaff.id,
  });

  const assigned = housekeepingOperationalTaskCapabilities(turnover, assignedStaff);
  const other = housekeepingOperationalTaskCapabilities(turnover, otherStaff);
  const ownerCapabilities = housekeepingOperationalTaskCapabilities(turnover, owner);

  assert.equal(assigned.canFinishCleaning, true);
  assert.equal(assigned.canCompleteTask, true);
  assert.equal(other.canFinishCleaning, true);
  assert.equal(other.canCompleteTask, true);
  assert.equal(ownerCapabilities.canFinishCleaning, true);
  assert.equal(ownerCapabilities.canCompleteTask, true);
});

test("central housekeeping capabilities allow operational staff to finish active cleaning categories", () => {
  for (const taskType of ["STANDARD_CLEANING", "ON_DEMAND_CLEANING", "LINEN_CHANGE"] as const) {
    const activeCleaning = task({
      taskType,
      status: "IN_PROGRESS",
      assignedUserId: assignedStaff.id,
    });

    assert.equal(housekeepingOperationalTaskCapabilities(activeCleaning, otherStaff).canFinishCleaning, true, taskType);
    assert.equal(housekeepingOperationalTaskCapabilities(activeCleaning, otherStaff).canCompleteTask, true, taskType);
  }
});

test("central housekeeping capabilities keep reception and maintenance blocks authoritative", () => {
  const waiting = task({
    taskType: "TURNOVER",
    status: "WAITING_FOR_RECEPTION",
    assignedUserId: assignedStaff.id,
  });
  const activeCleaning = task({
    taskType: "STANDARD_CLEANING",
    status: "IN_PROGRESS",
    assignedUserId: assignedStaff.id,
  });

  assert.equal(housekeepingOperationalTaskCapabilities(waiting, otherStaff).canStartCleaning, false);
  assert.equal(housekeepingOperationalTaskCapabilities(waiting, otherStaff).canFinishCleaning, false);
  assert.equal(housekeepingOperationalTaskCapabilities(activeCleaning, otherStaff, { maintenanceBlocked: true }).canFinishCleaning, false);
  assert.equal(housekeepingOperationalTaskCapabilities(activeCleaning, noAccessStaff).canFinishCleaning, false);
});

test("central housekeeping capabilities keep start ownership consistent across read models", () => {
  const claimed = task({
    taskType: "TURNOVER",
    status: "CLAIMED",
    assignedUserId: assignedStaff.id,
  });

  assert.equal(housekeepingOperationalTaskCapabilities(claimed, assignedStaff).canStartCleaning, true);
  assert.equal(housekeepingOperationalTaskCapabilities(claimed, otherStaff).canStartCleaning, true);
  assert.equal(housekeepingOperationalTaskCapabilities(claimed, owner).canStartCleaning, true);
});

function user(input: Pick<CurrentUser, "id" | "role" | "views"> & { permissions?: CurrentUser["permissions"] }): CurrentUser {
  return {
    id: input.id,
    displayName: input.id,
    fullName: input.id,
    profilePhotoUrl: null,
    role: input.role,
    preferredLanguage: "en",
    username: input.id,
    email: null,
    status: "active",
    views: input.views,
    permissions: input.permissions ?? [
      { module: "rooms", canAccess: true, canEdit: false },
      { module: "housekeeping", canAccess: true, canEdit: false },
    ],
    actionPermissions: [],
    lastLoginAt: null,
  };
}

function task(input: Pick<HousekeepingTask, "taskType" | "status" | "assignedUserId">): Pick<HousekeepingTask, "taskType" | "status" | "assignedUserId"> {
  return input;
}
