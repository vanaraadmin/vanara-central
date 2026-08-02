import { ChevronDownIcon } from "../OperationsIcons";
import OperationalStatusPill from "./OperationalStatusPill";
import type { RoomsWorkspaceRoom } from "../../types/rooms-workspace";

interface RoomCompactRowProps {
  expanded: boolean;
  room: RoomsWorkspaceRoom;
  onToggle: () => void;
}

function maintenanceLabel(room: RoomsWorkspaceRoom): string {
  if (room.maintenance.outOfService) return "Maintenance";
  if (room.maintenance.openIssues > 0) return "Maintenance";
  return "Clear";
}

export default function RoomCompactRow({ expanded, onToggle, room }: RoomCompactRowProps) {
  const detailsId = `room-workspace-${room.unitId}`;

  return (
    <article className={`room-list-item${expanded ? " room-list-item--expanded" : ""}`}>
      <button
        type="button"
        className="room-row"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        <span className="room-row__identity">
          <strong>{room.roomName}</strong>
          {room.occupancy.guestName ? <span>{room.occupancy.guestName}</span> : null}
        </span>

        <span className="room-row__status" aria-label={`${room.roomName} operational status`}>
          <OperationalStatusPill variant={room.occupancy.status} />
          <OperationalStatusPill variant={room.operationalAvailability.status} />
          <OperationalStatusPill variant={room.housekeeping.status} />
          <OperationalStatusPill variant={room.maintenance.status} label={maintenanceLabel(room)} />
        </span>

        <ChevronDownIcon className="room-row__chevron" />
      </button>
    </article>
  );
}
