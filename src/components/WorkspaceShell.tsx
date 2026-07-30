import { Link } from "react-router-dom";
import logo from "../assets/img/logo.png";
import shadowCanopy from "../assets/img/shadow-canopy.svg";
import "../styles/WorkspaceShell.css";

const WORKSPACE_HOME_ROUTE = "/staff";

const workspaceNumbers = {
  reception: "01",
  housekeeping: "02",
  maintenance: "03",
  procurement: "04",
  rooms: "05",
  chat: "06",
} as const;

type WorkspaceKey = keyof typeof workspaceNumbers;

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
  return (
    <main className="workspace-page">
      <div className="workspace-page__veil" aria-hidden="true" />

      <section className="workspace-shell" aria-label={`${title} workspace`}>
        <header className="workspace-masthead">
          <Link className="workspace-masthead__brand" to={WORKSPACE_HOME_ROUTE} aria-label="Back to Home">
            <img src={logo} alt="Vanara" className="workspace-masthead__logo" />

            <div className="workspace-masthead__wordmark">
              <span>Vanara</span>
              <strong>Central</strong>
            </div>
          </Link>

          <time className="workspace-masthead__date">{formatToday()}</time>
        </header>

        <section className="workspace-intro" aria-labelledby="workspace-title">
          <p className="workspace-intro__eyebrow">Staff page</p>
          <h1 id="workspace-title">{title}</h1>
        </section>

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
