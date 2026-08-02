import GuestCard from "./GuestCard";
import HousekeepingCard from "./HousekeepingCard";
import MaintenanceCard from "./MaintenanceCard";
import ReceptionCard from "./ReceptionCard";
import RoomHero from "./RoomHero";
import RoomOperationalSummaryCard from "./RoomOperationalSummaryCard";
import type { RoomHousekeepingCompletionMode, RoomsWorkspaceRoom } from "../../types/rooms-workspace";

interface RoomExpandedWorkspaceProps {
  id: string;
  room: RoomsWorkspaceRoom;
  actionPending: boolean;
  onCreateOnDemandCleaning: (roomId: number) => void;
  onStartHousekeepingTask: (taskId: number, version: number) => void;
  onCompleteHousekeepingTask: (taskId: number, version: number, completionMode: RoomHousekeepingCompletionMode) => void;
}

export default function RoomExpandedWorkspace({
  actionPending,
  id,
  onCompleteHousekeepingTask,
  onCreateOnDemandCleaning,
  onStartHousekeepingTask,
  room,
}: RoomExpandedWorkspaceProps) {
  return (
    <div id={id} className="room-expanded" role="region" aria-label={`${room.roomName} workspace`}>
      <div className="room-workspace-container">
        <RoomHero room={room} />
        <RoomOperationalSummaryCard summary={room.operational} />

        {room.currentStay ? <GuestCard stay={room.currentStay} /> : null}
        <ReceptionCard roomId={room.unitId} roomName={room.roomName} reception={room.reception} />
        <HousekeepingCard
          actionPending={actionPending}
          housekeeping={room.housekeeping}
          onCompleteTask={onCompleteHousekeepingTask}
          onCreateOnDemandCleaning={onCreateOnDemandCleaning}
          onStartTask={onStartHousekeepingTask}
          roomId={room.unitId}
          roomName={room.roomName}
        />
        <MaintenanceCard maintenance={room.maintenance} roomId={room.unitId} roomName={room.roomName} />
      </div>
    </div>
  );
}
