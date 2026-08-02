import { operationalBookingStatusSql } from "./booking-status.service.js";
import { housekeepingTaskCapabilities, type HousekeepingTaskPriority, type HousekeepingTaskStatus, type HousekeepingTaskType } from "./housekeeping-task-domain.service.js";
import { getBangkokDate } from "./today.service.js";
import { hasActionPermission, hasModulePermission, type CurrentUser } from "./current-user.service.js";

export interface RoomsWorkspaceBindings {
  DB: D1Database;
}

export type RoomOperationalAvailability = "OPERATING" | "NOT_OPERATING";
export type RoomOccupancyState = "VACANT" | "OCCUPIED";
export type RoomHousekeepingCondition = "READY" | "NOT_READY";
export type RoomHousekeepingWorkState = "NONE" | "AVAILABLE" | "IN_PROGRESS" | "BLOCKED";
export type RoomMaintenanceState = "CLEAR" | "ACTIVE" | "BLOCKING";
export type ReceptionStepState = "NOT_REQUIRED" | "PENDING" | "COMPLETE" | "BLOCKED";
export type ReceptionStayPhase = "NONE" | "ARRIVAL_DUE" | "IN_HOUSE" | "DEPARTURE_DUE" | "CHECKED_OUT";
export type ReceptionPrimaryActionType = "COLLECT_PASSPORT" | "COMPLETE_CHECK_IN" | "COMPLETE_CHECK_OUT";
export type RoomDomainTone = "success" | "warning" | "danger" | "info" | "neutral";
export type RoomHousekeepingActionType = "CREATE_ON_DEMAND_CLEANING" | "START_HOUSEKEEPING_TASK" | "COMPLETE_HOUSEKEEPING_TASK";
export type RoomMaintenanceActionType = "REPORT_ISSUE" | "OPEN_TICKET" | "CONTINUE_WORK";
export type RoomHousekeepingCompletionMode = "STANDARD" | "FULL" | "WATER";

interface RoomWorkspaceRow {
  unit_id: number;
  unit_name: string;
  unit_type: string | null;
  room_type_name: string | null;
  room_name: string | null;
  position: number | null;
  availability_status: RoomOperationalAvailability | null;
  availability_reason: string | null;
  seasonal_start: string | null;
  seasonal_end: string | null;
  ready_state: "READY" | "NOT_READY" | null;
  booking_id: number | null;
  beds24_booking_id: number | null;
  guest_name: string | null;
  country: string | null;
  country_code: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  api_source: string | null;
  channel: string | null;
  active_task_count: number | null;
  active_task_id: number | null;
  active_task_version: number | null;
  active_task_status: HousekeepingTaskStatus | null;
  active_task_type: HousekeepingTaskType | null;
  active_task_priority: HousekeepingTaskPriority | null;
  active_task_assignee: string | null;
  active_ticket_count: number | null;
  blocking_ticket_count: number | null;
  primary_maintenance_ticket_id: number | null;
  primary_maintenance_title: string | null;
  reception_booking_id: number | null;
  reception_beds24_booking_id: number | null;
  reception_arrival_date: string | null;
  reception_departure_date: string | null;
  reception_guest_arrived: number | null;
  reception_passport_collected: number | null;
  reception_deposit_collected: number | null;
  reception_welcome_completed: number | null;
  reception_keys_delivered: number | null;
  reception_guest_left: number | null;
  reception_keys_returned: number | null;
  reception_deposit_returned: number | null;
  reception_room_released: number | null;
  reception_updated_at: string | null;
  passport_completed_at: string | null;
  deposit_completed_at: string | null;
  check_in_completed_at: string | null;
  check_out_completed_at: string | null;
}

interface ReceptionAlertRow {
  alert_id: number;
  unit_id: number;
  alert_type: "passport_missing" | "deposit_pending";
  title: string;
}

export interface RoomsWorkspaceRoom {
  unitId: number;
  roomName: string;
  roomType: string;
  accommodationType: "Bungalow" | "Villa" | "Tent" | "Other";
  sortGroup: "bungalow" | "villa" | "tent" | "other";
  sortNumber: number;
  heroImageKey: string;
  currentStay: RoomCurrentStaySummary | null;
  operational: RoomOperationalSummary;
  reception: RoomReceptionSummary;
  housekeeping: RoomHousekeepingDomainSummary;
  maintenance: RoomMaintenanceDomainSummary;
}

export interface RoomCurrentStaySummary {
  guestName: string;
  nationality: string | null;
  source: string | null;
  arrivalDate: string;
  departureDate: string;
  stayNights: number | null;
}

export interface RoomOperationalSummary {
  availability: {
    state: RoomOperationalAvailability;
    reason: string | null;
    startDate: string | null;
    endDate: string | null;
    seasonLabel: string | null;
  };
  occupancy: {
    state: RoomOccupancyState;
    guestName: string | null;
    bookingId: number | null;
    source: string | null;
  };
  housekeeping: {
    condition: RoomHousekeepingCondition;
    workState: RoomHousekeepingWorkState;
    activeTaskType: string | null;
    assignedTo: string | null;
  };
  maintenance: {
    state: RoomMaintenanceState;
    activeTicketCount: number;
    blockingTicketCount: number;
    primaryTitle: string | null;
  };
}

export interface RoomReceptionStepSummary {
  state: ReceptionStepState;
  completedAt: string | null;
}

export interface RoomReceptionAlertSummary {
  id: number;
  type: string;
  label: string;
  tone: "warning" | "danger" | "info";
}

export interface RoomReceptionPrimaryAction {
  type: ReceptionPrimaryActionType;
  label: string;
  target: string;
}

export interface RoomReceptionSummary {
  phase: ReceptionStayPhase;
  passport: RoomReceptionStepSummary;
  deposit: RoomReceptionStepSummary;
  checkIn: RoomReceptionStepSummary;
  checkOut: RoomReceptionStepSummary;
  alerts: RoomReceptionAlertSummary[];
  primaryAction: RoomReceptionPrimaryAction | null;
}

export interface RoomHousekeepingActiveTaskSummary {
  id: number;
  version: number;
  taskType: string;
  status: string;
  priority: string;
  assignee: string | null;
}

export interface RoomHousekeepingPrimaryAction {
  type: RoomHousekeepingActionType;
  label: string;
  taskId: number | null;
  version: number | null;
  completionMode: RoomHousekeepingCompletionMode | null;
}

export interface RoomHousekeepingDomainSummary {
  primaryStatus: string;
  tone: RoomDomainTone;
  detail: string;
  secondaryInfo: string | null;
  activeTask: RoomHousekeepingActiveTaskSummary | null;
  primaryAction: RoomHousekeepingPrimaryAction | null;
}

export interface RoomMaintenancePrimaryAction {
  type: RoomMaintenanceActionType;
  label: string;
  target: string | null;
}

export interface RoomMaintenanceDomainSummary {
  primaryStatus: string;
  tone: RoomDomainTone;
  detail: string;
  secondaryInfo: string | null;
  primaryAction: RoomMaintenancePrimaryAction | null;
}

export interface RoomsWorkspaceOverview {
  rooms: RoomsWorkspaceRoom[];
  summary: {
    total: number;
    occupied: number;
    notOperating: number;
    notReady: number;
    maintenance: number;
  };
}

function roomNumber(name: string): number {
  const match = name.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 9999;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function monthDayLabel(value: string | null): string | null {
  if (!value || !/^\d{2}-\d{2}$/.test(value)) return null;
  const [month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(2026, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(date);
}

function seasonLabel(startDate: string | null, endDate: string | null): string | null {
  const start = monthDayLabel(startDate);
  const end = monthDayLabel(endDate);
  return start && end ? `${start} - ${end}` : null;
}

function dateOnlyToTime(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(`${value}T00:00:00+07:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function stayNights(arrivalDate: string | null, departureDate: string | null): number | null {
  const arrival = dateOnlyToTime(arrivalDate);
  const departure = dateOnlyToTime(departureDate);
  if (arrival === null || departure === null) return null;
  const nights = Math.round((departure - arrival) / 86_400_000);
  return nights >= 0 ? nights : null;
}

function roomFamily(row: Pick<RoomWorkspaceRow, "unit_name" | "unit_type" | "room_type_name" | "room_name">): RoomsWorkspaceRoom["sortGroup"] {
  const unitName = row.unit_name.toLowerCase();
  if (unitName.includes("bungalow")) return "bungalow";
  if (unitName.includes("villa")) return "villa";
  if (unitName.includes("tent") || unitName.includes("yurt")) return "tent";

  const fallback = `${row.unit_type ?? ""} ${row.room_type_name ?? ""} ${row.room_name ?? ""}`.toLowerCase();
  if (fallback.includes("bungalow")) return "bungalow";
  if (fallback.includes("villa")) return "villa";
  if (fallback.includes("tent") || fallback.includes("yurt")) return "tent";
  return "other";
}

function accommodationType(group: RoomsWorkspaceRoom["sortGroup"]): RoomsWorkspaceRoom["accommodationType"] {
  if (group === "bungalow") return "Bungalow";
  if (group === "villa") return "Villa";
  if (group === "tent") return "Tent";
  return "Other";
}

function familyRank(group: RoomsWorkspaceRoom["sortGroup"]): number {
  if (group === "bungalow") return 1;
  if (group === "villa") return 2;
  if (group === "tent") return 3;
  return 4;
}

function roomType(row: RoomWorkspaceRow): string {
  return row.room_type_name || row.room_name || row.unit_type || "Accommodation";
}

function sourceLabel(row: RoomWorkspaceRow): string | null {
  return row.api_source || row.channel || null;
}

function nationalitySource(row: RoomWorkspaceRow): string | null {
  return row.country || row.country_code || null;
}

function taskTypeLabel(taskType: HousekeepingTaskType | null): string | null {
  if (!taskType) return null;
  if (taskType === "TURNOVER") return "Turnover";
  if (taskType === "STANDARD_CLEANING" || taskType === "ON_DEMAND_CLEANING") return "Cleaning";
  if (taskType === "LINEN_CHANGE") return "Full Cleaning";
  if (taskType === "WATER_REFILL") return "Water refill";
  return "Housekeeping";
}

function housekeepingWorkState(row: RoomWorkspaceRow): RoomHousekeepingWorkState {
  if (!row.active_task_count) return "NONE";
  if (row.active_task_status === "BLOCKED") return "BLOCKED";
  if (row.active_task_status === "IN_PROGRESS" || row.active_task_status === "CHECKLIST_COMPLETE" || row.active_task_status === "READY_FOR_INSPECTION") return "IN_PROGRESS";
  return "AVAILABLE";
}

function maintenanceState(row: RoomWorkspaceRow): RoomMaintenanceState {
  if ((row.blocking_ticket_count ?? 0) > 0) return "BLOCKING";
  if ((row.active_ticket_count ?? 0) > 0) return "ACTIVE";
  return "CLEAR";
}

function flag(value: number | null): boolean {
  return value === 1;
}

function emptyReceptionStep(): RoomReceptionStepSummary {
  return { state: "NOT_REQUIRED", completedAt: null };
}

function emptyReceptionSummary(alerts: RoomReceptionAlertSummary[] = []): RoomReceptionSummary {
  return {
    phase: "NONE",
    passport: emptyReceptionStep(),
    deposit: emptyReceptionStep(),
    checkIn: emptyReceptionStep(),
    checkOut: emptyReceptionStep(),
    alerts,
    primaryAction: null,
  };
}

function stepState(required: boolean, complete: boolean): ReceptionStepState {
  if (complete) return "COMPLETE";
  if (!required) return "NOT_REQUIRED";
  return "PENDING";
}

function checkoutComplete(row: RoomWorkspaceRow): boolean {
  if (!flag(row.reception_guest_left) || !flag(row.reception_keys_returned) || !flag(row.reception_room_released)) return false;
  return flag(row.reception_deposit_collected) ? flag(row.reception_deposit_returned) : true;
}

function checkInComplete(row: RoomWorkspaceRow): boolean {
  return flag(row.reception_guest_arrived)
    && flag(row.reception_passport_collected)
    && flag(row.reception_deposit_collected)
    && flag(row.reception_welcome_completed)
    && flag(row.reception_keys_delivered);
}

function receptionPhase(row: RoomWorkspaceRow, date: string): ReceptionStayPhase {
  if (!row.reception_beds24_booking_id || !row.reception_arrival_date || !row.reception_departure_date) return "NONE";
  const arrived = flag(row.reception_guest_arrived);
  const checkedOut = checkoutComplete(row);

  if (row.reception_departure_date === date && checkedOut) return "CHECKED_OUT";
  if (row.reception_departure_date <= date && arrived && !checkedOut) return "DEPARTURE_DUE";
  if (row.reception_arrival_date === date && !checkInComplete(row)) return "ARRIVAL_DUE";
  if (row.reception_arrival_date <= date && row.reception_departure_date > date && arrived && !checkedOut) return "IN_HOUSE";
  return "NONE";
}

function canUseReceptionActions(user?: CurrentUser): boolean {
  return Boolean(user && hasModulePermission(user, "movements", "access") && hasActionPermission(user, "can_complete_checkin_checkout"));
}

function receptionPrimaryAction(summary: Omit<RoomReceptionSummary, "primaryAction">, canAct: boolean): RoomReceptionPrimaryAction | null {
  if (!canAct) return null;
  if (summary.phase === "DEPARTURE_DUE" && summary.checkOut.state !== "COMPLETE") {
    return { type: "COMPLETE_CHECK_OUT", label: "Complete Check-out", target: "/reception" };
  }
  if (summary.passport.state === "PENDING") {
    return { type: "COLLECT_PASSPORT", label: "Collect Passport", target: "/reception" };
  }
  if (summary.phase === "ARRIVAL_DUE" && summary.checkIn.state !== "COMPLETE") {
    return { type: "COMPLETE_CHECK_IN", label: "Complete Check-in", target: "/reception" };
  }
  return null;
}

function mapReceptionSummary(row: RoomWorkspaceRow, alerts: RoomReceptionAlertSummary[], date: string, user?: CurrentUser): RoomReceptionSummary {
  const phase = receptionPhase(row, date);
  if (phase === "NONE" && alerts.length === 0) return emptyReceptionSummary();

  const passportRequired = phase === "ARRIVAL_DUE" || phase === "IN_HOUSE" || phase === "DEPARTURE_DUE";
  const depositRequired = passportRequired;
  const checkInRequired = phase === "ARRIVAL_DUE" || phase === "IN_HOUSE" || phase === "DEPARTURE_DUE";
  const checkOutRequired = phase === "DEPARTURE_DUE" || phase === "CHECKED_OUT";
  const passportComplete = flag(row.reception_passport_collected);
  const depositComplete = flag(row.reception_deposit_collected);
  const checkInDone = checkInComplete(row);
  const checkOutDone = checkoutComplete(row);

  const summary: Omit<RoomReceptionSummary, "primaryAction"> = {
    phase,
    passport: {
      state: stepState(passportRequired, passportComplete),
      completedAt: passportComplete ? row.passport_completed_at ?? row.reception_updated_at : null,
    },
    deposit: {
      state: stepState(depositRequired, depositComplete),
      completedAt: depositComplete ? row.deposit_completed_at ?? row.reception_updated_at : null,
    },
    checkIn: {
      state: stepState(checkInRequired, checkInDone),
      completedAt: checkInDone ? row.check_in_completed_at ?? row.reception_updated_at : null,
    },
    checkOut: {
      state: stepState(checkOutRequired, checkOutDone),
      completedAt: checkOutDone ? row.check_out_completed_at ?? row.reception_updated_at : null,
    },
    alerts,
  };

  return {
    ...summary,
    primaryAction: receptionPrimaryAction(summary, canUseReceptionActions(user)),
  };
}

function alertLabel(type: ReceptionAlertRow["alert_type"], title: string): string {
  if (type === "passport_missing") return "Passport Missing";
  if (type === "deposit_pending") return "Deposit Pending";
  return title;
}

function mapReceptionAlerts(rows: ReceptionAlertRow[]): Map<number, RoomReceptionAlertSummary[]> {
  const alerts = new Map<number, RoomReceptionAlertSummary[]>();
  for (const row of rows) {
    const current = alerts.get(row.unit_id) ?? [];
    current.push({
      id: row.alert_id,
      type: row.alert_type,
      label: alertLabel(row.alert_type, row.title),
      tone: "warning",
    });
    alerts.set(row.unit_id, current);
  }
  return alerts;
}

async function loadReceptionAlerts(env: RoomsWorkspaceBindings): Promise<Map<number, RoomReceptionAlertSummary[]>> {
  const rows = await env.DB.prepare(`
    SELECT alert_id, unit_id, alert_type, title
    FROM reception_room_alerts
    WHERE status = 'active'
    ORDER BY created_at ASC, alert_id ASC
  `).all<ReceptionAlertRow>();
  return mapReceptionAlerts(rows.results ?? []);
}

function canUseHousekeepingActions(user?: CurrentUser): boolean {
  return Boolean(user && hasModulePermission(user, "housekeeping", "edit"));
}

function canCreateMaintenanceIssue(user?: CurrentUser): boolean {
  return Boolean(user && (
    hasModulePermission(user, "maintenance", "access")
    || hasModulePermission(user, "rooms", "access")
    || hasModulePermission(user, "housekeeping", "access")
    || hasModulePermission(user, "movements", "access")
  ));
}

function taskActionLabel(taskType: HousekeepingTaskType, mode: "start" | "complete"): string {
  if (mode === "start") {
    if (taskType === "LINEN_CHANGE") return "Start Full Cleaning";
    if (taskType === "WATER_REFILL") return "Complete Water";
    return "Start Cleaning";
  }

  if (taskType === "LINEN_CHANGE") return "Finish Full Cleaning";
  if (taskType === "WATER_REFILL") return "Complete Water";
  return "Finish Cleaning";
}

function housekeepingCompletionMode(taskType: HousekeepingTaskType): RoomHousekeepingCompletionMode {
  if (taskType === "LINEN_CHANGE") return "FULL";
  if (taskType === "WATER_REFILL") return "WATER";
  return "STANDARD";
}

function mapHousekeepingActiveTask(row: RoomWorkspaceRow): RoomHousekeepingActiveTaskSummary | null {
  if (!row.active_task_id || !row.active_task_type || !row.active_task_status || !row.active_task_priority || !row.active_task_version) return null;
  return {
    id: row.active_task_id,
    version: row.active_task_version,
    taskType: taskTypeLabel(row.active_task_type) ?? "Housekeeping",
    status: row.active_task_status,
    priority: row.active_task_priority,
    assignee: row.active_task_assignee,
  };
}

function mapHousekeepingAction(row: RoomWorkspaceRow, occupancyState: RoomOccupancyState, user?: CurrentUser): RoomHousekeepingPrimaryAction | null {
  const canAct = canUseHousekeepingActions(user);
  if (!canAct) return null;
  if (maintenanceState(row) === "BLOCKING") return null;

  if (row.active_task_id && row.active_task_type && row.active_task_status && row.active_task_version) {
    const capabilities = housekeepingTaskCapabilities({ taskType: row.active_task_type, status: row.active_task_status });
    if (capabilities.canStart) {
      return {
        type: "START_HOUSEKEEPING_TASK",
        label: taskActionLabel(row.active_task_type, "start"),
        taskId: row.active_task_id,
        version: row.active_task_version,
        completionMode: null,
      };
    }
    if (capabilities.canComplete) {
      return {
        type: "COMPLETE_HOUSEKEEPING_TASK",
        label: taskActionLabel(row.active_task_type, "complete"),
        taskId: row.active_task_id,
        version: row.active_task_version,
        completionMode: housekeepingCompletionMode(row.active_task_type),
      };
    }
    return null;
  }

  if (occupancyState === "OCCUPIED") {
    return {
      type: "CREATE_ON_DEMAND_CLEANING",
      label: "Start On-demand Cleaning",
      taskId: null,
      version: null,
      completionMode: null,
    };
  }

  return null;
}

function mapHousekeepingSummary(row: RoomWorkspaceRow, occupancyState: RoomOccupancyState, user?: CurrentUser): RoomHousekeepingDomainSummary {
  const activeTask = mapHousekeepingActiveTask(row);
  const activeTaskLabel = taskTypeLabel(row.active_task_type);
  const action = mapHousekeepingAction(row, occupancyState, user);
  const workState = housekeepingWorkState(row);

  if (maintenanceState(row) === "BLOCKING") {
    return {
      primaryStatus: "Maintenance Block",
      tone: "danger",
      detail: row.primary_maintenance_title ?? "Housekeeping blocked by maintenance.",
      secondaryInfo: "No cleaning actions available",
      activeTask,
      primaryAction: null,
    };
  }

  if (workState === "IN_PROGRESS") {
    return {
      primaryStatus: activeTaskLabel === "Water refill" ? "Water In Progress" : "Cleaning In Progress",
      tone: "info",
      detail: row.active_task_assignee ? `Assigned ${row.active_task_assignee}` : "Assigned operator pending",
      secondaryInfo: activeTaskLabel,
      activeTask,
      primaryAction: action,
    };
  }

  if (workState === "AVAILABLE") {
    return {
      primaryStatus: activeTaskLabel ?? "Cleaning Required",
      tone: "warning",
      detail: row.active_task_assignee ? `Assigned ${row.active_task_assignee}` : "Ready to start",
      secondaryInfo: row.ready_state === "NOT_READY" ? "Room not ready" : null,
      activeTask,
      primaryAction: action,
    };
  }

  if (row.ready_state === "NOT_READY") {
    return {
      primaryStatus: "Not Ready",
      tone: "warning",
      detail: "No active Housekeeping task",
      secondaryInfo: occupancyState === "OCCUPIED" ? "On-demand cleaning available" : null,
      activeTask,
      primaryAction: action,
    };
  }

  return {
    primaryStatus: "Ready",
    tone: "success",
    detail: "No work required",
    secondaryInfo: occupancyState === "OCCUPIED" ? "Guest request cleaning available" : null,
    activeTask,
    primaryAction: action,
  };
}

function mapMaintenanceSummary(row: RoomWorkspaceRow, user?: CurrentUser): RoomMaintenanceDomainSummary {
  const state = maintenanceState(row);
  const ticketCount = row.active_ticket_count ?? 0;
  const canReport = canCreateMaintenanceIssue(user);
  const title = row.primary_maintenance_title;
  const ticketTarget = row.primary_maintenance_ticket_id ? `/maintenance/${row.primary_maintenance_ticket_id}` : null;

  if (state === "BLOCKING") {
    return {
      primaryStatus: "Out Of Service",
      tone: "danger",
      detail: title ?? "Blocking maintenance active.",
      secondaryInfo: ticketCount > 1 ? `${ticketCount} open tickets` : "Room blocked",
      primaryAction: ticketTarget ? { type: "OPEN_TICKET", label: "Open Ticket", target: ticketTarget } : null,
    };
  }

  if (state === "ACTIVE") {
    return {
      primaryStatus: "Maintenance Active",
      tone: "warning",
      detail: title ?? "Open technical issue.",
      secondaryInfo: ticketCount > 1 ? `${ticketCount} open tickets` : "Room operating",
      primaryAction: ticketTarget ? { type: "CONTINUE_WORK", label: "Continue Work", target: ticketTarget } : null,
    };
  }

  return {
    primaryStatus: "No Issues",
    tone: "success",
    detail: "No technical issue.",
    secondaryInfo: null,
    primaryAction: canReport ? { type: "REPORT_ISSUE", label: "Report Issue", target: `/maintenance/new?roomId=${row.unit_id}&source=rooms` } : null,
  };
}

function mapRoom(row: RoomWorkspaceRow, receptionAlerts: RoomReceptionAlertSummary[], date: string, user?: CurrentUser): RoomsWorkspaceRoom {
  const group = roomFamily(row);
  const occupancyState = row.beds24_booking_id ? "OCCUPIED" : "VACANT";
  const guestName = row.guest_name || "Guest name unavailable";
  const staySource = sourceLabel(row);

  return {
    unitId: row.unit_id,
    roomName: row.unit_name,
    roomType: roomType(row),
    accommodationType: accommodationType(group),
    sortGroup: group,
    sortNumber: roomNumber(row.unit_name),
    heroImageKey: normalizeKey(row.unit_name),
    currentStay: occupancyState === "OCCUPIED" && row.arrival_date && row.departure_date
      ? {
          guestName,
          nationality: nationalitySource(row),
          source: staySource,
          arrivalDate: row.arrival_date,
          departureDate: row.departure_date,
          stayNights: stayNights(row.arrival_date, row.departure_date),
        }
      : null,
    operational: {
      availability: {
        state: row.availability_status === "NOT_OPERATING" ? "NOT_OPERATING" : "OPERATING",
        reason: row.availability_reason,
        startDate: row.seasonal_start,
        endDate: row.seasonal_end,
        seasonLabel: seasonLabel(row.seasonal_start, row.seasonal_end),
      },
      occupancy: {
        state: occupancyState,
        guestName: occupancyState === "OCCUPIED" ? guestName : null,
        bookingId: occupancyState === "OCCUPIED" ? row.beds24_booking_id : null,
        source: occupancyState === "OCCUPIED" ? staySource : null,
      },
      housekeeping: {
        condition: row.ready_state === "NOT_READY" ? "NOT_READY" : "READY",
        workState: housekeepingWorkState(row),
        activeTaskType: taskTypeLabel(row.active_task_type),
        assignedTo: row.active_task_assignee,
      },
      maintenance: {
        state: maintenanceState(row),
        activeTicketCount: row.active_ticket_count ?? 0,
        blockingTicketCount: row.blocking_ticket_count ?? 0,
        primaryTitle: row.primary_maintenance_title,
      },
    },
    reception: mapReceptionSummary(row, receptionAlerts, date, user),
    housekeeping: mapHousekeepingSummary(row, occupancyState, user),
    maintenance: mapMaintenanceSummary(row, user),
  };
}

export async function getRoomsWorkspaceOverview(env: RoomsWorkspaceBindings, date = getBangkokDate(), user?: CurrentUser): Promise<RoomsWorkspaceOverview> {
  const rows = await env.DB.prepare(`
    SELECT
      u.unit_id,
      u.unit_name,
      u.unit_type,
      rt.room_type_name,
      rt.room_name,
      u.position,
      COALESCE(roa.status, 'OPERATING') AS availability_status,
      roa.reason AS availability_reason,
      roa.seasonal_start,
      roa.seasonal_end,
      COALESCE(rhs.ready_state, 'READY') AS ready_state,
      b.booking_id,
      b.beds24_booking_id,
      b.guest_name,
      b.country,
      b.country_code,
      b.arrival_date,
      b.departure_date,
      b.api_source,
      b.channel,
      COALESCE(ht_count.active_task_count, 0) AS active_task_count,
      ht.active_task_id,
      ht.active_task_version,
      ht.active_task_status,
      ht.active_task_type,
      ht.active_task_priority,
      ht.active_task_assignee,
      COALESCE(mt.active_ticket_count, 0) AS active_ticket_count,
      COALESCE(mt.blocking_ticket_count, 0) AS blocking_ticket_count,
      mt.primary_maintenance_ticket_id,
      mt.primary_maintenance_title,
      rb.booking_id AS reception_booking_id,
      rb.beds24_booking_id AS reception_beds24_booking_id,
      rb.arrival_date AS reception_arrival_date,
      rb.departure_date AS reception_departure_date,
      COALESCE(rrs.guest_arrived, 0) AS reception_guest_arrived,
      COALESCE(rrs.passport_collected, 0) AS reception_passport_collected,
      COALESCE(rrs.deposit_collected, 0) AS reception_deposit_collected,
      COALESCE(rrs.welcome_completed, 0) AS reception_welcome_completed,
      COALESCE(rrs.keys_delivered, 0) AS reception_keys_delivered,
      COALESCE(rrs.guest_left, 0) AS reception_guest_left,
      COALESCE(rrs.keys_returned, 0) AS reception_keys_returned,
      COALESCE(rrs.deposit_returned, 0) AS reception_deposit_returned,
      COALESCE(rrs.room_released, 0) AS reception_room_released,
      rrs.updated_at AS reception_updated_at,
      (
        SELECT MAX(re.created_at)
        FROM reception_events re
        WHERE re.beds24_booking_id = rb.beds24_booking_id
          AND re.action IN ('passportCollected', 'passportRegistrationCompleted', 'checkInCompleted')
      ) AS passport_completed_at,
      (
        SELECT MAX(re.created_at)
        FROM reception_events re
        WHERE re.beds24_booking_id = rb.beds24_booking_id
          AND re.action IN ('depositCollected', 'checkInCompleted')
      ) AS deposit_completed_at,
      (
        SELECT MAX(re.created_at)
        FROM reception_events re
        WHERE re.beds24_booking_id = rb.beds24_booking_id
          AND re.action = 'checkInCompleted'
      ) AS check_in_completed_at,
      (
        SELECT MAX(re.created_at)
        FROM reception_events re
        WHERE re.beds24_booking_id = rb.beds24_booking_id
          AND re.action = 'checkOutCompleted'
      ) AS check_out_completed_at
    FROM units u
    LEFT JOIN room_types rt ON rt.room_type_id = u.room_type_id
    LEFT JOIN room_operational_availability roa ON roa.unit_id = u.unit_id
    LEFT JOIN room_housekeeping_state rhs ON rhs.unit_id = u.unit_id
    LEFT JOIN bookings b ON b.booking_id = (
      SELECT b2.booking_id
      FROM bookings b2
      LEFT JOIN reception_stays rs2 ON rs2.beds24_booking_id = b2.beds24_booking_id
      WHERE b2.unit_id = u.unit_id
        AND b2.arrival_date <= ?1
        AND b2.departure_date > ?1
        AND ${operationalBookingStatusSql("b2.status")}
        AND rs2.guest_arrived = 1
      ORDER BY b2.arrival_date DESC, b2.booking_id DESC
      LIMIT 1
    )
    LEFT JOIN bookings rb ON rb.booking_id = (
      SELECT b2.booking_id
      FROM bookings b2
      LEFT JOIN reception_stays rs2 ON rs2.beds24_booking_id = b2.beds24_booking_id
      WHERE b2.unit_id = u.unit_id
        AND ${operationalBookingStatusSql("b2.status")}
        AND (
          b2.arrival_date = ?1
          OR (
            b2.arrival_date <= ?1
            AND b2.departure_date > ?1
            AND COALESCE(rs2.guest_arrived, 0) = 1
            AND COALESCE(rs2.room_released, 0) = 0
          )
          OR (
            b2.departure_date <= ?1
            AND COALESCE(rs2.guest_arrived, 0) = 1
            AND COALESCE(rs2.room_released, 0) = 0
          )
          OR (
            b2.departure_date = ?1
            AND COALESCE(rs2.guest_left, 0) = 1
            AND COALESCE(rs2.room_released, 0) = 1
          )
        )
      ORDER BY
        CASE
          WHEN b2.departure_date <= ?1 AND COALESCE(rs2.guest_arrived, 0) = 1 AND COALESCE(rs2.room_released, 0) = 0 THEN 1
          WHEN b2.arrival_date = ?1 AND COALESCE(rs2.guest_arrived, 0) = 0 THEN 2
          WHEN b2.arrival_date <= ?1 AND b2.departure_date > ?1 AND COALESCE(rs2.guest_arrived, 0) = 1 THEN 3
          WHEN b2.departure_date = ?1 AND COALESCE(rs2.guest_left, 0) = 1 AND COALESCE(rs2.room_released, 0) = 1 THEN 4
          ELSE 5
        END,
        b2.arrival_date DESC,
        b2.booking_id DESC
      LIMIT 1
    )
    LEFT JOIN reception_stays rrs ON rrs.beds24_booking_id = rb.beds24_booking_id
    LEFT JOIN (
      SELECT unit_id, COUNT(*) AS active_task_count
      FROM housekeeping_tasks
      WHERE status IN ('WAITING_FOR_RECEPTION', 'AVAILABLE_FOR_CLAIM', 'CLAIMED', 'IN_PROGRESS', 'CHECKLIST_COMPLETE', 'READY_FOR_INSPECTION', 'READY', 'BLOCKED')
        AND (idempotency_key IS NULL OR idempotency_key NOT LIKE 'room-ready-baseline:not-ready:%')
        AND (operational_date = ?1 OR due_cycle_date <= ?1)
      GROUP BY unit_id
    ) ht_count ON ht_count.unit_id = u.unit_id
    LEFT JOIN (
      SELECT
        unit_id,
        task_id AS active_task_id,
        version AS active_task_version,
        status AS active_task_status,
        task_type AS active_task_type,
        priority AS active_task_priority,
        assigned_user_name AS active_task_assignee
      FROM (
        SELECT
          ht.*,
          ROW_NUMBER() OVER (
            PARTITION BY ht.unit_id
            ORDER BY
              CASE
                WHEN ht.status = 'BLOCKED' THEN 1
                WHEN ht.status IN ('IN_PROGRESS', 'CHECKLIST_COMPLETE', 'READY_FOR_INSPECTION') THEN 2
                ELSE 3
              END,
              CASE ht.task_type
                WHEN 'TURNOVER' THEN 1
                WHEN 'ON_DEMAND_CLEANING' THEN 2
                WHEN 'STANDARD_CLEANING' THEN 3
                WHEN 'LINEN_CHANGE' THEN 4
                WHEN 'WATER_REFILL' THEN 5
                ELSE 6
              END,
              ht.task_id
          ) AS task_rank
        FROM housekeeping_tasks ht
        WHERE ht.status IN ('WAITING_FOR_RECEPTION', 'AVAILABLE_FOR_CLAIM', 'CLAIMED', 'IN_PROGRESS', 'CHECKLIST_COMPLETE', 'READY_FOR_INSPECTION', 'READY', 'BLOCKED')
          AND (ht.idempotency_key IS NULL OR ht.idempotency_key NOT LIKE 'room-ready-baseline:not-ready:%')
          AND (ht.operational_date = ?1 OR ht.due_cycle_date <= ?1)
      )
      WHERE task_rank = 1
    ) ht ON ht.unit_id = u.unit_id
    LEFT JOIN (
      SELECT
        room_id,
        COUNT(*) AS active_ticket_count,
        SUM(CASE WHEN out_of_service = 1 OR json_extract(metadata_json, '$.outOfService') = 1 THEN 1 ELSE 0 END) AS blocking_ticket_count,
        COALESCE(
          MIN(CASE WHEN out_of_service = 1 OR json_extract(metadata_json, '$.outOfService') = 1 THEN ticket_id END),
          MIN(ticket_id)
        ) AS primary_maintenance_ticket_id,
        COALESCE(
          MIN(CASE WHEN out_of_service = 1 OR json_extract(metadata_json, '$.outOfService') = 1 THEN title END),
          MIN(title)
        ) AS primary_maintenance_title
      FROM maintenance_tickets
      WHERE room_id IS NOT NULL
        AND status NOT IN ('Resolved', 'Closed')
      GROUP BY room_id
    ) mt ON mt.room_id = u.unit_id
    WHERE u.active = 1
  `).bind(date).all<RoomWorkspaceRow>();

  const receptionAlerts = await loadReceptionAlerts(env);
  const rooms = (rows.results ?? [])
    .map((row) => mapRoom(row, receptionAlerts.get(row.unit_id) ?? [], date, user))
    .sort((left, right) =>
      familyRank(left.sortGroup) - familyRank(right.sortGroup)
      || left.sortNumber - right.sortNumber
      || left.roomName.localeCompare(right.roomName)
      || left.unitId - right.unitId
    );

  return {
    rooms,
    summary: {
      total: rooms.length,
      occupied: rooms.filter((room) => room.operational.occupancy.state === "OCCUPIED").length,
      notOperating: rooms.filter((room) => room.operational.availability.state === "NOT_OPERATING").length,
      notReady: rooms.filter((room) => room.operational.housekeeping.condition === "NOT_READY").length,
      maintenance: rooms.filter((room) => room.operational.maintenance.state !== "CLEAR").length,
    },
  };
}
