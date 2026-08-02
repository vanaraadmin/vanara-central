import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import WorkspaceShell from "../components/WorkspaceShell";
import { addMaintenancePhoto, createMaintenanceTicket, loadMaintenanceAssignableUsers } from "../services/maintenance.service";
import type { MaintenancePriority, MaintenanceTargetType } from "../types/maintenance";
import "../styles/MaintenancePage.css";

const priorities: MaintenancePriority[] = ["Low", "Normal", "High"];
const locationAreas = ["Restaurant", "Garden", "Pool", "Reception", "Storage", "Utilities", "Other"];

export default function CreateMaintenancePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const roomParam = params.get("roomId") ?? "";
  const source = params.get("source");
  const roomTargetLocked = Boolean(roomParam);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetType, setTargetType] = useState<MaintenanceTargetType>("ROOM");
  const [priority, setPriority] = useState<MaintenancePriority>("Normal");
  const [roomId, setRoomId] = useState(roomParam);
  const [locationArea, setLocationArea] = useState(locationAreas[0] ?? "Restaurant");
  const [outOfService, setOutOfService] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const assignable = useQuery({ queryKey: ["maintenance", "assignable-users"], queryFn: ({ signal }) => loadMaintenanceAssignableUsers(signal) });
  const internalUsers = assignable.data?.users ?? [];
  const mutation = useMutation({
    mutationFn: async () => {
      const ticket = await createMaintenanceTicket({
        targetType,
        title,
        description,
        priority,
        roomId: targetType === "ROOM" && roomId ? Number(roomId) : null,
        locationArea: targetType === "OTHER" ? locationArea : null,
        assignmentType: assignedUserId ? "INTERNAL" : null,
        assignedUserId: assignedUserId || null,
        outOfService,
      });
      await Promise.all(photos.map((photo) => addMaintenancePhoto(ticket.id, { localReference: photo.name })));
      return ticket;
    },
    onSuccess: (ticket) => {
      if (source === "housekeeping") {
        navigate("/housekeeping");
        return;
      }
      if (source === "reception") {
        navigate("/reception");
        return;
      }
      if (targetType === "ROOM" && roomId) {
        navigate(`/rooms/${roomId}`);
        return;
      }
      navigate(`/maintenance/${ticket.id}`);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missingRoom = targetType === "ROOM" && !roomId.trim();
    const missingArea = targetType === "OTHER" && !locationArea.trim();
    if (!title.trim() || !description.trim() || missingRoom || missingArea || mutation.isPending) return;
    mutation.mutate();
  }

  function updatePhotos(event: ChangeEvent<HTMLInputElement>) {
    setPhotos(Array.from(event.target.files ?? []));
  }

  const originLabel = source === "housekeeping"
    ? "From Housekeeping"
    : source === "reception"
      ? "From Reception"
      : roomId
        ? "From Room Workspace"
        : "Maintenance";

  return (
    <WorkspaceShell title="Maintenance" workspace="maintenance" bodyClassName="maintenance-page">
      <div className="workspace-body-actions">
        <span>{originLabel}</span>
        <Link to="/maintenance">Back</Link>
      </div>

      <form className="maintenance-form-page" onSubmit={submit}>
        {!roomTargetLocked && (
          <fieldset className="maintenance-target-field">
            <legend>Target</legend>
            <label>
              <input checked={targetType === "ROOM"} onChange={() => setTargetType("ROOM")} type="radio" />
              <span>Room</span>
            </label>
            <label>
              <input checked={targetType === "OTHER"} onChange={() => setTargetType("OTHER")} type="radio" />
              <span>Other</span>
            </label>
          </fieldset>
        )}
        <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} required /></label>
        <label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={2000} required /></label>
        <label><span>Photos</span><input accept="image/*" multiple onChange={updatePhotos} type="file" /></label>
        {photos.length > 0 && <p className="maintenance-muted">{photos.length} photo{photos.length === 1 ? "" : "s"} selected</p>}
        <div className="maintenance-form-grid">
          {!roomTargetLocked && targetType === "ROOM" && <label><span>Room</span><input inputMode="numeric" value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="Example: 1" required /></label>}
          {!roomTargetLocked && targetType === "OTHER" && (
            <label>
              <span>Area</span>
              <select value={locationArea} onChange={(event) => setLocationArea(event.target.value)} required>
                {locationAreas.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          )}
          <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as MaintenancePriority)}>{priorities.map((item) => <option key={item}>{item.toUpperCase()}</option>)}</select></label>
        </div>
        <label className="maintenance-checkbox-field">
          <input checked={outOfService} onChange={(event) => setOutOfService(event.target.checked)} type="checkbox" />
          <span>Blocking</span>
        </label>
        {internalUsers.length > 0 && (
          <label>
            <span>Assigned to optional</span>
            <select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}>
              <option value="">Unassigned</option>
              {internalUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
            </select>
          </label>
        )}
        {mutation.isError && <p className="maintenance-form-error">Issue could not be saved. Please check the fields.</p>}
        <button type="submit" disabled={!title.trim() || !description.trim() || (targetType === "ROOM" && !roomId.trim()) || (targetType === "OTHER" && !locationArea.trim()) || mutation.isPending}>{mutation.isPending ? "Creating..." : "Create Issue"}</button>
      </form>
    </WorkspaceShell>
  );
}
