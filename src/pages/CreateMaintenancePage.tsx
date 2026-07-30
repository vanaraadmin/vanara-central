import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import WorkspaceShell from "../components/WorkspaceShell";
import { createMaintenanceTicket, loadMaintenanceAssignableUsers } from "../services/maintenance.service";
import type { MaintenanceAssignmentType, MaintenanceCategory, MaintenancePriority } from "../types/maintenance";
import "../styles/MaintenancePage.css";

const categories: MaintenanceCategory[] = ["Electrical", "Air Conditioning", "Water", "Furniture", "Bathroom", "Garden", "Cleaning Equipment", "Internet / Network", "Appliance", "Other"];
const priorities: MaintenancePriority[] = ["Low", "Medium", "High", "Critical"];
const areas = ["Reception", "Restaurant", "Kitchen", "Garden", "Pond", "Entrance", "Storage", "Staff Area", "General Resort Area", "Other"];

export default function CreateMaintenancePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const roomParam = params.get("roomId") ?? "";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MaintenanceCategory>("Other");
  const [priority, setPriority] = useState<MaintenancePriority>("Medium");
  const [roomId, setRoomId] = useState(roomParam);
  const [locationArea, setLocationArea] = useState("General Resort Area");
  const [assignmentType, setAssignmentType] = useState<MaintenanceAssignmentType | "NONE">("NONE");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [externalAssigneeLabel, setExternalAssigneeLabel] = useState("External maintenance company");
  const [externalAssigneeNote, setExternalAssigneeNote] = useState("");
  const assignable = useQuery({ queryKey: ["maintenance", "assignable-users"], queryFn: ({ signal }) => loadMaintenanceAssignableUsers(signal) });
  const mutation = useMutation({
    mutationFn: () => createMaintenanceTicket({
      title,
      description,
      category,
      priority,
      roomId: roomId ? Number(roomId) : null,
      locationArea: roomId ? null : locationArea,
      assignmentType: assignmentType === "NONE" ? null : assignmentType,
      assignedUserId: assignmentType === "INTERNAL" ? assignedUserId : null,
      externalAssigneeLabel: assignmentType === "EXTERNAL" ? externalAssigneeLabel : null,
      externalAssigneeNote: assignmentType === "EXTERNAL" ? externalAssigneeNote : null,
    }),
    onSuccess: (ticket) => navigate(`/maintenance/${ticket.id}`),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !description.trim() || mutation.isPending) return;
    mutation.mutate();
  }

  const internalUsers = assignable.data?.users ?? [];
  const externalOptions = assignable.data?.externalAssignees ?? ["External maintenance company"];

  return (
    <WorkspaceShell title="Maintenance" workspace="maintenance" bodyClassName="maintenance-page">
      <div className="workspace-body-actions">
        <span>Report a real operational issue</span>
        <Link to="/maintenance">Back</Link>
      </div>

      <form className="maintenance-form-page" onSubmit={submit}>
        <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} required /></label>
        <label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={2000} required /></label>
        <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as MaintenanceCategory)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as MaintenancePriority)}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Room ID optional</span><input inputMode="numeric" value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="Example: 1" /></label>
        {!roomId && <label><span>Area</span><select value={locationArea} onChange={(event) => setLocationArea(event.target.value)}>{areas.map((item) => <option key={item}>{item}</option>)}</select></label>}
        <label>
          <span>Assignee type</span>
          <select value={assignmentType} onChange={(event) => setAssignmentType(event.target.value as MaintenanceAssignmentType | "NONE")}>
            <option value="NONE">Unassigned</option>
            <option value="INTERNAL" disabled={internalUsers.length === 0}>Internal maintenance staff</option>
            <option value="EXTERNAL">External technician</option>
          </select>
        </label>
        {assignmentType === "INTERNAL" && (
          <label>
            <span>Maintenance staff</span>
            <select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} required>
              <option value="">Select staff</option>
              {internalUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
            </select>
          </label>
        )}
        {assignmentType === "EXTERNAL" && (
          <>
            <label><span>External technician type</span><select value={externalAssigneeLabel} onChange={(event) => setExternalAssigneeLabel(event.target.value)}>{externalOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>External note optional</span><textarea value={externalAssigneeNote} onChange={(event) => setExternalAssigneeNote(event.target.value)} rows={3} maxLength={500} /></label>
          </>
        )}
        {internalUsers.length === 0 && <p className="maintenance-muted">No active internal maintenance staff. Use external technician if needed.</p>}
        {mutation.isError && <p className="maintenance-form-error">Ticket could not be saved. Please check the fields.</p>}
        <button type="submit" disabled={!title.trim() || !description.trim() || mutation.isPending}>{mutation.isPending ? "Creating…" : "Create Ticket"}</button>
      </form>
    </WorkspaceShell>
  );
}
