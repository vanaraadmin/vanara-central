import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { loadProcurementRequest, updateProcurementRequest } from "../services/procurement.service";
import type { ProcurementStatus } from "../types/procurement";
import "../styles/ProcurementPage.css";

const statuses: ProcurementStatus[] = ["requested", "reviewed", "ordered", "received", "rejected"];

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function ProcurementDetailPage() {
  const requestId = Number(useParams().requestId);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["procurement", "request", requestId], queryFn: ({ signal }) => loadProcurementRequest(requestId, signal), enabled: Number.isInteger(requestId) && requestId > 0 });
  const mutation = useMutation({
    mutationFn: (status: ProcurementStatus) => updateProcurementRequest(requestId, { status }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["procurement", "request", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["procurement", "requests"] }),
      ]);
    },
  });

  if (query.isLoading) return <WorkspaceShell title="Procurement" workspace="procurement"><PageLoading /></WorkspaceShell>;
  if (query.isError || !query.data) return <WorkspaceShell title="Procurement" workspace="procurement"><PageError onRetry={() => void query.refetch()} /></WorkspaceShell>;
  const request = query.data;

  return (
    <WorkspaceShell title="Procurement" workspace="procurement" bodyClassName="procurement-page">
      <div className="workspace-body-actions">
        <span>Request #{request.id} · {request.requestedByName} · {formatDate(request.createdAt)}</span>
        <Link to="/procurement">Back</Link>
      </div>

      <section className="procurement-detail-card">
        <h2>Requested items</h2>
        <div className="procurement-detail-items">
          {request.items.map((item) => <span key={item.id}>{item.nameEn}</span>)}
          {request.customItemText && <span>{request.customItemText}</span>}
        </div>
        {request.note && <p>{request.note}</p>}
      </section>

      <section className="procurement-detail-card">
        <h2>Status</h2>
        <div className="owner-filters owner-filters--wrap">
          {statuses.map((status) => <button key={status} className={status === request.status ? "is-active" : ""} type="button" onClick={() => mutation.mutate(status)} disabled={mutation.isPending || status === request.status}>{status}</button>)}
        </div>
      </section>

      <section className="procurement-detail-card">
        <h2>Timeline</h2>
        <dl className="procurement-timestamps">
          <div><dt>Created</dt><dd>{formatDate(request.createdAt)}</dd></div>
          <div><dt>Reviewed</dt><dd>{formatDate(request.reviewedAt)}</dd></div>
          <div><dt>Ordered</dt><dd>{formatDate(request.orderedAt)}</dd></div>
          <div><dt>Received</dt><dd>{formatDate(request.receivedAt)}</dd></div>
          <div><dt>Rejected</dt><dd>{formatDate(request.rejectedAt)}</dd></div>
        </dl>
      </section>
    </WorkspaceShell>
  );
}
