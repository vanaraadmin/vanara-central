import OperationalStatusPill from "./OperationalStatusPill";
import RoomHero from "./RoomHero";
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

      <section className="room-workspace-card room-operational-card" aria-label="Operational Summary">
        <h3>Operational Summary</h3>
        <div className="room-operational-card__pills">
          <OperationalStatusPill variant={room.operationalAvailability.status} />
          <OperationalStatusPill variant={room.occupancy.status} />
          <OperationalStatusPill variant={room.housekeeping.status} />
          <OperationalStatusPill variant={room.maintenance.status} />
        </div>
      </section>

      <WorkspacePlaceholder title="Guest" />
      <WorkspacePlaceholder title="Reception" />
      <WorkspacePlaceholder title="Housekeeping" />
      <WorkspacePlaceholder title="Maintenance" />
      <WorkspacePlaceholder title="Notes" />
      <WorkspacePlaceholder title="History" />
    </div>
  );
}
