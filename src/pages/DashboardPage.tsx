import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import LanguageSwitch from "../components/LanguageSwitch";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, MaintenanceIcon, RefreshIcon } from "../components/OperationsIcons";
import { useLanguage } from "../providers/language.context";
import { loadDashboardOverview } from "../services/dashboard.service";
import type { DashboardOverview, DashboardOverviewAlert, DashboardOverviewMetric, DashboardQuickLink } from "../types/dashboard";
import { translateStaffLabel } from "../utils/staff-i18n-labels";
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

type Translate = ReturnType<typeof useLanguage>["translate"];

function MetricCard({ metric, translate }: { metric: DashboardOverviewMetric; translate: Translate }) {
  return (
    <Link className={`control-card control-card--${metric.tone}`} to={metric.href}>
      <span aria-hidden="true">{iconFor(metric.id)}</span>
      <div>
        <strong>{metric.value}</strong>
        <small>{translateStaffLabel(metric.label, translate)}</small>
      </div>
    </Link>
  );
}

function AlertCard({ item, translate }: { item: DashboardOverviewAlert; translate: Translate }) {
  return (
    <Link className={`control-alert control-alert--${item.tone}`} to={item.href}>
      <AlertIcon />
      <div>
        <strong>{translateStaffLabel(item.label, translate)}</strong>
        <span>{item.value}</span>
      </div>
    </Link>
  );
}

function Section({ title, metrics, translate }: { title: string; metrics: DashboardOverviewMetric[]; translate: Translate }) {
  return (
    <section className="control-section" aria-labelledby={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      <header>
        <h2 id={`section-${title.replace(/\s+/g, "-").toLowerCase()}`}>{translate(title)}</h2>
      </header>
      <div className="control-grid">
        {metrics.map((metric) => <MetricCard key={metric.id} metric={metric} translate={translate} />)}
      </div>
    </section>
  );
}

function QuickAccess({ links, translate }: { links: DashboardQuickLink[]; translate: Translate }) {
  return (
    <section className="control-section" aria-label={translate("quickAccess")}>
      <header><h2>{translate("quickAccess")}</h2></header>
      <div className="quick-access-grid">
        {links.map((link) => (
          <Link key={link.id} to={link.href}>
            <span aria-hidden="true">{iconFor(link.id)}</span>
            {translateStaffLabel(link.label, translate)}
          </Link>
        ))}
      </div>
    </section>
  );
}

function DashboardContent({ data }: { data: DashboardOverview }) {
  const { translate } = useLanguage();
  return (
    <div className="control-room-dashboard">
      <section className="control-alerts" aria-label={translate("operationalAlerts")}>
        {data.alerts.length > 0
          ? data.alerts.map((item) => <AlertCard item={item} key={item.id} translate={translate} />)
          : <div className="control-alerts__empty"><MaintenanceIcon /><p>{translate("noOperationalAlerts")}</p></div>}
      </section>

      <Section title="housekeeping" metrics={Object.values(data.housekeeping)} translate={translate} />
      <Section title="maintenance" metrics={Object.values(data.maintenance)} translate={translate} />
      <Section title="todaySection" metrics={Object.values(data.today)} translate={translate} />
      <Section title="staff" metrics={Object.values(data.staff)} translate={translate} />
      <QuickAccess links={data.quickLinks} translate={translate} />
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
          <h1>{translate("controlRoom")}</h1>
          <p>{dashboard.data ? formatDate(dashboard.data.date, language) : translate("loadingOperations")}</p>
        </div>
        <div className="dashboard-header__actions">
          <LanguageSwitch />
          <a className="dashboard-download" href="/api/owner/tm30/export">
            {translate("downloadTm30")}
          </a>
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
