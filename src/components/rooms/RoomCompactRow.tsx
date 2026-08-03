import { ChevronDownIcon } from "../OperationsIcons";
import { getRoomCompactPresentation } from "../../config/roomOperationalPresentation";
import AccommodationTypeIcon from "./AccommodationTypeIcon";
import RoomCompactSignals, { RoomTerminalState } from "./RoomCompactSignals";
import type { RoomsWorkspaceRoom } from "../../types/rooms-workspace";

interface RoomCompactRowProps {
  expanded: boolean;
  room: RoomsWorkspaceRoom;
  onToggle: () => void;
}

export default function RoomCompactRow({ expanded, onToggle, room }: RoomCompactRowProps) {
  const detailsId = `room-workspace-${room.unitId}`;
  const presentation = getRoomCompactPresentation(room);
  const modeClass = presentation.mode.toLowerCase();
  const className = [
    "room-row",
    `room-row--${modeClass}`,
    expanded ? "room-row--expanded" : null,
  ].filter(Boolean).join(" ");
  const guestName = presentation.mode === "STANDARD" ? presentation.primary.detail : null;

  return (
    <article className={`room-list-item${expanded ? " room-list-item--expanded" : ""}`}>
      <button
        type="button"
        className={className}
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={presentation.accessibleSummary}
        onClick={onToggle}
      >
        <span className="room-row__type-mark" aria-hidden="true">
          <AccommodationTypeIcon className="room-row__icon" type={room.accommodationType} />
        </span>

        <span className="room-row__identity">
          <span className="room-row__name">{room.roomName}</span>
          {guestName ? <span className="room-row__guest">{guestName}</span> : null}
        </span>

        {presentation.mode === "STANDARD" ? (
          <RoomCompactSignals presentation={presentation} />
        ) : (
          <RoomTerminalState presentation={presentation} />
        )}

        <ChevronDownIcon className="room-row__chevron" />
      </button>
    </article>
  );
}
