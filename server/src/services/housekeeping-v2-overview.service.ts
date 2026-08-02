import { operationalBookingStatusSql } from "./booking-status.service.js";
import { createHousekeepingTask, housekeepingTaskCapabilities, ROOM_READY_OVERRIDE_SOURCE, syncReleasedTurnoverTasks, type HousekeepingTask, type HousekeepingTaskPriority, type HousekeepingTaskStatus, type HousekeepingTaskType } from "./housekeeping-task-domain.service.js";
import type { CurrentUser } from "./current-user.service.js";
import type { OperationalAvailabilityStatus } from "./room-operational-state.service.js";

export interface HousekeepingV2Bindings {
  DB: D1Database;
}

export type HousekeepingV2SectionId = "priority-turnover" | "normal-cleaning" | "water-refill";
export type HousekeepingV2StayStatus = "arriving" | "in_house" | "departing" | "vacant" | "ready";
export type HousekeepingV2ReceptionReleaseState = "not_required" | "waiting_for_reception" | "released";

export interface HousekeepingV2Summary {
  awaitingReceptionRelease: number;
  priorityTurnovers: number;
  normalCleaningDue: number;
  waterRefillDue: number;
  tasksClaimed: number;
  tasksInProgress: number;
  blockedRooms: number;
  completedToday: number;
  procurementAttention: number;
}

export interface HousekeepingV2TaskCard {
  unitId: number;
  unitName: string;
  taskId: number;
  taskVersion: number;
  taskType: HousekeepingTaskType;
  taskStatus: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  operationalDate: string;
  currentQueue: HousekeepingV2SectionId;
  displayReason: string | null;
  assignee: string | null;
  isBlocked: boolean;
  blockReason: string | null;
  waterQuantity: number | null;
  reasonCodes: HousekeepingV2ReasonCode[];
  capabilities: {
    canOpenRoom: boolean;
    canClaim: boolean;
    canReleaseClaim: boolean;
    canStart: boolean;
    canComplete: boolean;
    canSkip: boolean;
    canCancel: boolean;
    requiresReceptionRelease: boolean;
  };
}

export type HousekeepingV2ReasonCode = "standard_cleaning_previous_day" | "on_demand_previous_day" | "cleaning_due_today" | "on_demand_cleaning" | "linen_required" | "linen_override" | "waiting_reception" | "maintenance_block";

export interface HousekeepingV2Section {
  id: HousekeepingV2SectionId;
  title: string;
  emptyLabel: string;
  cards: HousekeepingV2TaskCard[];
}

export interface HousekeepingV2Overview {
  operationalDate: string;
  generatedAt: string;
  summary: HousekeepingV2Summary;
  sections: HousekeepingV2Section[];
  tasks: HousekeepingV2TaskCard[];
  procurement: {
    attentionCount: number;
    latestRequest: string | null;
  };
  meta: {
    generation: {
      attempted: number;
      createdOrReused: number;
    };
    legacyApiPreserved: true;
  };
}

interface UnitRow {
  unit_id: number;
  unit_name: string;
  unit_type: string | null;
  room_type_name: string | null;
  room_name: string | null;
  operational_availability_status: OperationalAvailabilityStatus;
}

interface BookingRow {
  booking_id: number;
  beds24_booking_id: number;
  unit_id: number;
  guest_name: string | null;
  arrival_date: string;
  departure_date: string;
  arrival_time: string | null;
  channel: string | null;
  api_source: string | null;
  status: string;
  guest_arrived: number | null;
  room_released: number | null;
}

interface TaskRow {
  task_id: number;
  task_type: HousekeepingTaskType;
  unit_id: number;
  booking_id: number | null;
  stay_id: number | null;
  operational_date: string;
  due_cycle_date: string | null;
  status: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  blocking_reason: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  claimed_at: string | null;
  started_at: string | null;
  checklist_completed_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  source: "system" | "reception_release" | "manual" | "physical_sign" | "guest_request" | "maintenance" | "migration";
  on_demand_source: string | null;
  idempotency_key: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface CounterRow {
  unit_id: number;
  active_booking_id: number | null;
  active_stay_id: number | null;
  next_standard_cleaning_due_date: string | null;
  standard_cleaning_interval_days: number | null;
  next_linen_change_due_date: string | null;
  linen_required_override: number | null;
  linen_override_reason: string | null;
}

interface AlertRow {
  unit_id: number;
  count: number;
  label: string | null;
}

interface MaintenanceRow {
  room_id: number;
  count: number;
  critical: number;
  label: string | null;
}

interface WaterConfigRow {
  room_type: string;
  default_bottles: number;
}

interface ProcurementRow {
  count: number;
  latest_request: string | null;
}

interface OperationalContext {
  unit: UnitRow;
  activeStay: BookingRow | null;
  departure: BookingRow | null;
  nextArrival: BookingRow | null;
  counter: CounterRow | null;
  tasks: HousekeepingTask[];
  alerts: AlertRow | null;
  maintenance: MaintenanceRow | null;
  waterQuantity: number;
  operationalAvailabilityStatus: OperationalAvailabilityStatus;
  date: string;
}

const ACTIVE_TASK_STATUSES = new Set<HousekeepingTaskStatus>(["WAITING_FOR_RECEPTION", "AVAILABLE_FOR_CLAIM", "CLAIMED", "IN_PROGRESS", "CHECKLIST_COMPLETE", "READY_FOR_INSPECTION", "READY", "BLOCKED"]);
const CLAIMED_STATUSES = new Set<HousekeepingTaskStatus>(["CLAIMED", "IN_PROGRESS", "CHECKLIST_COMPLETE", "READY_FOR_INSPECTION", "READY", "BLOCKED"]);
const IN_PROGRESS_STATUSES = new Set<HousekeepingTaskStatus>(["IN_PROGRESS", "CHECKLIST_COMPLETE", "READY_FOR_INSPECTION"]);
const SECTION_ORDER: HousekeepingV2SectionId[] = ["priority-turnover", "normal-cleaning", "water-refill"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_STANDARD_INTERVAL_DAYS = 3;

export class HousekeepingV2DateError extends Error {
  constructor(message = "Housekeeping date is invalid.") {
    super(message);
    this.name = "HousekeepingV2DateError";
  }
}

export function normalizeHousekeepingV2Date(value: string | null | undefined, now = new Date()): string {
  if (!value) return formatBangkokDate(now);
  if (!DATE_RE.test(value)) throw new HousekeepingV2DateError();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new HousekeepingV2DateError();
  return value;
}

export async function getHousekeepingV2Overview(env: HousekeepingV2Bindings, user: CurrentUser, date: string): Promise<HousekeepingV2Overview> {
  const generated = await generateHousekeepingV2Tasks(env, user, date);
  await syncReleasedTurnoverTasks(env, date, user);
  const [units, bookings, tasks, counters, alerts, maintenance, waterConfig, procurement] = await Promise.all([
    loadUnits(env),
    loadBookings(env, date),
    loadTasks(env, date),
    loadCounters(env),
    loadAlerts(env),
    loadMaintenance(env),
    loadWaterConfig(env),
    loadProcurementAttention(env),
  ]);

  const contexts = buildContexts(units, bookings, tasks, counters, alerts, maintenance, waterConfig, date);
  const allCards = contexts.flatMap((context) => cardsForContext(context, user));
  const sections = buildSections(allCards);
  const summary = buildSummary(sections, allCards, procurement.attentionCount);

  return {
    operationalDate: date,
    generatedAt: new Date().toISOString(),
    summary,
    sections,
    tasks: allCards,
    procurement,
    meta: {
      generation: generated,
      legacyApiPreserved: true,
    },
  };
}

async function generateHousekeepingV2Tasks(env: HousekeepingV2Bindings, user: CurrentUser, date: string): Promise<{ attempted: number; createdOrReused: number }> {
  const [bookings, tasks, counters, waterConfig] = await Promise.all([
    loadBookings(env, date),
    loadTasks(env, date),
    loadCounters(env),
    loadWaterConfig(env),
  ]);

  const activeTasks = tasks.filter((task) => task.status !== "CANCELLED");
  let attempted = 0;
  let createdOrReused = 0;

  for (const booking of bookings) {
    if (booking.departure_date === date && !hasTask(activeTasks, "TURNOVER", booking.unit_id, booking.booking_id, date)) {
      attempted += 1;
      await createHousekeepingTask(env, {
        taskType: "TURNOVER",
        unitId: booking.unit_id,
        bookingId: booking.booking_id,
        stayId: booking.beds24_booking_id,
        operationalDate: date,
        dueCycleDate: date,
        priority: booking.room_released === 1 ? "URGENT" : "HIGH",
        source: "system",
        idempotencyKey: `housekeeping:v2:turnover:${booking.unit_id}:${booking.beds24_booking_id}:${date}`,
      }, user);
      createdOrReused += 1;
    }

    if (!isOccupiedOn(booking, date) || booking.departure_date === date || booking.guest_arrived !== 1) continue;

    const counter = counterForActiveStay(counters.get(booking.unit_id) ?? null, booking);
    const dueCycleDate = standardCleaningDueCycle(booking, counter, date);
    if (dueCycleDate && !hasTask(activeTasks, "STANDARD_CLEANING", booking.unit_id, booking.booking_id, dueCycleDate)) {
      attempted += 1;
      await createHousekeepingTask(env, {
        taskType: "STANDARD_CLEANING",
        unitId: booking.unit_id,
        bookingId: booking.booking_id,
        stayId: booking.beds24_booking_id,
        operationalDate: date,
        dueCycleDate,
        priority: dueCycleDate < date ? "HIGH" : "NORMAL",
        source: "system",
        idempotencyKey: `housekeeping:v2:standard:${booking.unit_id}:${booking.beds24_booking_id}:${dueCycleDate}`,
      }, user);
      createdOrReused += 1;
    }

    if (counter?.linen_required_override === 1 && !hasTask(activeTasks, "LINEN_CHANGE", booking.unit_id, booking.booking_id, date)) {
      attempted += 1;
      await createHousekeepingTask(env, {
        taskType: "LINEN_CHANGE",
        unitId: booking.unit_id,
        bookingId: booking.booking_id,
        stayId: booking.beds24_booking_id,
        operationalDate: date,
        dueCycleDate: date,
        priority: "HIGH",
        source: "manual",
        idempotencyKey: `housekeeping:v2:linen:${booking.unit_id}:${booking.beds24_booking_id}:${date}`,
        creationMetadata: { reasonCode: "linen_override", reason: counter.linen_override_reason },
      }, user);
      createdOrReused += 1;
    }

    const completedWaterToday = activeTasks.some((task) => task.taskType === "WATER_REFILL" && task.unitId === booking.unit_id && task.operationalDate === date && (task.status === "COMPLETED" || task.status === "SKIPPED"));
    if (!completedWaterToday && !hasTask(activeTasks, "WATER_REFILL", booking.unit_id, null, date)) {
      attempted += 1;
      await createHousekeepingTask(env, {
        taskType: "WATER_REFILL",
        unitId: booking.unit_id,
        bookingId: booking.booking_id,
        stayId: booking.beds24_booking_id,
        operationalDate: date,
        dueCycleDate: date,
        priority: "NORMAL",
        source: "system",
        idempotencyKey: `housekeeping:v2:water:${booking.unit_id}:${date}`,
      }, user);
      createdOrReused += 1;
    }
  }

  void waterConfig;
  return { attempted, createdOrReused };
}

function hasTask(tasks: HousekeepingTask[], taskType: HousekeepingTaskType, unitId: number, bookingId: number | null, dateOrCycle: string): boolean {
  return tasks.some((task) => {
    if (task.taskType !== taskType || task.unitId !== unitId) return false;
    if (bookingId !== null && task.bookingId !== bookingId) return false;
    if (taskType === "STANDARD_CLEANING" || taskType === "LINEN_CHANGE") return task.dueCycleDate === dateOrCycle;
    return task.operationalDate === dateOrCycle;
  });
}

function cardsForContext(context: OperationalContext, user: CurrentUser): HousekeepingV2TaskCard[] {
  if (context.operationalAvailabilityStatus === "NOT_OPERATING") return [];
  const maintenanceBlocked = Boolean(context.maintenance && context.maintenance.critical > 0);
  if (maintenanceBlocked) return [];

  const cards: HousekeepingV2TaskCard[] = [];
  const turnover = taskFor(context.tasks.filter((task) => taskBelongsToDeparture(context, task)), "TURNOVER");
  if (turnover) {
    cards.push(cardFromContext(context, turnover, maintenanceBlocked, user));
  }

  const stayTasks = [
    ...context.tasks.filter((task) => taskBelongsToActiveStay(context, task)),
    ...context.tasks.filter((task) => taskBelongsToRoomReadyOverride(task)),
  ];

  const standard = taskFor(stayTasks, "STANDARD_CLEANING");
  if (standard) {
    cards.push(cardFromContext(context, standard, maintenanceBlocked, user));
  }

  const onDemand = taskFor(stayTasks, "ON_DEMAND_CLEANING");
  if (onDemand) {
    cards.push(cardFromContext(context, onDemand, maintenanceBlocked, user));
  }

  const linen = taskFor(stayTasks, "LINEN_CHANGE");
  if (linen) {
    cards.push(cardFromContext(context, linen, maintenanceBlocked, user));
  }

  const water = taskFor(stayTasks, "WATER_REFILL");
  if (water) {
    cards.push(cardFromContext(context, water, maintenanceBlocked, user));
  }

  return cards;
}

function cardFromContext(context: OperationalContext, task: HousekeepingTask, maintenanceBlocked: boolean, user: CurrentUser): HousekeepingV2TaskCard {
  const taskType = task.taskType;
  const releaseState = releaseStateFor(context, taskType);
  const isWaitingRelease = releaseState === "waiting_for_reception";
  const capabilities = overviewTaskCapabilities(task, user, isWaitingRelease, maintenanceBlocked);
  const reasonCodes = reasonCodesFor(context, task, taskType, isWaitingRelease, maintenanceBlocked);
  const currentQueue = visibleQueueForTask(task, reasonCodes, isWaitingRelease, maintenanceBlocked);

  return {
    unitId: context.unit.unit_id,
    unitName: context.unit.unit_name,
    taskId: task.id,
    taskVersion: task.version,
    taskType,
    taskStatus: task.status,
    priority: task.priority,
    operationalDate: task.operationalDate,
    currentQueue,
    displayReason: displayReasonFor(reasonCodes),
    assignee: task.assignedUserName ?? null,
    isBlocked: isWaitingRelease || maintenanceBlocked || task.status === "BLOCKED",
    blockReason: blockReasonFor(context, task, isWaitingRelease, maintenanceBlocked),
    waterQuantity: taskType === "WATER_REFILL" ? context.waterQuantity : null,
    reasonCodes,
    capabilities: {
      canOpenRoom: true,
      canClaim: capabilities.canClaim,
      canReleaseClaim: capabilities.canReleaseClaim,
      canStart: capabilities.canStart,
      canComplete: capabilities.canComplete,
      canSkip: capabilities.canSkip,
      canCancel: capabilities.canCancel,
      requiresReceptionRelease: capabilities.requiresReceptionRelease || isWaitingRelease,
    },
  };
}

function buildSections(cards: HousekeepingV2TaskCard[]): HousekeepingV2Section[] {
  return SECTION_ORDER.map((id) => ({
    id,
    title: sectionTitle(id),
    emptyLabel: sectionEmpty(id),
    cards: cards.filter((card) => sectionForCard(card) === id).sort(sortCards),
  }));
}

function buildSummary(sections: HousekeepingV2Section[], cards: HousekeepingV2TaskCard[], procurementAttention: number): HousekeepingV2Summary {
  return {
    awaitingReceptionRelease: cards.filter((card) => card.reasonCodes.includes("waiting_reception")).length,
    priorityTurnovers: sections.find((section) => section.id === "priority-turnover")?.cards.length ?? 0,
    normalCleaningDue: sections.find((section) => section.id === "normal-cleaning")?.cards.length ?? 0,
    waterRefillDue: sections.find((section) => section.id === "water-refill")?.cards.length ?? 0,
    tasksClaimed: cards.filter((card) => card.assignee && CLAIMED_STATUSES.has(card.taskStatus)).length,
    tasksInProgress: cards.filter((card) => IN_PROGRESS_STATUSES.has(card.taskStatus)).length,
    blockedRooms: cards.filter((card) => card.isBlocked).length,
    completedToday: cards.filter((card) => card.taskStatus === "COMPLETED").length,
    procurementAttention,
  };
}

function buildContexts(
  units: UnitRow[],
  bookings: BookingRow[],
  tasks: HousekeepingTask[],
  counters: Map<number, CounterRow>,
  alerts: Map<number, AlertRow>,
  maintenance: Map<number, MaintenanceRow>,
  waterConfig: Map<string, number>,
  date: string,
): OperationalContext[] {
  return units.map((unit) => {
    const unitBookings = bookings.filter((booking) => booking.unit_id === unit.unit_id);
    const activeStay = unitBookings.find((booking) => isOccupiedOn(booking, date)) ?? null;
    const departure = unitBookings.find((booking) => booking.departure_date === date) ?? null;
    const nextArrival = unitBookings
      .filter((booking) => booking.arrival_date >= date)
      .sort((left, right) => checkInAt(left).localeCompare(checkInAt(right)))[0] ?? null;
    const rawCounter = counters.get(unit.unit_id) ?? null;
    return {
      unit,
      activeStay,
      departure,
      nextArrival,
      counter: activeStay ? counterForActiveStay(rawCounter, activeStay) : null,
      tasks: tasks.filter((task) => task.unitId === unit.unit_id),
      alerts: alerts.get(unit.unit_id) ?? null,
      maintenance: maintenance.get(unit.unit_id) ?? null,
      waterQuantity: waterQuantityFor(unit, waterConfig),
      operationalAvailabilityStatus: unit.operational_availability_status,
      date,
    };
  });
}

function mapTaskRow(row: TaskRow): HousekeepingTask {
  return {
    id: row.task_id,
    taskType: row.task_type,
    unitId: row.unit_id,
    bookingId: row.booking_id,
    stayId: row.stay_id,
    operationalDate: row.operational_date,
    dueCycleDate: row.due_cycle_date,
    status: row.status,
    priority: row.priority,
    blockingReason: row.blocking_reason,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    claimedAt: row.claimed_at,
    startedAt: row.started_at,
    checklistCompletedAt: row.checklist_completed_at,
    readyAt: row.ready_at,
    completedAt: row.completed_at,
    skippedAt: row.skipped_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    source: row.source,
    onDemandSource: row.on_demand_source,
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function counterForActiveStay(counter: CounterRow | null, booking: BookingRow): CounterRow | null {
  if (!counter) return null;
  if (counter.active_booking_id === booking.booking_id) return counter;
  if (counter.active_stay_id === booking.beds24_booking_id) return counter;
  return null;
}

function standardCleaningDueCycle(booking: BookingRow, counter: CounterRow | null, date: string): string | null {
  const interval = counter?.standard_cleaning_interval_days && counter.standard_cleaning_interval_days > 0 ? counter.standard_cleaning_interval_days : DEFAULT_STANDARD_INTERVAL_DAYS;
  // The first standard cleaning is due after three occupied days have elapsed; checkout day is excluded by the caller.
  const dueDate = counter?.next_standard_cleaning_due_date ?? addDays(booking.arrival_date, interval);
  return dueDate <= date ? dueDate : null;
}

function reasonCodesFor(context: OperationalContext, task: HousekeepingTask, taskType: HousekeepingTaskType, waitingRelease: boolean, maintenanceBlocked: boolean): HousekeepingV2ReasonCode[] {
  const codes: HousekeepingV2ReasonCode[] = [];
  if (waitingRelease) codes.push("waiting_reception");
  if (maintenanceBlocked) codes.push("maintenance_block");
  if (taskType === "STANDARD_CLEANING" && task.dueCycleDate) {
    if (task.operationalDate < context.date) codes.push("standard_cleaning_previous_day");
    else if (task.dueCycleDate === context.date || task.operationalDate === context.date) codes.push("cleaning_due_today");
  }
  if (taskType === "ON_DEMAND_CLEANING") {
    codes.push(task.operationalDate < context.date ? "on_demand_previous_day" : "on_demand_cleaning");
  }
  if (taskType === "LINEN_CHANGE" || context.counter?.linen_required_override === 1) {
    codes.push("linen_required");
    if (context.counter?.linen_required_override === 1) codes.push("linen_override");
  }
  return [...new Set(codes)];
}

function releaseStateFor(context: OperationalContext, taskType: HousekeepingTaskType): HousekeepingV2ReceptionReleaseState {
  if (taskType !== "TURNOVER") return "not_required";
  return context.departure?.room_released === 1 ? "released" : "waiting_for_reception";
}

function sectionForCard(card: HousekeepingV2TaskCard): HousekeepingV2SectionId {
  return card.currentQueue;
}

function visibleQueueForTask(task: HousekeepingTask, reasonCodes: HousekeepingV2ReasonCode[], waitingRelease: boolean, maintenanceBlocked: boolean): HousekeepingV2SectionId {
  if (task.taskType === "TURNOVER") return "priority-turnover";
  if (task.taskType === "WATER_REFILL") return "water-refill";
  if (reasonCodes.includes("standard_cleaning_previous_day") || reasonCodes.includes("on_demand_previous_day")) return "priority-turnover";
  void maintenanceBlocked;
  if (task.priority === "URGENT" || waitingRelease || task.status === "BLOCKED") return "priority-turnover";
  return "normal-cleaning";
}

function displayReasonFor(reasonCodes: HousekeepingV2ReasonCode[]): string | null {
  if (reasonCodes.includes("standard_cleaning_previous_day") || reasonCodes.includes("on_demand_previous_day")) return "Was due yesterday";
  if (reasonCodes.includes("waiting_reception")) return "Waiting Reception";
  if (reasonCodes.includes("maintenance_block")) return "Maintenance Block";
  if (reasonCodes.includes("cleaning_due_today")) return "Due today";
  if (reasonCodes.includes("on_demand_cleaning")) return "On-Demand";
  if (reasonCodes.includes("linen_override")) return "Full Cleaning requested";
  if (reasonCodes.includes("linen_required")) return "Full Cleaning";
  return null;
}

function taskBelongsToActiveStay(context: OperationalContext, task: HousekeepingTask): boolean {
  if (task.taskType === "TURNOVER") return taskBelongsToDeparture(context, task);
  if (!context.activeStay) return false;
  return taskMatchesBooking(task, context.activeStay);
}

function taskBelongsToRoomReadyOverride(task: HousekeepingTask): boolean {
  if (task.idempotencyKey?.startsWith("room-ready-baseline:not-ready:")) return false;
  return task.source === "manual" && task.onDemandSource === ROOM_READY_OVERRIDE_SOURCE;
}

function taskBelongsToDeparture(context: OperationalContext, task: HousekeepingTask): boolean {
  if (task.taskType !== "TURNOVER") return false;
  if (!context.departure) return false;
  return taskMatchesBooking(task, context.departure);
}

function taskMatchesBooking(task: HousekeepingTask, booking: BookingRow): boolean {
  if (task.bookingId !== null) return task.bookingId === booking.booking_id;
  if (task.stayId !== null) return task.stayId === booking.beds24_booking_id;
  return false;
}

function overviewTaskCapabilities(task: HousekeepingTask, user: CurrentUser, isWaitingRelease: boolean, maintenanceBlocked: boolean) {
  const base = housekeepingTaskCapabilities(task);
  const isOwner = user.role === "Owner" && user.views.includes("owner");
  const isManager = user.role === "Manager";
  const isAssigned = task.assignedUserId === user.id;
  const isUnassigned = task.assignedUserId === null;
  const active = !["COMPLETED", "SKIPPED", "CANCELLED"].includes(task.status);

  return {
    canClaim: task.taskType !== "WATER_REFILL" && base.canClaim && !isWaitingRelease && !maintenanceBlocked,
    canReleaseClaim: task.status === "CLAIMED" && (isAssigned || isOwner || isManager),
    canStart: base.canStart && !isWaitingRelease && !maintenanceBlocked && (isUnassigned || isAssigned || isOwner),
    canComplete: base.canComplete && !isWaitingRelease && !maintenanceBlocked && (isAssigned || isOwner || (task.taskType === "WATER_REFILL" && isUnassigned)),
    canSkip: base.canSkip && (isAssigned || isOwner || isManager),
    canCancel: active && Boolean(isOwner || isManager),
    requiresReceptionRelease: base.requiresReceptionRelease || isWaitingRelease,
  };
}

function taskFor(tasks: HousekeepingTask[], taskType: HousekeepingTaskType): HousekeepingTask | null {
  return tasks
    .filter((task) => task.taskType === taskType && ACTIVE_TASK_STATUSES.has(task.status))
    .sort(sortTasks)[0] ?? null;
}

function sortTasks(left: HousekeepingTask, right: HousekeepingTask): number {
  return priorityRank(right.priority) - priorityRank(left.priority) || left.operationalDate.localeCompare(right.operationalDate) || left.id - right.id;
}

function sortCards(left: HousekeepingV2TaskCard, right: HousekeepingV2TaskCard): number {
  if (sectionForCard(left) === "normal-cleaning" && sectionForCard(right) === "normal-cleaning") {
    return normalCleaningRank(left) - normalCleaningRank(right) || priorityRank(right.priority) - priorityRank(left.priority) || left.unitName.localeCompare(right.unitName);
  }
  if (sectionForCard(left) === "priority-turnover" && sectionForCard(right) === "priority-turnover") {
    return priorityQueueRank(left) - priorityQueueRank(right) || priorityRank(right.priority) - priorityRank(left.priority) || left.operationalDate.localeCompare(right.operationalDate) || left.unitName.localeCompare(right.unitName);
  }
  return priorityRank(right.priority) - priorityRank(left.priority) || left.unitName.localeCompare(right.unitName);
}

function normalCleaningRank(card: HousekeepingV2TaskCard): number {
  if (card.reasonCodes.includes("standard_cleaning_previous_day")) return 1;
  if (card.reasonCodes.includes("on_demand_cleaning")) return 2;
  if (card.reasonCodes.includes("cleaning_due_today") || card.reasonCodes.includes("linen_required")) return 3;
  if (card.taskStatus === "CLAIMED" || card.taskStatus === "IN_PROGRESS") return 4;
  return 5;
}

function priorityQueueRank(card: HousekeepingV2TaskCard): number {
  if (card.taskType === "TURNOVER" && !card.reasonCodes.includes("waiting_reception") && !card.assignee) return 1;
  if (card.taskType === "TURNOVER") return 2;
  if (card.reasonCodes.includes("standard_cleaning_previous_day")) return 3;
  if (card.reasonCodes.includes("on_demand_previous_day")) return 4;
  if (card.taskStatus === "CLAIMED" || card.taskStatus === "IN_PROGRESS") return 5;
  if (card.isBlocked) return 6;
  return 7;
}

function priorityRank(priority: HousekeepingTaskPriority): number {
  switch (priority) {
    case "URGENT":
      return 4;
    case "HIGH":
      return 3;
    case "NORMAL":
      return 2;
    case "LOW":
      return 1;
  }
}

function blockReasonFor(context: OperationalContext, task: HousekeepingTask | null, waitingRelease: boolean, maintenanceBlocked: boolean): string | null {
  if (task?.blockingReason) return task.blockingReason;
  if (maintenanceBlocked) return maintenanceSummary(context.maintenance);
  if (waitingRelease) return "Waiting for Reception room release";
  return null;
}

function maintenanceSummary(row: MaintenanceRow | null): string | null {
  if (!row || row.count <= 0) return null;
  if (row.critical > 0) return row.label ?? "Maintenance block";
  return row.count === 1 ? row.label ?? "1 open maintenance ticket" : `${row.count} open maintenance tickets`;
}

function sectionTitle(id: HousekeepingV2SectionId): string {
  switch (id) {
    case "priority-turnover":
      return "Priority";
    case "normal-cleaning":
      return "Normal";
    case "water-refill":
      return "Water";
  }
}

function sectionEmpty(id: HousekeepingV2SectionId): string {
  switch (id) {
    case "priority-turnover":
      return "No priority work.";
    case "normal-cleaning":
      return "No normal cleaning work.";
    case "water-refill":
      return "No water refills.";
  }
}

function isOccupiedOn(booking: BookingRow, date: string): boolean {
  return booking.arrival_date <= date && booking.departure_date > date;
}

function checkInAt(booking: BookingRow): string {
  return `${booking.arrival_date}T${booking.arrival_time || "14:00"}`;
}

function waterQuantityFor(unit: UnitRow, config: Map<string, number>): number {
  const labels = [unit.unit_type, unit.room_type_name, unit.room_name].filter((value): value is string => Boolean(value));
  for (const label of labels) {
    const normalized = normalizeRoomType(label);
    const configured = config.get(normalized);
    if (configured) return configured;
  }
  return 2;
}

function normalizeRoomType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("villa")) return "villa";
  if (normalized.includes("bungalow")) return "bungalow";
  if (normalized.includes("yurt")) return "yurt";
  if (normalized.includes("tent")) return "tent";
  return normalized;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function formatBangkokDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function loadUnits(env: HousekeepingV2Bindings): Promise<UnitRow[]> {
  const rows = await env.DB.prepare(`
    SELECT u.unit_id, u.unit_name, u.unit_type, rt.room_type_name, rt.room_name,
           COALESCE(roa.status, 'OPERATING') AS operational_availability_status
    FROM units u
    JOIN room_types rt ON rt.room_type_id = u.room_type_id
    LEFT JOIN room_operational_availability roa ON roa.unit_id = u.unit_id
    WHERE u.active = 1
    ORDER BY COALESCE(u.position, 999), u.unit_name, u.unit_id
  `).all<UnitRow>();
  return rows.results ?? [];
}

async function loadBookings(env: HousekeepingV2Bindings, date: string): Promise<BookingRow[]> {
  const rows = await env.DB.prepare(`
    SELECT b.booking_id, b.beds24_booking_id, b.unit_id, b.guest_name, b.arrival_date, b.departure_date, b.arrival_time,
           b.channel, b.api_source, b.status,
           rs.guest_arrived, rs.room_released
    FROM bookings b
    JOIN units u ON u.unit_id = b.unit_id
    LEFT JOIN room_operational_availability roa ON roa.unit_id = b.unit_id
    LEFT JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
    WHERE b.unit_id IS NOT NULL
      AND u.active = 1
      AND COALESCE(roa.status, 'OPERATING') = 'OPERATING'
      AND NOT EXISTS (
        SELECT 1
        FROM maintenance_tickets mt
        WHERE mt.room_id = b.unit_id
          AND mt.status NOT IN ('Resolved', 'Closed')
          AND (mt.out_of_service = 1 OR json_extract(mt.metadata_json, '$.outOfService') = 1)
      )
      AND ${operationalBookingStatusSql("b.status")}
      AND (
        b.departure_date = ?
        OR (b.arrival_date <= ? AND b.departure_date > ?)
        OR b.arrival_date >= ?
      )
    ORDER BY b.arrival_date, b.departure_date, b.beds24_booking_id
  `).bind(date, date, date, date).all<BookingRow>();
  return rows.results ?? [];
}

async function loadTasks(env: HousekeepingV2Bindings, date: string): Promise<HousekeepingTask[]> {
  const rows = await env.DB.prepare(`
    SELECT *
    FROM housekeeping_tasks
    WHERE operational_date = ?
       OR (due_cycle_date <= ? AND status NOT IN ('COMPLETED', 'SKIPPED', 'CANCELLED'))
    ORDER BY operational_date, task_id
  `).bind(date, date).all<TaskRow>();
  return (rows.results ?? []).map(mapTaskRow);
}

async function loadCounters(env: HousekeepingV2Bindings): Promise<Map<number, CounterRow>> {
  const rows = await env.DB.prepare(`
    SELECT unit_id, active_booking_id, active_stay_id, next_standard_cleaning_due_date,
           standard_cleaning_interval_days, next_linen_change_due_date,
           linen_required_override, linen_override_reason
    FROM housekeeping_room_counters
  `).all<CounterRow>();
  return new Map((rows.results ?? []).map((row) => [row.unit_id, row]));
}

async function loadAlerts(env: HousekeepingV2Bindings): Promise<Map<number, AlertRow>> {
  const rows = await env.DB.prepare(`
    SELECT unit_id, COUNT(*) AS count, MIN(title) AS label
    FROM reception_room_alerts
    WHERE status = 'active'
    GROUP BY unit_id
  `).all<AlertRow>();
  return new Map((rows.results ?? []).map((row) => [row.unit_id, row]));
}

async function loadMaintenance(env: HousekeepingV2Bindings): Promise<Map<number, MaintenanceRow>> {
  const rows = await env.DB.prepare(`
    SELECT room_id, COUNT(*) AS count,
           SUM(CASE WHEN out_of_service = 1 OR json_extract(metadata_json, '$.outOfService') = 1 OR priority = 'Critical' THEN 1 ELSE 0 END) AS critical,
           MIN(title) AS label
    FROM maintenance_tickets
    WHERE room_id IS NOT NULL
      AND status NOT IN ('Resolved', 'Closed')
    GROUP BY room_id
  `).all<MaintenanceRow>();
  return new Map((rows.results ?? []).map((row) => [row.room_id, row]));
}

async function loadWaterConfig(env: HousekeepingV2Bindings): Promise<Map<string, number>> {
  const rows = await env.DB.prepare(`
    SELECT room_type, default_bottles
    FROM housekeeping_water_quantity_config
    WHERE active = 1
  `).all<WaterConfigRow>();
  return new Map((rows.results ?? []).map((row) => [normalizeRoomType(row.room_type), row.default_bottles]));
}

async function loadProcurementAttention(env: HousekeepingV2Bindings): Promise<{ attentionCount: number; latestRequest: string | null }> {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count, MAX(COALESCE(custom_item_text, note, status)) AS latest_request
    FROM procurement_requests
    WHERE status IN ('requested', 'reviewed', 'ordered')
  `).first<ProcurementRow>();
  return {
    attentionCount: row?.count ?? 0,
    latestRequest: row?.latest_request ?? null,
  };
}
