import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, HousekeepingIcon, RefreshIcon } from "../components/OperationsIcons";
import { loadHousekeepingOverview } from "../services/housekeeping.service";
import type { HousekeepingGroup, HousekeepingRoom, HousekeepingWorkflowStatus, OperationalGroupId } from "../types/housekeeping";
import "../styles/HousekeepingPage.css";

function groupTone(group: OperationalGroupId): string {
  switch (group) {
    case "clean-first":
      return "first";
    case "clean-today":
      return "today";
    case "ready":
      return "ready";
    case "occupied":
      return "occupied";
  }
}

function workflowIcon(status: HousekeepingWorkflowStatus): string {
  switch (status) {
    case "To Clean":
      return "⚪";
    case "Cleaning In Progress":
      return "🟡";
    case "Ready":
      return "🟢";
  }
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function checkoutLabel(room: HousekeepingRoom): string {
  switch (room.checkoutCompletionSource) {
    case "reception":
      return "✅ Checkout Confirmed by Reception";
    case "automatic-fallback":
      return "⚠️ Automatic Checkout Fallback";
    case "none":
      return "Checkout completed: No";
  }
}
function RoomCard({ room }: { room: HousekeepingRoom }) {
  return (
    <Link className={"queue-room queue-room--" + groupTone(room.group)} to={`/rooms/${room.unitId}`}>
      <div className="queue-room__head">
        <h3>{room.unitName}</h3>
        <strong>{room.operationalPriority}</strong>
      </div>
      <div className="queue-room__facts" aria-label="Operational room facts">
        <span>{room.occupancyStatus}</span>
        <span>{workflowIcon(room.housekeepingStatus)} {room.housekeepingStatus}</span>
        <span>{checkoutLabel(room)}</span>
        <span>New guest today: {yesNo(room.newGuestToday)}</span>
      </div>
      <div className="queue-room__actions" aria-label="Future housekeeping actions">
        <button disabled type="button">Start Cleaning</button>
        <button disabled type="button">Mark Ready</button>
        <button disabled type="button">Report Issue</button>
      </div>
    </Link>
  );
}

function QueueGroup({ group }: { group: HousekeepingGroup }) {
  return (
    <section className={"queue-group queue-group--" + groupTone(group.id)} aria-labelledby={`group-${group.id}`}>
      <header className="queue-group__header">
        <div>
          <span aria-hidden="true">{group.icon}</span>
          <h2 id={`group-${group.id}`}>{group.title}</h2>
        </div>
        <strong>{group.rooms.length}</strong>
      </header>
      <div className="queue-group__rooms">
        {group.rooms.length > 0
          ? group.rooms.map((room) => <RoomCard key={room.id} room={room} />)
          : <div className="queue-group__empty"><AlertIcon /><p>No rooms</p></div>}
      </div>
    </section>
  );
}

export default function HousekeepingPage() {
  const housekeeping = useQuery({
    queryKey: ["housekeeping-queue"],
    queryFn: ({ signal }) => loadHousekeepingOverview(signal),
    refetchInterval: 60_000,
  });

  return (
    <main className="housekeeping-page">
      <header className="housekeeping-header">
        <div>
          <span>HOUSEKEEPING QUEUE</span>
          <h1>What now?</h1>
          <p>{housekeeping.data ? `${housekeeping.data.summary.cleanFirst} urgent rooms` : "Loading priorities"}</p>
        </div>
        <button
          aria-label="Refresh housekeeping"
          className="housekeeping-refresh"
          disabled={housekeeping.isFetching}
          onClick={() => void housekeeping.refetch()}
          type="button"
        >
          <RefreshIcon className={housekeeping.isFetching ? "is-spinning" : ""} />
          <span>Refresh</span>
        </button>
      </header>

      {housekeeping.data?.capabilities.checkoutCompletionSource === "missing-reception-flag" && (
        <section className="housekeeping-source-note" role="status">
          Waiting for reception checkout confirmation.
        </section>
      )}

      {housekeeping.isLoading && <PageLoading />}
      {housekeeping.isError && !housekeeping.data && <PageError onRetry={() => void housekeeping.refetch()} />}

      {housekeeping.data && housekeeping.data.rooms.length > 0 && (
        <div className="housekeeping-queue" aria-label="Operational housekeeping queue">
          {housekeeping.data.groups.map((group) => <QueueGroup group={group} key={group.id} />)}
        </div>
      )}

      {housekeeping.data && housekeeping.data.rooms.length === 0 && (
        <section className="housekeeping-empty" aria-label="No housekeeping rooms">
          <HousekeepingIcon />
          <h2>No rooms to coordinate</h2>
          <p>Housekeeping will appear here after reception and room updates.</p>
        </section>
      )}
    </main>
  );
}