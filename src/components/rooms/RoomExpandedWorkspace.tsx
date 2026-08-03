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
  onCreateStandardCleaning: (roomId: number) => void;
  onCreateOnDemandCleaning: (roomId: number) => void;
  onStartHousekeepingTask: (taskId: number, version: number) => void;
  onCompleteHousekeepingTask: (taskId: number, version: number, completionMode: RoomHousekeepingCompletionMode) => void;
}

export default function RoomExpandedWorkspace({
  actionPending,
  id,
  onCompleteHousekeepingTask,
  onCreateStandardCleaning,
  onCreateOnDemandCleaning,
  onStartHousekeepingTask,
  room,
}: RoomExpandedWorkspaceProps) {
  const turnover = getRoomsWorkspaceTurnover(room);

  return (
    <div id={id} className="room-row-expanded-content room-expanded" role="region" aria-label={`${room.roomName} workspace`}>
      <section className="room-expanded-sheet vc-glass-sheet" aria-label={`${room.roomName} details`}>
        <RoomHero room={room} />
        {room.currentStay ? <GuestCard stay={room.currentStay} /> : null}
        <RoomOperationalSummaryCard summary={room.operational} />
        {turnover ? (
          <TurnoverCard
            roomId={room.unitId}
            turnover={turnover}
          />
        ) : null}
        <HousekeepingCard
          actionPending={actionPending}
          housekeeping={room.housekeeping}
          onCompleteTask={onCompleteHousekeepingTask}
          onCreateStandardCleaning={onCreateStandardCleaning}
          onCreateOnDemandCleaning={onCreateOnDemandCleaning}
          onStartTask={onStartHousekeepingTask}
          roomId={room.unitId}
          roomName={room.roomName}
        />
        <MaintenanceCard maintenance={room.maintenance} roomId={room.unitId} roomName={room.roomName} />
      </section>
    </div>
  );
}
