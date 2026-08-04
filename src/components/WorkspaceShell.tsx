import { useEffect, useMemo, useRef, useState } from "react";
import logo from "../assets/img/logo.png";
import shadowCanopy from "../assets/img/shadow-canopy.svg";
import StickyGlassHeader from "./StickyGlassHeader";
import VanaraStaffHomeAction from "./vanara/VanaraStaffHomeAction";
import WorkspaceHero from "./WorkspaceHero";
import {
  preloadWorkspaceBackground,
  workspaceBackgroundStyle,
  type WorkspaceBackgroundKey,
} from "../config/workspaceBackgrounds";
import "../styles/WorkspaceShell.css";

const workspaceNumbers = {
  staffHome: "00",
  rooms: "01",
  reception: "02",
  housekeeping: "03",
  maintenance: "04",
  procurement: "05",
  chat: "06",
} as const;

type WorkspaceKey = keyof typeof workspaceNumbers;

const workspaceBackgroundKeys: Record<WorkspaceKey, WorkspaceBackgroundKey> = {
  staffHome: "staffHome",
  reception: "reception",
  housekeeping: "housekeeping",
  maintenance: "maintenance",
  procurement: "procurement",
  rooms: "rooms",
  chat: "chat",
};

interface WorkspaceShellProps {
  children: React.ReactNode;
  title: string;
  workspace: WorkspaceKey;
  bodyClassName?: string;
  heroAction?: React.ReactNode;
  stickyNavigationTitle?: string;
  suppressStickyNavigation?: boolean;
}

function formatToday() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}

function clampProgress(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export default function WorkspaceShell({
  bodyClassName,
  children,
  heroAction,
  stickyNavigationTitle,
  suppressStickyNavigation = false,
  title,
  workspace,
}: WorkspaceShellProps) {
  const backgroundKey = workspaceBackgroundKeys[workspace];
  const heroLogoRef = useRef<HTMLImageElement>(null);
  const stickyTriggerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const today = useMemo(() => formatToday(), []);
  const heroActionNode = workspace === "staffHome" ? heroAction : (heroAction ?? <VanaraStaffHomeAction />);
  const navigationTitle = stickyNavigationTitle ?? title;

  useEffect(() => {
    preloadWorkspaceBackground(backgroundKey);
  }, [backgroundKey]);

  useEffect(() => {
    let frame = 0;

    const updateProgress = () => {
      frame = 0;
      const trigger = stickyTriggerRef.current;
      if (!trigger) return;

      const next = clampProgress(Math.max(0, -trigger.getBoundingClientRect().top) / 96);
      if (Math.abs(next - progressRef.current) < 0.005) return;

      progressRef.current = next;
      setProgress(next);
    };

    const requestProgress = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateProgress);
    };

    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver(requestProgress, { root: null, threshold: [0, 1] })
      : null;

    if (stickyTriggerRef.current) observer?.observe(stickyTriggerRef.current);
    requestProgress();
    window.addEventListener("scroll", requestProgress, { passive: true });
    window.addEventListener("resize", requestProgress);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", requestProgress);
      window.removeEventListener("resize", requestProgress);
    };
  }, []);

  return (
    <main className="workspace-page" style={workspaceBackgroundStyle(backgroundKey)}>
      <div className="workspace-page__veil" aria-hidden="true" />

      <section className="workspace-shell" aria-label={`${title} workspace`}>
        {!suppressStickyNavigation ? (
          <StickyGlassHeader heroLogoRef={heroLogoRef} progress={progress} title={navigationTitle} />
        ) : null}

        <WorkspaceHero ref={heroLogoRef} action={heroActionNode} date={today} logoSrc={logo} title={title} />

        <div ref={stickyTriggerRef} className="workspace-sticky-trigger" aria-hidden="true" />

        <section className="workspace-section-marker" aria-label="Workspace identifier">
          <span>Workspace</span>
          <span>{workspaceNumbers[workspace]}</span>
        </section>

        <div className={bodyClassName ? `workspace-body ${bodyClassName}` : "workspace-body"}>
          {children}
        </div>

        <footer className="workspace-canopy" aria-label="Vanara Central">
          <img src={shadowCanopy} alt="" aria-hidden="true" />
          <div className="workspace-canopy__signature">
            <span>Vanara Central</span>
            <small>Koh Chang · Thailand</small>
          </div>
        </footer>
      </section>
    </main>
  );
}
