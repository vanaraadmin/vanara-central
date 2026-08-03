import AccommodationTypeIcon from "./AccommodationTypeIcon";
import type { RoomsWorkspaceRoom } from "../../types/rooms-workspace";

interface RoomHeroProps {
  room: RoomsWorkspaceRoom;
}

export default function RoomHero({ room }: RoomHeroProps) {
  const stay = room.currentStay;

  return (
    <header className="room-hero" aria-label={`${room.roomName} workspace header`}>
      <div className="room-hero__icon" aria-hidden="true">
        <AccommodationTypeIcon type={room.accommodationType} />
      </div>
      <div className="room-hero__copy">
        <span>{room.accommodationType}</span>
        <strong>{room.roomName}</strong>
        <p>{stay ? stay.guestName : "No guest in room"}</p>
        <small>{stay ? `${stay.arrivalDate} - ${stay.departureDate}` : room.roomType}</small>
      </div>
    </header>
  );
}
