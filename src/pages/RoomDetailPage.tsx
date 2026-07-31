import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import warningIcon from "../assets/img/warning-circle-light.svg";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { AskIcon, CalendarIcon, CheckIcon, CheckInIcon, HousekeepingIcon, MaintenanceIcon, PlusIcon, RefreshIcon, RoomIcon, UserIcon } from "../components/OperationsIcons";
import { addRoomNote, createRoomMaintenanceTicket, loadRoomDetail, resolveReceptionRoomAlert, updateRoomHousekeeping } from "../services/room-detail.service";
import type { MaintenanceCategory, MaintenancePriority } from "../types/maintenance";
import type { RoomCurrentStay, RoomDetail, RoomHousekeepingStatus, RoomTimelineEvent } from "../types/room-detail";
import "../styles/RoomDetailPage.css";

const HOUSEKEEPING_STATUSES: RoomHousekeepingStatus[] = ["Dirty", "Cleaning", "Ready"];
const MAINTENANCE_CATEGORIES: MaintenanceCategory[] = ["Electrical", "Air Conditioning", "Water", "Furniture", "Bathroom", "Garden", "Cleaning Equipment", "Internet / Network", "Appliance", "Other"];
const MAINTENANCE_PRIORITIES: MaintenancePriority[] = ["Low", "Medium", "High", "Critical"];

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
  }).format(new Date(date + "T12:00:00+07:00"));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function statusTone(value: string): string {
  return value.toLowerCase().replaceAll(" ", "-");
}

function CurrentStay({ stay }: { stay: RoomCurrentStay | null }) {
  if (!stay) {
    return (
      <section className="room-section room-current-stay" aria-label="Guest information">
        <header><UserIcon /><h2>Guest Information</h2></header>
        <div className="room-empty-state">Vacant</div>
      </section>
    );
  }

  return (
    <section className="room-section room-current-stay" aria-label="Guest information">
      <header><UserIcon /><h2>Guest Information</h2></header>
      <article className="stay-card">
        <strong>{stay.guestName}</strong>
        <dl>
          <div><dt>Check-in</dt><dd>{formatDate(stay.arrival)}</dd></div>
          <div><dt>Check-out</dt><dd>{formatDate(stay.departure)}</dd></div>
          <div><dt>Adults</dt><dd>{stay.adults}</dd></div>
          <div><dt>Children</dt><dd>{stay.children}</dd></div>
          <div><dt>Source</dt><dd>{stay.bookingSource}</dd></div>
          <div><dt>Reference</dt><dd>{stay.bookingReference ?? "Not available"}</dd></div>
        </dl>
      </article>
    </section>
  );
}

function ReceptionPanel({ room }: { room: RoomDetail }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (alert: RoomDetail["reception"]["alerts"][number]) => resolveReceptionRoomAlert(alert),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["room-detail", String(room.unitId)] });
    },
  });

  return (
    <section className="room-section" aria-label="Reception summary">
      <header><CheckInIcon /><h2>Reception</h2></header>
      {room.reception.alerts.length > 0 && (
        <div className="room-alert-list" aria-label="Reception alerts">
          {room.reception.alerts.map((alert) => (
            <button disabled={mutation.isPending} key={alert.id} onClick={() => mutation.mutate(alert)} type="button">
              <img alt="" src={warningIcon} />
              <span>{alert.title}</span>
              <strong>{alert.actionLabel}</strong>
            </button>
          ))}
        </div>
      )}
      <div className="room-operation-card">
        {room.reception.guestSummary ? <strong>{room.reception.guestSummary}</strong> : <strong>No active guest</strong>}
        <dl>
          <div><dt>Arrival</dt><dd>{room.reception.arrival ? formatDate(room.reception.arrival) : "Not available"}</dd></div>
          <div><dt>Departure</dt><dd>{room.reception.departure ? formatDate(room.reception.departure) : "Not available"}</dd></div>
          <div><dt>Check-in</dt><dd>{room.reception.checkInStatus}</dd></div>
          <div><dt>Check-out</dt><dd>{room.reception.checkOutStatus}</dd></div>
        </dl>
      </div>
      <div className="room-reception-notes">
        {room.reception.notes.length === 0 && <div className="room-empty-state">No reception notes</div>}
        {room.reception.notes.map((note) => <p key={note}>{note}</p>)}
      </div>
      {mutation.isError && <p className="room-form-error">Reception alert could not be completed.</p>}
    </section>
  );
}

function RoomHeader({ room }: { room: RoomDetail }) {
  return (
    <>
      <section className="room-hero-card" aria-label="Room status">
        <div>
          <span className={`room-status-badge is-${statusTone(room.roomStatus)}`}>{room.roomStatus}</span>
          <strong>{room.occupancyStatus}</strong>
          <small>{room.arrival ? `Arrival ${formatDate(room.arrival)}` : "No arrival in current stay"} · {room.departure ? `Departure ${formatDate(room.departure)}` : "No departure in current stay"}</small>
        </div>
        <RoomIcon />
      </section>
      <section className="room-badges" aria-label="Room badges">
        <span><RoomIcon />{room.occupancyStatus}</span>
        <span><HousekeepingIcon />{room.housekeepingStatus}</span>
        <span><CalendarIcon />{checkoutLabel(room)}</span>
      </section>
    </>
  );
}

function HousekeepingPanel({ room, roomId }: { room: RoomDetail; roomId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: RoomHousekeepingStatus) => updateRoomHousekeeping(roomId, status),
    onSuccess: (updated) => queryClient.setQueryData(["room-detail", roomId], updated),
  });

  return (
    <section className="room-section" aria-label="Housekeeping">
      <header><HousekeepingIcon /><h2>Housekeeping</h2></header>
      <div className="room-operation-card">
        <span className={`room-status-badge is-${statusTone(room.housekeeping.status)}`}>{room.housekeeping.status}</span>
        <dl>
          <div><dt>Assigned</dt><dd>{room.housekeeping.assignedTo ?? "Unassigned"}</dd></div>
          <div><dt>Updated</dt><dd>{room.housekeeping.lastUpdated ? formatDateTime(room.housekeeping.lastUpdated) : "Not updated"}</dd></div>
          <div><dt>Checklist</dt><dd>{room.housekeeping.checklistLabel}</dd></div>
        </dl>
      </div>
      <div className="room-actions" aria-label="Change housekeeping status">
        {HOUSEKEEPING_STATUSES.map((status) => (
          <button
            className={status === room.housekeeping.status ? "is-selected" : ""}
            disabled={mutation.isPending || status === room.housekeeping.status}
            key={status}
            onClick={() => mutation.mutate(status)}
            type="button"
          >
            {status}
          </button>
        ))}
      </div>
      {mutation.isError && <p className="room-form-error">Housekeeping status could not be updated.</p>}
    </section>
  );
}

function MaintenancePanel({ room, roomId }: { room: RoomDetail; roomId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MaintenanceCategory>("Other");
  const [priority, setPriority] = useState<MaintenancePriority>("Medium");
  const mutation = useMutation({
    mutationFn: () => createRoomMaintenanceTicket(roomId, { title, description, category, priority }),
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setCategory("Other");
      setPriority("Medium");
      await queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <section className="room-section" aria-label="Maintenance summary">
      <header><MaintenanceIcon /><h2>Maintenance</h2></header>
      <div className="room-section-summary">
        <strong>{room.maintenance.label}</strong>
        <span>{room.maintenance.highestPriority ? `Highest active priority: ${room.maintenance.highestPriority}` : "Tickets stay owned by the Maintenance module."}</span>
        {room.maintenance.outOfService && <span>Out of Service - local operational state only</span>}
      </div>
      <div className="maintenance-ticket-list">
        {room.maintenance.tickets.length === 0 && <div className="room-empty-state">No open issues</div>}
        {room.maintenance.tickets.map((ticket) => (
          <Link className="maintenance-ticket-card" key={ticket.id} to={`/maintenance/${ticket.id}`}>
            <div>
              <strong>{ticket.title}</strong>
              <span>{ticket.category} · {ticket.status}</span>
            </div>
            <span className={`room-status-badge is-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span>
            {ticket.photos.length > 0 && <small>{ticket.photos.length} photo{ticket.photos.length === 1 ? "" : "s"}</small>}
          </Link>
        ))}
      </div>
      <form className="room-ticket-form" onSubmit={submit}>
        <label>
          New ticket
          <input maxLength={140} onChange={(event) => setTitle(event.target.value)} placeholder="Short issue title" required value={title} />
        </label>
        <label>
          Description
          <textarea maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="What needs attention?" required rows={3} value={description} />
        </label>
        <div className="room-form-grid">
          <label>
            Category
            <select onChange={(event) => setCategory(event.target.value as MaintenanceCategory)} value={category}>
              {MAINTENANCE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select onChange={(event) => setPriority(event.target.value as MaintenancePriority)} value={priority}>
              {MAINTENANCE_PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <button disabled={mutation.isPending} type="submit"><PlusIcon />Create ticket</button>
        {mutation.isError && <p className="room-form-error">Maintenance ticket could not be created.</p>}
      </form>
    </section>
  );
}

function NotesPanel({ room, roomId }: { room: RoomDetail; roomId: string }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const mutation = useMutation({
    mutationFn: () => addRoomNote(roomId, body),
    onSuccess: async () => {
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <section className="room-section" aria-label="Room notes">
      <header><CheckIcon /><h2>Notes</h2></header>
      <form className="room-note-form" onSubmit={submit}>
        <textarea maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder="Add an operational note" required rows={3} value={body} />
        <button disabled={mutation.isPending} type="submit">Add note</button>
        {mutation.isError && <p className="room-form-error">Note could not be saved.</p>}
      </form>
      <div className="room-note-list">
        {room.notes.length === 0 && <div className="room-empty-state">No notes yet</div>}
        {room.notes.map((note) => (
          <article className="room-note-card" key={note.id}>
            <strong>{note.authorName}</strong>
            <span>{formatDateTime(note.createdAt)}</span>
            <p>{note.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TimelinePanel({ events }: { events: RoomTimelineEvent[] }) {
  return (
    <section className="room-section" aria-label="Operational timeline">
      <header><img alt="" src={warningIcon} /><h2>Timeline</h2></header>
      <div className="room-timeline">
        {events.length === 0 && <div className="room-empty-state">No operational history yet</div>}
        {events.map((event) => (
          <article className={`timeline-event is-${event.type}`} key={event.id}>
            <span>{event.type.replace("-", " ")}</span>
            <div>
              <strong>{event.title}</strong>
              {event.description && <p>{event.description}</p>}
              <small>{formatDateTime(event.occurredAt)}{event.actorName ? ` · ${event.actorName}` : ""}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChatContextPanel({ room }: { room: RoomDetail }) {
  return (
    <section className="room-section" aria-label="Room chat context">
      <header><AskIcon /><h2>Chat Context</h2></header>
      <div className="room-section-summary">
        <strong>Room context prepared</strong>
        <span>{room.chatContext.conversationId ? "Conversation linked" : "No room conversation yet"}</span>
      </div>
    </section>
  );
}

function OperationalActions() {
  return (
    <section className="room-section" aria-label="Future operational actions">
      <header><CheckIcon /><h2>Actions</h2></header>
      <div className="room-actions">
        <button disabled type="button">Checkout Completed</button>
        <button disabled type="button">Report Issue</button>
        <button disabled type="button">View Notes</button>
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
    <WorkspaceShell title={room.data?.roomName ?? "Rooms"} workspace="rooms" bodyClassName="room-detail-page">
      {room.data && (
        <div className="workspace-body-actions">
          <span>{room.data.roomType}</span>
          <button
            aria-label="Refresh room detail"
            className="room-refresh"
            disabled={room.isFetching}
            onClick={() => void room.refetch()}
            type="button"
          >
            <RefreshIcon className={room.isFetching ? "is-spinning" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      )}
      {room.isLoading && <PageLoading />}
      {room.isError && !room.data && <PageError onRetry={() => void room.refetch()} />}
      {room.data && (
        <>
          <RoomHeader room={room.data} />
          <CurrentStay stay={room.data.currentStay} />
          <ReceptionPanel room={room.data} />
          <HousekeepingPanel room={room.data} roomId={roomId} />
          <MaintenancePanel room={room.data} roomId={roomId} />
          <NotesPanel room={room.data} roomId={roomId} />
          <TimelinePanel events={room.data.timeline.events} />
          <ChatContextPanel room={room.data} />
          <OperationalActions />
        </>
      )}
    </WorkspaceShell>
  );
}
