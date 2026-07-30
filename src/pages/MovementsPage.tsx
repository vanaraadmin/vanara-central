import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { AlertIcon, CheckInIcon, CheckOutIcon, RefreshIcon } from "../components/OperationsIcons";
import { loadArrivalsDepartures } from "../services/movements.service";
import type { ArrivalMovement, DepartureMovement } from "../types/movements";
import "../styles/MovementsPage.css";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(date + "T12:00:00+07:00"));
}

function checkoutTone(departure: DepartureMovement): string {
  switch (departure.checkoutEvent.type) {
    case "CheckoutConfirmed":
      return "confirmed";
    case "AutomaticFallback":
      return "fallback";
    default:
      return "pending";
  }
}

function ArrivalCard({ arrival }: { arrival: ArrivalMovement }) {
  return (
    <Link className="movement-card movement-card--arrival" to={`/rooms/${arrival.unitId ?? arrival.bookingId}`}>
      <div className="movement-card__icon" aria-hidden="true"><CheckInIcon /></div>
      <div className="movement-card__body">
        <div className="movement-card__topline">
          <h3>{arrival.room}</h3>
          <span>{arrival.roomStatus}</span>
        </div>
        <strong>{arrival.guestName}</strong>
        <p>ETA {arrival.eta ?? "not set"}</p>
        <p>Notes future placeholder</p>
        <div className="movement-card__actions" aria-label="Future arrival actions">
          <button disabled type="button">Check In</button>
          <button disabled type="button">Verify Documents</button>
          <button disabled type="button">Assign Keys</button>
        </div>
      </div>
    </Link>
  );
}

function DepartureCard({ departure }: { departure: DepartureMovement }) {
  return (
    <Link className={"movement-card movement-card--departure checkout-" + checkoutTone(departure)} to={`/rooms/${departure.unitId ?? departure.bookingId}`}>
      <div className="movement-card__icon" aria-hidden="true"><CheckOutIcon /></div>
      <div className="movement-card__body">
        <div className="movement-card__topline">
          <h3>{departure.room}</h3>
          <span>{departure.occupancyStatus}</span>
        </div>
        <strong>{departure.guestName}</strong>
        <p>Scheduled checkout {formatDate(departure.scheduledCheckout)}</p>
        <p>{departure.checkoutEvent.label}</p>
        <div className="movement-card__actions" aria-label="Future departure actions">
          <button disabled type="button">Checkout Completed</button>
        </div>
      </div>
    </Link>
  );
}

export default function MovementsPage() {
  const movements = useQuery({
    queryKey: ["movements"],
    queryFn: ({ signal }) => loadArrivalsDepartures(signal),
    refetchInterval: 60_000,
  });

  return (
    <WorkspaceShell title="Check-In / Out" workspace="reception" bodyClassName="movements-page">
      <div className="workspace-body-actions">
        <span>{movements.data ? formatDate(movements.data.date) : "Loading today"}</span>
        <button
          aria-label="Refresh arrivals and departures"
          className="movements-refresh"
          disabled={movements.isFetching}
          onClick={() => void movements.refetch()}
          type="button"
        >
          <RefreshIcon className={movements.isFetching ? "is-spinning" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {movements.isLoading && <PageLoading />}
      {movements.isError && !movements.data && <PageError onRetry={() => void movements.refetch()} />}

      {movements.data && (
        <div className="movements-agenda">
          <section className="movement-section movement-section--arrival" aria-labelledby="todays-arrivals">
            <header className="movement-section__header">
              <div><CheckInIcon /><h2 id="todays-arrivals">Today's Arrivals</h2></div>
              <strong>{movements.data.summary.arrivals}</strong>
            </header>
            <div className="movement-section__list">
              {movements.data.arrivals.length > 0
                ? movements.data.arrivals.map((arrival) => <ArrivalCard arrival={arrival} key={arrival.id} />)
                : <div className="movement-empty"><AlertIcon /><p>No arrivals today</p></div>}
            </div>
          </section>

          <section className="movement-section movement-section--departure" aria-labelledby="todays-departures">
            <header className="movement-section__header">
              <div><CheckOutIcon /><h2 id="todays-departures">Today's Departures</h2></div>
              <strong>{movements.data.summary.departures}</strong>
            </header>
            <div className="movement-section__list">
              {movements.data.departures.length > 0
                ? movements.data.departures.map((departure) => <DepartureCard departure={departure} key={departure.id} />)
                : <div className="movement-empty"><AlertIcon /><p>No departures today</p></div>}
            </div>
          </section>
        </div>
      )}
    </WorkspaceShell>
  );
}
