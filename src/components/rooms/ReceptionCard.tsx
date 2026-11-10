import type { StatusTone } from "../../config/roomOperationalPresentation";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReceptionStayPhase, ReceptionStepState, RoomReceptionAlertSummary, RoomReceptionSummary } from "../../types/rooms-workspace";
import { useLanguage } from "../../providers/language.context";
import { translateStaffLabel } from "../../utils/staff-i18n-labels";
import { resolveReceptionRoomAlert } from "../../services/reception.service";
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
    <div className="reception-card__alerts" aria-label={translate("receptionAttentionRequired")}>
      {alerts.map((alert) => (
        <span className="reception-card__alert-action" key={alert.id}>
          <OperationalStatusPill label={translateStaffLabel(alert.label, translate)} tone={alert.tone} emphasis />
        </span>
      ))}
    </div>
  );
}

function ReceptionRequirementActions({ alerts }: { alerts: RoomReceptionAlertSummary[] }) {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const deposit = useMutation({
    mutationFn: (bookingId: number) => resolveReceptionRoomAlert(bookingId, "deposit_pending"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rooms", "workspace"] });
      await queryClient.invalidateQueries({ queryKey: ["reception"] });
    },
  });
  const passportAlert = alerts.find((alert) => alert.type === "passport_missing");
  const depositAlert = alerts.find((alert) => alert.type === "deposit_pending");
  if (!passportAlert && !depositAlert) return null;
  const thai = language === "th";
  return (
    <div className="reception-card__requirement-actions">
      {passportAlert ? <Link className="vc-secondary-action" to={`/reception?bookingId=${passportAlert.bookingId}&intent=passport`}>
        {thai ? "เพิ่มหนังสือเดินทางที่ขาด" : "Add missing passport"}
      </Link> : null}
      {depositAlert ? <button className="vc-primary-action" disabled={deposit.isPending} onClick={() => deposit.mutate(depositAlert.bookingId)} type="button">
        {deposit.isPending ? "…" : thai ? "ได้รับเงินมัดจำแล้ว" : "Deposit delivered"}
      </button> : null}
      {deposit.isError ? <p className="reception-card__requirement-error" role="alert">{thai ? "ไม่สามารถบันทึกเงินมัดจำได้" : "Deposit could not be recorded. Try again."}</p> : null}
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
          <ReceptionRequirementActions alerts={reception.alerts} />
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
