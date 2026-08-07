import type { CSSProperties } from "react";

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

type WorkspaceBackgroundStyle = CSSProperties & {
  "--workspace-bg-top": string;
  "--workspace-bg-mid": string;
  "--workspace-bg-deep": string;
  "--workspace-accent": string;
  "--workspace-accent-soft": string;
  "--workspace-gold-soft": string;
  "--workspace-botanical-opacity": string;
  "--workspace-contour-opacity": string;
  "--workspace-glow-opacity": string;
};

const workspaceThemes = {
  staffHome: {
    top: "#123B2E",
    mid: "#0B2B21",
    deep: "#071F18",
    accent: "95, 174, 155",
    accentSoft: "95, 174, 155",
    goldSoft: "201, 168, 93",
    botanical: "0.038",
    contour: "0.078",
    glow: "0.56",
  },
  reception: {
    top: "#163B2D",
    mid: "#0B2B21",
    deep: "#071F18",
    accent: "201, 168, 93",
    accentSoft: "95, 174, 155",
    goldSoft: "201, 168, 93",
    botanical: "0.032",
    contour: "0.068",
    glow: "0.5",
  },
  rooms: {
    top: "#153B2D",
    mid: "#0B2B21",
    deep: "#071F18",
    accent: "201, 168, 93",
    accentSoft: "95, 174, 155",
    goldSoft: "201, 168, 93",
    botanical: "0.032",
    contour: "0.068",
    glow: "0.5",
  },
  housekeeping: {
    top: "#10392F",
    mid: "#0A2C24",
    deep: "#061F1A",
    accent: "95, 174, 155",
    accentSoft: "123, 199, 178",
    goldSoft: "201, 168, 93",
    botanical: "0.03",
    contour: "0.064",
    glow: "0.5",
  },
  maintenance: {
    top: "#102B22",
    mid: "#08231B",
    deep: "#061914",
    accent: "201, 168, 93",
    accentSoft: "95, 174, 155",
    goldSoft: "201, 168, 93",
    botanical: "0.026",
    contour: "0.056",
    glow: "0.42",
  },
  procurement: {
    top: "#123529",
    mid: "#09281F",
    deep: "#071F18",
    accent: "201, 168, 93",
    accentSoft: "95, 174, 155",
    goldSoft: "201, 168, 93",
    botanical: "0.026",
    contour: "0.054",
    glow: "0.4",
  },
  social: {
    top: "#102F27",
    mid: "#09261F",
    deep: "#071F18",
    accent: "95, 174, 155",
    accentSoft: "201, 168, 93",
    goldSoft: "201, 168, 93",
    botanical: "0.024",
    contour: "0.05",
    glow: "0.38",
  },
  payroll: {
    top: "#102E25",
    mid: "#09251D",
    deep: "#071F18",
    accent: "95, 174, 155",
    accentSoft: "201, 168, 93",
    goldSoft: "201, 168, 93",
    botanical: "0.024",
    contour: "0.048",
    glow: "0.36",
  },
  messages: {
    top: "#0B281F",
    mid: "#071F18",
    deep: "#041610",
    accent: "95, 174, 155",
    accentSoft: "95, 174, 155",
    goldSoft: "201, 168, 93",
    botanical: "0.02",
    contour: "0.04",
    glow: "0.3",
  },
  chat: {
    top: "#0A241D",
    mid: "#061B15",
    deep: "#03110D",
    accent: "95, 174, 155",
    accentSoft: "95, 174, 155",
    goldSoft: "201, 168, 93",
    botanical: "0.018",
    contour: "0.036",
    glow: "0.28",
  },
} satisfies Record<WorkspaceBackgroundKey, {
  top: string;
  mid: string;
  deep: string;
  accent: string;
  accentSoft: string;
  goldSoft: string;
  botanical: string;
  contour: string;
  glow: string;
}>;

export function workspaceBackgroundStyle(key: WorkspaceBackgroundKey): WorkspaceBackgroundStyle {
  const theme = workspaceThemes[key];
  return {
    "--workspace-bg-top": theme.top,
    "--workspace-bg-mid": theme.mid,
    "--workspace-bg-deep": theme.deep,
    "--workspace-accent": theme.accent,
    "--workspace-accent-soft": theme.accentSoft,
    "--workspace-gold-soft": theme.goldSoft,
    "--workspace-botanical-opacity": theme.botanical,
    "--workspace-contour-opacity": theme.contour,
    "--workspace-glow-opacity": theme.glow,
  };
}

export function preloadWorkspaceBackground(key: WorkspaceBackgroundKey): void {
  void key;
  // The global Vanara background is generated from CSS variables and inline SVG.
}
