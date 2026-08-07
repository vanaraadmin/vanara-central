import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import LanguageSwitch from "../components/LanguageSwitch";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, MaintenanceIcon, RefreshIcon } from "../components/OperationsIcons";
import ProfilePanel from "../components/ProfilePanel";
import { useLanguage } from "../providers/language.context";
import { loadDashboardOverview } from "../services/dashboard.service";
import type { DashboardBreakdownItem, DashboardBusinessMetric, DashboardOverview, DashboardOverviewAlert, DashboardOverviewMetric, DashboardQuickLink } from "../types/dashboard";
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

function money(value: number | string): string {
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

function iconFor(id: string): string {
  if (id.includes("income") || id.includes("future")) return "THB";
  if (id.includes("occupancy")) return "%";
  if (id.includes("clean") || id.includes("housekeeping")) return "HK";
  if (id.includes("maintenance") || id.includes("issue")) return "MT";
  if (id.includes("arrival") || id.includes("check-in")) return "IN";
  if (id.includes("departure") || id.includes("check-out")) return "OUT";
  if (id.includes("user") || id.includes("staff")) return "US";
  if (id.includes("room")) return "RM";
  return "VC";
}

type Translate = ReturnType<typeof useLanguage>["translate"];

function BusinessCard({ metric }: { metric: DashboardBusinessMetric }) {
  return (
    <article className={`business-card business-card--${metric.tone}`}>
      <span aria-hidden="true">{iconFor(metric.id)}</span>
      <div>
        <strong>{typeof metric.value === "number" ? money(metric.value) : metric.value}</strong>
        <small>{metric.label}</small>
        <p>{metric.detail}</p>
      </div>
    </article>
  );
}

function Breakdown({ title, items, amount }: { title: string; items: DashboardBreakdownItem[]; amount?: boolean }) {
  return (
    <section className="breakdown-panel">
      <h2>{title}</h2>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{amount && item.amount !== undefined ? money(item.amount) : item.value}</strong>
            </li>
          ))}
        </ul>
      ) : <p>No data yet.</p>}
    </section>
  );
}

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
      <section className="business-grid" aria-label="Business snapshot">
        <BusinessCard metric={data.business.expectedNetIncomeToDate} />
        <BusinessCard metric={data.business.expectedFutureNetIncome} />
        <BusinessCard metric={data.business.occupancy} />
        <Link className="business-card business-card--link" to="/accounting">
          <span aria-hidden="true">ACC</span>
          <div>
            <strong>Accounting</strong>
            <small>Open ledger</small>
            <p>OTA payouts, manual income, expenses and receipt exports.</p>
          </div>
        </Link>
      </section>

      <div className="dashboard-breakdowns">
        <Breakdown title="Guest origins" items={data.business.guestOrigins} />
        <Breakdown title="OTA channels" items={data.business.channels} amount />
      </div>

      <section className="control-alerts" aria-label={translate("operationalAlerts")}>
        {data.alerts.length > 0
          ? data.alerts.map((item) => <AlertCard item={item} key={item.id} translate={translate} />)
          : <div className="control-alerts__empty"><MaintenanceIcon /><p>{translate("noOperationalAlerts")}</p></div>}
      </section>

      <Section title="todaySection" metrics={Object.values(data.today)} translate={translate} />
      <Section title="housekeeping" metrics={Object.values(data.housekeeping).slice(0, 3)} translate={translate} />
      <Section title="maintenance" metrics={Object.values(data.maintenance).slice(0, 3)} translate={translate} />
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
    <main className="dashboard-page" aria-label={translate("controlRoom")}>
      <header className="dashboard-header">
        <div>
          <span className="dashboard-header__eyebrow">{translate("appName")}</span>
          <h1>Owner Dashboard</h1>
          <p>{dashboard.data ? formatDate(dashboard.data.date, language) : translate("loadingOperations")}</p>
        </div>
        <div className="dashboard-header__actions">
          <LanguageSwitch />
          <ProfilePanel />
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
