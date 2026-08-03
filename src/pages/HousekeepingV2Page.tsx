import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, CheckIcon, ChevronDownIcon, HousekeepingIcon, RefreshIcon } from "../components/OperationsIcons";
import VanaraDataGrid, { type VanaraDataGridItem } from "../components/vanara/VanaraDataGrid";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraGlassSheet from "../components/vanara/VanaraGlassSheet";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import VanaraSummaryGrid, { type VanaraSummaryItem } from "../components/vanara/VanaraSummaryGrid";
import WorkspaceShell from "../components/WorkspaceShell";
import {
  assignHousekeepingTask,
  claimHousekeepingTask,
  completeHousekeepingTask,
  loadHousekeepingAssignableUsers,
  loadHousekeepingV2Overview,
  releaseHousekeepingClaim,
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
type TaskTone = "clean" | "progress" | "warning" | "critical" | "maintenance" | "neutral";

function interventionLabel(type: InterventionType): string {
  return type === "cleaning" ? "Cleaning" : "Full Cleaning";
}

function interventionForCard(card: HousekeepingV2TaskCard): InterventionType | null {
  if (card.taskType === "STANDARD_CLEANING") return "cleaning";
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
  if (card.taskType === "WATER_REFILL") return card.waterQuantity ? `${card.waterQuantity} bottles` : "Water refill";
  return "Operational task";
}

function formatRoomCount(value: number): string {
  return `${value} ${value === 1 ? "Room" : "Rooms"}`;
}

function summaryToneForSection(sectionId: HousekeepingV2SectionId, count: number): VanaraSummaryItem["tone"] {
  if (count === 0) return "clean";
  if (sectionId === "priority-turnover") return "critical";
  if (sectionId === "water-refill") return "progress";
  return "warning";
}

function taskTone(card: HousekeepingV2TaskCard): TaskTone {
  if (card.isBlocked || card.taskStatus === "BLOCKED") return card.reasonCodes.includes("maintenance_block") ? "maintenance" : "critical";
  if (card.taskStatus === "IN_PROGRESS" || card.taskStatus === "CHECKLIST_COMPLETE" || card.taskStatus === "READY_FOR_INSPECTION") return "progress";
  if (card.taskStatus === "COMPLETED" || card.taskStatus === "READY") return "clean";
  if (card.taskStatus === "WAITING_FOR_RECEPTION" || card.priority === "URGENT" || card.priority === "HIGH") return "warning";
  return "neutral";
}

function taskStateDescription(card: HousekeepingV2TaskCard): string {
  if (card.isBlocked) return card.blockReason ?? "Task cannot continue yet.";
  if (card.taskStatus === "WAITING_FOR_RECEPTION") return "Reception has not released this room.";
  if (card.taskStatus === "AVAILABLE_FOR_CLAIM") return "Ready for an operator to claim.";
  if (card.taskStatus === "CLAIMED") return card.assignee ? `Assigned to ${card.assignee}.` : "Assigned and waiting to start.";
  if (card.taskStatus === "IN_PROGRESS") return "Work is currently in progress.";
  if (card.taskStatus === "CHECKLIST_COMPLETE") return "Cleaning checklist has been completed.";
  if (card.taskStatus === "READY_FOR_INSPECTION") return "Ready for inspection.";
  if (card.taskStatus === "READY") return "Ready to close.";
  if (card.taskStatus === "COMPLETED") return "Task completed.";
  if (card.taskStatus === "SKIPPED") return "Task skipped.";
  if (card.taskStatus === "CANCELLED") return "Task cancelled.";
  return "Task is active.";
}

function sectionSummaryItems(sections: HousekeepingV2Section[]): VanaraSummaryItem[] {
  return homeSections.map((item) => {
    const count = sections.find((section) => section.id === item.id)?.cards.length ?? 0;
    return {
      id: item.id,
      label: item.label,
      tone: summaryToneForSection(item.id, count),
      value: formatRoomCount(count),
    };
  });
}

function taskDetails(card: HousekeepingV2TaskCard): VanaraDataGridItem[] {
  return [
    { label: "Task", value: taskLabel(card) },
    { label: "Status", value: statusLabel(card) },
    { label: "Priority", value: card.priority },
    { label: "Due", value: formatDate(card.operationalDate) },
    { label: "Assignee", value: card.assignee ?? "Unassigned" },
    { label: "Reason", value: card.displayReason ?? card.blockReason ?? "Operational work" },
    ...(card.taskType === "WATER_REFILL" ? [{ label: "Quantity", value: card.waterQuantity ? `${card.waterQuantity} bottles` : "Water refill" }] : []),
  ];
}

function reasonLabel(code: string): string {
  if (code === "standard_cleaning_previous_day") return "Was due yesterday";
  if (code === "cleaning_due_today") return "Due today";
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
      <VanaraGlassSheet className="housekeeping-v2-info-sheet__panel">
        <VanaraSectionHeader
          eyebrow="Intervention"
          headingId="housekeeping-v2-info-title"
          title={interventionLabel(type)}
        />
        <div className="housekeeping-v2-info-sheet__content">
          <p>General room cleaning.</p>
          {type === "full-cleaning" && <p>Replace bed linen.</p>}
          <p>Please also check room amenities before completion.</p>
        </div>
        <button className="vc-secondary-action" onClick={onClose} type="button">Close</button>
      </VanaraGlassSheet>
    </div>
  );
}

function TaskActions({ action, card }: { action: ReturnType<typeof useOverviewAction>; card: HousekeepingV2TaskCard }) {
  const taskId = card.taskId;
  const version = card.taskVersion;
  const completeWater = () => action.mutate(completeHousekeepingTask(taskId, version, { waterRefillCompleted: true }));
  const completeRegularTask = () => action.mutate(completeHousekeepingTask(taskId, version, card.taskType === "LINEN_CHANGE" || card.taskType === "TURNOVER" ? { linenChangeCompleted: true } : { standardCleaningCompleted: true }));
  const regularFinishLabel = card.taskType === "LINEN_CHANGE" || card.taskType === "TURNOVER" ? "Finish Full Cleaning" : "Finish Cleaning";
  const controls = [
    card.capabilities.canClaim ? (
      <button className="vc-primary-action" disabled={action.isPending} key="claim" onClick={() => action.mutate(claimHousekeepingTask(taskId, version))} type="button">Claim</button>
    ) : null,
    card.capabilities.canReleaseClaim ? (
      <button className="vc-secondary-action" disabled={action.isPending} key="release" onClick={() => action.mutate(releaseHousekeepingClaim(taskId, version))} type="button">Release</button>
    ) : null,
    card.capabilities.canStart ? (
      <button className="vc-primary-action" disabled={action.isPending} key="start" onClick={() => action.mutate(startHousekeepingTask(taskId, version))} type="button">Start</button>
    ) : null,
    card.taskType === "WATER_REFILL" && card.capabilities.canComplete ? (
      <button className="vc-primary-action" disabled={action.isPending} key="water-complete" onClick={completeWater} type="button">
        <CheckIcon />
        <span>Complete</span>
      </button>
    ) : null,
    card.capabilities.canComplete && card.taskType === "STANDARD_CLEANING" ? (
      <button className="vc-primary-action" disabled={action.isPending} key="finish-cleaning" onClick={() => action.mutate(completeHousekeepingTask(taskId, version, { standardCleaningCompleted: true, linenChangeCompleted: false }))} type="button">Finish Cleaning</button>
    ) : null,
    card.capabilities.canComplete && card.taskType === "STANDARD_CLEANING" ? (
      <button className="vc-secondary-action" disabled={action.isPending} key="finish-full-cleaning" onClick={() => action.mutate(completeHousekeepingTask(taskId, version, { standardCleaningCompleted: true, linenChangeCompleted: true }))} type="button">Finish Full Cleaning</button>
    ) : null,
    card.capabilities.canComplete && card.taskType !== "STANDARD_CLEANING" && card.taskType !== "WATER_REFILL" ? (
      <button className="vc-primary-action" disabled={action.isPending} key="finish-regular" onClick={completeRegularTask} type="button">{regularFinishLabel}</button>
    ) : null,
  ].filter(Boolean);

  return controls.length > 0 ? (
    <div className="housekeeping-v2-card__actions" aria-label={`Actions for ${card.unitName}`}>
      {controls}
    </div>
  ) : null;
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
      <button className="vc-primary-action" disabled={!assignedUserId || users.isLoading || mutation.isPending} type="submit">
        Assign Task
      </button>
      {(users.isError || mutation.isError) && <p>Assignment not saved.</p>}
    </form>
  );
}

function TaskCard({
  action,
  card,
  expanded,
  onInterventionInfo,
  onToggle,
}: {
  action: ReturnType<typeof useOverviewAction>;
  card: HousekeepingV2TaskCard;
  expanded: boolean;
  onInterventionInfo: (type: InterventionType) => void;
  onToggle: () => void;
}) {
  const intervention = interventionForCard(card);
  const canReportMaintenance = Boolean(intervention && card.unitId > 0);
  const tone = taskTone(card);
  const assigneeLabel = card.assignee ? `Assigned ${card.assignee}` : "Unassigned";

  return (
    <article className={`housekeeping-v2-task-item housekeeping-v2-task-item--${card.priority.toLowerCase()}${card.isBlocked ? " is-blocked" : ""}${expanded ? " is-expanded" : ""}`}>
      <div className="housekeeping-v2-task-row">
        <div className="housekeeping-v2-task-row__mark" aria-hidden="true">
          {card.isBlocked ? <AlertIcon /> : <HousekeepingIcon />}
        </div>

        <div className="housekeeping-v2-task-row__identity">
          {card.capabilities.canOpenRoom && card.unitId > 0 ? (
            <Link className="housekeeping-v2-room-link" to={`/rooms/${card.unitId}?taskId=${card.taskId}`}>{card.unitName}</Link>
          ) : (
            <strong>{card.unitName}</strong>
          )}
          {intervention ? (
            <button className="housekeeping-v2-intervention" onClick={() => onInterventionInfo(intervention)} type="button">{taskLabel(card)}</button>
          ) : (
            <span>{taskLabel(card)}</span>
          )}
        </div>

        <div className="housekeeping-v2-task-row__state">
          <strong className={`vc-state-${tone}`}>{statusLabel(card)}</strong>
          <span>{assigneeLabel} · {formatDate(card.operationalDate)}</span>
        </div>

        <button
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Open"} ${card.unitName} task`}
          className="housekeeping-v2-task-row__toggle"
          onClick={onToggle}
          type="button"
        >
          <ChevronDownIcon />
        </button>
      </div>

      {expanded && (
        <div className="housekeeping-v2-task-expanded">
          <VanaraGlassSheet className="housekeeping-v2-task-sheet">
            <header className="housekeeping-v2-task-identity">
              <div className="housekeeping-v2-task-identity__icon" aria-hidden="true">
                {card.isBlocked ? <AlertIcon /> : <HousekeepingIcon />}
              </div>
              <div className="housekeeping-v2-task-identity__copy">
                <span>{taskLabel(card)}</span>
                <strong>{card.unitName}</strong>
                <p className={`vc-state-${tone}`}>{statusLabel(card)}</p>
                <small>{formatDate(card.operationalDate)}</small>
              </div>
            </header>

            <VanaraGlassRegion
              ariaLabelledBy={`housekeeping-v2-task-state-${card.taskId}`}
              className="housekeeping-v2-task-region"
            >
              <VanaraSectionHeader
                eyebrow="Task"
                headingId={`housekeeping-v2-task-state-${card.taskId}`}
                title="Current State"
              />
              <div className={`housekeeping-v2-current-state housekeeping-v2-current-state--${tone}`}>
                <span>Current state</span>
                <strong>{statusLabel(card)}</strong>
                <p>{taskStateDescription(card)}</p>
              </div>
            </VanaraGlassRegion>

            <VanaraGlassRegion
              ariaLabelledBy={`housekeeping-v2-task-details-${card.taskId}`}
              className="housekeeping-v2-task-region"
            >
              <VanaraSectionHeader
                eyebrow="Assignment"
                headingId={`housekeeping-v2-task-details-${card.taskId}`}
                title="Task Details"
              />
              <VanaraDataGrid
                ariaLabel={`${card.unitName} task details`}
                className="housekeeping-v2-task-data"
                items={taskDetails(card)}
              />
              <CardMeta card={card} />
            </VanaraGlassRegion>

            {canReportMaintenance && (
              <VanaraGlassRegion
                ariaLabelledBy={`housekeeping-v2-task-maintenance-${card.taskId}`}
                className="housekeeping-v2-task-region"
              >
                <VanaraSectionHeader
                  eyebrow="Maintenance"
                  headingId={`housekeeping-v2-task-maintenance-${card.taskId}`}
                  title="Maintenance"
                />
                <Link className="housekeeping-v2-report-issue vc-secondary-action" to={`/maintenance/new?roomId=${card.unitId}&source=housekeeping`}>Report Issue</Link>
              </VanaraGlassRegion>
            )}

            <VanaraGlassRegion
              ariaLabelledBy={`housekeeping-v2-task-actions-${card.taskId}`}
              className="housekeeping-v2-task-region"
            >
              <VanaraSectionHeader
                eyebrow="Actions"
                headingId={`housekeeping-v2-task-actions-${card.taskId}`}
                title="Actions"
              />
              <OwnerAssignmentControl card={card} key={`${card.taskId}:${card.taskVersion}:${card.assigneeId ?? ""}`} />
              <TaskActions action={action} card={card} />
            </VanaraGlassRegion>
          </VanaraGlassSheet>
        </div>
      )}
    </article>
  );
}

function Section({
  action,
  expandedTaskId,
  onInterventionInfo,
  onTaskToggle,
  section,
}: {
  action: ReturnType<typeof useOverviewAction>;
  expandedTaskId: number | null;
  onInterventionInfo: (type: InterventionType) => void;
  onTaskToggle: (taskId: number) => void;
  section: HousekeepingV2Section;
}) {
  return (
    <section className="housekeeping-v2-section" aria-labelledby={`housekeeping-v2-${section.id}`}>
      <VanaraSectionHeader
        eyebrow="Housekeeping"
        headingId={`housekeeping-v2-${section.id}`}
        meta={formatRoomCount(section.cards.length)}
        title={section.title}
      />

      <div className="housekeeping-v2-section__list vc-glass-surface">
        {section.cards.length > 0 ? (
          section.cards.map((card) => (
            <TaskCard
              action={action}
              card={card}
              expanded={expandedTaskId === card.taskId}
              key={`${section.id}:${card.taskId}`}
              onInterventionInfo={onInterventionInfo}
              onToggle={() => onTaskToggle(card.taskId)}
            />
          ))
        ) : (
          <div className="housekeeping-v2-empty">
            <CheckIcon />
            <p>{section.emptyLabel}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function HousekeepingV2Page() {
  const [activeSection, setActiveSection] = useState<HousekeepingV2SectionId | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [infoSheet, setInfoSheet] = useState<InterventionType | null>(null);
  const action = useOverviewAction();
  const housekeeping = useQuery({
    queryKey: ["housekeeping-v2"],
    queryFn: ({ signal }) => loadHousekeepingV2Overview(undefined, signal),
    refetchInterval: 60_000,
  });
  const expandedSection = housekeeping.data?.sections.find((section) => section.id === activeSection) ?? null;
  const summaryItems = housekeeping.data ? sectionSummaryItems(housekeeping.data.sections) : [];

  return (
    <WorkspaceShell title="Housekeeping" workspace="housekeeping" bodyClassName="housekeeping-v2-page">
      <div className="workspace-body-actions">
        <span>{housekeeping.data ? `Today ${formatDate(housekeeping.data.operationalDate)}` : "Loading work"}</span>
        <button
          aria-label="Refresh housekeeping operations"
          className="housekeeping-v2-refresh vc-secondary-action"
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
          <VanaraSummaryGrid
            activeItemId={activeSection}
            ariaLabel="Housekeeping operational summary"
            className="housekeeping-v2-summary"
            items={summaryItems}
            onItemSelect={(item) => {
              const nextSection = item.id as HousekeepingV2SectionId;
              setExpandedTaskId(null);
              setActiveSection((current) => current === nextSection ? null : nextSection);
            }}
          />

          {expandedSection && (
            <div className="housekeeping-v2-sections" aria-label="Housekeeping task queue">
              <Section
                action={action}
                expandedTaskId={expandedTaskId}
                onInterventionInfo={setInfoSheet}
                onTaskToggle={(taskId) => setExpandedTaskId((current) => current === taskId ? null : taskId)}
                section={expandedSection}
              />
            </div>
          )}

          {infoSheet && <InterventionSheet onClose={() => setInfoSheet(null)} type={infoSheet} />}
          {action.isError && <p className="housekeeping-v2-action-error">This task changed. The list is refreshing.</p>}
        </>
      )}
    </WorkspaceShell>
  );
}
