import type { HousekeepingTaskPriority, HousekeepingTaskType } from "./housekeeping-task-domain.service.js";

export type HousekeepingWorkKind =
  | "PRIORITY_TURNOVER"
  | "CHECKOUT_CLEANING"
  | "NORMAL_CLEANING"
  | "FULL_CLEANING"
  | "WATER_REFILL"
  | "ON_DEMAND_CLEANING";

export function housekeepingWorkKind(taskType: HousekeepingTaskType, priority: HousekeepingTaskPriority): HousekeepingWorkKind {
  if (taskType === "TURNOVER") return priority === "HIGH" || priority === "URGENT" ? "PRIORITY_TURNOVER" : "CHECKOUT_CLEANING";
  if (taskType === "STANDARD_CLEANING") return "NORMAL_CLEANING";
  if (taskType === "LINEN_CHANGE") return "FULL_CLEANING";
  if (taskType === "WATER_REFILL") return "WATER_REFILL";
  return "ON_DEMAND_CLEANING";
}

export function housekeepingWorkTitle(workKind: HousekeepingWorkKind): string {
  if (workKind === "PRIORITY_TURNOVER") return "Priority Turnover";
  if (workKind === "CHECKOUT_CLEANING") return "Check-out Cleaning";
  if (workKind === "NORMAL_CLEANING") return "Cleaning";
  if (workKind === "FULL_CLEANING") return "Full Cleaning";
  if (workKind === "WATER_REFILL") return "Water refill";
  return "Cleaning";
}
