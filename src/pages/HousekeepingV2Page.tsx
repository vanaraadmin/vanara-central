import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, CheckIcon, HousekeepingIcon, MaintenanceIcon, RefreshIcon } from "../components/OperationsIcons";
import WorkspaceShell from "../components/WorkspaceShell";
import { loadHousekeepingV2Overview } from "../services/housekeeping-v2.service";
import type { HousekeepingV2Section, HousekeepingV2TaskCard } from "../types/housekeeping-v2";
import "../styles/HousekeepingV2Page.css";

const summaryLabels = [
  ["awaitingReceptionRelease", "Awaiting release"],
  ["priorityTurnovers", "Priority turnovers"],
  ["normalCleaningDue", "Cleaning due"],
  ["waterRefillDue", "Water refill"],
  ["tasksClaimed", "Claimed"],
  ["tasksInProgress", "In progress"],
  ["blockedRooms", "Blocked"],
  ["completedToday", "Completed"],
  ["procurementAttention", "Procurement"],
] as const;

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const [date, time] = value.split("T");
  return `${formatDate(date ?? null)} ${time?.slice(0, 5) ?? ""}`.trim();
}

function taskLabel(card: HousekeepingV2TaskCard): string {
  if (card.taskType === "TURNOVER") return card.receptionReleaseState === "waiting_for_reception" ? "Waiting for Reception" : "Turnover";
  if (card.taskType === "STANDARD_CLEANING") return card.isOverdue ? "Cleaning overdue" : "Cleaning due";
  if (card.taskType === "WATER_REFILL") return card.waterQuantity ? `${card.waterQuantity} bottles` : "Water refill";
  if (card.unitId === 0) return "Supply requests";
  return "No action required";
}

function statusLabel(card: HousekeepingV2TaskCard): string {
  if (card.isBlocked && card.blockReason) return card.blockReason;
  if (card.taskStatus === "AVAILABLE_FOR_CLAIM") return "Available";
  if (card.taskStatus === "CLAIMED") return `Claimed${card.assignee ? ` by ${card.assignee}` : ""}`;
  if (card.taskStatus === "IN_PROGRESS") return "In progress";
  if (card.taskStatus === "COMPLETED") return "Completed today";
  if (card.taskStatus === "WAITING_FOR_RECEPTION") return "Waiting for Reception release";
  return card.taskStatus ?? "Ready";
}

function CardMeta({ card }: { card: HousekeepingV2TaskCard }) {
  const details = [
    card.guestName,
    card.arrivalDate && `In ${formatDate(card.arrivalDate)}`,
    card.departureDate && `Out ${formatDate(card.departureDate)}`,
    card.nextCheckInAt && `Next ${formatDateTime(card.nextCheckInAt)}`,
    card.alertSummary,
    card.maintenanceSummary,
    card.linenRequired ? "Linen required" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="housekeeping-v2-card__meta">
      {details.map((detail) => <span key={detail}>{detail}</span>)}
    </div>
  );
}

function TaskCard({ card }: { card: HousekeepingV2TaskCard }) {
  const content = (
    <article className={`housekeeping-v2-card housekeeping-v2-card--${card.priority.toLowerCase()}${card.isBlocked ? " is-blocked" : ""}`}>
      <div className="housekeeping-v2-card__top">
        <div>
          <p>{card.roomType}</p>
          <h3>{card.unitName}</h3>
        </div>
        <strong>{taskLabel(card)}</strong>
      </div>

      <div className="housekeeping-v2-card__state">
        {card.isBlocked ? <AlertIcon /> : card.taskType === null ? <CheckIcon /> : <HousekeepingIcon />}
        <span>{statusLabel(card)}</span>
      </div>

      <CardMeta card={card} />

      <div className="housekeeping-v2-card__footer">
        <span>{card.taskId ? `Task #${card.taskId}` : card.bookingId ? `Booking ${card.bookingId}` : "Operational view"}</span>
        {card.capabilities.canOpenRoom && card.unitId > 0 && <span>Room detail coming later</span>}
      </div>
    </article>
  );

  if (!card.capabilities.canOpenRoom || card.unitId === 0) return content;
  return <Link className="housekeeping-v2-card-link" to={`/housekeeping/rooms/${card.unitId}`}>{content}</Link>;
}

function Section({ section }: { section: HousekeepingV2Section }) {
  return (
    <section className="housekeeping-v2-section" aria-labelledby={`housekeeping-v2-${section.id}`}>
      <header className="housekeeping-v2-section__header">
        <div>
          {section.id === "procurement" ? <MaintenanceIcon /> : <HousekeepingIcon />}
          <h2 id={`housekeeping-v2-${section.id}`}>{section.title}</h2>
        </div>
        <span>{section.cards.length}</span>
      </header>

      {section.cards.length > 0 ? (
        <div className="housekeeping-v2-section__cards">
          {section.cards.map((card) => <TaskCard card={card} key={`${section.id}:${card.unitId}:${card.taskId ?? card.bookingId ?? "ready"}`} />)}
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
  const housekeeping = useQuery({
    queryKey: ["housekeeping-v2"],
    queryFn: ({ signal }) => loadHousekeepingV2Overview(undefined, signal),
    refetchInterval: 60_000,
  });

  return (
    <WorkspaceShell title="Housekeeping" workspace="housekeeping" bodyClassName="housekeeping-v2-page">
      <div className="workspace-body-actions">
        <span>{housekeeping.data ? `Operational date ${formatDate(housekeeping.data.operationalDate)}` : "Loading operations"}</span>
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
            {summaryLabels.map(([key, label]) => (
              <div className="housekeeping-v2-summary__item" key={key}>
                <span>{label}</span>
                <strong>{housekeeping.data.summary[key]}</strong>
              </div>
            ))}
          </section>

          <div className="housekeeping-v2-generation" role="status">
            <span>{housekeeping.data.meta.generation.attempted} generation checks</span>
            <span>{housekeeping.data.meta.generation.createdOrReused} tasks created or reused</span>
          </div>

          <div className="housekeeping-v2-sections" aria-label="Housekeeping operational sections">
            {housekeeping.data.sections.map((section) => <Section key={section.id} section={section} />)}
          </div>
        </>
      )}
    </WorkspaceShell>
  );
}
