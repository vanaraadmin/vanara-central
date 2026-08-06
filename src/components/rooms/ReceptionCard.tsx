import type { StatusTone } from "../../config/roomOperationalPresentation";
import type { ReceptionStayPhase, ReceptionStepState, RoomReceptionAlertSummary, RoomReceptionSummary } from "../../types/rooms-workspace";
import { useLanguage } from "../../providers/language.context";
import { translateStaffLabel } from "../../utils/staff-i18n-labels";
import OperationalStatusPill from "./OperationalStatusPill";
import RoomDomainCard, { OperationalStateBlock, PrimaryActionRow } from "./RoomDomainCard";

type ReceptionCardProps = {
  roomId: number;
  roomName: string;
  reception: RoomReceptionSummary;
};

type ReceptionStatusItemProps = {
  label: string;
  state: ReceptionStepState;
};

function getReceptionPhaseLabel(phase: ReceptionStayPhase, translate: (key: string) => string): string {
  if (phase === "ARRIVAL_DUE") return translate("arrivalDue");
  if (phase === "IN_HOUSE") return translate("inHouse");
  if (phase === "DEPARTURE_DUE") return translate("departureDue");
  if (phase === "CHECKED_OUT") return translate("checkedOut");
  return translate("reception");
}

function getReceptionPhaseTone(phase: ReceptionStayPhase): StatusTone {
  if (phase === "DEPARTURE_DUE") return "warning";
  if (phase === "ARRIVAL_DUE") return "info";
  if (phase === "IN_HOUSE") return "success";
  if (phase === "CHECKED_OUT") return "neutral";
  return "neutral";
}

function getReceptionStepLabel(state: ReceptionStepState, translate: (key: string) => string): string {
  if (state === "COMPLETE") return translate("complete");
  if (state === "PENDING") return translate("pending");
  if (state === "BLOCKED") return translate("attentionRequired");
  return translate("notRequired");
}

function getReceptionStepTone(state: ReceptionStepState): StatusTone {
  if (state === "COMPLETE") return "success";
  if (state === "PENDING") return "warning";
  if (state === "BLOCKED") return "danger";
  return "neutral";
}

function shouldRenderReceptionCard(reception: RoomReceptionSummary): boolean {
  return reception.phase !== "NONE" || reception.alerts.length > 0 || reception.primaryAction !== null;
}

function ReceptionStatusItem({ label, state }: ReceptionStatusItemProps) {
  const { translate } = useLanguage();
  return (
    <div className="reception-status-item">
      <dt className="reception-status-item__label">{translateStaffLabel(label, translate)}</dt>
      <dd className="reception-status-item__value">
        <OperationalStatusPill label={getReceptionStepLabel(state, translate)} tone={getReceptionStepTone(state)} />
      </dd>
    </div>
  );
}

function ReceptionAlerts({ alerts }: { alerts: RoomReceptionAlertSummary[] }) {
  const { translate } = useLanguage();
  if (alerts.length === 0) return null;
  return (
    <div className="reception-card__alerts" role="status">
      {alerts.map((alert) => (
        <OperationalStatusPill key={alert.id} label={translateStaffLabel(alert.label, translate)} tone={alert.tone} emphasis />
      ))}
    </div>
  );
}

function getReceptionDetail(reception: RoomReceptionSummary, translate: (key: string) => string): string {
  if (reception.primaryAction) return translateStaffLabel(reception.primaryAction.label, translate);
  if (reception.alerts.length > 0) return translate("receptionAttentionRequired");
  return translate("noReceptionActionRequired");
}

export default function ReceptionCard({ roomId, roomName, reception }: ReceptionCardProps) {
  const { translate } = useLanguage();
  if (!shouldRenderReceptionCard(reception)) return null;

  const phaseLabel = getReceptionPhaseLabel(reception.phase, translate);
  const phaseStatus = reception.phase !== "NONE"
    ? <OperationalStatusPill label={phaseLabel} tone={getReceptionPhaseTone(reception.phase)} emphasis />
    : undefined;

  return (
    <RoomDomainCard
      action={reception.primaryAction ? (
        <PrimaryActionRow
          ariaLabel={`${translate("openReception")} ${roomName}`}
          label={translate("openReception")}
          to={reception.primaryAction.target}
        />
      ) : null}
      className="reception-card"
      eyebrow={translate("reception")}
      headingId={`reception-card-${roomId}`}
      secondary={(
        <>
          <ReceptionAlerts alerts={reception.alerts} />
          <dl className="reception-card__steps">
            <ReceptionStatusItem label="Passport" state={reception.passport.state} />
            <ReceptionStatusItem label="Deposit" state={reception.deposit.state} />
            <ReceptionStatusItem label="Check-in" state={reception.checkIn.state} />
            <ReceptionStatusItem label="Check-out" state={reception.checkOut.state} />
          </dl>
        </>
      )}
      state={(
        <OperationalStateBlock
          detail={getReceptionDetail(reception, translate)}
          tone={getReceptionPhaseTone(reception.phase)}
          value={phaseLabel}
        />
      )}
      status={phaseStatus}
      title={translate("stay")}
    />
  );
}
