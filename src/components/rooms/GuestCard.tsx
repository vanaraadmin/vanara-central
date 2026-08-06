import { useId, type Ref } from "react";
import VanaraGuestContactTrigger from "../vanara/VanaraGuestContactTrigger";
import { useLanguage } from "../../providers/language.context";
import { formatNationalityText } from "../../utils/country-nationality";
import type { VanaraGuestContact } from "../vanara/VanaraGuestContactSheet";
import type { RoomCurrentStaySummary } from "../../types/rooms-workspace";

type GuestCardProps = {
  contact: VanaraGuestContact | null;
  contactButtonRef?: Ref<HTMLButtonElement>;
  onContactRequest: (contact: VanaraGuestContact) => void;
  stay: RoomCurrentStaySummary;
};

function formatDate(value: string, language = "en"): string {
  const date = new Date(`${value}T12:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatStay(value: number | null, translate: (key: string, options?: Record<string, unknown>) => string): string | null {
  if (value == null) return null;
  return translate(value === 1 ? "nightCount" : "nightCountPlural", { count: value });
}

function GuestIdentity({
  contact,
  contactButtonRef,
  headingId,
  onContactRequest,
  stay,
}: {
  contact: VanaraGuestContact | null;
  contactButtonRef?: Ref<HTMLButtonElement>;
  headingId: string;
  onContactRequest: (contact: VanaraGuestContact) => void;
  stay: RoomCurrentStaySummary;
}) {
  const { translate } = useLanguage();
  return (
    <header className="room-expanded-section__header guest-card__identity">
      <div>
        <span className="room-expanded-section__eyebrow vc-section-eyebrow">{translate("guest")}</span>
        <h3 className="room-expanded-section__title guest-card__name" id={headingId}>{stay.guestName}</h3>
      </div>
      {contact ? (
        <VanaraGuestContactTrigger
          buttonRef={contactButtonRef}
          contact={contact}
          onClick={(event) => {
            event.stopPropagation();
            onContactRequest(contact);
          }}
        />
      ) : null}
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
  const { language, translate } = useLanguage();
  return (
    <div className="room-expanded-facts room-expanded-facts--three guest-card__stay">
      <GuestStayFact label={translate("checkIn")} value={formatDate(stay.arrivalDate, language)} />
      <GuestStayFact label={translate("checkOut")} value={formatDate(stay.departureDate, language)} />
      <GuestStayFact label={translate("stay")} value={formatStay(stay.stayNights, translate)} />
    </div>
  );
}

export default function GuestCard({
  contact,
  contactButtonRef,
  onContactRequest,
  stay,
}: GuestCardProps) {
  const headingId = useId();

  return (
    <section className="room-expanded-section vc-glass-region guest-card" aria-labelledby={headingId}>
      <GuestIdentity
        contact={contact}
        contactButtonRef={contactButtonRef}
        headingId={headingId}
        onContactRequest={onContactRequest}
        stay={stay}
      />
      <div className="room-expanded-section__content">
        <GuestBookingSummary stay={stay} />
        <GuestStaySummary stay={stay} />
      </div>
    </section>
  );
}
