import type { TurnoverPresentation } from "../../config/turnoverPresentation";
import { useLanguage } from "../../providers/language.context";
import { translateStaffLabel } from "../../utils/staff-i18n-labels";
import OperationalStatusPill from "./OperationalStatusPill";
import RoomDomainCard, { OperationalStateBlock } from "./RoomDomainCard";

type TurnoverCardProps = {
  roomId: number;
  turnover: TurnoverPresentation;
};

function TurnoverState({ turnover }: { turnover: TurnoverPresentation }) {
  const { translate } = useLanguage();
  return (
    <OperationalStateBlock
      detail={turnover.detail}
      tone={turnover.tone}
      value={translateStaffLabel(turnover.label, translate)}
    />
  );
}

export default function TurnoverCard({
  roomId,
  turnover,
}: TurnoverCardProps) {
  const { translate } = useLanguage();
  return (
    <RoomDomainCard
      className="turnover-card"
      eyebrow={translate("turnover")}
      headingId={`turnover-card-${roomId}`}
      state={<TurnoverState turnover={turnover} />}
      status={<OperationalStatusPill label={translateStaffLabel(turnover.label, translate)} tone={turnover.tone} emphasis />}
      title={translate("currentState")}
    />
  );
}
