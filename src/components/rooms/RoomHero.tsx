import AccommodationTypeIcon from "./AccommodationTypeIcon";
import type { RoomsWorkspaceRoom } from "../../types/rooms-workspace";

interface RoomHeroProps {
  room: RoomsWorkspaceRoom;
}

export default function RoomHero({ room }: RoomHeroProps) {
  const stay = room.currentStay;

  return (
    <header className="room-expanded-sheet__identity" aria-label={`${room.roomName} workspace header`}>
      <div className="room-expanded-sheet__identity-icon" aria-hidden="true">
        <AccommodationTypeIcon type={room.accommodationType} />
      </div>
      <div className="room-expanded-sheet__identity-copy">
        <span className="room-expanded-sheet__identity-type">{room.accommodationType}</span>
        <strong className="room-expanded-sheet__identity-name">{room.roomName}</strong>
        <p className="room-expanded-sheet__identity-guest">{stay ? stay.guestName : "No guest in room"}</p>
        <small className="room-expanded-sheet__identity-stay">{stay ? `${stay.arrivalDate} - ${stay.departureDate}` : room.roomType}</small>
      </div>
    </header>
  );
}
