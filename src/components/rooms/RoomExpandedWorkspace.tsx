import GuestCard from "./GuestCard";
import HousekeepingCard from "./HousekeepingCard";
import MaintenanceCard from "./MaintenanceCard";
import RoomHero from "./RoomHero";
import RoomOperationalSummaryCard from "./RoomOperationalSummaryCard";
import TurnoverCard from "./TurnoverCard";
import { getRoomsWorkspaceTurnover } from "../../config/turnoverPresentation";
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
  const turnover = getRoomsWorkspaceTurnover(room);

  return (
    <div id={id} className="room-expanded" role="region" aria-label={`${room.roomName} workspace`}>
      <div className="room-workspace-container">
        <RoomHero room={room} />
        {room.currentStay ? <GuestCard stay={room.currentStay} /> : null}
        <RoomOperationalSummaryCard summary={room.operational} />
        <TurnoverCard
          roomId={room.unitId}
          turnover={turnover}
        />
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
