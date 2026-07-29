import type { ComponentType, SVGProps } from "react";
import {
  AskIcon,
  CalendarIcon,
  CheckInIcon,
  HousekeepingIcon,
  MaintenanceIcon,
  PlusIcon,
  RoomIcon,
  TasksIcon,
  TodayIcon,
} from "../components/OperationsIcons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavigationItem {
  key: string;
  labelKey: string;
  descriptionKey?: string;
  path: string;
  Icon: IconComponent;
  tone?: "green" | "blue" | "gold" | "rose" | "slate";
}

export const primaryNavigation: NavigationItem[] = [
  { key: "dashboard", labelKey: "dashboard", path: "/dashboard", Icon: TodayIcon },
  { key: "rooms", labelKey: "rooms", path: "/rooms", Icon: RoomIcon },
  { key: "availability", labelKey: "availability", path: "/availability", Icon: CalendarIcon },
  { key: "chat", labelKey: "chat", path: "/chat", Icon: AskIcon },
  { key: "more", labelKey: "more", path: "/more", Icon: PlusIcon },
];

export const dashboardModules: NavigationItem[] = [
  { key: "movements", labelKey: "arrivalsDepartures", descriptionKey: "movementsDescription", path: "/movements", Icon: CheckInIcon, tone: "blue" },
  { key: "rooms", labelKey: "roomWorkspace", descriptionKey: "roomsDescription", path: "/rooms", Icon: RoomIcon, tone: "green" },
  { key: "housekeeping", labelKey: "housekeeping", descriptionKey: "housekeepingDescription", path: "/housekeeping", Icon: HousekeepingIcon, tone: "gold" },
  { key: "availability", labelKey: "availability", descriptionKey: "availabilityDescription", path: "/availability", Icon: CalendarIcon, tone: "blue" },
  { key: "maintenance", labelKey: "maintenance", descriptionKey: "maintenanceDescription", path: "/maintenance", Icon: MaintenanceIcon, tone: "rose" },
  { key: "procurement", labelKey: "procurement", descriptionKey: "procurementDescription", path: "/procurement", Icon: TasksIcon, tone: "slate" },
  { key: "chat", labelKey: "chat", descriptionKey: "chatDescription", path: "/chat", Icon: AskIcon, tone: "green" },
];
