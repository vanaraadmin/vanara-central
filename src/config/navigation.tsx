import type { ComponentType, SVGProps } from "react";
import type { ModuleKey } from "../types/auth";
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
  moduleKey?: ModuleKey;
  labelKey: string;
  descriptionKey?: string;
  path: string;
  Icon: IconComponent;
  tone?: "green" | "blue" | "gold" | "rose" | "slate";
}

export const primaryNavigation: NavigationItem[] = [
  { key: "staff", labelKey: "staffHome", path: "/staff", Icon: TasksIcon },
  { key: "dashboard", moduleKey: "dashboard", labelKey: "dashboard", path: "/dashboard", Icon: TodayIcon },
  { key: "rooms", moduleKey: "rooms", labelKey: "rooms", path: "/rooms", Icon: RoomIcon },
  { key: "availability", moduleKey: "rooms", labelKey: "prices", path: "/availability-prices", Icon: CalendarIcon },
  { key: "chat", moduleKey: "chat", labelKey: "chat", path: "/chat", Icon: AskIcon },
  { key: "more", labelKey: "more", path: "/more", Icon: PlusIcon },
];

export const dashboardModules: NavigationItem[] = [
  { key: "reception", moduleKey: "movements", labelKey: "arrivalsDepartures", descriptionKey: "movementsDescription", path: "/reception", Icon: CheckInIcon, tone: "blue" },
  { key: "rooms", moduleKey: "rooms", labelKey: "roomWorkspace", descriptionKey: "roomsDescription", path: "/rooms", Icon: RoomIcon, tone: "green" },
  { key: "housekeeping", moduleKey: "housekeeping", labelKey: "housekeeping", descriptionKey: "housekeepingDescription", path: "/housekeeping", Icon: HousekeepingIcon, tone: "gold" },
  { key: "availability", moduleKey: "rooms", labelKey: "prices", descriptionKey: "pricesDescription", path: "/availability-prices", Icon: CalendarIcon, tone: "blue" },
  { key: "maintenance", moduleKey: "maintenance", labelKey: "maintenance", descriptionKey: "maintenanceDescription", path: "/maintenance", Icon: MaintenanceIcon, tone: "rose" },
  { key: "procurement", moduleKey: "procurement", labelKey: "procurement", descriptionKey: "procurementDescription", path: "/procurement", Icon: TasksIcon, tone: "slate" },
  { key: "chat", moduleKey: "chat", labelKey: "chat", descriptionKey: "chatDescription", path: "/chat", Icon: AskIcon, tone: "green" },
];
