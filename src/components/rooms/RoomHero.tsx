import AccommodationTypeIcon from "./AccommodationTypeIcon";
import type { RoomsWorkspaceRoom } from "../../types/rooms-workspace";

interface RoomHeroProps {
  room: RoomsWorkspaceRoom;
}

export default function RoomHero({ room }: RoomHeroProps) {
  const stay = room.currentStay;

  return (
    <header className="vc-sheet-identity room-expanded-sheet__identity" aria-label={`${room.roomName} workspace header`}>
      <div className="vc-sheet-identity__icon room-expanded-sheet__identity-icon" aria-hidden="true">
        <AccommodationTypeIcon type={room.accommodationType} />
      </div>
      <div className="vc-sheet-identity__content room-expanded-sheet__identity-copy">
        <span className="vc-sheet-identity__eyebrow room-expanded-sheet__identity-type">{room.accommodationType}</span>
        <strong className="vc-sheet-identity__title room-expanded-sheet__identity-name">{room.roomName}</strong>
        <p className="vc-sheet-identity__subtitle room-expanded-sheet__identity-guest">{stay ? stay.guestName : "No guest in room"}</p>
        <small className="vc-sheet-identity__meta room-expanded-sheet__identity-stay">{stay ? `${stay.arrivalDate} - ${stay.departureDate}` : room.roomType}</small>
      </div>
    </header>
  );
}
