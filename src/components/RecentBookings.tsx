import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutsidePointerDown } from "../hooks/useOutsidePointerDown";
import type { BookingPulseEventType, BookingPulseItem } from "../types/staff";
import "../styles/RecentBookings.css";

export type RecentBookingEvent = BookingPulseItem;

type RecentBookingsProps = {
  events: RecentBookingEvent[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

const EVENT_LABELS: Record<BookingPulseEventType, string> = {
  NEW: "NEW",
  UPDATED: "UPDATED",
  CANCELLED: "CANCELLED",
};

function eventTone(type: BookingPulseEventType): string {
  return type.toLowerCase();
}

function countryCodeToFlag(countryCode?: string | null): string {
  if (!countryCode) return "";
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return String.fromCodePoint(...normalized.split("").map((character) => 127397 + character.charCodeAt(0)));
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
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

function dateKeyOffset(dateKey: string, offsetDays: number): string {
  const date = new Date(`${dateKey}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return bangkokDateKey(date);
}

function formatArrival(value?: string | null): string | null {
  if (!value) return null;
  const now = new Date();
  const today = bangkokDateKey(now);
  if (value === today) return "Arrives today";
  if (value === dateKeyOffset(today, 1)) return "Arrives tomorrow";
  const formatted = formatDate(value);
  return formatted ? `Arrives ${formatted}` : null;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatRelativeEventTime(value: string): string {
  const occurredAt = new Date(value);
  if (Number.isNaN(occurredAt.getTime())) return value;

  const now = new Date();
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - occurredAt.getTime()) / 60_000));
  if (elapsedMinutes < 60) return `${Math.max(1, elapsedMinutes)} min ago`;

  const eventDay = bangkokDateKey(occurredAt);
  const today = bangkokDateKey(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(occurredAt);

  if (eventDay === today) return `Today ${time}`;
  return formatDateTime(value);
}

function formatGuestCount(value?: number | null): string | null {
  if (value == null || value <= 0) return null;
  return `${value} ${value === 1 ? "guest" : "guests"}`;
}

function formatStay(value?: number | null): string | null {
  if (value == null) return null;
  return `${value} ${value === 1 ? "night" : "nights"}`;
}

function formatPrice(item: RecentBookingEvent): string | null {
  if (item.totalPrice == null) return null;
  const amount = item.totalPrice.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  return item.currency ? `${amount} ${item.currency}` : amount;
}

function safeDetailsId(eventId: string): string {
  return `booking-pulse-details-${eventId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function BookingPulseDetail({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="booking-pulse__detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function BookingPulseDetails({
  id,
  item,
}: {
  id: string;
  item: RecentBookingEvent;
}) {
  const flag = countryCodeToFlag(item.countryCode);
  const nationality = [flag, item.nationality].filter(Boolean).join(" ");

  return (
    <div
      id={id}
      className="booking-pulse__details"
      role="region"
      aria-label={`Booking details for ${item.guestName}`}
    >
      <dl className="booking-pulse__detail-grid">
        <BookingPulseDetail label="Guest" value={item.guestName} />
        <BookingPulseDetail label="Nationality" value={nationality || null} />
        <BookingPulseDetail label="Room" value={item.unitName} />
        <BookingPulseDetail label="Source" value={item.source} />
        <BookingPulseDetail label="Arrival" value={formatDate(item.arrivalDate)} />
        <BookingPulseDetail label="Departure" value={formatDate(item.departureDate)} />
        <BookingPulseDetail label="Stay" value={formatStay(item.stayNights)} />
        <BookingPulseDetail label="Status" value={item.bookingStatus} />
        <BookingPulseDetail label="Guest count" value={formatGuestCount(item.guestCount)} />
        <BookingPulseDetail label="Event" value={EVENT_LABELS[item.eventType]} />
        <BookingPulseDetail label="Event time" value={formatDateTime(item.eventTimestamp)} />
        <BookingPulseDetail label="Total" value={formatPrice(item)} />
      </dl>
    </div>
  );
}

function BookingEventRow({
  event,
  expanded,
  index,
  onToggle,
}: {
  event: RecentBookingEvent;
  expanded: boolean;
  index: number;
  onToggle: () => void;
}) {
  const tone = eventTone(event.eventType);
  const detail = [event.unitName, event.source].filter(Boolean).join(" / ");
  const arrival = formatArrival(event.arrivalDate);
  const eventTime = formatRelativeEventTime(event.eventTimestamp);
  const timing = [arrival, eventTime].filter(Boolean).join(" / ");
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
              {EVENT_LABELS[event.eventType]}
            </span>
          </span>

          <span className="recent-bookings__event-detail booking-pulse__meta">{detail || "Booking details"}</span>
        </span>

        <time className="recent-bookings__event-time booking-pulse__timing" dateTime={event.eventTimestamp}>
          <span>{timing}</span>
        </time>
      </button>

      {expanded ? <BookingPulseDetails id={detailsId} item={event} /> : null}

      <span className="recent-bookings__event-index" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
    </article>
  );
}

function RecentBookingsEmpty() {
  return (
    <div className="recent-bookings__empty booking-pulse__empty" role="status">
      <span className="recent-bookings__empty-symbol" aria-hidden="true">
        <span />
      </span>

      <span className="recent-bookings__empty-copy">
        <strong>No recent booking activity</strong>
      </span>
    </div>
  );
}

function RecentBookingsLoading() {
  return (
    <div
      className="recent-bookings__loading"
      aria-label="Loading recent bookings"
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
  return (
    <div className="recent-bookings__empty booking-pulse__error" role="status">
      <span className="recent-bookings__empty-copy">
        <strong>Booking activity could not be loaded.</strong>
        {onRetry ? <button type="button" onClick={onRetry}>Try again</button> : null}
      </span>
    </div>
  );
}

export default function RecentBookings({
  events,
  loading = false,
  error = false,
  onRetry,
}: RecentBookingsProps) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
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
          <span className="recent-bookings__eyebrow">Booking pulse</span>

          <h2 id="recent-bookings-title">Recent Bookings</h2>
        </div>

        <div
          className="recent-bookings__counter"
          aria-label={`${visibleEvents.length} recent booking events`}
        >
          <span>{String(visibleEvents.length).padStart(2, "0")}</span>
          <small>latest</small>
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
