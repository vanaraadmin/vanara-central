import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import LanguageSwitch from "../components/LanguageSwitch";
import { PageError, PageLoading } from "../components/AsyncState";
import {
  ArrivalsIcon,
  ArrowRightIcon,
  DeparturesIcon,
  HousekeepingIcon,
  MaintenanceIcon,
  RefreshIcon,
  TasksIcon,
} from "../components/OperationsIcons";
import { dashboardModules } from "../config/navigation";
import { useLanguage } from "../providers/language.context";
import { loadDashboard } from "../services/dashboard.service";
import type { DashboardData } from "../types/dashboard";
import "../styles/DashboardPage.css";

function formatDate(date: string, language: "en" | "th") {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date + "T12:00:00+07:00"));
}

function formatTimestamp(timestamp: string, language: "en" | "th") {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

interface SummaryCardProps {
  label: string;
  value: number;
  to: string;
  tone: string;
  Icon: typeof ArrivalsIcon;
}

function SummaryCard({ label, value, to, tone, Icon }: SummaryCardProps) {
  return (
    <Link className={"dashboard-summary-card tone-" + tone} to={to}>
      <span className="dashboard-summary-card__icon"><Icon /></span>
      <span>{label}</span>
      <strong>{value}</strong>
    </Link>
  );
}

function DashboardContent({ data }: { data: DashboardData }) {
  const { language, translate } = useLanguage();
  const summaryCards = [
    { label: translate("arrivalsToday"), value: data.summary.arrivals, to: "/movements", tone: "green", Icon: ArrivalsIcon },
    { label: translate("departuresToday"), value: data.summary.departures, to: "/movements", tone: "blue", Icon: DeparturesIcon },
    { label: translate("dirtyRooms"), value: data.summary.dirtyRooms, to: "/housekeeping", tone: "gold", Icon: HousekeepingIcon },
    { label: translate("openMaintenance"), value: data.summary.openMaintenance, to: "/maintenance", tone: "rose", Icon: MaintenanceIcon },
    { label: translate("pendingProcurement"), value: data.summary.pendingProcurement, to: "/procurement", tone: "slate", Icon: TasksIcon },
  ];

  return (
    <>
      {!data.system.hasOperationalData && (
        <div className="dashboard-notice" role="status">
          {translate("localDataEmpty")}
        </div>
      )}

      <section className="dashboard-section" aria-labelledby="today-summary-title">
        <div className="dashboard-section__heading">
          <div>
            <span>{translate("operationalSummary")}</span>
            <h2 id="today-summary-title">{translate("todayAtVanara")}</h2>
          </div>
        </div>
        <div className="dashboard-summary-grid">
          {summaryCards.map((card) => <SummaryCard key={card.label} {...card} />)}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="modules-title">
        <div className="dashboard-section__heading">
          <div>
            <span>{translate("application")}</span>
            <h2 id="modules-title">{translate("mainModules")}</h2>
          </div>
        </div>
        <div className="dashboard-module-grid">
          {dashboardModules.map(({ key, labelKey, descriptionKey, path, Icon, tone }) => (
            <Link className={"dashboard-module tone-" + tone} key={key} to={path}>
              <span className="dashboard-module__icon"><Icon /></span>
              <span className="dashboard-module__arrow"><ArrowRightIcon /></span>
              <strong>{translate(labelKey)}</strong>
              {descriptionKey && <small>{translate(descriptionKey)}</small>}
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="activity-title">
        <div className="dashboard-section__heading">
          <div>
            <span>{translate("latest")}</span>
            <h2 id="activity-title">{translate("recentActivity")}</h2>
          </div>
        </div>
        <div className="dashboard-empty-state">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>{translate("noRecentActivity")}</strong>
            <p>{translate("activityUnavailable")}</p>
          </div>
        </div>
      </section>

      <footer className="dashboard-footer">
        {data.system.latestSync?.finishedAt
          ? translate("lastSync") + " " + formatTimestamp(data.system.latestSync.finishedAt, language)
          : translate("noSyncAvailable")}
      </footer>
    </>
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
          <h1>{translate("goodMorning")}</h1>
          <p>{dashboard.data ? formatDate(dashboard.data.date, language) : translate("loadingDate")}</p>
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
