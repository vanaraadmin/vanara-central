import GuestCard from "./GuestCard";
import RoomHero from "./RoomHero";
import RoomOperationalSummaryCard from "./RoomOperationalSummaryCard";
import type { RoomsWorkspaceRoom } from "../../types/rooms-workspace";

interface RoomExpandedWorkspaceProps {
  id: string;
  room: RoomsWorkspaceRoom;
}

function WorkspacePlaceholder({ title }: { title: string }) {
  return (
    <section className="room-workspace-card room-workspace-placeholder-card" aria-label={title}>
      <h3>{title}</h3>
      <span aria-hidden="true" />
    </section>
  );
}

export default function RoomExpandedWorkspace({ id, room }: RoomExpandedWorkspaceProps) {
  return (
    <div id={id} className="room-expanded" role="region" aria-label={`${room.roomName} workspace`}>
      <RoomHero room={room} />
      <RoomOperationalSummaryCard summary={room.operational} />

      {room.currentStay ? <GuestCard stay={room.currentStay} /> : null}
      <WorkspacePlaceholder title="Reception" />
      <WorkspacePlaceholder title="Housekeeping" />
      <WorkspacePlaceholder title="Maintenance" />
      <WorkspacePlaceholder title="Notes" />
      <WorkspacePlaceholder title="History" />
    </div>
  );
}
