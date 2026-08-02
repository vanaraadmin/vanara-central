import type { RoomMaintenanceDomainSummary } from "../../types/rooms-workspace";
import OperationalStatusPill from "./OperationalStatusPill";
import RoomDomainCard, { OperationalStateBlock, PrimaryActionRow } from "./RoomDomainCard";

type MaintenanceCardProps = {
  roomId: number;
  roomName: string;
  maintenance: RoomMaintenanceDomainSummary;
};

export default function MaintenanceCard({ maintenance, roomId, roomName }: MaintenanceCardProps) {
  const action = maintenance.primaryAction;

  return (
    <RoomDomainCard
      action={action ? (
        <PrimaryActionRow
          ariaLabel={`${action.label} for ${roomName}`}
          label={action.label}
          to={action.target}
        />
      ) : null}
      className="maintenance-domain-card"
      eyebrow="Maintenance"
      headingId={`maintenance-card-${roomId}`}
      state={(
        <OperationalStateBlock
          detail={maintenance.detail}
          secondaryInfo={maintenance.secondaryInfo}
          tone={maintenance.tone}
          value={maintenance.primaryStatus}
        />
      )}
      status={<OperationalStatusPill label={maintenance.primaryStatus} tone={maintenance.tone} emphasis />}
      title="Technical"
    />
  );
}
