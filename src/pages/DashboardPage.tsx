import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import LanguageSwitch from "../components/LanguageSwitch";
import { PageError, PageLoading } from "../components/AsyncState";
import {
  AlertIcon,
  CheckIcon,
  CheckInIcon,
  CheckOutIcon,
  MaintenanceIcon,
  RefreshIcon,
} from "../components/OperationsIcons";
import { useLanguage } from "../providers/language.context";
import { loadDashboard } from "../services/dashboard.service";
import type { DashboardData, DashboardRoomCard, DashboardRoomStatus } from "../types/dashboard";
import "../styles/DashboardPage.css";

function formatDate(date: string, language: "en" | "th") {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(date + "T12:00:00+07:00"));
}

function shortDate(date: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
  }).format(new Date(date + "T12:00:00+07:00"));
}

function statusTone(status: DashboardRoomStatus): string {
  switch (status) {
    case "Ready":
      return "ready";
    case "Occupied":
      return "occupied";
    case "Cleaning":
      return "cleaning";
    case "Dirty":
      return "dirty";
    case "Maintenance":
      return "maintenance";
    case "Arrival Today":
      return "arrival";
    case "Departure Today":
      return "departure";
  }
}

function StatusIcon({ status }: { status: DashboardRoomStatus }) {
  switch (status) {
    case "Ready":
      return <CheckIcon />;
    case "Maintenance":
      return <MaintenanceIcon />;
    case "Arrival Today":
      return <CheckInIcon />;
    case "Departure Today":
      return <CheckOutIcon />;
    default:
      return <AlertIcon />;
  }
}

interface OperationSectionProps {
  title: string;
  count: number;
  items: DashboardRoomCard[];
  emptyText: string;
  tone: string;
  sectionHref?: string;
}

function MetricCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return (
    <Link className={"dashboard-metric dashboard-metric--" + tone} to="/housekeeping">
      <span aria-hidden="true">{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </Link>
  );
}

function RoomCard({ room }: { room: DashboardRoomCard }) {
  const dateLine = [shortDate(room.checkIn), shortDate(room.checkOut)].filter(Boolean).join(" → ");

  return (
    <article className={"room-card status-" + statusTone(room.status)}>
      <div className="room-card__icon" aria-hidden="true">
        <StatusIcon status={room.status} />
      </div>
      <div className="room-card__body">
        <div className="room-card__topline">
          <h3>{room.unitName}</h3>
          <span>{room.status}</span>
        </div>
        {room.guestName && <p className="room-card__guest">{room.guestName}</p>}
        {dateLine && <p className="room-card__dates">{dateLine}</p>}
      </div>
    </article>
  );
}

function OperationSection({ title, count, items, emptyText, tone, sectionHref }: OperationSectionProps) {
  return (
    <section className={"operation-section tone-" + tone} aria-labelledby={title.replace(/\s+/g, "-").toLowerCase()}>
      <header className="operation-section__header">
        <h2 id={title.replace(/\s+/g, "-").toLowerCase()}>{title}</h2>
        {sectionHref && <Link to={sectionHref}>Open</Link>}
        <span>{count}</span>
      </header>
      <div className="operation-section__list">
        {items.length > 0
          ? items.map((room) => <RoomCard key={room.id} room={room} />)
          : <div className="operation-section__empty"><AlertIcon /><p>{emptyText}</p></div>}
      </div>
    </section>
  );
}

function HousekeepingSummary({ data }: { data: DashboardData }) {
  return (
    <section className="dashboard-housekeeping" aria-label="Housekeeping priority summary">
      <header>
        <span>HOUSEKEEPING</span>
        <h2>What needs attention?</h2>
      </header>
      <div className="dashboard-metrics">
        <MetricCard icon="🔥" label="Clean First" value={data.summary.cleanFirst} tone="first" />
        <MetricCard icon="🧹" label="Clean Today" value={data.summary.cleanToday} tone="today" />
        <MetricCard icon="🟡" label="Cleaning In Progress" value={data.summary.cleaningInProgress} tone="progress" />
      </div>
    </section>
  );
}

function DashboardContent({ data }: { data: DashboardData }) {
  return (
    <div className="operations-dashboard">
      {!data.system.hasOperationalData && (
        <div className="dashboard-notice" role="status">
          Local data is empty. Run local bootstrap before using operations.
        </div>
      )}

      <HousekeepingSummary data={data} />
      <OperationSection
        title="Today's Check-ins"
        count={data.summary.arrivals}
        items={data.operations.checkIns}
        emptyText="No check-ins today"
        tone="arrival"
        sectionHref="/movements"
      />
      <OperationSection
        title="Today's Check-outs"
        count={data.summary.departures}
        items={data.operations.checkOuts}
        emptyText="No check-outs today"
        tone="departure"
        sectionHref="/movements"
      />
      <OperationSection
        title="Maintenance Alerts"
        count={data.summary.openMaintenance}
        items={data.operations.maintenanceAlerts}
        emptyText="No maintenance alerts"
        tone="maintenance"
      />
    </div>
  );
}

export default function DashboardPage() {
  const { language, translate } = useLanguage();
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: ({ signal }) => loadDashboard(signal),
    refetchInterval: 60_000,
  });

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <span className="dashboard-header__eyebrow">{translate("appName")}</span>
          <h1>Today</h1>
          <p>{dashboard.data ? formatDate(dashboard.data.date, language) : "Loading today"}</p>
        </div>
        <div className="dashboard-header__actions">
          <LanguageSwitch />
          <button
            aria-label={translate("refresh")}
            className="dashboard-refresh"
            disabled={dashboard.isFetching}
            onClick={() => void dashboard.refetch()}
            type="button"
          >
            <RefreshIcon className={dashboard.isFetching ? "is-spinning" : ""} />
            <span>{translate("refresh")}</span>
          </button>
        </div>
      </header>

      {dashboard.isLoading && <PageLoading />}
      {dashboard.isError && !dashboard.data && <PageError onRetry={() => void dashboard.refetch()} />}
      {dashboard.data && <DashboardContent data={dashboard.data} />}
    </main>
  );
}