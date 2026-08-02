import { ChevronDownIcon } from "../OperationsIcons";
import RoomCompactSignals from "./RoomCompactSignals";
import type { RoomsWorkspaceRoom } from "../../types/rooms-workspace";

interface RoomCompactRowProps {
  expanded: boolean;
  room: RoomsWorkspaceRoom;
  onToggle: () => void;
}

export default function RoomCompactRow({ expanded, onToggle, room }: RoomCompactRowProps) {
  const detailsId = `room-workspace-${room.unitId}`;
  const guestName = room.operational.occupancy.state === "OCCUPIED" ? room.operational.occupancy.guestName : null;
  const summaryLine = room.alertSummary ?? guestName;

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
          <strong className="room-row__name">{room.roomName}</strong>
          {summaryLine ? <span className="room-row__guest">{summaryLine}</span> : null}
        </span>

        <RoomCompactSignals summary={room.operational} />

        <ChevronDownIcon className="room-row__chevron" />
      </button>
    </article>
  );
}
