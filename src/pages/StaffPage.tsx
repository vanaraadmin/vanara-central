import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect, type CSSProperties } from "react";
import airplaneLandingIcon from "../assets/img/airplane-landing-light.svg";
import bedIcon from "../assets/img/bed-light.svg";
import logo from "../assets/img/logo.png";
import shadowCanopy from "../assets/img/shadow-canopy.svg";
import shoppingCartIcon from "../assets/img/shopping-cart-light.svg";
import sprayBottleIcon from "../assets/img/spray-bottle-light.svg";
import wrenchIcon from "../assets/img/wrench-light.svg";
import { PageError, PageLoading } from "../components/AsyncState";
import RecentBookings from "../components/RecentBookings";
import { RoomIcon } from "../components/OperationsIcons";
import {
  preloadWorkspaceBackground,
  workspaceBackgroundStyle,
} from "../config/workspaceBackgrounds";
import { loadStaffOverview } from "../services/staff.service";
import type { StaffCardId, StaffOverviewCard } from "../types/staff";
import "../styles/StaffPage.css";

const WORKSPACE_ORDER: StaffCardId[] = [
  "rooms",
  "housekeeping",
  "maintenance",
  "reception",
  "procurement",
  "availability",
];

const HIDDEN_UNTIL_PAGE_READY = new Set<StaffCardId>(["availability"]);

const workspaceIcons: Record<StaffCardId, string> = {
  rooms: bedIcon,
  reception: airplaneLandingIcon,
  availability: bedIcon,
  housekeeping: sprayBottleIcon,
  maintenance: wrenchIcon,
  procurement: shoppingCartIcon,
};

const workspaceTone: Record<StaffCardId, string> = {
  rooms: "moss",
  reception: "water",
  availability: "fern",
  housekeeping: "sun",
  maintenance: "earth",
  procurement: "ash",
};

function formatToday() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}

function firstName(displayName: string) {
  const cleaned = displayName.trim();

  if (!cleaned || cleaned.toLowerCase() === "vanara owner") {
    return "";
  }

  return cleaned.split(/\s+/)[0];
}

function sortWorkspaces(workspaces: StaffOverviewCard[]) {
  return [...workspaces].sort(
    (a, b) =>
      WORKSPACE_ORDER.indexOf(a.id) - WORKSPACE_ORDER.indexOf(b.id),
  );
}

function iconStyle(iconUrl: string): CSSProperties {
  return { "--staff-icon-url": `url("${iconUrl}")` } as CSSProperties;
}

function WorkspaceCard({
  index,
  workspace,
}: {
  index: number;
  workspace: StaffOverviewCard;
}) {
  const iconUrl = workspaceIcons[workspace.id];
  const title = workspace.id === "reception" ? "Check-In / Out" : workspace.title;

  return (
    <Link
      className={[
        "staff-workspace",
        `staff-workspace--${workspaceTone[workspace.id]}`,
        index === 0 ? "staff-workspace--priority" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      to={workspace.href}
    >
      <span className="staff-workspace__wash" aria-hidden="true" />

      <span className="staff-workspace__identity">
        <span className="staff-workspace__index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>

        <span
          className="staff-workspace__icon"
          style={iconStyle(iconUrl)}
          aria-hidden="true"
        >
          <span className="staff-icon" />
        </span>
      </span>

      <span className="staff-workspace__content">
        <span className="staff-workspace__title">{title}</span>

        <span
          className="staff-workspace__summary"
          data-dynamic-field={`${workspace.id}.summaryLine1`}
          aria-label="Dynamic operational summary"
        >
          {workspace.summaryLine1 ?? "—"}
        </span>
        <span
          className="staff-workspace__secondary"
          data-dynamic-field={`${workspace.id}.summaryLine2`}
          aria-label="Dynamic operational detail"
        >
          {workspace.summaryLine2 ?? "—"}
        </span>
      </span>

      <span className="staff-workspace__arrow" aria-hidden="true">
        ↗
      </span>
    </Link>
  );
}

export default function StaffPage() {
  useEffect(() => {
    preloadWorkspaceBackground("staffHome");
  }, []);

  const staff = useQuery({
    queryKey: ["staff", "overview"],
    queryFn: ({ signal }) => loadStaffOverview(signal),
    refetchInterval: 60_000,
  });

  const workspaces = staff.data
    ? sortWorkspaces(staff.data.cards).filter(
        (workspace) => !HIDDEN_UNTIL_PAGE_READY.has(workspace.id),
      )
    : [];
  const roomsWorkspace = workspaces.find((workspace) => workspace.id === "rooms") ?? null;
  const remainingWorkspaces = roomsWorkspace
    ? workspaces.filter((workspace) => workspace.id !== "rooms")
    : workspaces;

  const name = staff.data ? firstName(staff.data.user.displayName) : "";
  const bookingEvents = staff.data?.bookingEvents ?? [];
  const canViewBookingValue = staff.data?.bookingPulseCapabilities?.canViewBookingValue ?? false;
  const showSecondaryWorkspaceSection = Boolean(!roomsWorkspace || remainingWorkspaces.length > 0 || staff.isLoading || staff.isError || (staff.data && workspaces.length === 0));

  return (
    <main className="staff-page" style={workspaceBackgroundStyle("staffHome")}>
      <div className="staff-page__veil" aria-hidden="true" />

      <section className="staff-shell" aria-label="Vanara Central home">
        <header className="staff-masthead">
          <div className="staff-masthead__brand">
            <img src={logo} alt="Vanara" className="staff-masthead__logo" />

            <div className="staff-masthead__wordmark">
              <span>Vanara</span>
              <strong>Central</strong>
            </div>
          </div>

          <time className="staff-masthead__date">{formatToday()}</time>
        </header>

        <section className="staff-intro" aria-labelledby="staff-intro-title">
          <p className="staff-intro__eyebrow">Staff page</p>
          <h1 id="staff-intro-title">
            {name ? `Sawasdee, ${name}` : "Sawasdee"}
          </h1>
        </section>

        {roomsWorkspace ? (
          <section className="staff-workspaces staff-workspaces--primary" aria-label="Primary workspace">
            <div className="staff-workspaces__heading">
              <span>Workspaces</span>
              <span>{String(workspaces.length).padStart(2, "0")}</span>
            </div>

            <div className="staff-workspace-list">
              <WorkspaceCard
                index={0}
                workspace={roomsWorkspace}
              />
            </div>
          </section>
        ) : null}

        <RecentBookings
          canViewBookingValue={canViewBookingValue}
          events={bookingEvents}
          error={staff.isError}
          loading={staff.isLoading}
          onRetry={() => void staff.refetch()}
        />

        {showSecondaryWorkspaceSection ? (
        <section className={`staff-workspaces${roomsWorkspace ? " staff-workspaces--secondary" : ""}`} aria-label="Available workspaces">
          {!roomsWorkspace ? (
            <div className="staff-workspaces__heading">
              <span>Workspaces</span>
              <span>{String(remainingWorkspaces.length).padStart(2, "0")}</span>
            </div>
          ) : null}

          {staff.isLoading && (
            <div className="staff-state">
              <PageLoading />
            </div>
          )}

          {staff.isError && !staff.data && (
            <div className="staff-state">
              <PageError onRetry={() => void staff.refetch()} />
            </div>
          )}

          {staff.data && workspaces.length === 0 && (
            <section className="staff-empty" aria-label="No work available">
              <RoomIcon />
              <h2>Nothing assigned</h2>
              <p>Your work areas will appear here when access is enabled.</p>
            </section>
          )}

          {remainingWorkspaces.length > 0 && (
            <div className="staff-workspace-list">
              {remainingWorkspaces.map((workspace, index) => (
                <WorkspaceCard
                  index={roomsWorkspace ? index + 1 : index}
                  key={workspace.id}
                  workspace={workspace}
                />
              ))}
            </div>
          )}
        </section>
        ) : null}

        <footer className="staff-canopy" aria-label="Vanara Central">
          <img src={shadowCanopy} alt="" aria-hidden="true" />
          <div className="staff-canopy__signature">
            <span>Vanara Central</span>
            <small>Koh Chang · Thailand</small>
          </div>
        </footer>
      </section>

    </main>
  );
}
