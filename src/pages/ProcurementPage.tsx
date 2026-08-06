import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { CheckIcon, PlusIcon } from "../components/OperationsIcons";
import TranslatableText from "../components/TranslatableText";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import WorkspaceShell from "../components/WorkspaceShell";
import { createProcurementRequest, loadCurrentUser, loadProcurementRequests, updateProcurementRequest } from "../services/procurement.service";
import type { ProcurementRequest } from "../types/procurement";
import "../styles/ProcurementPage.css";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: ProcurementRequest["status"]) {
  if (status === "DONE") return "Bought";
  if (status === "REJECTED") return "Rejected";
  return "Pending";
}

function RequestCard({ isOwner, request }: { isOwner: boolean; request: ProcurementRequest }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: "DONE" | "REJECTED") => updateProcurementRequest(request.id, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["procurement", "requests"] });
    },
  });

  return (
    <article className={`procurement-card status-${request.status.toLowerCase()}`}>
      <div className="procurement-card__top">
        <div>
          <strong>{request.requestedByName}</strong>
          <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
        </div>
        <span className="procurement-status">{statusLabel(request.status)}</span>
      </div>

      <TranslatableText
        entityType="procurement_request"
        entityId={String(request.id)}
        fieldName="request_text_original"
        originalText={request.requestTextOriginal}
        sourceLanguage={request.originalLanguage}
        targetLanguage={request.viewerLanguage}
        initialTranslatedText={request.translationAvailable ? request.translatedText : null}
        initialTranslatedLanguage={request.translatedLanguage}
        originalClassName="procurement-card__text"
        translationClassName="procurement-card__translation"
      />

      {request.closedAt ? (
        <p className="procurement-card__meta">
          Closed {formatDate(request.closedAt)}{request.closedByName ? ` by ${request.closedByName}` : ""}
        </p>
      ) : null}

      {isOwner && request.status === "PENDING" ? (
        <div className="procurement-card__actions" aria-label={`Actions for request ${request.id}`}>
          <button
            className="procurement-action procurement-action--done"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("DONE")}
            type="button"
          >
            <CheckIcon /> Bought
          </button>
          <button
            className="procurement-action procurement-action--reject"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("REJECTED")}
            type="button"
          >
            Reject
          </button>
        </div>
      ) : null}
    </article>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="procurement-empty">
      <span aria-hidden="true" />
      <strong>{children}</strong>
    </div>
  );
}

export default function ProcurementPage() {
  const [requestText, setRequestText] = useState("");
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => loadCurrentUser(signal) });
  const requestsQuery = useQuery({
    queryKey: ["procurement", "requests", "all"],
    queryFn: ({ signal }) => loadProcurementRequests("all", signal),
  });
  const createMutation = useMutation({
    mutationFn: () => createProcurementRequest({ requestText }),
    onSuccess: async () => {
      setRequestText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["procurement", "requests"] }),
        queryClient.invalidateQueries({ queryKey: ["staff", "overview"] }),
      ]);
    },
  });
  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const isOwner = Boolean(user.data?.isOwner);
  const pending = useMemo(() => requests.filter((request) => request.status === "PENDING"), [requests]);
  const closedRecent = useMemo(() => requests.filter((request) => request.status !== "PENDING"), [requests]);
  const canSubmit = requestText.trim().length > 0 && !createMutation.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    createMutation.mutate();
  }

  if (user.isLoading || requestsQuery.isLoading) {
    return <WorkspaceShell title="Procurement" workspace="procurement"><PageLoading /></WorkspaceShell>;
  }

  if (user.isError || requestsQuery.isError || !user.data) {
    return (
      <WorkspaceShell title="Procurement" workspace="procurement">
        <PageError onRetry={() => { void user.refetch(); void requestsQuery.refetch(); }} />
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell title="Procurement" workspace="procurement" bodyClassName="procurement-page">
      <VanaraGlassRegion className="procurement-compose" ariaLabelledBy="procurement-new-request">
        <VanaraSectionHeader
          eyebrow="Procurement"
          headingId="procurement-new-request"
          meta={isOwner ? "Owner view" : "Staff request"}
          title={isOwner ? "Open Requests" : "New Request"}
        />

        {!isOwner ? (
          <form className="procurement-form" onSubmit={submit}>
            <label className="procurement-field">
              <span>What should we buy?</span>
              <textarea
                maxLength={2000}
                onChange={(event) => setRequestText(event.target.value)}
                placeholder="Write the request here. Thai is okay."
                rows={5}
                value={requestText}
              />
            </label>
            {createMutation.isError ? <p className="procurement-error">Request was not saved. Please try again.</p> : null}
            <button className="procurement-submit" disabled={!canSubmit} type="submit">
              <PlusIcon /> Send Request
            </button>
          </form>
        ) : (
          <p className="procurement-owner-note">Read the staff request exactly as written, then mark it Bought or Reject.</p>
        )}
      </VanaraGlassRegion>

      <section className="procurement-section" aria-labelledby="procurement-pending">
        <VanaraSectionHeader
          eyebrow="Pending"
          headingId="procurement-pending"
          meta={`${pending.length} open`}
          title="Pending Requests"
        />
        <div className="procurement-list vc-glass-list">
          {pending.length > 0 ? pending.map((request) => (
            <RequestCard isOwner={isOwner} key={request.id} request={request} />
          )) : <EmptyState>No pending requests</EmptyState>}
        </div>
      </section>

      <section className="procurement-section" aria-labelledby="procurement-closed">
        <VanaraSectionHeader
          eyebrow="Closed"
          headingId="procurement-closed"
          meta={isOwner ? "All closed" : "7 days"}
          title="Recent Closed"
        />
        <div className="procurement-list vc-glass-list">
          {closedRecent.length > 0 ? closedRecent.map((request) => (
            <RequestCard isOwner={isOwner} key={request.id} request={request} />
          )) : <EmptyState>No recent closed requests</EmptyState>}
        </div>
      </section>
    </WorkspaceShell>
  );
}
