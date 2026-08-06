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
import { useLanguage } from "../providers/language.context";
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

type Translate = (key: string, options?: Record<string, unknown>) => string;

const homeSections: Array<{ id: HousekeepingV2SectionId; labelKey: string }> = [
  { id: "priority-turnover", labelKey: "priorityTurnover" },
  { id: "normal-cleaning", labelKey: "normalCleaning" },
  { id: "water-refill", labelKey: "waterRefill" },
];

type InterventionType = "cleaning" | "full-cleaning";
type TaskTone = "clean" | "progress" | "warning" | "critical" | "maintenance" | "neutral";

function interventionLabel(type: InterventionType, translate: Translate): string {
  return type === "cleaning" ? translate("cleaning") : translate("fullCleaning");
}

function interventionForCard(card: HousekeepingV2TaskCard): InterventionType | null {
  if (card.taskType === "STANDARD_CLEANING") return "cleaning";
  if (card.taskType === "LINEN_CHANGE") return "full-cleaning";
  return null;
}

function formatDate(value: string | null, language: "en" | "th", translate: Translate): string {
  if (!value) return translate("notScheduled");
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function taskLabel(card: HousekeepingV2TaskCard, translate: Translate): string {
  if (card.taskType === "TURNOVER") return translate("turnover");
  if (card.taskType === "STANDARD_CLEANING") return translate("cleaning");
  if (card.taskType === "LINEN_CHANGE") return translate("fullCleaning");
  if (card.taskType === "WATER_REFILL") return card.waterQuantity ? `${card.waterQuantity} ${card.waterQuantity === 1 ? translate("bottle") : translate("bottles")}` : translate("waterRefill");
  return translate("operationalTask");
}

function formatRoomCount(value: number, translate: Translate): string {
  return `${value} ${value === 1 ? translate("room") : translate("roomPlural")}`;
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

function taskStateDescription(card: HousekeepingV2TaskCard, translate: Translate): string {
  if (card.isBlocked) return card.blockReason ?? translate("taskCannotContinue");
  if (card.taskStatus === "WAITING_FOR_RECEPTION") return translate("receptionNotReleased");
  if (card.taskStatus === "AVAILABLE_FOR_CLAIM") return translate("readyForClaim");
  if (card.taskStatus === "CLAIMED") return card.assignee ? `${translate("assigned")} ${card.assignee}.` : translate("assignedWaitingStart");
  if (card.taskStatus === "IN_PROGRESS") return translate("cleaningInProgress");
  if (card.taskStatus === "CHECKLIST_COMPLETE") return translate("cleaningChecklistComplete");
  if (card.taskStatus === "READY_FOR_INSPECTION") return translate("readyForInspection");
  if (card.taskStatus === "READY") return translate("readyToClose");
  if (card.taskStatus === "COMPLETED") return translate("taskCompleted");
  if (card.taskStatus === "SKIPPED") return translate("taskSkipped");
  if (card.taskStatus === "CANCELLED") return translate("taskCancelled");
  return translate("taskActive");
}

function sectionSummaryItems(sections: HousekeepingV2Section[], translate: Translate): VanaraSummaryItem[] {
  return homeSections.map((item) => {
    const count = sections.find((section) => section.id === item.id)?.cards.length ?? 0;
    return {
      id: item.id,
      label: translate(item.labelKey),
      tone: summaryToneForSection(item.id, count),
      value: count,
      unitLabel: count === 1 ? translate("room") : translate("roomPlural"),
    };
  });
}

function taskDetails(card: HousekeepingV2TaskCard, language: "en" | "th", translate: Translate): VanaraDataGridItem[] {
  return [
    { label: translate("task"), value: taskLabel(card, translate) },
    { label: translate("status"), value: statusLabel(card, translate) },
    { label: translate("priority"), value: card.priority },
    { label: translate("due"), value: formatDate(card.operationalDate, language, translate) },
    { label: translate("assignee"), value: card.assignee ?? translate("unassigned") },
    { label: translate("reason"), value: card.displayReason ?? card.blockReason ?? translate("operationalWork") },
    ...(card.taskType === "WATER_REFILL" ? [{ label: translate("quantity"), value: card.waterQuantity ? `${card.waterQuantity} ${card.waterQuantity === 1 ? translate("bottle") : translate("bottles")}` : translate("waterRefill") }] : []),
  ];
}

function reasonLabel(code: string, translate: Translate): string {
  if (code === "standard_cleaning_previous_day") return translate("wasDueYesterday");
  if (code === "cleaning_due_today") return translate("dueToday");
  if (code === "linen_required") return translate("linen");
  if (code === "linen_override") return translate("override");
  if (code === "waiting_reception") return translate("waitingForCheckout");
  if (code === "maintenance_block") return translate("maintenanceBlock");
  return code;
}

function statusLabel(card: HousekeepingV2TaskCard, translate: Translate): string {
  if (card.taskType === "WATER_REFILL") return waterDeliveryStateLabel(card, translate);
  if (card.isBlocked && card.blockReason) return card.blockReason;
  if (card.taskStatus === "AVAILABLE_FOR_CLAIM") return translate("available");
  if (card.taskStatus === "CLAIMED") return card.assignee ? `${translate("assigned")} ${card.assignee}` : translate("assigned");
  if (card.taskStatus === "IN_PROGRESS") return translate("cleaningInProgress");
  if (card.taskStatus === "CHECKLIST_COMPLETE" || card.taskStatus === "READY_FOR_INSPECTION" || card.taskStatus === "READY") return translate("ready");
  if (card.taskStatus === "COMPLETED") return translate("completed");
  if (card.taskStatus === "SKIPPED") return translate("skipped");
  if (card.taskStatus === "CANCELLED") return translate("cancelled");
  if (card.taskStatus === "BLOCKED") return translate("blocked");
  if (card.taskStatus === "WAITING_FOR_RECEPTION") return translate("waitingForCheckout");
  return translate("active");
}

function waterDeliveryStateLabel(card: HousekeepingV2TaskCard, translate: Translate): string {
  if (card.taskStatus === "COMPLETED" || card.taskStatus === "READY") return translate("delivered");
  if (card.taskStatus === "SKIPPED") return translate("skipped");
  if (card.isBlocked || card.taskStatus === "BLOCKED") return translate("blocked");
  return translate("pending");
}

function completeWaterRefill(action: ReturnType<typeof useOverviewAction>, card: HousekeepingV2TaskCard) {
  action.mutate(completeHousekeepingTask(card.taskId, card.taskVersion, { waterRefillCompleted: true }));
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

function WaterDeliveryControl({
  action,
  card,
  translate,
}: {
  action: ReturnType<typeof useOverviewAction>;
  card: HousekeepingV2TaskCard;
  translate: Translate;
}) {
  const delivered = card.taskStatus === "COMPLETED" || card.taskStatus === "READY";
  const disabled = action.isPending || delivered || !card.capabilities.canComplete;
  const ariaLabel = action.isPending
    ? translate("savingWaterDelivery", { room: card.unitName })
    : delivered
      ? translate("waterDeliveredFor", { room: card.unitName })
      : translate("markWaterDeliveredFor", { room: card.unitName });

  return (
    <button
      aria-label={ariaLabel}
      className={`housekeeping-v2-water-delivery${delivered ? " is-delivered" : ""}`}
      disabled={disabled}
      onClick={() => completeWaterRefill(action, card)}
      type="button"
    >
      <span>{delivered ? translate("delivered") : action.isPending ? translate("saving") : translate("markDelivered")}</span>
    </button>
  );
}

function CardMeta({ card, translate }: { card: HousekeepingV2TaskCard; translate: Translate }) {
  if (card.taskType === "WATER_REFILL") return null;
  const reasonLabels = card.reasonCodes.map((code) => reasonLabel(code, translate)).filter((label) => label !== card.displayReason);
  const details = [
    card.displayReason,
    card.blockReason,
    card.assignee ? `${translate("assigned")} ${card.assignee}` : null,
    ...reasonLabels,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="housekeeping-v2-card__meta">
      {details.map((detail) => <span key={detail}>{detail}</span>)}
    </div>
  );
}

function InterventionSheet({ type, onClose }: { type: InterventionType; onClose: () => void }) {
  const { translate } = useLanguage();
  return (
    <div className="housekeeping-v2-info-sheet" role="dialog" aria-modal="true" aria-labelledby="housekeeping-v2-info-title">
      <VanaraGlassSheet className="housekeeping-v2-info-sheet__panel">
        <VanaraSectionHeader
          eyebrow={translate("intervention")}
          headingId="housekeeping-v2-info-title"
          title={interventionLabel(type, translate)}
        />
        <div className="housekeeping-v2-info-sheet__content">
          <p>{translate("generalRoomCleaning")}</p>
          {type === "full-cleaning" && <p>{translate("replaceBedLinen")}</p>}
          <p>{translate("checkAmenities")}</p>
        </div>
        <button className="vc-secondary-action" onClick={onClose} type="button">{translate("close")}</button>
      </VanaraGlassSheet>
    </div>
  );
}

function TaskActions({ action, card, translate }: { action: ReturnType<typeof useOverviewAction>; card: HousekeepingV2TaskCard; translate: Translate }) {
  const taskId = card.taskId;
  const version = card.taskVersion;
  const completeRegularTask = () => action.mutate(completeHousekeepingTask(
    taskId,
    version,
    card.taskType === "TURNOVER"
      ? { standardCleaningCompleted: true, linenChangeCompleted: true }
      : card.taskType === "LINEN_CHANGE"
        ? { linenChangeCompleted: true }
        : { standardCleaningCompleted: true },
  ));
  const regularFinishLabel = card.taskType === "LINEN_CHANGE" ? translate("finishFullCleaning") : translate("finishCleaning");
  const controls = [
    card.capabilities.canClaim ? (
      <button className="vc-primary-action" disabled={action.isPending} key="claim" onClick={() => action.mutate(claimHousekeepingTask(taskId, version))} type="button">{translate("claim")}</button>
    ) : null,
    card.capabilities.canReleaseClaim ? (
      <button className="vc-secondary-action" disabled={action.isPending} key="release" onClick={() => action.mutate(releaseHousekeepingClaim(taskId, version))} type="button">{translate("release")}</button>
    ) : null,
    card.capabilities.canStart ? (
      <button className="vc-primary-action" disabled={action.isPending} key="start" onClick={() => action.mutate(startHousekeepingTask(taskId, version))} type="button">{translate("start")}</button>
    ) : null,
    card.taskType === "WATER_REFILL" && card.capabilities.canComplete ? (
      <button className="vc-primary-action" disabled={action.isPending} key="water-complete" onClick={() => completeWaterRefill(action, card)} type="button">
        <span>{translate("markDelivered")}</span>
      </button>
    ) : null,
    card.capabilities.canComplete && card.taskType === "STANDARD_CLEANING" ? (
      <button className="vc-primary-action" disabled={action.isPending} key="finish-cleaning" onClick={() => action.mutate(completeHousekeepingTask(taskId, version, { standardCleaningCompleted: true }))} type="button">{translate("finishCleaning")}</button>
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
  const { translate } = useLanguage();
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
        <span>{translate("assignCleaning")}</span>
        <select
          disabled={users.isLoading || mutation.isPending}
          onChange={(event) => setAssignedUserId(event.target.value)}
          value={assignedUserId}
        >
          <option value="">{translate("selectUser")}</option>
          {options.map((user) => (
            <option key={user.id} value={user.id}>{user.displayName}</option>
          ))}
        </select>
      </label>
      <button className="vc-primary-action" disabled={!assignedUserId || users.isLoading || mutation.isPending} type="submit">
        {translate("assignTask")}
      </button>
      {(users.isError || mutation.isError) && <p>{translate("assignmentNotSaved")}</p>}
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
  const { language, translate } = useLanguage();
  const intervention = interventionForCard(card);
  const canReportMaintenance = Boolean(intervention && card.unitId > 0);
  const tone = taskTone(card);
  const assigneeLabel = card.assignee ? `${translate("assigned")} ${card.assignee}` : translate("unassigned");
  const isWaterTask = card.taskType === "WATER_REFILL";

  return (
    <article className={`housekeeping-v2-task-item housekeeping-v2-task-item--${card.priority.toLowerCase()}${card.isBlocked ? " is-blocked" : ""}${expanded ? " is-expanded" : ""}`}>
      <div className={`housekeeping-v2-task-row${isWaterTask ? " housekeeping-v2-task-row--water" : ""}`}>
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
            <button className="housekeeping-v2-intervention" onClick={() => onInterventionInfo(intervention)} type="button">{taskLabel(card, translate)}</button>
          ) : (
            <span>{taskLabel(card, translate)}</span>
          )}
        </div>

        <div className="housekeeping-v2-task-row__state">
          <strong className={`vc-state-${tone}`}>{statusLabel(card, translate)}</strong>
          <span>{assigneeLabel} · {formatDate(card.operationalDate, language, translate)}</span>
        </div>

        {isWaterTask ? <WaterDeliveryControl action={action} card={card} translate={translate} /> : null}

        {!isWaterTask ? (
          <button
            aria-expanded={expanded}
            aria-label={translate(expanded ? "collapseTask" : "openTask", { room: card.unitName })}
            className="housekeeping-v2-task-row__toggle"
            onClick={onToggle}
            type="button"
          >
            <ChevronDownIcon />
          </button>
        ) : null}
      </div>

      {!isWaterTask && expanded && (
        <div className="housekeeping-v2-task-expanded">
          <VanaraGlassSheet className="housekeeping-v2-task-sheet">
            <header className="vc-sheet-identity housekeeping-v2-task-identity">
              <div className="vc-sheet-identity__icon housekeeping-v2-task-identity__icon" aria-hidden="true">
                {card.isBlocked ? <AlertIcon /> : <HousekeepingIcon />}
              </div>
              <div className="vc-sheet-identity__content housekeeping-v2-task-identity__copy">
                <span className="vc-sheet-identity__eyebrow">{taskLabel(card, translate)}</span>
                <strong className="vc-sheet-identity__title">{card.unitName}</strong>
                <p className={`vc-sheet-identity__subtitle vc-state-${tone}`}>{statusLabel(card, translate)}</p>
                <small className="vc-sheet-identity__meta">{formatDate(card.operationalDate, language, translate)}</small>
              </div>
            </header>

            <VanaraGlassRegion
              ariaLabelledBy={`housekeeping-v2-task-state-${card.taskId}`}
              className="housekeeping-v2-task-region"
            >
              <VanaraSectionHeader
                eyebrow={translate("task")}
                headingId={`housekeeping-v2-task-state-${card.taskId}`}
                title={translate("currentState")}
              />
              <div className={`vc-operational-state housekeeping-v2-current-state vc-state-${tone}`}>
                <span className="vc-operational-state__label">{translate("currentState")}</span>
                <strong className="vc-operational-state__value">{statusLabel(card, translate)}</strong>
                <p className="vc-operational-state__description">{taskStateDescription(card, translate)}</p>
              </div>
            </VanaraGlassRegion>

            <VanaraGlassRegion
              ariaLabelledBy={`housekeeping-v2-task-details-${card.taskId}`}
              className="housekeeping-v2-task-region"
            >
              <VanaraSectionHeader
                eyebrow={translate("assignee")}
                headingId={`housekeeping-v2-task-details-${card.taskId}`}
                title={translate("taskDetails")}
              />
              <VanaraDataGrid
                ariaLabel={`${card.unitName} ${translate("taskDetails")}`}
                className="housekeeping-v2-task-data"
                items={taskDetails(card, language, translate)}
              />
              <CardMeta card={card} translate={translate} />
            </VanaraGlassRegion>

            {canReportMaintenance && (
              <VanaraGlassRegion
                ariaLabelledBy={`housekeeping-v2-task-maintenance-${card.taskId}`}
                className="housekeeping-v2-task-region"
              >
                <VanaraSectionHeader
                  eyebrow={translate("maintenance")}
                  headingId={`housekeeping-v2-task-maintenance-${card.taskId}`}
                  title={translate("maintenance")}
                />
                <Link className="housekeeping-v2-report-issue vc-secondary-action" to={`/maintenance/new?roomId=${card.unitId}&source=housekeeping`}>{translate("reportIssue")}</Link>
              </VanaraGlassRegion>
            )}

            <VanaraGlassRegion
              ariaLabelledBy={`housekeeping-v2-task-actions-${card.taskId}`}
              className="housekeeping-v2-task-region"
            >
              <VanaraSectionHeader
                eyebrow={translate("actions")}
                headingId={`housekeeping-v2-task-actions-${card.taskId}`}
                title={translate("actions")}
              />
              <OwnerAssignmentControl card={card} key={`${card.taskId}:${card.taskVersion}:${card.assigneeId ?? ""}`} />
              <TaskActions action={action} card={card} translate={translate} />
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
  const { translate } = useLanguage();
  return (
    <section className="housekeeping-v2-section" aria-labelledby={`housekeeping-v2-${section.id}`}>
      <VanaraSectionHeader
        eyebrow={translate("housekeeping")}
        headingId={`housekeeping-v2-${section.id}`}
        meta={formatRoomCount(section.cards.length, translate)}
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
  const { language, translate } = useLanguage();
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
  const summaryItems = housekeeping.data ? sectionSummaryItems(housekeeping.data.sections, translate) : [];

  return (
    <WorkspaceShell title={translate("housekeeping")} workspace="housekeeping" bodyClassName="housekeeping-v2-page">
      <div className="workspace-body-actions">
        <span>{housekeeping.data ? translate("todayDate", { date: formatDate(housekeeping.data.operationalDate, language, translate) }) : translate("loadingWork")}</span>
        <button
          aria-label={translate("refreshHousekeeping")}
          className="housekeeping-v2-refresh vc-secondary-action"
          disabled={housekeeping.isFetching}
          onClick={() => void housekeeping.refetch()}
          type="button"
        >
          <RefreshIcon className={housekeeping.isFetching ? "is-spinning" : ""} />
          <span>{translate("refresh")}</span>
        </button>
      </div>

      {housekeeping.isLoading && <PageLoading />}
      {housekeeping.isError && !housekeeping.data && <PageError onRetry={() => void housekeeping.refetch()} />}

      {housekeeping.data && (
        <>
          <VanaraSummaryGrid
            activeItemId={activeSection}
            ariaLabel={translate("roomsSummary")}
            className="housekeeping-v2-summary"
            items={summaryItems}
            onItemSelect={(item) => {
              const nextSection = item.id as HousekeepingV2SectionId;
              setExpandedTaskId(null);
              setActiveSection((current) => current === nextSection ? null : nextSection);
            }}
          />

          {expandedSection && (
            <div className="housekeeping-v2-sections" aria-label={translate("housekeepingTaskQueue")}>
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
          {action.isError && <p className="housekeeping-v2-action-error">{translate("taskChangedRefreshing")}</p>}
        </>
      )}
    </WorkspaceShell>
  );
}
