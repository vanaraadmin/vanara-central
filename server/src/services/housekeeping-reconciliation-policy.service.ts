import { isOperationalBookingStatus } from "./booking-status.service.js";
import type { HousekeepingTask, HousekeepingTaskPriority } from "./housekeeping-task-domain.service.js";

export interface HousekeepingBookingTruth {
  booking_id: number;
  beds24_booking_id: number;
  unit_id: number;
  arrival_date: string;
  departure_date: string;
  status: string;
}

export function departuresForOperationalDate<T extends HousekeepingBookingTruth>(bookings: T[], date: string): T[] {
  const byUnit = new Map<number, T>();
  for (const booking of bookings) {
    if (booking.departure_date !== date || !isOperationalBookingStatus(booking.status)) continue;
    const current = byUnit.get(booking.unit_id);
    if (!current || booking.booking_id < current.booking_id) byUnit.set(booking.unit_id, booking);
  }
  return [...byUnit.values()];
}

export function departureForOperationalDate<T extends HousekeepingBookingTruth>(bookings: T[], unitId: number, date: string): T | null {
  return departuresForOperationalDate(bookings, date).find((booking) => booking.unit_id === unitId) ?? null;
}

export function qualifyingIncomingForOperationalDate<T extends HousekeepingBookingTruth>(
  bookings: T[],
  unitId: number,
  date: string,
  departure?: T | null,
): T | null {
  return bookings.find((booking) => booking.unit_id === unitId
    && booking.arrival_date === date
    && isOperationalBookingStatus(booking.status)
    && (!departure || booking.booking_id !== departure.booking_id)) ?? null;
}

export function turnoverPriorityForOperationalDate<T extends HousekeepingBookingTruth>(
  bookings: T[],
  unitId: number,
  date: string,
  departure?: T | null,
): HousekeepingTaskPriority {
  return qualifyingIncomingForOperationalDate(bookings, unitId, date, departure) ? "HIGH" : "NORMAL";
}

export function hasSupersedingRoomCycle<T extends HousekeepingBookingTruth>(
  bookings: T[],
  unitId: number,
  operationalDate: string,
  asOfDate: string,
): boolean {
  return bookings.some((booking) => booking.unit_id === unitId
    && booking.arrival_date > operationalDate
    && booking.arrival_date <= asOfDate
    && isOperationalBookingStatus(booking.status));
}

export interface TurnoverReconciliationPlan<T extends HousekeepingBookingTruth> {
  departures: Array<{ booking: T; priority: HousekeepingTaskPriority }>;
  cancellations: Array<{ task: HousekeepingTask; reason: "stale_booking_identity" | "duplicate_room_cycle" }>;
  priorityUpdates: Array<{ task: HousekeepingTask; priority: HousekeepingTaskPriority }>;
}

const ACTIVE_STATUSES = new Set(["WAITING_FOR_RECEPTION", "AVAILABLE_FOR_CLAIM", "CLAIMED", "IN_PROGRESS", "CHECKLIST_COMPLETE", "READY_FOR_INSPECTION", "READY", "BLOCKED"]);

export function buildTurnoverReconciliationPlan<T extends HousekeepingBookingTruth>(
  bookings: T[],
  tasks: HousekeepingTask[],
  date: string,
): TurnoverReconciliationPlan<T> {
  const departures = departuresForOperationalDate(bookings, date);
  const departureByUnit = new Map(departures.map((booking) => [booking.unit_id, booking]));
  const eligibleTasks = tasks
    .filter((task) => task.taskType === "TURNOVER"
      && task.operationalDate === date
      && ACTIVE_STATUSES.has(task.status)
      && (task.source === "system" || task.source === "reception_release"))
    .sort((left, right) => left.id - right.id);
  const acceptedUnitIds = new Set<number>();
  const cancellations: TurnoverReconciliationPlan<T>["cancellations"] = [];
  const priorityUpdates: TurnoverReconciliationPlan<T>["priorityUpdates"] = [];

  for (const task of eligibleTasks) {
    const departure = departureByUnit.get(task.unitId);
    const matches = Boolean(departure && taskMatchesBookingIdentity(task, departure));
    if (!matches) {
      cancellations.push({ task, reason: "stale_booking_identity" });
      continue;
    }
    if (acceptedUnitIds.has(task.unitId)) {
      cancellations.push({ task, reason: "duplicate_room_cycle" });
      continue;
    }
    acceptedUnitIds.add(task.unitId);
    const priority = turnoverPriorityForOperationalDate(bookings, task.unitId, date, departure);
    if (task.priority !== priority) priorityUpdates.push({ task, priority });
  }

  return {
    departures: departures.map((booking) => ({
      booking,
      priority: turnoverPriorityForOperationalDate(bookings, booking.unit_id, date, booking),
    })),
    cancellations,
    priorityUpdates,
  };
}

function taskMatchesBookingIdentity(task: HousekeepingTask, booking: HousekeepingBookingTruth): boolean {
  if (task.bookingId !== null) return task.bookingId === booking.booking_id;
  if (task.stayId !== null) return task.stayId === booking.beds24_booking_id;
  return false;
}
