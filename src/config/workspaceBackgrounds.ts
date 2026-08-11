import type { CSSProperties } from "react";
import workspaceBackground from "../assets/img/background_room.png";

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
  staffHome: workspaceBackground,
  reception: workspaceBackground,
  rooms: workspaceBackground,
  housekeeping: workspaceBackground,
  maintenance: workspaceBackground,
  procurement: workspaceBackground,
  social: workspaceBackground,
  payroll: workspaceBackground,
  messages: workspaceBackground,
  chat: workspaceBackground,
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

  const existing = document.head.querySelector<HTMLLinkElement>('link[data-workspace-background="global"]');
  if (existing) return;

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = WORKSPACE_BACKGROUNDS[key];
  link.dataset.workspaceBackground = "global";
  document.head.appendChild(link);
}
