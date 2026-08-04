import type { Ref } from "react";
import GuestCard from "./GuestCard";
import HousekeepingCard from "./HousekeepingCard";
import MaintenanceCard from "./MaintenanceCard";
import RoomHero from "./RoomHero";
import RoomOperationalSummaryCard from "./RoomOperationalSummaryCard";
import TurnoverCard from "./TurnoverCard";
import VanaraGlassSheet from "../vanara/VanaraGlassSheet";
import { getRoomsWorkspaceTurnover } from "../../config/turnoverPresentation";
import type { VanaraGuestContact } from "../vanara/VanaraGuestContactSheet";
import type { RoomHousekeepingCompletionMode, RoomsWorkspaceRoom } from "../../types/rooms-workspace";

interface RoomExpandedWorkspaceProps {
  id: string;
  room: RoomsWorkspaceRoom;
  actionPending: boolean;
  guestContactButtonRef?: Ref<HTMLButtonElement>;
  onCreateStandardCleaning: (roomId: number) => void;
  onCreateOnDemandCleaning: (roomId: number) => void;
  onGuestContactRequest: (contact: VanaraGuestContact) => void;
  onStartHousekeepingTask: (taskId: number, version: number) => void;
  onCompleteHousekeepingTask: (taskId: number, version: number, completionMode: RoomHousekeepingCompletionMode) => void;
}

function roomGuestContact(room: RoomsWorkspaceRoom): VanaraGuestContact | null {
  if (room.operational.occupancy.state !== "OCCUPIED") return null;
  if (!room.currentStay) return null;
  if (!room.operational.occupancy.bookingId) return null;

  return {
    guestName: room.currentStay.guestName,
    unitName: room.roomName,
    phone: room.currentStay.phone,
    email: room.currentStay.email,
  };
}

export default function RoomExpandedWorkspace({
  actionPending,
  guestContactButtonRef,
  id,
  onCompleteHousekeepingTask,
  onCreateStandardCleaning,
  onCreateOnDemandCleaning,
  onGuestContactRequest,
  onStartHousekeepingTask,
  room,
}: RoomExpandedWorkspaceProps) {
  const turnover = getRoomsWorkspaceTurnover(room);
  const contact = roomGuestContact(room);

  return (
    <div id={id} className="room-row-expanded-content room-expanded" role="region" aria-label={`${room.roomName} workspace`}>
      <VanaraGlassSheet ariaLabel={`${room.roomName} details`} className="room-expanded-sheet" variant="elevated">
        <RoomHero room={room} />
        {room.currentStay ? (
          <GuestCard
            contact={contact}
            contactButtonRef={guestContactButtonRef}
            onContactRequest={onGuestContactRequest}
            stay={room.currentStay}
          />
        ) : null}
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
      </VanaraGlassSheet>
    </div>
  );
}
