import type { RoomOperationalSummary, RoomsWorkspaceRoom } from "../types/rooms-workspace";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export type RoomCompactTone = "neutral" | "positive" | "attention" | "critical" | "information";
export type RoomCompactMode = "STANDARD" | "MAINTENANCE_BLOCKED" | "SEASON_CLOSED";

export interface RoomOperationalItemModel {
  id: "operational" | "occupancy" | "housekeeping" | "maintenance";
  label: string;
  value: string;
  tone: StatusTone;
  detail: string | null;
  meta: string | null;
}

export interface RoomCompactSignal {
  key: string;
  label: string;
  tone: RoomCompactTone;
}

export interface RoomCompactPresentation {
  mode: RoomCompactMode;
  primary: {
    label: string;
    detail: string | null;
    tone: RoomCompactTone;
  };
  occupancy: RoomCompactSignal | null;
  housekeeping: RoomCompactSignal | null;
  secondarySignals: RoomCompactSignal[];
  accessibleSummary: string;
}

function compactSignal(key: string, label: string, tone: RoomCompactTone): RoomCompactSignal {
  return { key, label, tone };
}

function compactTaskIsCleaning(summary: RoomOperationalSummary): boolean {
  return Boolean(summary.housekeeping.activeTaskType && summary.housekeeping.activeTaskType !== "Water refill");
}

function mapCompactOccupancy(summary: RoomOperationalSummary): RoomCompactSignal {
  if (summary.occupancy.state === "OCCUPIED") return compactSignal("occupancy", "OCCUPIED", "information");
  return compactSignal("occupancy", "VACANT", "neutral");
}

function mapCompactHousekeeping(summary: RoomOperationalSummary): RoomCompactSignal {
  const hasCleaningWork = compactTaskIsCleaning(summary);

  if (summary.housekeeping.workState === "IN_PROGRESS" && hasCleaningWork) {
    return compactSignal("housekeeping", "CLEANING IN PROGRESS", "information");
  }

  if (summary.housekeeping.condition === "NOT_READY" || (hasCleaningWork && summary.housekeeping.workState !== "NONE")) {
    return compactSignal("housekeeping", "DIRTY", "attention");
  }

  return compactSignal("housekeeping", "CLEAN", "positive");
}

function mapCompactMaintenance(summary: RoomOperationalSummary): RoomCompactSignal | null {
  if (summary.maintenance.state !== "ACTIVE") return null;
  return compactSignal("maintenance", "MAINTENANCE", "attention");
}

function mapCompactTurnover(room: RoomsWorkspaceRoom): RoomCompactSignal | null {
  const { checkIn, checkOut } = room.reception.today;
  if (checkIn && checkOut) return compactSignal("turnover", "TURNOVER TODAY", "information");
  if (checkIn) return compactSignal("check-in", "CHECK-IN TODAY", "information");
  if (checkOut) return compactSignal("check-out", "CHECK-OUT TODAY", "information");
  return null;
}

function mapCompactGuestWaiting(room: RoomsWorkspaceRoom): RoomCompactSignal | null {
  const task = room.housekeeping.activeTask;
  if (task?.taskType === "Turnover" && task.status === "IN_PROGRESS" && room.reception.checkIn.state === "COMPLETE") {
    return compactSignal("guest-waiting", "GUEST WAITING", "critical");
  }
  return null;
}

function mapCompactReceptionAlert(room: RoomsWorkspaceRoom): RoomCompactSignal | null {
  const passportMissing = room.reception.alerts.some((alert) => alert.type === "passport_missing");
  const depositPending = room.reception.alerts.some((alert) => alert.type === "deposit_pending");

  if (passportMissing && depositPending) return compactSignal("reception-attention", "RECEPTION ATTENTION", "attention");
  if (passportMissing) return compactSignal("passport-missing", "PASSPORT MISSING", "attention");
  if (depositPending) return compactSignal("deposit-pending", "DEPOSIT PENDING", "attention");
  return null;
}

function monthDayShort(value: string | null): string | null {
  if (!value || !/^\d{2}-\d{2}$/.test(value)) return null;
  const [month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(2026, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(date);
}

function seasonalDetail(room: RoomsWorkspaceRoom): string | null {
  const endDate = monthDayShort(room.operational.availability.endDate);
  if (endDate) return `Until ${endDate}`;
  return room.operational.availability.reason ?? room.operational.availability.seasonLabel;
}

function accessibleSummary(room: RoomsWorkspaceRoom, facts: Array<string | null>): string {
  return [room.roomName, room.accommodationType, ...facts].filter(Boolean).join(", ");
}

export function getRoomCompactPresentation(room: RoomsWorkspaceRoom): RoomCompactPresentation {
  if (room.operational.maintenance.state === "BLOCKING") {
    const detail = room.operational.maintenance.primaryTitle ?? "Maintenance blocking";
    return {
      mode: "MAINTENANCE_BLOCKED",
      primary: {
        label: "OUT OF SERVICE",
        detail,
        tone: "critical",
      },
      occupancy: null,
      housekeeping: null,
      secondarySignals: [],
      accessibleSummary: accessibleSummary(room, ["Out of Service", detail]),
    };
  }

  if (room.operational.availability.state === "NOT_OPERATING") {
    const detail = seasonalDetail(room);
    return {
      mode: "SEASON_CLOSED",
      primary: {
        label: "SEASON CLOSED",
        detail,
        tone: "neutral",
      },
      occupancy: null,
      housekeeping: null,
      secondarySignals: [],
      accessibleSummary: accessibleSummary(room, ["Season Closed", detail]),
    };
  }

  const occupancy = mapCompactOccupancy(room.operational);
  const housekeeping = mapCompactHousekeeping(room.operational);
  const secondarySignals = [
    mapCompactGuestWaiting(room),
    mapCompactMaintenance(room.operational),
    mapCompactTurnover(room),
    mapCompactReceptionAlert(room),
  ].filter((item): item is RoomCompactSignal => item !== null);

  return {
    mode: "STANDARD",
    primary: {
      label: room.roomName,
      detail: room.operational.occupancy.state === "OCCUPIED"
        ? room.operational.occupancy.guestName
        : room.roomType,
      tone: "neutral",
    },
    occupancy,
    housekeeping,
    secondarySignals,
    accessibleSummary: accessibleSummary(room, [
      occupancy.label,
      housekeeping.label,
      ...secondarySignals.map((item) => item.label),
    ]),
  };
}

function maintenanceValue(summary: RoomOperationalSummary): Pick<RoomOperationalItemModel, "value" | "tone"> {
  if (summary.maintenance.state === "BLOCKING") return { value: "Out of Service", tone: "danger" };
  if (summary.maintenance.state === "ACTIVE") return { value: "Active", tone: "warning" };
  return { value: "Clear", tone: "success" };
}

function housekeepingWorkLabel(summary: RoomOperationalSummary): string | null {
  const task = summary.housekeeping.activeTaskType ?? "Cleaning";
  if (summary.housekeeping.workState === "BLOCKED") return `${task} blocked`;
  if (summary.housekeeping.workState === "AVAILABLE") return `${task} scheduled`;
  return null;
}

function housekeepingConditionValue(summary: RoomOperationalSummary): Pick<RoomOperationalItemModel, "value" | "tone"> {
  if (summary.housekeeping.workState === "IN_PROGRESS") return { value: "Cleaning In Progress", tone: "info" };
  if (summary.housekeeping.condition === "NOT_READY") return { value: "Dirty", tone: "warning" };
  return { value: "Clean", tone: "success" };
}

export function getRoomOperationalItems(summary: RoomOperationalSummary): RoomOperationalItemModel[] {
  const availabilityDetail = summary.availability.reason;
  const availabilityMeta = summary.availability.seasonLabel;
  const housekeepingCondition = housekeepingConditionValue(summary);
  const housekeepingDetail = housekeepingWorkLabel(summary);
  const maintenance = maintenanceValue(summary);

  return [
    {
      id: "operational",
      label: "Operational",
      value: summary.availability.state === "NOT_OPERATING" ? "Not Operating" : "Operating",
      tone: summary.availability.state === "NOT_OPERATING" ? "warning" : "success",
      detail: availabilityDetail,
      meta: availabilityMeta,
    },
    {
      id: "occupancy",
      label: "Occupancy",
      value: summary.occupancy.state === "OCCUPIED" ? "Occupied" : "Vacant",
      tone: "neutral",
      detail: null,
      meta: null,
    },
    {
      id: "housekeeping",
      label: "Cleaning",
      value: housekeepingCondition.value,
      tone: housekeepingCondition.tone,
      detail: housekeepingDetail,
      meta: summary.housekeeping.assignedTo ? `Assigned to ${summary.housekeeping.assignedTo}` : null,
    },
    {
      id: "maintenance",
      label: "Maintenance",
      value: maintenance.value,
      tone: maintenance.tone,
      detail: summary.maintenance.primaryTitle,
      meta: summary.maintenance.activeTicketCount > 1 ? `${summary.maintenance.activeTicketCount} active tickets` : null,
    },
  ];
}
