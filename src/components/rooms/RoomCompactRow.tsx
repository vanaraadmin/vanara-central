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
    "room-compact-row",
    `room-compact-row--${modeClass}`,
    expanded ? "room-compact-row--expanded" : null,
  ].filter(Boolean).join(" ");
  const identityDetail = presentation.mode === "STANDARD" ? presentation.primary.detail : room.accommodationType;

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
        <span className="room-compact-row__type-mark" aria-hidden="true">
          <AccommodationTypeIcon type={room.accommodationType} />
        </span>

        <span className="room-compact-row__content">
          <span className="room-compact-row__identity">
            <span className="room-compact-row__name">{room.roomName}</span>
            {identityDetail ? <span className="room-compact-row__detail">{identityDetail}</span> : null}
          </span>

          {presentation.mode === "STANDARD" ? (
            <RoomCompactSignals presentation={presentation} />
          ) : (
            <RoomTerminalState presentation={presentation} />
          )}
        </span>

        <ChevronDownIcon className="room-compact-row__chevron" />
      </button>
    </article>
  );
}
