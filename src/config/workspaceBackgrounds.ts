import type { CSSProperties } from "react";
import backgroundChat from "../assets/img/background_chat.png";
import backgroundCheckinCheckout from "../assets/img/background_checkin_checkout.png";
import backgroundHomeStaff from "../assets/img/background_home_staff.png";
import backgroundHousekeeping from "../assets/img/background_housekeeping.png";
import backgroundMaintenance from "../assets/img/background_maintenance.png";
import backgroundProcurement from "../assets/img/background_procurement.png";
import backgroundRooms from "../assets/img/background_room.png";

export type WorkspaceBackgroundKey =
  | "staffHome"
  | "reception"
  | "rooms"
  | "housekeeping"
  | "maintenance"
  | "procurement"
  | "social"
  | "payroll"
  | "messages"
  | "chat";

export const WORKSPACE_BACKGROUNDS = {
  staffHome: backgroundHomeStaff,
  reception: backgroundCheckinCheckout,
  rooms: backgroundRooms,
  housekeeping: backgroundHousekeeping,
  maintenance: backgroundMaintenance,
  procurement: backgroundProcurement,
  social: backgroundProcurement,
  payroll: backgroundProcurement,
  messages: backgroundRooms,
  chat: backgroundChat,
} satisfies Record<WorkspaceBackgroundKey, string>;

type WorkspaceBackgroundStyle = CSSProperties & {
  "--workspace-background": string;
};

export function workspaceBackgroundStyle(key: WorkspaceBackgroundKey): WorkspaceBackgroundStyle {
  return {
    "--workspace-background": `url("${WORKSPACE_BACKGROUNDS[key]}")`,
  };
}

export function preloadWorkspaceBackground(key: WorkspaceBackgroundKey): void {
  if (typeof document === "undefined") return;

  const existing = document.head.querySelector<HTMLLinkElement>(`link[data-workspace-background="${key}"]`);
  if (existing) return;

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = WORKSPACE_BACKGROUNDS[key];
  link.dataset.workspaceBackground = key;
  document.head.appendChild(link);
}
