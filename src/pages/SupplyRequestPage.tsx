import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { createProcurementRequest, loadProcurementItems } from "../services/procurement.service";
import "../styles/ProcurementPage.css";

export default function SupplyRequestPage({ embedded = false }: { embedded?: boolean }) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [customItemText, setCustomItemText] = useState("");
  const [note, setNote] = useState("");
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const itemsQuery = useQuery({ queryKey: ["procurement", "items"], queryFn: ({ signal }) => loadProcurementItems(signal) });
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const mutation = useMutation({
    mutationFn: () => createProcurementRequest({ itemIds: [...selected], customItemText: customItemText || null, note: note || null }),
    onSuccess: (request) => {
      setSubmittedId(request.id);
      setSelected(new Set());
      setCustomItemText("");
      setNote("");
    },
  });
  const canSubmit = selected.size > 0 || customItemText.trim().length > 0;

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || mutation.isPending || submittedId) return;
    mutation.mutate();
  }

  if (itemsQuery.isLoading) {
    return embedded ? <PageLoading /> : <WorkspaceShell title="Procurement" workspace="procurement"><PageLoading /></WorkspaceShell>;
  }
  if (itemsQuery.isError) {
    const errorState = <PageError onRetry={() => void itemsQuery.refetch()} />;
    return embedded ? errorState : <WorkspaceShell title="Procurement" workspace="procurement">{errorState}</WorkspaceShell>;
  }

  const content = (
    <>
      <div className="workspace-body-actions">
        <span>Tell the owners in about 15 seconds.</span>
        {!embedded && <Link to="/procurement">Back</Link>}
      </div>

      {submittedId ? (
        <section className="supply-success">
          <span aria-hidden="true">✓</span>
          <h2>Sent to the owners</h2>
          <p>Your supply request has been saved.</p>
          <Link to="/dashboard">Done</Link>
        </section>
      ) : (
        <form className="supply-form" onSubmit={submit}>
          <section className="supply-items" aria-label="Supply catalogue">
            {items.map((item) => (
              <button key={item.id} className={selected.has(item.id) ? "is-selected" : ""} type="button" onClick={() => toggle(item.id)}>
                <span aria-hidden="true">{selected.has(item.id) ? "✓" : "+"}</span>
                <strong>{item.nameEn}</strong>
                <small>{item.category}</small>
              </button>
            ))}
          </section>
          <label className="supply-field"><span>Other item</span><input value={customItemText} onChange={(event) => setCustomItemText(event.target.value)} placeholder="Something not listed" maxLength={240} /></label>
          <label className="supply-field"><span>Note optional</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Short note for the owners" rows={3} maxLength={500} /></label>
          {mutation.isError && <p className="supply-error">Request was not saved. Please try again.</p>}
          <button className="supply-submit" type="submit" disabled={!canSubmit || mutation.isPending}>{mutation.isPending ? "Sending…" : "Tell the owners"}</button>
        </form>
      )}
    </>
  );

  if (embedded) {
    return <div className="procurement-page">{content}</div>;
  }

  return (
    <WorkspaceShell title="Procurement" workspace="procurement" bodyClassName="procurement-page">
      {content}
    </WorkspaceShell>
  );
}
