import type { TurnoverPresentation } from "../../config/turnoverPresentation";
import OperationalStatusPill from "./OperationalStatusPill";
import RoomDomainCard, { OperationalStateBlock } from "./RoomDomainCard";

type TurnoverCardProps = {
  roomId: number;
  turnover: TurnoverPresentation;
};

function TurnoverState({ turnover }: { turnover: TurnoverPresentation }) {
  return (
    <OperationalStateBlock
      detail={turnover.detail}
      tone={turnover.tone}
      value={turnover.label}
    />
  );
}

export default function TurnoverCard({
  roomId,
  turnover,
}: TurnoverCardProps) {
  return (
    <RoomDomainCard
      className="turnover-card"
      eyebrow="Turnover"
      headingId={`turnover-card-${roomId}`}
      state={<TurnoverState turnover={turnover} />}
      status={<OperationalStatusPill label={turnover.label} tone={turnover.tone} emphasis />}
      title="Current State"
    />
  );
}
