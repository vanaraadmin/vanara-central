import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef } from "react";
import logo from "../assets/img/logo.png";
import shadowCanopy from "../assets/img/shadow-canopy.svg";
import StickyGlassHeader from "./StickyGlassHeader";
import {
  preloadWorkspaceBackground,
  workspaceBackgroundStyle,
  type WorkspaceBackgroundKey,
} from "../config/workspaceBackgrounds";
import "../styles/WorkspaceShell.css";

const WORKSPACE_HOME_ROUTE = "/staff";

const workspaceNumbers = {
  rooms: "01",
  reception: "02",
  housekeeping: "03",
  maintenance: "04",
  procurement: "05",
  chat: "06",
} as const;

type WorkspaceKey = keyof typeof workspaceNumbers;

const workspaceBackgroundKeys: Record<WorkspaceKey, WorkspaceBackgroundKey> = {
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
}

function formatToday() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}

export default function WorkspaceShell({
  bodyClassName,
  children,
  title,
  workspace,
}: WorkspaceShellProps) {
  const backgroundKey = workspaceBackgroundKeys[workspace];
  const stickyTriggerRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => formatToday(), []);

  useEffect(() => {
    preloadWorkspaceBackground(backgroundKey);
  }, [backgroundKey]);

  return (
    <main className="workspace-page" style={workspaceBackgroundStyle(backgroundKey)}>
      <div className="workspace-page__veil" aria-hidden="true" />

      <section className="workspace-shell" aria-label={`${title} workspace`}>
        <StickyGlassHeader date={today} logoSrc={logo} title={title} triggerRef={stickyTriggerRef} />

        <header className="workspace-masthead">
          <Link className="workspace-masthead__brand" to={WORKSPACE_HOME_ROUTE} aria-label="Back to Home">
            <img src={logo} alt="Vanara" className="workspace-masthead__logo" />

            <div className="workspace-masthead__wordmark">
              <span>Vanara</span>
              <strong>Central</strong>
            </div>
          </Link>

          <time className="workspace-masthead__date">{today}</time>
        </header>

        <section className="workspace-intro" aria-labelledby="workspace-title">
          <p className="workspace-intro__eyebrow">Staff page</p>
          <h1 id="workspace-title">{title}</h1>
        </section>

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
