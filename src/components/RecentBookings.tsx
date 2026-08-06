import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutsidePointerDown } from "../hooks/useOutsidePointerDown";
import type { BookingPulseEventType, BookingPulseItem } from "../types/staff";
import { useLanguage } from "../providers/language.context";
import "../styles/RecentBookings.css";

export type RecentBookingEvent = BookingPulseItem;

type RecentBookingsProps = {
  events: RecentBookingEvent[];
  canViewBookingValue?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

function eventLabel(type: BookingPulseEventType, translate: (key: string) => string): string {
  if (type === "NEW") return translate("eventNew");
  if (type === "UPDATED") return translate("eventModified");
  return translate("cancelled");
}

function eventTone(type: BookingPulseEventType): string {
  return type.toLowerCase();
}

function countryCodeToFlag(countryCode?: string | null): string {
  if (!countryCode) return "";
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return String.fromCodePoint(...normalized.split("").map((character) => 127397 + character.charCodeAt(0)));
}

function formatDate(value?: string | null, language = "en"): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function bangkokDateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatDateTime(value: string, language = "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatRelativeEventTime(value: string, language = "en", translate: (key: string, options?: Record<string, unknown>) => string): string {
  const occurredAt = new Date(value);
  if (Number.isNaN(occurredAt.getTime())) return value;

  const now = new Date();
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - occurredAt.getTime()) / 60_000));
  if (elapsedMinutes < 60) return translate("minutesAgo", { count: Math.max(1, elapsedMinutes) });

  const eventDay = bangkokDateKey(occurredAt);
  const today = bangkokDateKey(now);
  const time = new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(occurredAt);

  if (eventDay === today) return `${translate("today")} ${time}`;
  return formatDateTime(value, language);
}

function formatGuestCount(value: number | null | undefined, translate: (key: string, options?: Record<string, unknown>) => string): string | null {
  if (value == null || value <= 0) return null;
  return translate(value === 1 ? "guestCount" : "guestCountPlural", { count: value });
}

function formatStay(value: number | null | undefined, translate: (key: string, options?: Record<string, unknown>) => string): string | null {
  if (value == null) return null;
  return translate(value === 1 ? "nightCount" : "nightCountPlural", { count: value });
}

function formatBookingValue(value?: number | null): string | null {
  if (value == null) return null;
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })} THB`;
}

function bookingSourceLabel(value: string | null | undefined, translate: (key: string) => string): string | null {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  return cleaned.toLowerCase() === "direct" ? translate("frontDesk") : cleaned;
}

function safeDetailsId(eventId: string): string {
  return `booking-pulse-details-${eventId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function BookingPulseDetail({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="booking-pulse__detail">
      <dt className="booking-pulse__detail-label">{label}</dt>
      <dd className="booking-pulse__detail-value">{value}</dd>
    </div>
  );
}

function BookingPulseDetails({
  canViewBookingValue,
  id,
  item,
}: {
  canViewBookingValue: boolean;
  id: string;
  item: RecentBookingEvent;
}) {
  const { language, translate } = useLanguage();
  const bookingValue = canViewBookingValue ? formatBookingValue(item.totalPrice) : null;
  const roomQuantity = item.roomQuantity > 1 ? item.roomQuantity : null;
  const source = bookingSourceLabel(item.source, translate);

  return (
    <div
      id={id}
      className="booking-pulse__details"
      role="region"
      aria-label={translate("bookingDetailsFor", { guestName: item.guestName })}
    >
      <dl className="booking-pulse__detail-grid">
        <BookingPulseDetail label={translate("guest")} value={item.guestName} />
        <BookingPulseDetail label={translate("room")} value={item.unitName} />
        <BookingPulseDetail label={translate("roomQuantity")} value={roomQuantity} />
        <BookingPulseDetail label={translate("source")} value={source} />
        <BookingPulseDetail label={translate("checkIn")} value={formatDate(item.arrivalDate, language)} />
        <BookingPulseDetail label={translate("checkOut")} value={formatDate(item.departureDate, language)} />
        <BookingPulseDetail label={translate("stay")} value={formatStay(item.stayNights, translate)} />
        <BookingPulseDetail label={translate("guestCountLabel")} value={formatGuestCount(item.guestCount, translate)} />
        <BookingPulseDetail label={translate("bookingValue")} value={bookingValue} />
      </dl>
    </div>
  );
}

function BookingEventRow({
  canViewBookingValue,
  event,
  expanded,
  index,
  onToggle,
}: {
  canViewBookingValue: boolean;
  event: RecentBookingEvent;
  expanded: boolean;
  index: number;
  onToggle: () => void;
}) {
  const { language, translate } = useLanguage();
  const tone = eventTone(event.eventType);
  const source = bookingSourceLabel(event.source, translate);
  const detail = source;
  const eventTime = formatRelativeEventTime(event.eventTimestamp, language, translate);
  const timing = eventTime;
  const detailsId = safeDetailsId(event.eventId);
  const flag = countryCodeToFlag(event.countryCode);

  return (
    <article
      className={[
        "recent-bookings__event",
        "booking-pulse__item",
        `recent-bookings__event--${tone}`,
        `booking-pulse__item--${tone}`,
        expanded ? "recent-bookings__event--expanded booking-pulse__item--expanded" : "",
      ].filter(Boolean).join(" ")}
      aria-label={`${event.guestName}, ${detail}, ${timing}`}
    >
      <button
        type="button"
        className="recent-bookings__event-trigger booking-pulse__trigger"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        <span className="recent-bookings__event-marker" aria-hidden="true">
          <span className="recent-bookings__event-dot" />
          <span className="recent-bookings__event-line" />
        </span>

        <span className="recent-bookings__event-copy booking-pulse__primary">
          <span className="recent-bookings__event-topline">
            <strong className="recent-bookings__event-title booking-pulse__guest">
              {flag ? <span className="booking-pulse__flag" aria-hidden="true">{flag}</span> : null}
              {event.guestName}
            </strong>

            <span className={`recent-bookings__event-kind booking-pulse__status booking-pulse__status--${tone}`}>
              {eventLabel(event.eventType, translate)}
            </span>
          </span>

          <span className="recent-bookings__event-detail booking-pulse__meta">{detail || translate("bookingDetails")}</span>
        </span>

        <time className="recent-bookings__event-time booking-pulse__timing" dateTime={event.eventTimestamp}>
          <span>{timing}</span>
        </time>
      </button>

      {expanded ? <BookingPulseDetails canViewBookingValue={canViewBookingValue} id={detailsId} item={event} /> : null}

      <span className="recent-bookings__event-index" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
    </article>
  );
}

function RecentBookingsEmpty() {
  const { translate } = useLanguage();
  return (
    <div className="recent-bookings__empty booking-pulse__empty" role="status">
      <span className="recent-bookings__empty-symbol" aria-hidden="true">
        <span />
      </span>

      <span className="recent-bookings__empty-copy">
        <strong>{translate("noRecentBookingActivity")}</strong>
      </span>
    </div>
  );
}

function RecentBookingsLoading() {
  const { translate } = useLanguage();
  return (
    <div
      className="recent-bookings__loading"
      aria-label={translate("loading")}
      role="status"
    >
      {[0, 1, 2].map((item) => (
        <span className="recent-bookings__skeleton" key={item}>
          <span />
          <span />
        </span>
      ))}
    </div>
  );
}

function RecentBookingsError({ onRetry }: { onRetry?: () => void }) {
  const { translate } = useLanguage();
  return (
    <div className="recent-bookings__empty booking-pulse__error" role="status">
      <span className="recent-bookings__empty-copy">
        <strong>{translate("bookingActivityLoadFailed")}</strong>
        {onRetry ? <button type="button" onClick={onRetry}>{translate("tryAgain")}</button> : null}
      </span>
    </div>
  );
}

export default function RecentBookings({
  canViewBookingValue = false,
  events,
  loading = false,
  error = false,
  onRetry,
}: RecentBookingsProps) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const { translate } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleEvents = useMemo(() => events.slice(0, 3), [events]);
  const expandedEventStillVisible = expandedEventId !== null && visibleEvents.some((item) => item.eventId === expandedEventId);
  const activeExpandedEventId = expandedEventStillVisible ? expandedEventId : null;

  const collapse = useCallback(() => {
    setExpandedEventId(null);
  }, []);

  const toggleEvent = useCallback((eventId: string) => {
    setExpandedEventId((current) => (current === eventId ? null : eventId));
  }, []);

  useOutsidePointerDown(containerRef, collapse, activeExpandedEventId !== null);

  useEffect(() => {
    if (expandedEventId && !expandedEventStillVisible) {
      const timer = window.setTimeout(() => {
        setExpandedEventId(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [expandedEventId, expandedEventStillVisible]);

  useEffect(() => {
    if (!activeExpandedEventId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedEventId(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeExpandedEventId]);

  return (
    <section
      className="recent-bookings booking-pulse"
      aria-labelledby="recent-bookings-title"
    >
      <div className="recent-bookings__heading booking-pulse__heading">
        <div className="recent-bookings__heading-copy">
          <span className="recent-bookings__eyebrow">{translate("bookingPulse")}</span>

          <h2 id="recent-bookings-title">{translate("recentBookings")}</h2>
        </div>

        <div
          className="recent-bookings__counter"
          aria-label={translate("recentBookingEventsAria", { count: visibleEvents.length })}
        >
          <span>{String(visibleEvents.length).padStart(2, "0")}</span>
          <small>{translate("latest")}</small>
        </div>
      </div>

      <div className="recent-bookings__surface booking-pulse__surface">
        <span className="recent-bookings__ambient" aria-hidden="true" />
        <span className="recent-bookings__grain" aria-hidden="true" />

        {loading && visibleEvents.length === 0 ? (
          <RecentBookingsLoading />
        ) : error && visibleEvents.length === 0 ? (
          <RecentBookingsError onRetry={onRetry} />
        ) : visibleEvents.length > 0 ? (
          <div ref={containerRef} className="recent-bookings__list booking-pulse__list">
            {visibleEvents.map((event, index) => (
              <BookingEventRow
                canViewBookingValue={canViewBookingValue}
                event={event}
                expanded={activeExpandedEventId === event.eventId}
                index={index}
                key={event.eventId}
                onToggle={() => toggleEvent(event.eventId)}
              />
            ))}
          </div>
        ) : (
          <RecentBookingsEmpty />
        )}
      </div>
    </section>
  );
}
