import { Link } from "react-router-dom";
import type { StatusTone } from "../../config/roomOperationalPresentation";
import type { ReceptionStayPhase, ReceptionStepState, RoomReceptionAlertSummary, RoomReceptionPrimaryAction, RoomReceptionSummary } from "../../types/rooms-workspace";
import { ArrowRightIcon } from "../OperationsIcons";
import OperationalStatusPill from "./OperationalStatusPill";
import RoomDomainCard from "./RoomDomainCard";

type ReceptionCardProps = {
  roomId: number;
  roomName: string;
  reception: RoomReceptionSummary;
};

type ReceptionStatusItemProps = {
  label: string;
  state: ReceptionStepState;
};

function getReceptionPhaseLabel(phase: ReceptionStayPhase): string {
  if (phase === "ARRIVAL_DUE") return "Arrival Due";
  if (phase === "IN_HOUSE") return "In House";
  if (phase === "DEPARTURE_DUE") return "Departure Due";
  if (phase === "CHECKED_OUT") return "Checked Out";
  return "Reception";
}

function getReceptionPhaseTone(phase: ReceptionStayPhase): StatusTone {
  if (phase === "DEPARTURE_DUE") return "warning";
  if (phase === "ARRIVAL_DUE") return "info";
  if (phase === "IN_HOUSE") return "success";
  if (phase === "CHECKED_OUT") return "neutral";
  return "neutral";
}

function getReceptionStepLabel(state: ReceptionStepState): string {
  if (state === "COMPLETE") return "Complete";
  if (state === "PENDING") return "Pending";
  if (state === "BLOCKED") return "Attention Required";
  return "Not Required";
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
  return (
    <div className="reception-status-item">
      <dt className="reception-status-item__label">{label}</dt>
      <dd className="reception-status-item__value">
        <OperationalStatusPill label={getReceptionStepLabel(state)} tone={getReceptionStepTone(state)} />
      </dd>
    </div>
  );
}

function ReceptionAlerts({ alerts }: { alerts: RoomReceptionAlertSummary[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="reception-card__alerts" role="status">
      {alerts.map((alert) => (
        <OperationalStatusPill key={alert.id} label={alert.label} tone={alert.tone} emphasis />
      ))}
    </div>
  );
}

function ReceptionPrimaryAction({ action, roomName }: { action: RoomReceptionPrimaryAction; roomName: string }) {
  return (
    <Link className="room-domain-card__primary-action" to={action.target} aria-label={`${action.label} for ${roomName}`}>
      <span>{action.label}</span>
      <ArrowRightIcon />
    </Link>
  );
}

export default function ReceptionCard({ roomId, roomName, reception }: ReceptionCardProps) {
  if (!shouldRenderReceptionCard(reception)) return null;

  const phaseLabel = getReceptionPhaseLabel(reception.phase);
  const phaseStatus = reception.phase !== "NONE"
    ? <OperationalStatusPill label={phaseLabel} tone={getReceptionPhaseTone(reception.phase)} emphasis />
    : undefined;

  return (
    <RoomDomainCard
      className="reception-card"
      eyebrow="Reception"
      headingId={`reception-card-${roomId}`}
      title={phaseLabel}
      status={phaseStatus}
    >
      <ReceptionAlerts alerts={reception.alerts} />
      {reception.primaryAction ? <ReceptionPrimaryAction action={reception.primaryAction} roomName={roomName} /> : null}

      <dl className="reception-card__steps">
        <ReceptionStatusItem label="Passport" state={reception.passport.state} />
        <ReceptionStatusItem label="Deposit" state={reception.deposit.state} />
        <ReceptionStatusItem label="Check-in" state={reception.checkIn.state} />
        <ReceptionStatusItem label="Check-out" state={reception.checkOut.state} />
      </dl>
    </RoomDomainCard>
  );
}
