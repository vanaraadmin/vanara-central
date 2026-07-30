import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import LanguageSwitch from "../components/LanguageSwitch";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, MaintenanceIcon, RefreshIcon } from "../components/OperationsIcons";
import { useLanguage } from "../providers/language.context";
import { loadDashboardOverview } from "../services/dashboard.service";
import type { DashboardOverview, DashboardOverviewAlert, DashboardOverviewMetric, DashboardQuickLink } from "../types/dashboard";
import "../styles/DashboardPage.css";

function formatDate(date: string, language: "en" | "th") {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(date + "T12:00:00+07:00"));
}

function iconFor(id: string): string {
  if (id.includes("clean") || id.includes("housekeeping")) return "🧹";
  if (id.includes("maintenance") || id.includes("issue")) return "🔧";
  if (id.includes("arrival") || id.includes("check-in")) return "📥";
  if (id.includes("departure") || id.includes("check-out")) return "📤";
  if (id.includes("user") || id.includes("staff")) return "👥";
  if (id.includes("room")) return "🏡";
  if (id.includes("setting")) return "⚙️";
  return "•";
}

function MetricCard({ metric }: { metric: DashboardOverviewMetric }) {
  return (
    <Link className={`control-card control-card--${metric.tone}`} to={metric.href}>
      <span aria-hidden="true">{iconFor(metric.id)}</span>
      <div>
        <strong>{metric.value}</strong>
        <small>{metric.label}</small>
      </div>
    </Link>
  );
}

function AlertCard({ item }: { item: DashboardOverviewAlert }) {
  return (
    <Link className={`control-alert control-alert--${item.tone}`} to={item.href}>
      <AlertIcon />
      <div>
        <strong>{item.label}</strong>
        <span>{item.value}</span>
      </div>
    </Link>
  );
}

function Section({ title, metrics }: { title: string; metrics: DashboardOverviewMetric[] }) {
  return (
    <section className="control-section" aria-labelledby={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      <header>
        <h2 id={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}>{title}</h2>
      </header>
      <div className="control-grid">
        {metrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
      </div>
    </section>
  );
}

function QuickAccess({ links }: { links: DashboardQuickLink[] }) {
  return (
    <section className="control-section" aria-label="Quick access">
      <header><h2>Quick Access</h2></header>
      <div className="quick-access-grid">
        {links.map((link) => (
          <Link key={link.id} to={link.href}>
            <span aria-hidden="true">{iconFor(link.id)}</span>
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function DashboardContent({ data }: { data: DashboardOverview }) {
  return (
    <div className="control-room-dashboard">
      <section className="control-alerts" aria-label="Operational alerts">
        {data.alerts.length > 0
          ? data.alerts.map((item) => <AlertCard item={item} key={item.id} />)
          : <div className="control-alerts__empty"><MaintenanceIcon /><p>No operational alerts</p></div>}
      </section>

      <Section title="Housekeeping" metrics={Object.values(data.housekeeping)} />
      <Section title="Maintenance" metrics={Object.values(data.maintenance)} />
      <Section title="Today" metrics={Object.values(data.today)} />
      <Section title="Staff" metrics={Object.values(data.staff)} />
      <QuickAccess links={data.quickLinks} />
    </div>
  );
}

export default function DashboardPage() {
  const { language, translate } = useLanguage();
  const dashboard = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: ({ signal }) => loadDashboardOverview(signal),
    refetchInterval: 60_000,
  });

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <span className="dashboard-header__eyebrow">{translate("appName")}</span>
          <h1>Control Room</h1>
          <p>{dashboard.data ? formatDate(dashboard.data.date, language) : "Loading operations"}</p>
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
