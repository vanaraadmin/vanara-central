import type { RoomMaintenanceDomainSummary } from "../../types/rooms-workspace";
import { useLanguage } from "../../providers/language.context";
import { translateStaffLabel } from "../../utils/staff-i18n-labels";
import OperationalStatusPill from "./OperationalStatusPill";
import RoomDomainCard, { OperationalStateBlock, PrimaryActionRow } from "./RoomDomainCard";

type MaintenanceCardProps = {
  roomId: number;
  roomName: string;
  maintenance: RoomMaintenanceDomainSummary;
};

export default function MaintenanceCard({ maintenance, roomId, roomName }: MaintenanceCardProps) {
  const { translate } = useLanguage();
  const action = maintenance.primaryAction;

  return (
    <RoomDomainCard
      action={action ? (
        <PrimaryActionRow
          ariaLabel={`${translateStaffLabel(action.label, translate)} ${roomName}`}
          label={translateStaffLabel(action.label, translate)}
          to={action.target}
        />
      ) : null}
      className="maintenance-domain-card"
      eyebrow={translate("maintenance")}
      headingId={`maintenance-card-${roomId}`}
      state={(
        <OperationalStateBlock
          detail={translateStaffLabel(maintenance.detail, translate)}
          secondaryInfo={maintenance.secondaryInfo ? translateStaffLabel(maintenance.secondaryInfo, translate) : null}
          tone={maintenance.tone}
          value={translateStaffLabel(maintenance.primaryStatus, translate)}
        />
      )}
      status={<OperationalStatusPill label={translateStaffLabel(maintenance.primaryStatus, translate)} tone={maintenance.tone} emphasis />}
      title={translate("technical")}
    />
  );
}
