import type { RoomOperationalSummary } from "../types/rooms-workspace";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface RoomOperationalSignal {
  label: string;
  tone: StatusTone;
  priority: number;
  emphasis: boolean;
}

export interface RoomOperationalItemModel {
  id: "operational" | "occupancy" | "housekeeping" | "maintenance";
  label: string;
  value: string;
  tone: StatusTone;
  detail: string | null;
  meta: string | null;
}

function signal(label: string, tone: StatusTone, priority: number, emphasis = false): RoomOperationalSignal {
  return { label, tone, priority, emphasis };
}

function maintenanceValue(summary: RoomOperationalSummary): Pick<RoomOperationalItemModel, "value" | "tone"> {
  if (summary.maintenance.state === "BLOCKING") return { value: "Out of Service", tone: "danger" };
  if (summary.maintenance.state === "ACTIVE") return { value: "Active", tone: "warning" };
  return { value: "Clear", tone: "success" };
}

function housekeepingWorkLabel(summary: RoomOperationalSummary): string | null {
  const task = summary.housekeeping.activeTaskType ?? "Cleaning";
  if (summary.housekeeping.workState === "IN_PROGRESS") return `${task} in progress`;
  if (summary.housekeeping.workState === "BLOCKED") return `${task} blocked`;
  if (summary.housekeeping.workState === "AVAILABLE") return `${task} scheduled`;
  return null;
}

export function getRoomOperationalSignals(summary: RoomOperationalSummary): RoomOperationalSignal[] {
  const signals: RoomOperationalSignal[] = [];

  if (summary.maintenance.state === "BLOCKING") {
    signals.push(signal("OUT OF SERVICE", "danger", 1, true));
  }

  if (summary.availability.state === "NOT_OPERATING") {
    signals.push(signal("NOT OPERATING", "warning", 2, true));
  }

  if (summary.housekeeping.workState === "IN_PROGRESS") {
    signals.push(signal("CLEANING", "info", 3, true));
  }

  if (summary.maintenance.state === "ACTIVE") {
    signals.push(signal("MAINTENANCE", "warning", 4, true));
  }

  if (summary.housekeeping.condition === "NOT_READY") {
    signals.push(signal("NOT READY", "warning", 5, true));
  }

  signals.push(summary.occupancy.state === "OCCUPIED"
    ? signal("OCCUPIED", "info", 6)
    : signal("VACANT", "neutral", 6));

  if (summary.housekeeping.condition === "READY") {
    signals.push(signal("READY", "success", 7));
  }

  return signals.sort((left, right) => left.priority - right.priority);
}

export function getRoomOperationalItems(summary: RoomOperationalSummary): RoomOperationalItemModel[] {
  const availabilityDetail = summary.availability.reason;
  const availabilityMeta = summary.availability.seasonLabel;
  const housekeepingCondition = summary.housekeeping.condition === "NOT_READY" ? "Not Ready" : "Ready";
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
      label: "Housekeeping",
      value: housekeepingCondition,
      tone: summary.housekeeping.condition === "NOT_READY" ? "warning" : "success",
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
