import { RoomIcon } from "../OperationsIcons";
import type { RoomsWorkspaceRoom } from "../../types/rooms-workspace";

interface RoomHeroProps {
  room: RoomsWorkspaceRoom;
}

export default function RoomHero({ room }: RoomHeroProps) {
  return (
    <figure className="room-hero">
      {room.heroImage ? (
        <img alt={`${room.roomName} official room`} src={room.heroImage} />
      ) : (
        <div className="room-hero__placeholder" role="img" aria-label={`${room.roomName} image unavailable`}>
          <RoomIcon />
        </div>
      )}

      <figcaption>
        <strong>{room.roomName}</strong>
        <span>{room.roomType}</span>
      </figcaption>
    </figure>
  );
}
