import { useId } from "react";
import { formatNationalityText } from "../../utils/country-nationality";
import type { RoomCurrentStaySummary } from "../../types/rooms-workspace";

type GuestCardProps = {
  stay: RoomCurrentStaySummary;
};

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatStay(value: number | null): string | null {
  if (value == null) return null;
  return `${value} ${value === 1 ? "night" : "nights"}`;
}

function GuestIdentity({ headingId, stay }: { headingId: string; stay: RoomCurrentStaySummary }) {
  return (
    <header className="guest-card__identity">
      <h3 className="guest-card__name" id={headingId}>{stay.guestName}</h3>
    </header>
  );
}

function GuestBookingSummary({ stay }: { stay: RoomCurrentStaySummary }) {
  const nationality = formatNationalityText(stay.nationality);
  const meta = [nationality, stay.source].filter(Boolean);

  if (meta.length === 0) return null;

  return (
    <p className="guest-card__meta">
      {meta.length > 0 ? (
        meta.map((item, index) => (
          <span className="guest-card__meta-item" key={`${item}-${index}`}>
            {index > 0 ? <span className="guest-card__meta-separator" aria-hidden="true">&middot;</span> : null}
            <span>{item}</span>
          </span>
        ))
      ) : null}
    </p>
  );
}

function GuestStayFact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div className="guest-card__stay-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function GuestStaySummary({ stay }: { stay: RoomCurrentStaySummary }) {
  return (
    <dl className="guest-card__stay">
      <GuestStayFact label="Arrived" value={formatDate(stay.arrivalDate)} />
      <GuestStayFact label="Leaving" value={formatDate(stay.departureDate)} />
      <GuestStayFact label="Stay" value={formatStay(stay.stayNights)} />
    </dl>
  );
}

export default function GuestCard({ stay }: GuestCardProps) {
  const headingId = useId();

  return (
    <section className="room-workspace-card guest-card" aria-labelledby={headingId}>
      <GuestIdentity headingId={headingId} stay={stay} />
      <GuestBookingSummary stay={stay} />
      <GuestStaySummary stay={stay} />
    </section>
  );
}
