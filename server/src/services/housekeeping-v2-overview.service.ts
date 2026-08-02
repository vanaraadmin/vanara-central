import { operationalBookingStatusSql } from "./booking-status.service.js";
import { createHousekeepingTask, housekeepingTaskCapabilities, type HousekeepingTask, type HousekeepingTaskPriority, type HousekeepingTaskStatus, type HousekeepingTaskType } from "./housekeeping-task-domain.service.js";
import type { CurrentUser } from "./current-user.service.js";

export interface HousekeepingV2Bindings {
  DB: D1Database;
}

export type HousekeepingV2SectionId = "priority-turnover" | "normal-cleaning" | "water-refill" | "ready" | "procurement";
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
  roomType: string;
  bookingId: number | null;
  guestName: string | null;
  stayStatus: HousekeepingV2StayStatus;
  arrivalDate: string | null;
  departureDate: string | null;
  nextCheckInAt: string | null;
  taskId: number | null;
  taskType: HousekeepingTaskType | null;
  taskStatus: HousekeepingTaskStatus | null;
  priority: HousekeepingTaskPriority;
  assignee: string | null;
  isOverdue: boolean;
  isBlocked: boolean;
  blockReason: string | null;
  receptionReleaseState: HousekeepingV2ReceptionReleaseState;
  waterQuantity: number | null;
  linenRequired: boolean;
  alertSummary: string | null;
  maintenanceSummary: string | null;
  capabilities: {
    canOpenRoom: boolean;
    canClaim: boolean;
    canStart: boolean;
    canComplete: boolean;
    canSkip: boolean;
    canCancel: boolean;
    requiresReceptionRelease: boolean;
  };
}

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
}

interface BookingRow {
  booking_id: number;
  beds24_booking_id: number;
  unit_id: number;
  guest_name: string | null;
  arrival_date: string;
  departure_date: string;
  arrival_time: string | null;
  adults: number;
  children: number;
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
  next_standard_cleaning_due_date: string | null;
  standard_cleaning_interval_days: number | null;
  linen_required_override: number | null;
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
  date: string;
}

const ACTIVE_TASK_STATUSES = new Set<HousekeepingTaskStatus>(["WAITING_FOR_RECEPTION", "AVAILABLE_FOR_CLAIM", "CLAIMED", "IN_PROGRESS", "CHECKLIST_COMPLETE", "READY_FOR_INSPECTION", "READY", "BLOCKED"]);
const CLAIMED_STATUSES = new Set<HousekeepingTaskStatus>(["CLAIMED", "IN_PROGRESS", "CHECKLIST_COMPLETE", "READY_FOR_INSPECTION", "READY", "BLOCKED"]);
const IN_PROGRESS_STATUSES = new Set<HousekeepingTaskStatus>(["IN_PROGRESS", "CHECKLIST_COMPLETE", "READY_FOR_INSPECTION"]);
const SECTION_ORDER: HousekeepingV2SectionId[] = ["priority-turnover", "normal-cleaning", "water-refill", "ready", "procurement"];
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
  const operationalCards = contexts.flatMap((context) => cardsForContext(context));
  const procurementCard = procurement.attentionCount > 0 ? procurementAttentionCard(procurement) : null;
  const allCards = procurementCard ? [...operationalCards, procurementCard] : operationalCards;
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
        operationalDate: date,
        dueCycleDate: date,
        priority: booking.room_released === 1 ? "URGENT" : "HIGH",
        source: "system",
        idempotencyKey: `housekeeping:v2:turnover:${booking.unit_id}:${booking.beds24_booking_id}:${date}`,
      }, user);
      createdOrReused += 1;
    }

    if (!isOccupiedOn(booking, date) || booking.departure_date === date || booking.guest_arrived !== 1) continue;

    const counter = counters.get(booking.unit_id) ?? null;
    const dueCycleDate = standardCleaningDueCycle(booking, counter, date);
    if (dueCycleDate && !hasTask(activeTasks, "STANDARD_CLEANING", booking.unit_id, booking.booking_id, dueCycleDate)) {
      attempted += 1;
      await createHousekeepingTask(env, {
        taskType: "STANDARD_CLEANING",
        unitId: booking.unit_id,
        bookingId: booking.booking_id,
        operationalDate: date,
        dueCycleDate,
        priority: dueCycleDate < date ? "HIGH" : "NORMAL",
        source: "system",
        idempotencyKey: `housekeeping:v2:standard:${booking.unit_id}:${booking.beds24_booking_id}:${dueCycleDate}`,
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
    if (taskType === "STANDARD_CLEANING") return task.dueCycleDate === dateOrCycle;
    return task.operationalDate === dateOrCycle;
  });
}

function cardsForContext(context: OperationalContext): HousekeepingV2TaskCard[] {
  const cards: HousekeepingV2TaskCard[] = [];
  const maintenanceBlocked = Boolean(context.maintenance && context.maintenance.critical > 0);
  const turnover = taskFor(context.tasks, "TURNOVER");
  if (turnover || context.departure) {
    cards.push(cardFromContext(context, turnover, "TURNOVER", maintenanceBlocked));
  }

  const standard = taskFor(context.tasks, "STANDARD_CLEANING");
  if (standard) {
    cards.push(cardFromContext(context, standard, "STANDARD_CLEANING", maintenanceBlocked));
  }

  const water = taskFor(context.tasks, "WATER_REFILL");
  if (water) {
    cards.push(cardFromContext(context, water, "WATER_REFILL", maintenanceBlocked));
  }

  if (!turnover && !standard && !water && !maintenanceBlocked) {
    cards.push(readyCard(context));
  }

  return cards;
}

function cardFromContext(context: OperationalContext, task: HousekeepingTask | null, taskType: HousekeepingTaskType, maintenanceBlocked: boolean): HousekeepingV2TaskCard {
  const booking = taskType === "TURNOVER" ? context.departure : context.activeStay;
  const releaseState = releaseStateFor(context, taskType);
  const isWaitingRelease = releaseState === "waiting_for_reception";
  const priority = task?.priority ?? (taskType === "TURNOVER" ? "HIGH" : "NORMAL");
  const taskStatus = task?.status ?? (taskType === "TURNOVER" && isWaitingRelease ? "WAITING_FOR_RECEPTION" : "AVAILABLE_FOR_CLAIM");
  const capabilities = task ? housekeepingTaskCapabilities(task) : null;

  return {
    unitId: context.unit.unit_id,
    unitName: context.unit.unit_name,
    roomType: roomTypeLabel(context.unit),
    bookingId: booking?.beds24_booking_id ?? task?.bookingId ?? null,
    guestName: booking?.guest_name ?? null,
    stayStatus: stayStatusFor(context, taskType),
    arrivalDate: booking?.arrival_date ?? null,
    departureDate: booking?.departure_date ?? null,
    nextCheckInAt: context.nextArrival ? checkInAt(context.nextArrival) : null,
    taskId: task?.id ?? null,
    taskType,
    taskStatus,
    priority,
    assignee: task?.assignedUserName ?? null,
    isOverdue: taskType === "STANDARD_CLEANING" && Boolean(task?.dueCycleDate && task.dueCycleDate < context.date),
    isBlocked: isWaitingRelease || maintenanceBlocked || taskStatus === "BLOCKED",
    blockReason: blockReasonFor(context, task, isWaitingRelease, maintenanceBlocked),
    receptionReleaseState: releaseState,
    waterQuantity: taskType === "WATER_REFILL" ? context.waterQuantity : null,
    linenRequired: context.counter?.linen_required_override === 1,
    alertSummary: alertSummary(context.alerts),
    maintenanceSummary: maintenanceSummary(context.maintenance),
    capabilities: {
      canOpenRoom: true,
      canClaim: Boolean(capabilities?.canClaim) && !isWaitingRelease && !maintenanceBlocked,
      canStart: Boolean(capabilities?.canStart) && !maintenanceBlocked,
      canComplete: Boolean(capabilities?.canComplete) && !maintenanceBlocked,
      canSkip: Boolean(capabilities?.canSkip),
      canCancel: Boolean(capabilities?.canCancel),
      requiresReceptionRelease: Boolean(capabilities?.requiresReceptionRelease) || isWaitingRelease,
    },
  };
}

function readyCard(context: OperationalContext): HousekeepingV2TaskCard {
  return {
    unitId: context.unit.unit_id,
    unitName: context.unit.unit_name,
    roomType: roomTypeLabel(context.unit),
    bookingId: context.activeStay?.beds24_booking_id ?? null,
    guestName: context.activeStay?.guest_name ?? null,
    stayStatus: context.activeStay ? "in_house" : "ready",
    arrivalDate: context.activeStay?.arrival_date ?? null,
    departureDate: context.activeStay?.departure_date ?? null,
    nextCheckInAt: context.nextArrival ? checkInAt(context.nextArrival) : null,
    taskId: null,
    taskType: null,
    taskStatus: null,
    priority: "LOW",
    assignee: null,
    isOverdue: false,
    isBlocked: false,
    blockReason: null,
    receptionReleaseState: "not_required",
    waterQuantity: null,
    linenRequired: false,
    alertSummary: alertSummary(context.alerts),
    maintenanceSummary: null,
    capabilities: {
      canOpenRoom: true,
      canClaim: false,
      canStart: false,
      canComplete: false,
      canSkip: false,
      canCancel: false,
      requiresReceptionRelease: false,
    },
  };
}

function procurementAttentionCard(procurement: { attentionCount: number; latestRequest: string | null }): HousekeepingV2TaskCard {
  return {
    unitId: 0,
    unitName: "Supply attention",
    roomType: "Procurement",
    bookingId: null,
    guestName: procurement.latestRequest,
    stayStatus: "ready",
    arrivalDate: null,
    departureDate: null,
    nextCheckInAt: null,
    taskId: null,
    taskType: null,
    taskStatus: null,
    priority: "NORMAL",
    assignee: null,
    isOverdue: false,
    isBlocked: false,
    blockReason: null,
    receptionReleaseState: "not_required",
    waterQuantity: null,
    linenRequired: false,
    alertSummary: `${procurement.attentionCount} supply request${procurement.attentionCount === 1 ? "" : "s"} need attention`,
    maintenanceSummary: null,
    capabilities: {
      canOpenRoom: false,
      canClaim: false,
      canStart: false,
      canComplete: false,
      canSkip: false,
      canCancel: false,
      requiresReceptionRelease: false,
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
  const taskCards = cards.filter((card) => card.taskId !== null);
  return {
    awaitingReceptionRelease: cards.filter((card) => card.receptionReleaseState === "waiting_for_reception").length,
    priorityTurnovers: sections.find((section) => section.id === "priority-turnover")?.cards.filter((card) => card.receptionReleaseState !== "waiting_for_reception").length ?? 0,
    normalCleaningDue: sections.find((section) => section.id === "normal-cleaning")?.cards.length ?? 0,
    waterRefillDue: sections.find((section) => section.id === "water-refill")?.cards.length ?? 0,
    tasksClaimed: taskCards.filter((card) => card.assignee && card.taskStatus && CLAIMED_STATUSES.has(card.taskStatus)).length,
    tasksInProgress: taskCards.filter((card) => card.taskStatus && IN_PROGRESS_STATUSES.has(card.taskStatus)).length,
    blockedRooms: cards.filter((card) => card.isBlocked).length,
    completedToday: taskCards.filter((card) => card.taskStatus === "COMPLETED").length,
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
    return {
      unit,
      activeStay,
      departure,
      nextArrival,
      counter: counters.get(unit.unit_id) ?? null,
      tasks: tasks.filter((task) => task.unitId === unit.unit_id),
      alerts: alerts.get(unit.unit_id) ?? null,
      maintenance: maintenance.get(unit.unit_id) ?? null,
      waterQuantity: waterQuantityFor(unit, waterConfig),
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

function standardCleaningDueCycle(booking: BookingRow, counter: CounterRow | null, date: string): string | null {
  const interval = counter?.standard_cleaning_interval_days && counter.standard_cleaning_interval_days > 0 ? counter.standard_cleaning_interval_days : DEFAULT_STANDARD_INTERVAL_DAYS;
  const dueDate = counter?.next_standard_cleaning_due_date ?? addDays(booking.arrival_date, interval);
  return dueDate <= date ? dueDate : null;
}

function releaseStateFor(context: OperationalContext, taskType: HousekeepingTaskType): HousekeepingV2ReceptionReleaseState {
  if (taskType !== "TURNOVER") return "not_required";
  return context.departure?.room_released === 1 ? "released" : "waiting_for_reception";
}

function stayStatusFor(context: OperationalContext, taskType: HousekeepingTaskType): HousekeepingV2StayStatus {
  if (taskType === "TURNOVER") return "departing";
  if (context.activeStay) return "in_house";
  if (context.nextArrival?.arrival_date === context.date) return "arriving";
  return "vacant";
}

function sectionForCard(card: HousekeepingV2TaskCard): HousekeepingV2SectionId {
  if (card.unitId === 0) return "procurement";
  if (card.taskType === "TURNOVER") return "priority-turnover";
  if (card.taskType === "STANDARD_CLEANING") return "normal-cleaning";
  if (card.taskType === "WATER_REFILL") return "water-refill";
  return "ready";
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
  return priorityRank(right.priority) - priorityRank(left.priority) || Number(right.isOverdue) - Number(left.isOverdue) || left.unitName.localeCompare(right.unitName);
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

function alertSummary(alert: AlertRow | null): string | null {
  if (!alert || alert.count <= 0) return null;
  return alert.count === 1 ? alert.label ?? "1 Reception alert" : `${alert.count} Reception alerts`;
}

function maintenanceSummary(row: MaintenanceRow | null): string | null {
  if (!row || row.count <= 0) return null;
  if (row.critical > 0) return row.label ?? "Maintenance block";
  return row.count === 1 ? row.label ?? "1 open maintenance ticket" : `${row.count} open maintenance tickets`;
}

function sectionTitle(id: HousekeepingV2SectionId): string {
  switch (id) {
    case "priority-turnover":
      return "Priority Turnover";
    case "normal-cleaning":
      return "Normal Cleaning";
    case "water-refill":
      return "Water Refill";
    case "ready":
      return "Ready / No Action Required";
    case "procurement":
      return "Procurement";
  }
}

function sectionEmpty(id: HousekeepingV2SectionId): string {
  switch (id) {
    case "priority-turnover":
      return "No turnovers waiting.";
    case "normal-cleaning":
      return "No occupied-room cleaning due.";
    case "water-refill":
      return "Water refill complete.";
    case "ready":
      return "No ready rooms to list.";
    case "procurement":
      return "No supply requests pending.";
  }
}

function isOccupiedOn(booking: BookingRow, date: string): boolean {
  return booking.arrival_date <= date && booking.departure_date > date;
}

function checkInAt(booking: BookingRow): string {
  return `${booking.arrival_date}T${booking.arrival_time || "14:00"}`;
}

function roomTypeLabel(unit: UnitRow): string {
  return unit.room_type_name || unit.room_name || unit.unit_type || "Accommodation";
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
    SELECT u.unit_id, u.unit_name, u.unit_type, rt.room_type_name, rt.room_name
    FROM units u
    JOIN room_types rt ON rt.room_type_id = u.room_type_id
    WHERE u.active = 1
    ORDER BY COALESCE(u.position, 999), u.unit_name, u.unit_id
  `).all<UnitRow>();
  return rows.results ?? [];
}

async function loadBookings(env: HousekeepingV2Bindings, date: string): Promise<BookingRow[]> {
  const rows = await env.DB.prepare(`
    SELECT b.booking_id, b.beds24_booking_id, b.unit_id, b.guest_name, b.arrival_date, b.departure_date, b.arrival_time,
           b.adults, b.children, b.channel, b.api_source, b.status,
           rs.guest_arrived, rs.room_released
    FROM bookings b
    LEFT JOIN reception_stays rs ON rs.beds24_booking_id = b.beds24_booking_id
    WHERE b.unit_id IS NOT NULL
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
    SELECT unit_id, next_standard_cleaning_due_date, standard_cleaning_interval_days, linen_required_override
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
           SUM(CASE WHEN json_extract(metadata_json, '$.outOfService') = 1 OR priority = 'Critical' THEN 1 ELSE 0 END) AS critical,
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
