import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MaintenanceIcon } from "../components/OperationsIcons";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraGlassSheet from "../components/vanara/VanaraGlassSheet";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import WorkspaceShell from "../components/WorkspaceShell";
import { addMaintenancePhoto, createMaintenanceTicket, loadMaintenanceAssignableUsers, loadMaintenanceRoomTargets } from "../services/maintenance.service";
import type { MaintenancePriority, MaintenanceTargetType } from "../types/maintenance";
import { useLanguage } from "../providers/language.context";
import { translateStaffLabel } from "../utils/staff-i18n-labels";
import "../styles/MaintenancePage.css";

const priorities: MaintenancePriority[] = ["Low", "Normal", "High"];
const locationAreas = [
  { key: "restaurant", value: "Restaurant" },
  { key: "garden", value: "Garden" },
  { key: "pool", value: "Pool" },
  { key: "receptionArea", value: "Reception" },
  { key: "kitchen", value: "Kitchen" },
  { key: "laundry", value: "Laundry" },
  { key: "commonArea", value: "Common area" },
  { key: "other", value: "Other" },
] as const;

export default function CreateMaintenancePage() {
  const { translate } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const roomParam = params.get("roomId") ?? "";
  const source = params.get("source");
  const roomTargetLocked = Boolean(roomParam);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetType, setTargetType] = useState<MaintenanceTargetType | "">(roomTargetLocked ? "ROOM" : "");
  const [priority, setPriority] = useState<MaintenancePriority>("Normal");
  const [roomId, setRoomId] = useState(roomParam);
  const [locationArea, setLocationArea] = useState("");
  const [outOfService, setOutOfService] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const assignable = useQuery({ queryKey: ["maintenance", "assignable-users"], queryFn: ({ signal }) => loadMaintenanceAssignableUsers(signal) });
  const rooms = useQuery({
    queryKey: ["maintenance", "rooms"],
    queryFn: ({ signal }) => loadMaintenanceRoomTargets(signal),
    enabled: targetType === "ROOM" && !roomTargetLocked,
  });
  const internalUsers = assignable.data?.users ?? [];
  const roomOptions = rooms.data ?? [];
  const mutation = useMutation({
    mutationFn: async () => {
      if (!targetType) throw new Error("Target is required.");
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
    const missingTarget = !targetType;
    const missingRoom = targetType === "ROOM" && !roomId.trim();
    const missingArea = targetType === "OTHER" && !locationArea.trim();
    const waitingForRooms = targetType === "ROOM" && !roomTargetLocked && (rooms.isLoading || rooms.isError || roomOptions.length === 0);
    if (!title.trim() || !description.trim() || missingTarget || missingRoom || missingArea || waitingForRooms || mutation.isPending) return;
    mutation.mutate();
  }

  function chooseTarget(next: MaintenanceTargetType) {
    setTargetType(next);
    if (next === "ROOM") setLocationArea("");
    if (next === "OTHER") setRoomId("");
  }

  function updatePhotos(event: ChangeEvent<HTMLInputElement>) {
    setPhotos(Array.from(event.target.files ?? []));
  }

  const originLabel = source === "housekeeping"
    ? translate("housekeeping")
    : source === "reception"
      ? translate("reception")
      : roomId
        ? translate("rooms")
        : translate("maintenance");

  return (
    <WorkspaceShell title={translate("maintenance")} workspace="maintenance" bodyClassName="maintenance-page">
      <div className="workspace-body-actions">
        <span>{originLabel}</span>
        <Link className="vc-secondary-action" to="/maintenance">{translate("back")}</Link>
      </div>

      <form className="maintenance-form-page" onSubmit={submit}>
        <VanaraGlassSheet ariaLabel={translate("createMaintenanceIssue")} className="maintenance-form-sheet">
          <header className="vc-sheet-identity maintenance-sheet-identity">
            <div className="vc-sheet-identity__icon maintenance-sheet-identity__icon" aria-hidden="true">
              <MaintenanceIcon />
            </div>
            <div className="vc-sheet-identity__content maintenance-sheet-identity__content">
              <span className="vc-sheet-identity__eyebrow">{originLabel}</span>
              <h1 className="vc-sheet-identity__title">{translate("reportIssue")}</h1>
              <p className="vc-sheet-identity__subtitle">{translate("createTicketWhenPhysical")}</p>
            </div>
          </header>

          <VanaraGlassRegion ariaLabelledBy="maintenance-create-details-title" className="maintenance-region">
            <VanaraSectionHeader eyebrow={translate("issue")} headingId="maintenance-create-details-title" title={translate("details")} />
            <label><span>{translate("issue")}</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} required /></label>
            <label><span>{translate("description")}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={2000} required /></label>
            <label><span>{translate("photos")}</span><input accept="image/*" multiple onChange={updatePhotos} type="file" /></label>
            {photos.length > 0 && <p className="maintenance-muted">{translate("photoSelectedCount", { count: photos.length })}</p>}
          </VanaraGlassRegion>

          <VanaraGlassRegion ariaLabelledBy="maintenance-create-target-title" className="maintenance-region">
            <VanaraSectionHeader eyebrow={translate("target")} headingId="maintenance-create-target-title" title={translate("target")} />
            {!roomTargetLocked && (
              <fieldset className="maintenance-target-field">
                <legend>{translate("issueTarget")}</legend>
                <label>
                  <input checked={targetType === "ROOM"} name="maintenance-target" onChange={() => chooseTarget("ROOM")} required type="radio" />
                  <span>{translate("room")}</span>
                </label>
                <label>
                  <input checked={targetType === "OTHER"} name="maintenance-target" onChange={() => chooseTarget("OTHER")} required type="radio" />
                  <span>{translate("otherArea")}</span>
                </label>
              </fieldset>
            )}

            <div className="maintenance-form-grid">
              {!roomTargetLocked && targetType === "ROOM" && (
                <label>
                  <span>{translate("room")}</span>
                  <select value={roomId} onChange={(event) => setRoomId(event.target.value)} required disabled={rooms.isLoading || rooms.isError || roomOptions.length === 0}>
                    <option value="">{rooms.isLoading ? translate("loadingRooms") : translate("selectRoom")}</option>
                    {roomOptions.map((room) => <option key={room.id} value={room.id}>{room.label}</option>)}
                  </select>
                </label>
              )}
              {!roomTargetLocked && targetType === "OTHER" && (
                <label>
                  <span>{translate("areaOrAsset")}</span>
                  <select value={locationArea} onChange={(event) => setLocationArea(event.target.value)} required>
                    <option value="">{translate("areaOrAsset")}</option>
                    {locationAreas.map((item) => <option key={item.value} value={item.value}>{translate(item.key)}</option>)}
                  </select>
                </label>
              )}
              <label><span>{translate("priority")}</span><select value={priority} onChange={(event) => setPriority(event.target.value as MaintenancePriority)}>{priorities.map((item) => <option key={item} value={item}>{translateStaffLabel(item, translate)}</option>)}</select></label>
            </div>
            {rooms.isError && targetType === "ROOM" && <p className="maintenance-form-error">{translate("roomListCouldNotLoad")}</p>}
          </VanaraGlassRegion>

          <VanaraGlassRegion ariaLabelledBy="maintenance-create-operations-title" className="maintenance-region">
            <VanaraSectionHeader eyebrow={translate("operations")} headingId="maintenance-create-operations-title" title={translate("operationalControls")} />
            <label className="maintenance-checkbox-field">
              <input checked={outOfService} onChange={(event) => setOutOfService(event.target.checked)} type="checkbox" />
              <span>{translate("blocking")}</span>
            </label>
            {internalUsers.length > 0 && (
              <label>
                <span>{translate("assignedOptional")}</span>
                <select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}>
                  <option value="">{translate("unassigned")}</option>
                  {internalUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                </select>
              </label>
            )}
            {mutation.isError && <p className="maintenance-form-error">{translate("issueCouldNotBeSaved")}</p>}
          </VanaraGlassRegion>

          <div className="maintenance-form-actions">
            <button className="vc-primary-action" type="submit" disabled={!title.trim() || !description.trim() || !targetType || (targetType === "ROOM" && !roomId.trim()) || (targetType === "ROOM" && !roomTargetLocked && (rooms.isLoading || rooms.isError || roomOptions.length === 0)) || (targetType === "OTHER" && !locationArea.trim()) || mutation.isPending}>{mutation.isPending ? translate("creating") : translate("createIssue")}</button>
          </div>
        </VanaraGlassSheet>
      </form>
    </WorkspaceShell>
  );
}
