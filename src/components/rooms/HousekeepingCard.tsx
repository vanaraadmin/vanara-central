import type { RoomHousekeepingCompletionMode, RoomHousekeepingDomainSummary } from "../../types/rooms-workspace";
import { useLanguage } from "../../providers/language.context";
import { translateStaffLabel } from "../../utils/staff-i18n-labels";
import OperationalStatusPill from "./OperationalStatusPill";
import RoomDomainCard, { OperationalStateBlock, PrimaryActionRow } from "./RoomDomainCard";

type HousekeepingCardProps = {
  roomId: number;
  roomName: string;
  housekeeping: RoomHousekeepingDomainSummary;
  actionPending: boolean;
  onCreateStandardCleaning: (roomId: number) => void;
  onCreateOnDemandCleaning: (roomId: number) => void;
  onStartTask: (taskId: number, version: number) => void;
  onCompleteTask: (taskId: number, version: number, completionMode: RoomHousekeepingCompletionMode) => void;
};

export default function HousekeepingCard({
  actionPending,
  housekeeping,
  onCompleteTask,
  onCreateStandardCleaning,
  onCreateOnDemandCleaning,
  onStartTask,
  roomId,
  roomName,
}: HousekeepingCardProps) {
  const { translate } = useLanguage();
  const action = housekeeping.primaryAction;
  const runAction = () => {
    if (!action) return;
    if (action.type === "OPEN_MAINTENANCE") return;
    if (action.type === "CREATE_STANDARD_CLEANING") {
      onCreateStandardCleaning(roomId);
      return;
    }
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
          ariaLabel={`${translateStaffLabel(action.label, translate)} ${roomName}`}
          busy={actionPending}
          label={translateStaffLabel(action.label, translate)}
          onClick={runAction}
          to={action.target}
        />
      ) : null}
      className="housekeeping-domain-card"
      eyebrow={translate("housekeeping")}
      headingId={`housekeeping-card-${roomId}`}
      state={(
        <OperationalStateBlock
          detail={translateStaffLabel(housekeeping.detail, translate)}
          secondaryInfo={housekeeping.secondaryInfo ? translateStaffLabel(housekeeping.secondaryInfo, translate) : null}
          tone={housekeeping.tone}
          value={translateStaffLabel(housekeeping.primaryStatus, translate)}
        />
      )}
      status={<OperationalStatusPill label={translateStaffLabel(housekeeping.primaryStatus, translate)} tone={housekeeping.tone} emphasis />}
      title={translate("work")}
    />
  );
}
