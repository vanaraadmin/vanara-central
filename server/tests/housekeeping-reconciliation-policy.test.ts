import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  buildTurnoverReconciliationPlan,
  departureForOperationalDate,
  departuresForOperationalDate,
  hasSupersedingRoomCycle,
  qualifyingIncomingForOperationalDate,
  turnoverPriorityForOperationalDate,
  type HousekeepingBookingTruth,
} from "../src/services/housekeeping-reconciliation-policy.service.ts";
import type { HousekeepingTask } from "../src/services/housekeeping-task-domain.service.ts";
import { canonicalUnitName, readableUnitName } from "../src/services/room-display-label.service.ts";
import { safeHousekeepingRoomLabel } from "../../src/utils/housekeeping-room-label.ts";

const date = "2026-08-14";

function booking(id: number, unitId: number, arrival: string, departure: string, status = "confirmed"): HousekeepingBookingTruth {
  return { booking_id: id, beds24_booking_id: 900000 + id, unit_id: unitId, arrival_date: arrival, departure_date: departure, status };
}

function turnoverTask(id: number, bookingId: number, unitId: number, priority: "NORMAL" | "HIGH" = "HIGH"): HousekeepingTask {
  return {
    id,
    taskType: "TURNOVER",
    unitId,
    bookingId,
    stayId: 900000 + bookingId,
    operationalDate: date,
    dueCycleDate: date,
    status: "WAITING_FOR_RECEPTION",
    priority,
    blockingReason: null,
    assignedUserId: null,
    assignedUserName: null,
    claimedAt: null,
    startedAt: null,
    checklistCompletedAt: null,
    readyAt: null,
    completedAt: null,
    skippedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    source: "system",
    onDemandSource: null,
    idempotencyKey: `test:${id}`,
    version: 1,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
}

test("three departures and zero same-day arrivals are all normal post-checkout cleaning", () => {
  const bookings = [
    booking(1, 1, "2026-08-10", date),
    booking(2, 2, "2026-08-11", date),
    booking(3, 3, "2026-08-12", date),
  ];
  assert.equal(departuresForOperationalDate(bookings, date).length, 3);
  for (const departure of departuresForOperationalDate(bookings, date)) {
    assert.equal(turnoverPriorityForOperationalDate(bookings, departure.unit_id, date, departure), "NORMAL");
  }
  const plan = buildTurnoverReconciliationPlan(bookings, [], date);
  assert.equal(plan.departures.length, 3);
  assert.equal(plan.departures.filter((item) => item.priority === "HIGH").length, 0);
  assert.equal(plan.departures.filter((item) => item.priority === "NORMAL").length, 3);
});

test("only a same-day operational incoming stay makes turnover priority", () => {
  const departure = booking(10, 2, "2026-08-10", date);
  const sameDay = booking(11, 2, date, "2026-08-17");
  const future = booking(12, 3, "2026-08-15", "2026-08-18");
  assert.equal(turnoverPriorityForOperationalDate([departure, sameDay], 2, date, departure), "HIGH");
  assert.equal(turnoverPriorityForOperationalDate([booking(13, 3, "2026-08-10", date), future], 3, date), "NORMAL");
  assert.equal(turnoverPriorityForOperationalDate([departure, { ...sameDay, status: "cancelled" }], 2, date, departure), "NORMAL");
});

test("room move and B2/B3 swap follow current canonical assignments without duplicates", () => {
  const departures = [booking(20, 2, "2026-08-10", date), booking(21, 3, "2026-08-10", date)];
  const incomingOriginallyB2 = booking(22, 3, date, "2026-08-18");
  const incomingOriginallyB3 = booking(23, 2, "2026-08-15", "2026-08-19");
  const truth = [...departures, incomingOriginallyB2, incomingOriginallyB3];

  assert.equal(departuresForOperationalDate(truth, date).length, 2);
  assert.equal(qualifyingIncomingForOperationalDate(truth, 2, date, departures[0]), null);
  assert.equal(qualifyingIncomingForOperationalDate(truth, 3, date, departures[1])?.booking_id, 22);
  assert.equal(turnoverPriorityForOperationalDate(truth, 2, date, departures[0]), "NORMAL");
  assert.equal(turnoverPriorityForOperationalDate(truth, 3, date, departures[1]), "HIGH");
  assert.equal(departureForOperationalDate(truth, 3, date)?.booking_id, 21);

  const staleB2 = turnoverTask(100, 22, 2);
  const validB3 = turnoverTask(101, 21, 3, "NORMAL");
  const duplicateB3 = turnoverTask(102, 21, 3, "HIGH");
  const plan = buildTurnoverReconciliationPlan(truth, [staleB2, validB3, duplicateB3], date);
  assert.deepEqual(plan.cancellations.map((item) => [item.task.id, item.reason]), [
    [100, "stale_booking_identity"],
    [102, "duplicate_room_cycle"],
  ]);
  assert.deepEqual(plan.priorityUpdates.map((item) => [item.task.id, item.priority]), [[101, "HIGH"]]);

  const reconciledTasks = [turnoverTask(101, 21, 3, "HIGH")];
  const secondPlan = buildTurnoverReconciliationPlan(truth, reconciledTasks, date);
  assert.equal(secondPlan.cancellations.length, 0);
  assert.equal(secondPlan.priorityUpdates.length, 0);
});

test("cancelled incoming demotes an existing priority task idempotently", () => {
  const departure = booking(30, 1, "2026-08-10", date);
  const cancelledIncoming = booking(31, 1, date, "2026-08-18", "cancelled");
  const task = turnoverTask(130, 30, 1, "HIGH");
  const first = buildTurnoverReconciliationPlan([departure, cancelledIncoming], [task], date);
  assert.deepEqual(first.priorityUpdates.map((item) => item.priority), ["NORMAL"]);
  const second = buildTurnoverReconciliationPlan([departure, cancelledIncoming], [{ ...task, priority: "NORMAL" }], date);
  assert.equal(second.priorityUpdates.length, 0);
});

test("a later operational stay supersedes old active tasks without guessing from room labels", () => {
  const oldStay = booking(40, 3, "2026-08-02", "2026-08-07");
  const newerStay = booking(41, 3, "2026-08-12", "2026-08-14");
  const futureStay = booking(42, 3, "2026-09-01", "2026-09-05");
  assert.equal(hasSupersedingRoomCycle([oldStay, newerStay], 3, "2026-08-07", date), true);
  assert.equal(hasSupersedingRoomCycle([oldStay, futureStay], 3, "2026-08-07", date), false);
  assert.equal(hasSupersedingRoomCycle([oldStay, { ...newerStay, status: "cancelled" }], 3, "2026-08-07", date), false);
  assert.equal(hasSupersedingRoomCycle([oldStay], 3, "2026-08-07", date), false);
});

test("canonical room labels never guess or expose raw external codes", () => {
  const rawUnit = { unit_id: 3, unit_name: "E2", unit_type: "bungalow", position: 1 };
  assert.equal(canonicalUnitName(rawUnit), null);
  assert.equal(readableUnitName(rawUnit), "Room not assigned");
  assert.equal(safeHousekeepingRoomLabel("E2"), "Room not assigned");
  assert.equal(safeHousekeepingRoomLabel("A12"), "Room not assigned");
  assert.equal(safeHousekeepingRoomLabel("Bungalow 1"), "Bungalow 1");
  assert.equal(canonicalUnitName({ ...rawUnit, unit_name: "Bungalow 1" }), "Bungalow 1");
  assert.equal(readableUnitName({ ...rawUnit, unit_name: "Bungalow 1" }), "Bungalow 1");
});

test("migration reconciles legacy identities, priorities, duplicates, and the active turnover index", async () => {
  const migration = await readFile(new URL("../migrations/0050_housekeeping_canonical_reconciliation.sql", import.meta.url), "utf8");
  assert.match(migration, /stale_booking_identity/);
  assert.match(migration, /newer\.arrival_date > housekeeping_tasks\.operational_date/);
  assert.match(migration, /newer\.arrival_date <= date\('now', '\+7 hours'\)/);
  assert.match(migration, /housekeeping_tasks\.task_type IN \('TURNOVER', 'STANDARD_CLEANING', 'LINEN_CHANGE'\)/);
  assert.match(migration, /duplicate_room_cycle/);
  assert.match(migration, /arrival_date = housekeeping_tasks\.operational_date/);
  assert.match(migration, /THEN 'HIGH' ELSE 'NORMAL'/);
  assert.match(migration, /ON housekeeping_tasks\(unit_id, operational_date\)/);
  assert.doesNotMatch(migration, /E2|external_unit_id|Bungalow 1/);
});

test("migration 0051 restores only valid current tasks and is idempotent", async () => {
  const migration = await readFile(new URL("../migrations/0051_housekeeping_reconciliation_recovery.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /task_id\s+IN\s*\([^)]*45|#45|#48/);

  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE units (unit_id INTEGER PRIMARY KEY, unit_name TEXT NOT NULL, active INTEGER NOT NULL);
    CREATE TABLE bookings (
      booking_id INTEGER PRIMARY KEY, beds24_booking_id INTEGER NOT NULL, unit_id INTEGER NOT NULL,
      arrival_date TEXT NOT NULL, departure_date TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE reception_stays (
      beds24_booking_id INTEGER PRIMARY KEY, guest_arrived INTEGER NOT NULL,
      guest_left INTEGER NOT NULL, room_released INTEGER NOT NULL
    );
    CREATE TABLE housekeeping_tasks (
      task_id INTEGER PRIMARY KEY, task_type TEXT NOT NULL, unit_id INTEGER NOT NULL,
      booking_id INTEGER, stay_id INTEGER, operational_date TEXT NOT NULL, status TEXT NOT NULL,
      priority TEXT NOT NULL, source TEXT NOT NULL, cancelled_at TEXT, cancellation_reason TEXT,
      version INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT, updated_by_name TEXT
    );
    CREATE TABLE housekeeping_task_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, event_type TEXT NOT NULL,
      actor_user_id TEXT, actor_name TEXT, previous_status TEXT, new_status TEXT, reason TEXT,
      metadata_json TEXT, idempotency_key TEXT, created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_test_event_key ON housekeeping_task_events(task_id, idempotency_key);
    CREATE UNIQUE INDEX idx_housekeeping_tasks_active_turnover
      ON housekeeping_tasks(unit_id, operational_date)
      WHERE task_type = 'TURNOVER' AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED');
  `);

  const today = bangkokDateOffset(0);
  const insertUnit = db.prepare("INSERT INTO units VALUES (?, ?, 1)");
  for (const [unitId, unitName] of [[1, "Villa 10"], [3, "Bungalow 1"], [4, "Bungalow 2"], [5, "Bungalow 3"]] as const) {
    insertUnit.run(unitId, unitName);
  }
  const insertBooking = db.prepare("INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?)");
  const insertStay = db.prepare("INSERT INTO reception_stays VALUES (?, ?, ?, ?)");
  const stays = [
    [55, 90810966, 5, bangkokDateOffset(-12), bangkokDateOffset(-7), 1, 1, 1],
    [80, 91030591, 1, bangkokDateOffset(-1), today, 1, 0, 0],
    [88, 91283283, 3, bangkokDateOffset(-1), bangkokDateOffset(6), 1, 0, 0],
    [90, 91331429, 4, bangkokDateOffset(-2), today, 1, 0, 0],
    [91, 91332438, 5, bangkokDateOffset(-2), today, 1, 0, 0],
  ] as const;
  for (const [bookingId, bedsId, unitId, arrival, departure, arrived, left, released] of stays) {
    insertBooking.run(bookingId, bedsId, unitId, arrival, departure, "confirmed");
    insertStay.run(bedsId, arrived, left, released);
  }
  for (const [bookingId, bedsId, unitId] of [[180, 98000001, 1], [190, 98000002, 4], [191, 98000003, 5], [188, 98000004, 3]] as const) {
    insertBooking.run(bookingId, bedsId, unitId, bangkokDateOffset(30), bangkokDateOffset(34), "confirmed");
  }

  const insertTask = db.prepare("INSERT INTO housekeeping_tasks VALUES (?, ?, ?, ?, ?, ?, 'CANCELLED', ?, 'system', ?, 'Task no longer matches the canonical booking and room assignment.', 2, ?, NULL, 'System reconciliation')");
  const now = new Date().toISOString();
  insertTask.run(36, "STANDARD_CLEANING", 5, 55, 90810966, bangkokDateOffset(-8), "HIGH", now, now);
  insertTask.run(37, "WATER_REFILL", 5, 55, 90810966, bangkokDateOffset(-8), "NORMAL", now, now);
  insertTask.run(38, "TURNOVER", 5, 55, 90810966, bangkokDateOffset(-7), "HIGH", now, now);
  insertTask.run(45, "TURNOVER", 4, 90, 91331429, today, "HIGH", now, now);
  insertTask.run(46, "TURNOVER", 5, 91, 91332438, today, "HIGH", now, now);
  insertTask.run(47, "TURNOVER", 1, 80, 91030591, today, "HIGH", now, now);
  insertTask.run(48, "WATER_REFILL", 3, 88, 91283283, today, "NORMAL", now, now);
  const insertBadEvent = db.prepare("INSERT INTO housekeeping_task_events (task_id, event_type, idempotency_key, created_at) VALUES (?, 'cancel', ?, ?)");
  for (const taskId of [36, 37, 38, 45, 46, 47, 48]) insertBadEvent.run(taskId, `migration:0050:stale-booking:${taskId}`, now);

  db.exec(migration);
  const rows = db.prepare("SELECT task_id, unit_id, status, priority FROM housekeeping_tasks ORDER BY task_id").all() as Array<Record<string, unknown>>;
  assert.deepEqual(rows.slice(0, 3).map((row) => [row.task_id, row.status]), [[36, "CANCELLED"], [37, "CANCELLED"], [38, "CANCELLED"]]);
  assert.deepEqual(rows.slice(3).map((row) => [row.task_id, row.unit_id, row.status, row.priority]), [
    [45, 4, "WAITING_FOR_RECEPTION", "NORMAL"],
    [46, 5, "WAITING_FOR_RECEPTION", "NORMAL"],
    [47, 1, "WAITING_FOR_RECEPTION", "NORMAL"],
    [48, 3, "AVAILABLE_FOR_CLAIM", "NORMAL"],
  ]);
  assert.equal(db.prepare("SELECT unit_name FROM units WHERE unit_id = 3").get()?.unit_name, "Bungalow 1");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM housekeeping_task_events WHERE idempotency_key LIKE 'migration:0051:restore:%'").get()?.count, 4);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM housekeeping_tasks WHERE status NOT IN ('COMPLETED','SKIPPED','CANCELLED') GROUP BY unit_id, operational_date HAVING COUNT(*) > 1").get(), undefined);

  const before = Number(db.prepare("SELECT total_changes() AS count").get()?.count);
  db.exec(migration);
  const after = Number(db.prepare("SELECT total_changes() AS count").get()?.count);
  assert.equal(after - before, 0);
  db.close();
});

function bangkokDateOffset(days: number): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString().slice(0, 10);
}
