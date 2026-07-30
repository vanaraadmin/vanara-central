import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { loadProcurementRequests } from "../services/procurement.service";
import type { ProcurementRequest, ProcurementStatus } from "../types/procurement";
import "../styles/ProcurementPage.css";

const statuses: Array<ProcurementStatus | "all"> = ["all", "requested", "reviewed", "ordered", "received", "rejected"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function itemLine(request: ProcurementRequest): string {
  const names = request.items.map((item) => item.nameEn);
  if (request.customItemText) names.push(request.customItemText);
  return names.join(", ");
}

export default function ProcurementOwnerPage() {
  const [status, setStatus] = useState<ProcurementStatus | "all">("all");
  const query = useQuery({ queryKey: ["procurement", "requests", status], queryFn: ({ signal }) => loadProcurementRequests(status, signal) });
  const requests = useMemo(() => query.data ?? [], [query.data]);

  if (query.isLoading) return <WorkspaceShell title="Procurement" workspace="procurement"><PageLoading /></WorkspaceShell>;
  if (query.isError) return <WorkspaceShell title="Procurement" workspace="procurement"><PageError onRetry={() => void query.refetch()} /></WorkspaceShell>;

  return (
    <WorkspaceShell title="Procurement" workspace="procurement" bodyClassName="procurement-page">
      <div className="workspace-body-actions">
        <span>{requests.length} visible request{requests.length === 1 ? "" : "s"}</span>
        <Link to="/procurement/new">Request supplies</Link>
      </div>

      <section className="owner-filters" aria-label="Request status filter">
        {statuses.map((option) => <button key={option} className={option === status ? "is-active" : ""} type="button" onClick={() => setStatus(option)}>{option}</button>)}
      </section>

      <section className="owner-request-list" aria-label="Supply requests">
        {requests.length ? requests.map((request) => (
          <Link className={`owner-request status-${request.status}`} key={request.id} to={`/procurement/${request.id}`}>
            <div className="owner-request__top"><strong>{request.requestedByName}</strong><span>{request.status}</span></div>
            <p>{itemLine(request)}</p>
            {request.note && <small>{request.note}</small>}
            <em>{formatDate(request.createdAt)}</em>
          </Link>
        )) : (
          <div className="supply-success supply-success--empty"><span aria-hidden="true">🌿</span><h2>No requests</h2><p>No supply requests match this status.</p></div>
        )}
      </section>
    </WorkspaceShell>
  );
}
