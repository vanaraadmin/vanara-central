import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { AlertIcon, CheckIcon, HousekeepingIcon, MaintenanceIcon, RefreshIcon, RoomIcon } from "../components/OperationsIcons";
import { loadCurrentUser } from "../services/auth.service";
import { loadHousekeepingAssignableUsers, loadHousekeepingOverview, updateHousekeepingAssignment, updateHousekeepingChecklist, updateHousekeepingRoom } from "../services/housekeeping.service";
import type { CurrentUserView } from "../types/auth";
import type { HousekeepingAssignableUser, HousekeepingChecklistItem, HousekeepingGroup, HousekeepingRoom, HousekeepingWorkflowStatus, OperationalGroupId } from "../types/housekeeping";
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
    case "Dirty":
      return "⚪";
    case "Cleaning":
      return "🟡";
    case "Ready":
      return "🟢";
  }
}

function checkoutLabel(room: HousekeepingRoom): string {
  switch (room.checkoutCompletionSource) {
    case "reception":
      return "✅ Reception confirmed";
    case "automatic-fallback":
      return "⚠️ Automatic fallback";
    case "none":
      return room.occupancyStatus;
  }
}

function lastUpdated(minutes: number | null): string {
  if (minutes === null) return "No update yet";
  if (minutes < 1) return "Updated now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function nextAction(room: HousekeepingRoom): HousekeepingWorkflowStatus | null {
  if (room.housekeepingStatus === "Dirty") return "Cleaning";
  if (room.housekeepingStatus === "Cleaning") return "Ready";
  return null;
}

function canManageHousekeeping(user: CurrentUserView | undefined): boolean {
  if (!user) return false;
  const permission = user.permissions.find((item) => item.module === "housekeeping");
  return Boolean(permission?.canAccess && permission.canEdit && (user.role === "Owner" || user.role === "Manager" || user.role === "Operations"));
}

function canActOnRoom(room: HousekeepingRoom, user: CurrentUserView | undefined, management: boolean): boolean {
  if (!user) return false;
  if (management) return true;
  if (room.housekeepingStatus === "Dirty") return room.assignedUserId === null;
  if (room.housekeepingStatus === "Cleaning") return room.assignedUserId === user.id;
  return false;
}

function ActionButton({ room, status, label, disabled }: { room: HousekeepingRoom; status: HousekeepingWorkflowStatus; label: string; disabled: boolean }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => updateHousekeepingRoom(room.unitId, status),
    onSuccess: (overview) => queryClient.setQueryData(["housekeeping-queue"], overview),
  });

  return (
    <>
      <button disabled={disabled || mutation.isPending || room.housekeepingStatus === status || room.blocked} onClick={() => mutation.mutate()} type="button">
        {label}
      </button>
      {mutation.isError && <p className="queue-action-error">Could not update room. Try again.</p>}
    </>
  );
}

function ChecklistItem({ item, room }: { item: HousekeepingChecklistItem; room: HousekeepingRoom }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => updateHousekeepingChecklist(room.unitId, item.id, !item.completed),
    onSuccess: (overview) => queryClient.setQueryData(["housekeeping-queue"], overview),
  });

  return (
    <>
      <button
        aria-pressed={item.completed}
        className={item.completed ? "is-complete" : ""}
        disabled={mutation.isPending || room.blocked}
        onClick={() => mutation.mutate()}
        type="button"
      >
        <span>{item.completed ? "☑" : "□"}</span>
        {item.label}
      </button>
      {mutation.isError && <p className="queue-action-error">Checklist not saved.</p>}
    </>
  );
}

function AssignmentControl({ room, users, enabled }: { room: HousekeepingRoom; users: HousekeepingAssignableUser[]; enabled: boolean }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (assignedUserId: string | null) => updateHousekeepingAssignment(room.unitId, assignedUserId),
    onSuccess: (overview) => queryClient.setQueryData(["housekeeping-queue"], overview),
  });

  if (!enabled) return null;

  return (
    <div className="queue-assignment-control">
      <label>
        Assign
        <select
          disabled={mutation.isPending}
          onChange={(event) => mutation.mutate(event.target.value || null)}
          value={room.assignedUserId ?? ""}
        >
          <option value="">Unassigned</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
        </select>
      </label>
      {room.assignedUserId && (
        <button disabled={mutation.isPending} onClick={() => mutation.mutate(null)} type="button">Release</button>
      )}
      {mutation.isError && <p className="queue-action-error">Assignment not saved.</p>}
    </div>
  );
}

function RoomCard({ room, currentUser, users, management }: { room: HousekeepingRoom; currentUser: CurrentUserView | undefined; users: HousekeepingAssignableUser[]; management: boolean }) {
  const action = nextAction(room);
  const missing = room.checklist.missing.slice(0, 3).join(", ");
  const allowed = canActOnRoom(room, currentUser, management);
  const assignedToOther = room.housekeepingStatus === "Cleaning" && room.assignedUserId !== null && room.assignedUserId !== currentUser?.id && !management;

  return (
    <article className={"queue-room queue-room--" + groupTone(room.group)}>
      <div className="queue-room__head">
        <div>
          <h3>{room.unitName}</h3>
          <p>{checkoutLabel(room)}</p>
        </div>
        <strong className={`queue-priority queue-priority--${room.priority.toLowerCase()}`}>{room.priority}</strong>
      </div>

      <div className="queue-room__status" aria-label="Housekeeping status">
        <span>{workflowIcon(room.housekeepingStatus)} {room.housekeepingStatus}</span>
        <span>{room.assignedTo ? `Assigned to ${room.assignedTo}` : "Unassigned"}</span>
        <span>{lastUpdated(room.minutesSinceUpdate)}</span>
      </div>
      {assignedToOther && <p className="queue-room__notice">This room is already being cleaned by {room.assignedTo}.</p>}

      <AssignmentControl enabled={management} room={room} users={users} />

      <div className="queue-checklist" aria-label="Room checklist">
        <header>
          <strong>Checklist</strong>
          <span>{room.checklist.completed}/{room.checklist.total}</span>
        </header>
        <div className="queue-checklist__items">
          {room.checklist.items.map((item) => <ChecklistItem item={item} key={item.id} room={room} />)}
        </div>
        {missing && <p>Missing: {missing}</p>}
      </div>

      <div className="queue-room__actions" aria-label="Housekeeping quick actions">
        {action === "Cleaning" && <ActionButton disabled={!allowed} label="▶️ Take Cleaning" room={room} status="Cleaning" />}
        {action === "Ready" && <ActionButton disabled={!allowed} label="✅ Ready" room={room} status="Ready" />}
        {room.housekeepingStatus === "Cleaning" && allowed && <ActionButton disabled={!allowed} label="Release Cleaning" room={room} status="Dirty" />}
        {action === null && <button disabled type="button"><CheckIcon /> Ready</button>}
        <Link to="/maintenance/new"><MaintenanceIcon /> Maintenance</Link>
        <Link to={`/rooms/${room.unitId}`}><RoomIcon /> Open Room</Link>
      </div>
    </article>
  );
}

function QueueGroup({ group, currentUser, users, management }: { group: HousekeepingGroup; currentUser: CurrentUserView | undefined; users: HousekeepingAssignableUser[]; management: boolean }) {
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
          ? group.rooms.map((room) => <RoomCard currentUser={currentUser} key={room.id} management={management} room={room} users={users} />)
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
  const currentUser = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => loadCurrentUser(signal) });
  const management = canManageHousekeeping(currentUser.data);
  const users = useQuery({
    queryKey: ["housekeeping", "assignable-users"],
    queryFn: ({ signal }) => loadHousekeepingAssignableUsers(signal),
    enabled: management,
  });
  const assignableUsers = users.data ?? [];

  return (
    <WorkspaceShell title="Housekeeping" workspace="housekeeping" bodyClassName="housekeeping-page">
      <div className="workspace-body-actions">
        <span>{housekeeping.data ? `${housekeeping.data.summary.cleanFirst} urgent · ${housekeeping.data.summary.assigned} assigned` : "Loading priorities"}</span>
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
      </div>

      {housekeeping.data?.capabilities.checkoutCompletionSource === "missing-reception-flag" && (
        <section className="housekeeping-source-note" role="status">
          Waiting for reception checkout confirmation. Inspection is prepared for a future workflow step.
        </section>
      )}

      {housekeeping.isLoading && <PageLoading />}
      {housekeeping.isError && !housekeeping.data && <PageError onRetry={() => void housekeeping.refetch()} />}

      {housekeeping.data && housekeeping.data.rooms.length > 0 && (
        <div className="housekeeping-queue" aria-label="Operational housekeeping queue">
          {housekeeping.data.groups.map((group) => <QueueGroup currentUser={currentUser.data} group={group} key={group.id} management={management} users={assignableUsers} />)}
        </div>
      )}

      {housekeeping.data && housekeeping.data.rooms.length === 0 && (
        <section className="housekeeping-empty" aria-label="No housekeeping rooms">
          <HousekeepingIcon />
          <h2>No rooms to coordinate</h2>
          <p>Housekeeping will appear here after reception and room updates.</p>
        </section>
      )}
    </WorkspaceShell>
  );
}
