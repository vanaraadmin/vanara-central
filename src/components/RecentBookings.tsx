import "../styles/RecentBookings.css";

export type RecentBookingEventType = "new" | "updated" | "cancelled";

export type RecentBookingEvent = {
  id: string;
  type: RecentBookingEventType;
  title: string;
  accommodation: string;
  source?: string;
  occurredAt: string;
};

type RecentBookingsProps = {
  events: RecentBookingEvent[];
  loading?: boolean;
};
const EVENT_LABELS: Record<RecentBookingEventType, string> = {
  new: "NEW",
  updated: "UPDATED",
  cancelled: "CANCELLED",
};

function BookingEventRow({
  event,
  index,
}: {
  event: RecentBookingEvent;
  index: number;
}) {
  const detail = [event.accommodation, event.source]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`recent-bookings__event recent-bookings__event--${event.type}`}
      aria-label={`${event.title}, ${detail}, ${event.occurredAt}`}
    >
      <span className="recent-bookings__event-marker" aria-hidden="true">
        <span className="recent-bookings__event-dot" />
        <span className="recent-bookings__event-line" />
      </span>

      <span className="recent-bookings__event-copy">
        <span className="recent-bookings__event-topline">
          <strong className="recent-bookings__event-title">
            {event.title}
          </strong>

          <span className="recent-bookings__event-kind" aria-hidden="true">
            {EVENT_LABELS[event.type]}
          </span>
        </span>

        <span className="recent-bookings__event-detail">{detail}</span>
      </span>

      <time className="recent-bookings__event-time">
        {event.occurredAt}
      </time>

      <span className="recent-bookings__event-index" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
    </article>
  );
}

function RecentBookingsEmpty() {
  return (
    <div className="recent-bookings__empty" role="status">
      <span className="recent-bookings__empty-symbol" aria-hidden="true">
        <span />
      </span>

      <span className="recent-bookings__empty-copy">
        <strong>No bookings yet</strong>
        <span>No booking. No money. No honey.</span>
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

export default function RecentBookings({
  events,
  loading = false,
}: RecentBookingsProps) {
  const visibleEvents = events.slice(0, 3);

  return (
    <section
      className="recent-bookings"
      aria-labelledby="recent-bookings-title"
    >
      <div className="recent-bookings__heading">
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

      <div className="recent-bookings__surface">
        <span className="recent-bookings__ambient" aria-hidden="true" />
        <span className="recent-bookings__grain" aria-hidden="true" />

        {loading ? (
          <RecentBookingsLoading />
        ) : visibleEvents.length > 0 ? (
          <div className="recent-bookings__list">
            {visibleEvents.map((event, index) => (
              <BookingEventRow
                event={event}
                index={index}
                key={event.id}
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
