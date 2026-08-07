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
  "--workspace-background-veil-strength": string;
  "--workspace-background-vignette-opacity": string;
};

const workspaceThemes = {
  staffHome: {
    top: "#123B2E",
    mid: "#0B2B21",
    deep: "#071F18",
    accent: "95, 174, 155",
    veil: "0.72",
    vignette: "0.62",
  },
  reception: {
    top: "#163B2D",
    mid: "#0B2B21",
    deep: "#071F18",
    accent: "201, 168, 93",
    veil: "0.76",
    vignette: "0.66",
  },
  rooms: {
    top: "#153B2D",
    mid: "#0B2B21",
    deep: "#071F18",
    accent: "201, 168, 93",
    veil: "0.76",
    vignette: "0.66",
  },
  housekeeping: {
    top: "#10392F",
    mid: "#0A2C24",
    deep: "#061F1A",
    accent: "95, 174, 155",
    veil: "0.8",
    vignette: "0.68",
  },
  maintenance: {
    top: "#102B22",
    mid: "#08231B",
    deep: "#061914",
    accent: "201, 168, 93",
    veil: "0.84",
    vignette: "0.72",
  },
  procurement: {
    top: "#123529",
    mid: "#09281F",
    deep: "#071F18",
    accent: "201, 168, 93",
    veil: "0.84",
    vignette: "0.72",
  },
  social: {
    top: "#102F27",
    mid: "#09261F",
    deep: "#071F18",
    accent: "95, 174, 155",
    veil: "0.84",
    vignette: "0.72",
  },
  payroll: {
    top: "#102E25",
    mid: "#09251D",
    deep: "#071F18",
    accent: "95, 174, 155",
    veil: "0.84",
    vignette: "0.72",
  },
  messages: {
    top: "#0B281F",
    mid: "#071F18",
    deep: "#041610",
    accent: "95, 174, 155",
    veil: "0.86",
    vignette: "0.76",
  },
  chat: {
    top: "#0A241D",
    mid: "#061B15",
    deep: "#03110D",
    accent: "95, 174, 155",
    veil: "0.86",
    vignette: "0.76",
  },
} satisfies Record<WorkspaceBackgroundKey, {
  top: string;
  mid: string;
  deep: string;
  accent: string;
  veil: string;
  vignette: string;
}>;

export function workspaceBackgroundStyle(key: WorkspaceBackgroundKey): WorkspaceBackgroundStyle {
  const theme = workspaceThemes[key];
  return {
    "--workspace-bg-top": theme.top,
    "--workspace-bg-mid": theme.mid,
    "--workspace-bg-deep": theme.deep,
    "--workspace-accent": theme.accent,
    "--workspace-background-veil-strength": theme.veil,
    "--workspace-background-vignette-opacity": theme.vignette,
  };
}

export function preloadWorkspaceBackground(key: WorkspaceBackgroundKey): void {
  void key;
  // The global Vanara background is a single bundled asset tuned by shell variables.
}
