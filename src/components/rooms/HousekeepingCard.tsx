import type { RoomHousekeepingCompletionMode, RoomHousekeepingDomainSummary } from "../../types/rooms-workspace";
import OperationalStatusPill from "./OperationalStatusPill";
import RoomDomainCard, { OperationalStateBlock, PrimaryActionRow } from "./RoomDomainCard";

type HousekeepingCardProps = {
  roomId: number;
  roomName: string;
  housekeeping: RoomHousekeepingDomainSummary;
  actionPending: boolean;
  onCreateOnDemandCleaning: (roomId: number) => void;
  onStartTask: (taskId: number, version: number) => void;
  onCompleteTask: (taskId: number, version: number, completionMode: RoomHousekeepingCompletionMode) => void;
};

function HousekeepingTaskSummary({ housekeeping }: { housekeeping: RoomHousekeepingDomainSummary }) {
  if (!housekeeping.activeTask) return null;

  return (
    <dl className="room-domain-card__facts">
      <div className="room-domain-card__fact">
        <dt>Task</dt>
        <dd>{housekeeping.activeTask.taskType}</dd>
      </div>
      <div className="room-domain-card__fact">
        <dt>Operator</dt>
        <dd>{housekeeping.activeTask.assignee ?? "Unassigned"}</dd>
      </div>
    </dl>
  );
}

export default function HousekeepingCard({
  actionPending,
  housekeeping,
  onCompleteTask,
  onCreateOnDemandCleaning,
  onStartTask,
  roomId,
  roomName,
}: HousekeepingCardProps) {
  const action = housekeeping.primaryAction;
  const runAction = () => {
    if (!action) return;
    if (action.type === "OPEN_MAINTENANCE") return;
    if (action.type === "CREATE_ON_DEMAND_CLEANING") {
      onCreateOnDemandCleaning(roomId);
      return;
    }
    if (action.type === "START_HOUSEKEEPING_TASK" && action.taskId && action.version) {
      onStartTask(action.taskId, action.version);
      return;
    }
    if (action.type === "COMPLETE_HOUSEKEEPING_TASK" && action.taskId && action.version && action.completionMode) {
      onCompleteTask(action.taskId, action.version, action.completionMode);
    }
  };

  return (
    <RoomDomainCard
      action={action ? (
        <PrimaryActionRow
          ariaLabel={`${action.label} for ${roomName}`}
          busy={actionPending}
          label={action.label}
          onClick={runAction}
          to={action.target}
        />
      ) : null}
      className="housekeeping-domain-card"
      eyebrow="Housekeeping"
      headingId={`housekeeping-card-${roomId}`}
      state={(
        <OperationalStateBlock
          detail={housekeeping.detail}
          secondaryInfo={housekeeping.secondaryInfo}
          tone={housekeeping.tone}
          value={housekeeping.primaryStatus}
        />
      )}
      status={<OperationalStatusPill label={housekeeping.primaryStatus} tone={housekeeping.tone} emphasis />}
      title="Work"
    >
      <HousekeepingTaskSummary housekeeping={housekeeping} />
    </RoomDomainCard>
  );
}
