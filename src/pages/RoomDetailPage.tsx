import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import { AlertIcon, CheckIcon, HousekeepingIcon, MaintenanceIcon, RefreshIcon, RoomIcon, UserIcon } from "../components/OperationsIcons";
import { loadRoomDetail } from "../services/room-detail.service";
import type { RoomCurrentStay, RoomDetail } from "../types/room-detail";
import "../styles/RoomDetailPage.css";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
  }).format(new Date(date + "T12:00:00+07:00"));
}

function checkoutLabel(room: RoomDetail): string {
  switch (room.checkoutCompletionSource) {
    case "reception":
      return "Checkout confirmed by Reception";
    case "automatic-fallback":
      return "Automatic checkout fallback";
    case "none":
      return "Checkout not completed";
  }
}

function CurrentStay({ stay }: { stay: RoomCurrentStay | null }) {
  if (!stay) {
    return (
      <section className="room-section room-current-stay" aria-label="Current stay">
        <header><UserIcon /><h2>Current Stay</h2></header>
        <div className="room-vacant">Vacant</div>
      </section>
    );
  }

  return (
    <section className="room-section room-current-stay" aria-label="Current stay">
      <header><UserIcon /><h2>Current Stay</h2></header>
      <article className="stay-card">
        <strong>{stay.guestName}</strong>
        <span>{formatDate(stay.arrival)} → {formatDate(stay.departure)}</span>
        <span>{stay.guests} guests</span>
      </article>
    </section>
  );
}

function StatusPanel({ room }: { room: RoomDetail }) {
  return (
    <section className="room-section" aria-label="Operational status">
      <header><CheckIcon /><h2>Operational Status</h2></header>
      <div className="status-grid">
        <div><span>Priority</span><strong>{room.operationalPriority}</strong></div>
        <div><span>Occupancy</span><strong>{room.occupancyStatus}</strong></div>
        <div><span>Housekeeping</span><strong>{room.housekeepingStatus}</strong></div>
        <div><span>Checkout</span><strong>{checkoutLabel(room)}</strong></div>
      </div>
    </section>
  );
}

function ActionsPanel() {
  return (
    <section className="room-section" aria-label="Operational actions">
      <header><HousekeepingIcon /><h2>Actions</h2></header>
      <div className="room-actions">
        <button disabled type="button">Start Cleaning</button>
        <button disabled type="button">Mark Ready</button>
        <button disabled type="button">Checkout Completed</button>
        <button disabled type="button">Report Issue</button>
        <button disabled type="button">View Notes</button>
      </div>
    </section>
  );
}

function MaintenancePanel({ room }: { room: RoomDetail }) {
  return (
    <section className="room-section" aria-label="Maintenance summary">
      <header><MaintenanceIcon /><h2>Maintenance</h2></header>
      <div className="room-placeholder">
        <strong>{room.maintenance.label}</strong>
        <span>{room.maintenance.openIssues} open issues</span>
      </div>
    </section>
  );
}

function TimelinePanel({ room }: { room: RoomDetail }) {
  return (
    <section className="room-section" aria-label="Operational timeline">
      <header><AlertIcon /><h2>Timeline</h2></header>
      <div className="room-placeholder">
        <strong>{room.timeline.label}</strong>
        <span>Future operational history</span>
      </div>
    </section>
  );
}

export default function RoomDetailPage() {
  const { roomId = "" } = useParams();
  const room = useQuery({
    queryKey: ["room-detail", roomId],
    queryFn: ({ signal }) => loadRoomDetail(roomId, signal),
    enabled: roomId.length > 0,
    refetchInterval: 60_000,
  });

  return (
    <main className="room-detail-page">
      {room.isLoading && <PageLoading />}
      {room.isError && !room.data && <PageError onRetry={() => void room.refetch()} />}
      {room.data && (
        <>
          <header className="room-detail-header">
            <div>
              <span>{room.data.accommodationType}</span>
              <h1>{room.data.roomName}</h1>
            </div>
            <button
              aria-label="Refresh room detail"
              className="room-refresh"
              disabled={room.isFetching}
              onClick={() => void room.refetch()}
              type="button"
            >
              <RefreshIcon className={room.isFetching ? "is-spinning" : ""} />
            </button>
          </header>

          <section className="room-badges" aria-label="Room badges">
            <span><RoomIcon />{room.data.occupancyStatus}</span>
            <span><HousekeepingIcon />{room.data.housekeepingStatus}</span>
          </section>

          <CurrentStay stay={room.data.currentStay} />
          <StatusPanel room={room.data} />
          <ActionsPanel />
          <MaintenancePanel room={room.data} />
          <TimelinePanel room={room.data} />
        </>
      )}
    </main>
  );
}