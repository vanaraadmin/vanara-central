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
    <header className="room-expanded-section__header guest-card__identity">
      <div>
        <span className="room-expanded-section__eyebrow vc-section-eyebrow">Guest</span>
        <h3 className="room-expanded-section__title guest-card__name" id={headingId}>{stay.guestName}</h3>
      </div>
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
    <div className="room-expanded-fact guest-card__stay-fact">
      <span className="room-expanded-fact__label">{label}</span>
      <strong className="room-expanded-fact__value">{value}</strong>
    </div>
  );
}

function GuestStaySummary({ stay }: { stay: RoomCurrentStaySummary }) {
  return (
    <div className="room-expanded-facts room-expanded-facts--three guest-card__stay">
      <GuestStayFact label="Arrived" value={formatDate(stay.arrivalDate)} />
      <GuestStayFact label="Leaving" value={formatDate(stay.departureDate)} />
      <GuestStayFact label="Stay" value={formatStay(stay.stayNights)} />
    </div>
  );
}

export default function GuestCard({ stay }: GuestCardProps) {
  const headingId = useId();

  return (
    <section className="room-expanded-section vc-glass-region guest-card" aria-labelledby={headingId}>
      <GuestIdentity headingId={headingId} stay={stay} />
      <div className="room-expanded-section__content">
        <GuestBookingSummary stay={stay} />
        <GuestStaySummary stay={stay} />
      </div>
    </section>
  );
}
