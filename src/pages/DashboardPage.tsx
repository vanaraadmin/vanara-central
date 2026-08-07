import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { RefreshIcon } from "../components/OperationsIcons";
import WorkspaceShell from "../components/WorkspaceShell";
import { loadDashboardOverview } from "../services/dashboard.service";
import type { DashboardFinancialSegment, DashboardOverview } from "../types/dashboard";
import "../styles/DashboardPage.css";

function money(value: number | string): string {
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value);
}

type FinancialView = "overview" | "income" | "expenses" | "ota" | "manual-income" | "manual-expenses" | "payroll";
type FinancialDrill = {
  title: string;
  note: string;
  segments: DashboardFinancialSegment[];
  selectable?: (segment: DashboardFinancialSegment) => boolean;
  onSelect?: (id: string) => FinancialView | null;
};

function segmentColor(segment: DashboardFinancialSegment, index: number): string {
  if (segment.kind === "reduction") return "rgba(219, 116, 94, 0.86)";
  if (segment.kind === "expense") return index % 2 === 0 ? "rgba(82, 132, 150, 0.92)" : "rgba(128, 166, 174, 0.88)";
  if (segment.kind === "forecast") return "rgba(111, 164, 139, 0.76)";
  return index % 2 === 0 ? "rgba(78, 172, 115, 0.95)" : "rgba(168, 213, 151, 0.9)";
}

function donutStyle(segments: DashboardFinancialSegment[]) {
  const total = segments.reduce((sum, segment) => sum + Math.abs(segment.amount), 0);
  if (total <= 0) {
    return { background: "conic-gradient(rgba(244, 237, 223, 0.18) 0 360deg)" };
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

function percentOf(amount: number, total: number): number {
  return total <= 0 ? 0 : Math.round((Math.abs(amount) / total) * 1000) / 10;
}

function totalAbs(segments: DashboardFinancialSegment[]): number {
  return segments.reduce((sum, segment) => sum + Math.abs(segment.amount), 0);
}

function FinancialList({
  onSelect,
  selectable,
  segments,
}: {
  onSelect?: (id: string) => void;
  selectable?: (segment: DashboardFinancialSegment) => boolean;
  segments: DashboardFinancialSegment[];
}) {
  const visible = segments.filter((segment) => segment.amount !== 0);
  const total = totalAbs(visible);
  if (visible.length === 0) return <p className="financial-dashboard__empty">No data yet.</p>;

  return (
    <ul className="financial-dashboard__list">
      {visible.map((segment, index) => {
        const canSelect = onSelect && (selectable ? selectable(segment) : true);
        const content = (
          <>
            <span className="financial-dashboard__dot" style={{ backgroundColor: segmentColor(segment, index) }} aria-hidden="true" />
            <div>
              <strong>{segment.label}</strong>
              <small>{percentOf(segment.amount, total)}%</small>
            </div>
            <b className={segment.kind === "reduction" ? "is-reduction" : undefined}>{money(segment.amount)}</b>
          </>
        );

        return (
          <li key={segment.id}>
            {canSelect ? (
              <button type="button" onClick={() => onSelect(segment.id)}>
                {content}
              </button>
            ) : (
              <span className="financial-dashboard__list-row">{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function drillConfig(data: DashboardOverview, view: FinancialView): FinancialDrill | null {
  const snapshot = data.business.financialSnapshot;
  if (view === "income") {
    return {
      title: "Income composition",
      note: "Tap OTA or Manual income for details.",
      segments: snapshot.incomeComposition,
      onSelect: (id: string): FinancialView | null => id.includes("ota") ? "ota" : id.includes("manual") ? "manual-income" : null,
    };
  }
  if (view === "expenses") {
    return {
      title: "Expenses composition",
      note: "Tap Manual expenses or Payroll / Wages for details.",
      segments: snapshot.expenseComposition,
      selectable: (segment: DashboardFinancialSegment) => segment.id.includes("payroll") || segment.id.includes("manual"),
      onSelect: (id: string): FinancialView | null => id.includes("payroll") ? "payroll" : id.includes("manual") ? "manual-expenses" : null,
    };
  }
  if (view === "ota") {
    return { title: "OTA income by channel", note: "Checked-in OTA expected net payout by source.", segments: snapshot.otaChannels };
  }
  if (view === "manual-income") {
    return { title: "Manual income", note: "Owner-entered income categories.", segments: snapshot.manualIncome };
  }
  if (view === "manual-expenses") {
    return { title: "Manual expenses", note: "Owner-entered expense categories.", segments: snapshot.manualExpenses };
  }
  if (view === "payroll") {
    return { title: "Payroll / Wages", note: "Finalized payroll components. Salary advances are not counted as extra cost.", segments: snapshot.payrollComponents };
  }
  return null;
}

function FinancialDashboard({ data }: { data: DashboardOverview }) {
  const [view, setView] = useState<FinancialView>("overview");
  const snapshot = data.business.financialSnapshot;
  const topSegments = useMemo(() => snapshot.topLevel, [snapshot.topLevel]);
  const activeDrill = drillConfig(data, view);

  return (
    <div className="dashboard-finance-stack">
      <section className="financial-dashboard" aria-labelledby="financial-dashboard-title">
        <header className="financial-dashboard__header">
          <div>
            <span>Owner finance</span>
            <h2 id="financial-dashboard-title">Financial Dashboard</h2>
            <p>Tap Income or Expenses to explore.</p>
          </div>
        </header>

        <div className="financial-dashboard__summary">
          <div className="financial-dashboard__donut-wrap">
            <button
              className="financial-dashboard__segment financial-dashboard__segment--income"
              type="button"
              onClick={() => setView("income")}
            >
              <span>Income</span>
              <strong>{money(snapshot.totalIncome)}</strong>
            </button>
            <div className="financial-dashboard__donut" style={donutStyle(topSegments)} aria-hidden="true">
              <div>
                <span>Net position</span>
                <strong>{money(snapshot.netPosition)}</strong>
              </div>
            </div>
            <button
              className="financial-dashboard__segment financial-dashboard__segment--expenses"
              type="button"
              onClick={() => setView("expenses")}
            >
              <span>Expenses</span>
              <strong>{money(snapshot.totalExpenses)}</strong>
            </button>
          </div>

          <div className="financial-dashboard__metrics" aria-label="Financial key metrics">
            <button type="button" onClick={() => setView("income")}>
              <span>Total income</span>
              <strong>{money(snapshot.totalIncome)}</strong>
            </button>
            <button type="button" onClick={() => setView("expenses")}>
              <span>Total expenses</span>
              <strong>{money(snapshot.totalExpenses)}</strong>
            </button>
            <article>
              <span>Future forecast</span>
              <strong>{money(snapshot.futureBookedNetForecast)}</strong>
            </article>
          </div>
        </div>

        {activeDrill ? (
          <section className="financial-dashboard__drill" aria-live="polite">
            <header>
              <button type="button" onClick={() => setView("overview")}>Overview</button>
              {view !== "income" && view !== "expenses" && (
                <button type="button" onClick={() => setView(view === "ota" || view === "manual-income" ? "income" : "expenses")}>Back</button>
              )}
              <div>
                <h3>{activeDrill.title}</h3>
                <p>{activeDrill.note}</p>
              </div>
            </header>
            <FinancialList
              segments={activeDrill.segments}
              selectable={activeDrill.selectable}
              onSelect={activeDrill.onSelect ? (id) => {
                const next = activeDrill.onSelect?.(id);
                if (next) setView(next);
              } : undefined}
            />
          </section>
        ) : null}
      </section>

      <section className="dashboard-occupancy" aria-label="Occupancy">
        <span>Occupancy</span>
        <strong>{data.business.occupancy.value}</strong>
        <p>{data.business.occupancy.detail}</p>
      </section>
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardOverview }) {
  return (
    <div className="control-room-dashboard">
      <FinancialDashboard data={data} />
    </div>
  );
}

export default function DashboardPage() {
  const dashboard = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: ({ signal }) => loadDashboardOverview(signal),
    refetchInterval: 60_000,
  });

  const refreshAction = (
    <button
      aria-label="Refresh dashboard"
      className="dashboard-refresh"
      disabled={dashboard.isFetching}
      onClick={() => void dashboard.refetch()}
      type="button"
    >
      <RefreshIcon className={dashboard.isFetching ? "is-spinning" : ""} />
      <span>Refresh</span>
    </button>
  );

  return (
    <WorkspaceShell title="Financial Dashboard" workspace="ownerDashboard" bodyClassName="dashboard-shell" heroAction={refreshAction} wide>
      {dashboard.isLoading && <PageLoading />}
      {dashboard.isError && !dashboard.data && <PageError onRetry={() => void dashboard.refetch()} />}
      {dashboard.data && <DashboardContent data={dashboard.data} />}
    </WorkspaceShell>
  );
}
