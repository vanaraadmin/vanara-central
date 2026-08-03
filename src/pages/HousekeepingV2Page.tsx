import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, CheckIcon, HousekeepingIcon, RefreshIcon } from "../components/OperationsIcons";
import WorkspaceShell from "../components/WorkspaceShell";
import {
  assignHousekeepingTask,
  completeHousekeepingTask,
  loadHousekeepingAssignableUsers,
  loadHousekeepingV2Overview,
  startHousekeepingTask,
} from "../services/housekeeping-v2.service";
import type { HousekeepingV2Section, HousekeepingV2SectionId, HousekeepingV2TaskCard } from "../types/housekeeping-v2";
import "../styles/HousekeepingV2Page.css";

const homeSections: Array<{ id: HousekeepingV2SectionId; label: string }> = [
  { id: "priority-turnover", label: "Priority" },
  { id: "normal-cleaning", label: "Normal" },
  { id: "water-refill", label: "Water" },
];

type InterventionType = "cleaning" | "full-cleaning";

function interventionLabel(type: InterventionType): string {
  return type === "cleaning" ? "Cleaning" : "Full Cleaning";
}

function interventionForCard(card: HousekeepingV2TaskCard): InterventionType | null {
  if (card.taskType === "STANDARD_CLEANING" || card.taskType === "ON_DEMAND_CLEANING") return "cleaning";
  if (card.taskType === "LINEN_CHANGE" || card.taskType === "TURNOVER") return "full-cleaning";
  return null;
}

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function taskLabel(card: HousekeepingV2TaskCard): string {
  if (card.taskType === "TURNOVER") return "Turnover";
  if (card.taskType === "STANDARD_CLEANING") return "Cleaning";
  if (card.taskType === "LINEN_CHANGE") return "Full Cleaning";
  if (card.taskType === "ON_DEMAND_CLEANING") return "Cleaning request";
  if (card.taskType === "WATER_REFILL") return card.waterQuantity ? `${card.waterQuantity} bottles` : "Water refill";
  return "Operational task";
}

function formatRoomCount(value: number): string {
  return `${value} ${value === 1 ? "Room" : "Rooms"}`;
}

function reasonLabel(code: string): string {
  if (code === "standard_cleaning_previous_day") return "Was due yesterday";
  if (code === "on_demand_previous_day") return "Was due yesterday";
  if (code === "cleaning_due_today") return "Due today";
  if (code === "on_demand_cleaning") return "On-demand";
  if (code === "linen_required") return "Linen";
  if (code === "linen_override") return "Override";
  if (code === "waiting_reception") return "Waiting for Check-out";
  if (code === "maintenance_block") return "Maintenance Block";
  return code;
}

function statusLabel(card: HousekeepingV2TaskCard): string {
  if (card.isBlocked && card.blockReason) return card.blockReason;
  if (card.taskStatus === "AVAILABLE_FOR_CLAIM") return "Available";
  if (card.taskStatus === "CLAIMED") return card.assignee ? `Assigned to ${card.assignee}` : "Assigned";
  if (card.taskStatus === "IN_PROGRESS") return "In progress";
  if (card.taskStatus === "CHECKLIST_COMPLETE" || card.taskStatus === "READY_FOR_INSPECTION" || card.taskStatus === "READY") return "Ready";
  if (card.taskStatus === "COMPLETED") return "Completed";
  if (card.taskStatus === "SKIPPED") return "Skipped";
  if (card.taskStatus === "CANCELLED") return "Cancelled";
  if (card.taskStatus === "BLOCKED") return "Blocked";
  if (card.taskStatus === "WAITING_FOR_RECEPTION") return "Waiting for Check-out";
  return "Active";
}

function useOverviewAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (next: Promise<unknown>) => next,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["housekeeping-v2"] });
    },
  });
}

function CardMeta({ card }: { card: HousekeepingV2TaskCard }) {
  if (card.taskType === "WATER_REFILL") return null;
  const reasonLabels = card.reasonCodes.map(reasonLabel).filter((label) => label !== card.displayReason);
  const details = [
    card.displayReason,
    card.blockReason,
    card.assignee ? `Assigned to ${card.assignee}` : null,
    ...reasonLabels,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="housekeeping-v2-card__meta">
      {details.map((detail) => <span key={detail}>{detail}</span>)}
    </div>
  );
}

function InterventionSheet({ type, onClose }: { type: InterventionType; onClose: () => void }) {
  return (
    <div className="housekeeping-v2-info-sheet" role="dialog" aria-modal="true" aria-labelledby="housekeeping-v2-info-title">
      <div>
        <header>
          <h2 id="housekeeping-v2-info-title">{interventionLabel(type)}</h2>
          <button onClick={onClose} type="button">Close</button>
        </header>
        <p>General room cleaning.</p>
        {type === "full-cleaning" && <p>Replace bed linen.</p>}
        <p>Please also check room amenities before completion.</p>
      </div>
    </div>
  );
}

function TaskActions({ action, card }: { action: ReturnType<typeof useOverviewAction>; card: HousekeepingV2TaskCard }) {
  const taskId = card.taskId;
  const version = card.taskVersion;
  const completeWater = () => action.mutate(completeHousekeepingTask(taskId, version, { waterRefillCompleted: true }));
  const completeRegularTask = () => action.mutate(completeHousekeepingTask(taskId, version, card.taskType === "LINEN_CHANGE" || card.taskType === "TURNOVER" ? { linenChangeCompleted: true } : { standardCleaningCompleted: true }));
  const regularFinishLabel = card.taskType === "LINEN_CHANGE" || card.taskType === "TURNOVER" ? "Finish Full Cleaning" : "Finish Cleaning";

  if (card.taskType === "WATER_REFILL") {
    return (
      <div className="housekeeping-v2-card__actions" aria-label={`Actions for ${card.unitName}`}>
        {card.capabilities.canComplete && (
          <button disabled={action.isPending} onClick={completeWater} type="button">
            <CheckIcon />
            <span>Complete</span>
          </button>
        )}
      </div>
    );
  }

  if (card.capabilities.canStart) {
    return (
      <div className="housekeeping-v2-card__actions" aria-label={`Actions for ${card.unitName}`}>
        <button disabled={action.isPending} onClick={() => action.mutate(startHousekeepingTask(taskId, version))} type="button">Start</button>
      </div>
    );
  }

  if (card.capabilities.canComplete && card.taskType === "ON_DEMAND_CLEANING") {
    return (
      <div className="housekeeping-v2-card__actions" aria-label={`Actions for ${card.unitName}`}>
        <button disabled={action.isPending} onClick={() => action.mutate(completeHousekeepingTask(taskId, version, { standardCleaningCompleted: true, linenChangeCompleted: false }))} type="button">Finish Cleaning</button>
        <button disabled={action.isPending} onClick={() => action.mutate(completeHousekeepingTask(taskId, version, { standardCleaningCompleted: true, linenChangeCompleted: true }))} type="button">Finish Full Cleaning</button>
      </div>
    );
  }

  if (card.capabilities.canComplete && card.taskType === "STANDARD_CLEANING") {
    return (
      <div className="housekeeping-v2-card__actions" aria-label={`Actions for ${card.unitName}`}>
        <button disabled={action.isPending} onClick={() => action.mutate(completeHousekeepingTask(taskId, version, { standardCleaningCompleted: true, linenChangeCompleted: false }))} type="button">Finish Cleaning</button>
        <button disabled={action.isPending} onClick={() => action.mutate(completeHousekeepingTask(taskId, version, { standardCleaningCompleted: true, linenChangeCompleted: true }))} type="button">Finish Full Cleaning</button>
      </div>
    );
  }

  if (card.capabilities.canComplete) {
    return (
      <div className="housekeeping-v2-card__actions" aria-label={`Actions for ${card.unitName}`}>
        <button disabled={action.isPending} onClick={completeRegularTask} type="button">{regularFinishLabel}</button>
      </div>
    );
  }

  return null;
}

function OwnerAssignmentControl({ card }: { card: HousekeepingV2TaskCard }) {
  const queryClient = useQueryClient();
  const [assignedUserId, setAssignedUserId] = useState(card.assigneeId ?? "");
  const users = useQuery({
    queryKey: ["housekeeping", "assignable-users"],
    queryFn: ({ signal }) => loadHousekeepingAssignableUsers(signal),
    enabled: card.capabilities.canReassign,
  });
  const mutation = useMutation({
    mutationFn: () => assignHousekeepingTask(card.taskId, card.taskVersion, assignedUserId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["housekeeping-v2"] });
    },
  });

  if (!card.capabilities.canReassign) return null;

  const options = users.data ?? [];
  return (
    <form
      className="housekeeping-v2-assignment"
      onSubmit={(event) => {
        event.preventDefault();
        if (!assignedUserId || mutation.isPending) return;
        mutation.mutate();
      }}
    >
      <label>
        <span>Assign Cleaning</span>
        <select
          disabled={users.isLoading || mutation.isPending}
          onChange={(event) => setAssignedUserId(event.target.value)}
          value={assignedUserId}
        >
          <option value="">Select user</option>
          {options.map((user) => (
            <option key={user.id} value={user.id}>{user.displayName}</option>
          ))}
        </select>
      </label>
      <button disabled={!assignedUserId || users.isLoading || mutation.isPending} type="submit">
        Assign Task
      </button>
      {(users.isError || mutation.isError) && <p>Assignment not saved.</p>}
    </form>
  );
}

function TaskCard({ action, card, onInterventionInfo }: { action: ReturnType<typeof useOverviewAction>; card: HousekeepingV2TaskCard; onInterventionInfo: (type: InterventionType) => void }) {
  const intervention = interventionForCard(card);
  const canReportMaintenance = Boolean(intervention && card.unitId > 0);
  return (
    <article className={`housekeeping-v2-card housekeeping-v2-card--${card.priority.toLowerCase()}${card.isBlocked ? " is-blocked" : ""}`}>
      <div className="housekeeping-v2-card__top">
        <div>
          {card.capabilities.canOpenRoom && card.unitId > 0 ? (
            <h3><Link className="housekeeping-v2-room-link" to={`/rooms/${card.unitId}?taskId=${card.taskId}`}>{card.unitName}</Link></h3>
          ) : (
            <h3>{card.unitName}</h3>
          )}
        </div>
        {intervention ? (
          <button className="housekeeping-v2-intervention" onClick={() => onInterventionInfo(intervention)} type="button">{taskLabel(card)}</button>
        ) : (
          <strong>{taskLabel(card)}</strong>
        )}
      </div>

      {card.taskType !== "WATER_REFILL" && (
        <div className="housekeeping-v2-card__state">
          {card.isBlocked ? <AlertIcon /> : <HousekeepingIcon />}
          <span>{statusLabel(card)}</span>
        </div>
      )}

      <CardMeta card={card} />
      {canReportMaintenance && (
        <Link className="housekeeping-v2-report-issue" to={`/maintenance/new?roomId=${card.unitId}&source=housekeeping`}>Report Issue</Link>
      )}
      <OwnerAssignmentControl card={card} key={`${card.taskId}:${card.taskVersion}:${card.assigneeId ?? ""}`} />
      <TaskActions action={action} card={card} />
    </article>
  );
}

function Section({ action, onInterventionInfo, section }: { action: ReturnType<typeof useOverviewAction>; onInterventionInfo: (type: InterventionType) => void; section: HousekeepingV2Section }) {
  return (
    <section className="housekeeping-v2-section" aria-labelledby={`housekeeping-v2-${section.id}`}>
      <header className="housekeeping-v2-section__header">
        <div>
          {section.id === "water-refill" ? <RefreshIcon /> : <HousekeepingIcon />}
          <h2 id={`housekeeping-v2-${section.id}`}>{section.title}</h2>
        </div>
        <span>{formatRoomCount(section.cards.length)}</span>
      </header>

      {section.cards.length > 0 ? (
        <div className="housekeeping-v2-section__cards">
          {section.cards.map((card) => <TaskCard action={action} card={card} key={`${section.id}:${card.taskId}`} onInterventionInfo={onInterventionInfo} />)}
        </div>
      ) : (
        <div className="housekeeping-v2-empty">
          <CheckIcon />
          <p>{section.emptyLabel}</p>
        </div>
      )}
    </section>
  );
}

export default function HousekeepingV2Page() {
  const [activeSection, setActiveSection] = useState<HousekeepingV2SectionId | null>(null);
  const [infoSheet, setInfoSheet] = useState<InterventionType | null>(null);
  const action = useOverviewAction();
  const housekeeping = useQuery({
    queryKey: ["housekeeping-v2"],
    queryFn: ({ signal }) => loadHousekeepingV2Overview(undefined, signal),
    refetchInterval: 60_000,
  });
  const expandedSection = housekeeping.data?.sections.find((section) => section.id === activeSection) ?? null;

  return (
    <WorkspaceShell title="Housekeeping" workspace="housekeeping" bodyClassName="housekeeping-v2-page">
      <div className="workspace-body-actions">
        <span>{housekeeping.data ? `Today ${formatDate(housekeeping.data.operationalDate)}` : "Loading work"}</span>
        <button
          aria-label="Refresh housekeeping operations"
          className="housekeeping-v2-refresh"
          disabled={housekeeping.isFetching}
          onClick={() => void housekeeping.refetch()}
          type="button"
        >
          <RefreshIcon className={housekeeping.isFetching ? "is-spinning" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {housekeeping.isLoading && <PageLoading />}
      {housekeeping.isError && !housekeeping.data && <PageError onRetry={() => void housekeeping.refetch()} />}

      {housekeeping.data && (
        <>
          <section className="housekeeping-v2-summary" aria-label="Housekeeping operational summary">
            {homeSections.map((item) => (
              <button
                aria-expanded={activeSection === item.id}
                className={`housekeeping-v2-summary__item${activeSection === item.id ? " is-active" : ""}`}
                key={item.id}
                onClick={() => setActiveSection((current) => current === item.id ? null : item.id)}
                type="button"
              >
                <span>{item.label}</span>
                <strong>{formatRoomCount(housekeeping.data.sections.find((section) => section.id === item.id)?.cards.length ?? 0)}</strong>
              </button>
            ))}
          </section>

          {expandedSection && (
            <div className="housekeeping-v2-sections" aria-label="Housekeeping task queue">
              <Section action={action} onInterventionInfo={setInfoSheet} section={expandedSection} />
            </div>
          )}

          {infoSheet && <InterventionSheet onClose={() => setInfoSheet(null)} type={infoSheet} />}
          {action.isError && <p className="housekeeping-v2-action-error">This task changed. The list is refreshing.</p>}
        </>
      )}
    </WorkspaceShell>
  );
}
