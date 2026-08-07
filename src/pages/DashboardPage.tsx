import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import LanguageSwitch from "../components/LanguageSwitch";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, MaintenanceIcon, RefreshIcon } from "../components/OperationsIcons";
import ProfilePanel from "../components/ProfilePanel";
import { useLanguage } from "../providers/language.context";
import { loadDashboardOverview } from "../services/dashboard.service";
import type { DashboardBreakdownItem, DashboardBusinessMetric, DashboardFinancialSegment, DashboardOverview, DashboardOverviewAlert, DashboardOverviewMetric, DashboardQuickLink } from "../types/dashboard";
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

type FinancialView = "overview" | "income" | "expenses" | "ota" | "manual-income" | "payroll";

function segmentColor(segment: DashboardFinancialSegment, index: number): string {
  if (segment.kind === "reduction") return "rgba(163, 63, 54, 0.74)";
  if (segment.kind === "expense") return index % 2 === 0 ? "rgba(146, 91, 60, 0.86)" : "rgba(178, 138, 70, 0.86)";
  return index % 2 === 0 ? "rgba(44, 106, 77, 0.9)" : "rgba(54, 95, 83, 0.82)";
}

function donutStyle(segments: DashboardFinancialSegment[]) {
  const total = segments.reduce((sum, segment) => sum + Math.abs(segment.amount), 0);
  if (total <= 0) {
    return { background: "conic-gradient(rgba(44, 106, 77, 0.18) 0 360deg)" };
  }
  let cursor = 0;
  const stops = segments.map((segment, index) => {
    const size = Math.abs(segment.amount) / total * 360;
    const start = cursor;
    cursor += size;
    return `${segmentColor(segment, index)} ${start}deg ${cursor}deg`;
  });
  return { background: `conic-gradient(${stops.join(", ")})` };
}

function segmentTotal(segments: DashboardFinancialSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.amount, 0);
}

function FinancialList({ segments, empty }: { segments: DashboardFinancialSegment[]; empty: string }) {
  const visible = segments.filter((segment) => segment.amount !== 0);
  if (visible.length === 0) return <p className="financial-dashboard__empty">{empty}</p>;
  return (
    <ul className="financial-dashboard__list">
      {visible.map((segment, index) => (
        <li key={segment.id}>
          <span className="financial-dashboard__dot" style={{ backgroundColor: segmentColor(segment, index) }} aria-hidden="true" />
          <div>
            <strong>{segment.label}</strong>
            <small>{segment.percentage}%</small>
          </div>
          <b className={segment.kind === "reduction" ? "is-reduction" : undefined}>{money(segment.amount)}</b>
        </li>
      ))}
    </ul>
  );
}

function FinancialDashboard({ data }: { data: DashboardOverview }) {
  const [view, setView] = useState<FinancialView>("overview");
  const snapshot = data.business.financialSnapshot;
  const config = useMemo(() => {
    if (view === "income") {
      return {
        title: "Income Composition",
        subtitle: "Checked-in OTA revenue plus manual income.",
        totalLabel: "Total income",
        total: snapshot.totalIncome,
        segments: snapshot.incomeComposition,
        empty: "No income recorded yet.",
      };
    }
    if (view === "expenses") {
      return {
        title: "Expenses Composition",
        subtitle: "Manual expenses plus finalized payroll and wages.",
        totalLabel: "Total expenses",
        total: snapshot.totalExpenses,
        segments: snapshot.expenseComposition,
        empty: "No expenses recorded yet.",
      };
    }
    if (view === "ota") {
      return {
        title: "OTA Income",
        subtitle: "Channel split from normalized expected net payout.",
        totalLabel: "OTA income",
        total: snapshot.checkedInNetRevenue,
        segments: snapshot.otaChannels,
        empty: "No checked-in OTA income yet.",
      };
    }
    if (view === "manual-income") {
      return {
        title: "Manual Income",
        subtitle: "Owner-entered income categories.",
        totalLabel: "Manual income",
        total: snapshot.manualIncomeTotal,
        segments: snapshot.manualIncome,
        empty: "No manual income recorded yet.",
      };
    }
    if (view === "payroll") {
      return {
        title: "Payroll / Wages",
        subtitle: "Finalized payroll components. Salary advances are not counted as extra cost.",
        totalLabel: "Payroll expense",
        total: snapshot.payrollTotal,
        segments: snapshot.payrollComponents,
        empty: "No finalized payroll expense yet.",
      };
    }
    return {
      title: "Financial Snapshot",
      subtitle: "Clean income and expenses from accounting, OTA normalization and finalized payroll.",
      totalLabel: "Net position",
      total: snapshot.netPosition,
      segments: snapshot.topLevel,
      empty: "No financial activity recorded yet.",
    };
  }, [snapshot, view]);

  return (
    <section className="financial-dashboard" aria-labelledby="financial-dashboard-title">
      <header className="financial-dashboard__header">
        <div>
          <span>Owner finance</span>
          <h2 id="financial-dashboard-title">{config.title}</h2>
          <p>{config.subtitle}</p>
        </div>
        <Link to="/accounting">Open Accounting</Link>
      </header>

      <div className="financial-dashboard__summary">
        <div className="financial-dashboard__donut" style={donutStyle(config.segments)} aria-hidden="true">
          <div>
            <span>{config.totalLabel}</span>
            <strong>{money(config.total)}</strong>
          </div>
        </div>
        <div className="financial-dashboard__metrics">
          <article>
            <span>Total income</span>
            <strong>{money(snapshot.totalIncome)}</strong>
          </article>
          <article>
            <span>Total expenses</span>
            <strong>{money(snapshot.totalExpenses)}</strong>
          </article>
          <article>
            <span>Future booked net forecast</span>
            <strong>{money(snapshot.futureBookedNetForecast)}</strong>
          </article>
        </div>
      </div>

      <nav className="financial-dashboard__tabs" aria-label="Financial dashboard drill-down">
        {([
          ["overview", "Overview"],
          ["income", "Income"],
          ["expenses", "Expenses"],
          ["ota", "OTA"],
          ["manual-income", "Manual income"],
          ["payroll", "Payroll / Wages"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={view === key ? "is-active" : undefined}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <FinancialList segments={config.segments} empty={config.empty} />
      {view === "overview" && (
        <p className="financial-dashboard__note">
          Checked-in revenue means expected net payout for stays already started. It is not bank-received cash.
        </p>
      )}
      {view === "payroll" && segmentTotal(snapshot.payrollComponents) !== snapshot.payrollTotal && (
        <p className="financial-dashboard__note">
          Reductions lower the finalized payroll cost; salary advances are cash timing only.
        </p>
      )}
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
      <FinancialDashboard data={data} />

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
