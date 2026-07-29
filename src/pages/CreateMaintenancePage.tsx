import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { createMaintenanceTicket } from "../services/maintenance.service";
import type { MaintenanceCategory, MaintenancePriority } from "../types/maintenance";
import "../styles/MaintenancePage.css";

const categories: MaintenanceCategory[] = ["Electrical", "Plumbing", "Cleaning", "Furniture", "Air Conditioning", "Garden", "Pool", "Restaurant", "IT", "Other"];
const priorities: MaintenancePriority[] = ["Low", "Medium", "High", "Critical"];

export default function CreateMaintenancePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MaintenanceCategory>("Other");
  const [priority, setPriority] = useState<MaintenancePriority>("Medium");
  const [roomId, setRoomId] = useState("");
  const [assignedUserName, setAssignedUserName] = useState("");
  const mutation = useMutation({
    mutationFn: () => createMaintenanceTicket({
      title,
      description,
      category,
      priority,
      roomId: roomId ? Number(roomId) : null,
      assignedUserName: assignedUserName || null,
      assignedUserId: assignedUserName ? assignedUserName.toLowerCase().replaceAll(" ", "-") : null,
    }),
    onSuccess: (ticket) => navigate(`/maintenance/${ticket.id}`),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !description.trim() || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <main className="maintenance-page">
      <header className="maintenance-hero maintenance-hero--compact">
        <div>
          <p>Maintenance</p>
          <h1>New Ticket</h1>
          <span>Persistent operational issue</span>
        </div>
        <Link to="/maintenance">Back</Link>
      </header>

      <form className="maintenance-form-page" onSubmit={submit}>
        <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} required /></label>
        <label><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} maxLength={2000} required /></label>
        <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as MaintenanceCategory)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as MaintenancePriority)}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Room ID optional</span><input inputMode="numeric" value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="Example: 1" /></label>
        <label><span>Assign technician optional</span><input value={assignedUserName} onChange={(event) => setAssignedUserName(event.target.value)} placeholder="Technician name" /></label>
        {mutation.isError && <p className="maintenance-form-error">Ticket could not be saved. Please check the fields.</p>}
        <button type="submit" disabled={!title.trim() || !description.trim() || mutation.isPending}>{mutation.isPending ? "Creating…" : "Create Ticket"}</button>
      </form>
    </main>
  );
}
