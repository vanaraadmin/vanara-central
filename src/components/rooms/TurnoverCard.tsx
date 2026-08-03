import type { TurnoverPresentation } from "../../config/turnoverPresentation";
import type { RoomHousekeepingCompletionMode } from "../../types/rooms-workspace";
import OperationalStatusPill from "./OperationalStatusPill";
import RoomDomainCard, { OperationalStateBlock, PrimaryActionRow } from "./RoomDomainCard";

type TurnoverCardProps = {
  actionPending: boolean;
  roomId: number;
  roomName: string;
  turnover: TurnoverPresentation;
  onStartTask: (taskId: number, version: number) => void;
  onCompleteTask: (taskId: number, version: number, completionMode: RoomHousekeepingCompletionMode) => void;
};

function TurnoverState({ turnover }: { turnover: TurnoverPresentation }) {
  return (
    <OperationalStateBlock
      detail={turnover.detail}
      secondaryInfo={turnover.secondaryInfo}
      tone={turnover.tone}
      value={turnover.label}
    />
  );
}

function TurnoverDescription({ turnover }: { turnover: TurnoverPresentation }) {
  if (!turnover.task) return null;

  return (
    <dl className="room-domain-card__facts turnover-card__facts">
      <div className="room-domain-card__fact">
        <dt>Task</dt>
        <dd>{turnover.task.taskType}</dd>
      </div>
      <div className="room-domain-card__fact">
        <dt>Operator</dt>
        <dd>{turnover.task.assignee ?? "Unassigned"}</dd>
      </div>
    </dl>
  );
}

function TurnoverPrimaryAction({
  actionPending,
  onCompleteTask,
  onStartTask,
  roomName,
  turnover,
}: Pick<TurnoverCardProps, "actionPending" | "onCompleteTask" | "onStartTask" | "roomName" | "turnover">) {
  const action = turnover.primaryAction;
  if (!action) return null;

  return (
    <PrimaryActionRow
      ariaLabel={`${action.label} for ${roomName}`}
      busy={actionPending}
      label={action.label}
      onClick={() => {
        if (action.type === "START_CLEANING") onStartTask(action.taskId, action.version);
        else onCompleteTask(action.taskId, action.version, action.completionMode);
      }}
    />
  );
}

export default function TurnoverCard({
  actionPending,
  onCompleteTask,
  onStartTask,
  roomId,
  roomName,
  turnover,
}: TurnoverCardProps) {
  return (
    <RoomDomainCard
      action={turnover.primaryAction ? (
        <TurnoverPrimaryAction
          actionPending={actionPending}
          onCompleteTask={onCompleteTask}
          onStartTask={onStartTask}
          roomName={roomName}
          turnover={turnover}
        />
      ) : null}
      className="turnover-card"
      eyebrow="Turnover"
      headingId={`turnover-card-${roomId}`}
      state={<TurnoverState turnover={turnover} />}
      status={<OperationalStatusPill label={turnover.label} tone={turnover.tone} emphasis />}
      title="Stage"
    >
      <TurnoverDescription turnover={turnover} />
    </RoomDomainCard>
  );
}
