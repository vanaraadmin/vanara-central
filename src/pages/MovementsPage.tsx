import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { AlertIcon, CheckInIcon, CheckOutIcon, RefreshIcon } from "../components/OperationsIcons";
import { useLanguage } from "../providers/language.context";
import { loadArrivalsDepartures } from "../services/movements.service";
import type { ArrivalMovement, DepartureMovement } from "../types/movements";
import { translateStaffLabel } from "../utils/staff-i18n-labels";
import "../styles/MovementsPage.css";

function formatDate(date: string, language = "en") {
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
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
  const { translate } = useLanguage();
  return (
    <Link className="movement-card movement-card--arrival" to={`/rooms/${arrival.unitId ?? arrival.bookingId}`}>
      <div className="movement-card__icon" aria-hidden="true"><CheckInIcon /></div>
      <div className="movement-card__body">
        <div className="movement-card__topline">
          <h3>{arrival.room}</h3>
          <span>{translateStaffLabel(arrival.roomStatus, translate)}</span>
        </div>
        <strong>{arrival.guestName}</strong>
        <p>{translate("eta")} {arrival.eta ?? translate("notSet")}</p>
        <p>{translate("notesFuturePlaceholder")}</p>
        <div className="movement-card__actions" aria-label={translate("futureArrivalActions")}>
          <button disabled type="button">{translate("checkIn")}</button>
          <button disabled type="button">{translate("verifyDocuments")}</button>
          <button disabled type="button">{translate("assignKeys")}</button>
        </div>
      </div>
    </Link>
  );
}

function DepartureCard({ departure }: { departure: DepartureMovement }) {
  const { language, translate } = useLanguage();
  return (
    <Link className={"movement-card movement-card--departure checkout-" + checkoutTone(departure)} to={`/rooms/${departure.unitId ?? departure.bookingId}`}>
      <div className="movement-card__icon" aria-hidden="true"><CheckOutIcon /></div>
      <div className="movement-card__body">
        <div className="movement-card__topline">
          <h3>{departure.room}</h3>
          <span>{translateStaffLabel(departure.occupancyStatus, translate)}</span>
        </div>
        <strong>{departure.guestName}</strong>
        <p>{translate("scheduledCheckout")} {formatDate(departure.scheduledCheckout, language)}</p>
        <p>{translateStaffLabel(departure.checkoutEvent.label, translate)}</p>
        <div className="movement-card__actions" aria-label={translate("futureDepartureActions")}>
          <button disabled type="button">{translate("checkoutCompleted")}</button>
        </div>
      </div>
    </Link>
  );
}

export default function MovementsPage() {
  const { language, translate } = useLanguage();
  const movements = useQuery({
    queryKey: ["movements"],
    queryFn: ({ signal }) => loadArrivalsDepartures(signal),
    refetchInterval: 60_000,
  });

  return (
    <WorkspaceShell title={translate("arrivalsDepartures")} workspace="reception" bodyClassName="movements-page">
      <div className="workspace-body-actions">
        <span>{movements.data ? formatDate(movements.data.date, language) : translate("loadingToday")}</span>
        <button
          aria-label={translate("refreshArrivalsDepartures")}
          className="movements-refresh"
          disabled={movements.isFetching}
          onClick={() => void movements.refetch()}
          type="button"
        >
          <RefreshIcon className={movements.isFetching ? "is-spinning" : ""} />
          <span>{translate("refresh")}</span>
        </button>
      </div>

      {movements.isLoading && <PageLoading />}
      {movements.isError && !movements.data && <PageError onRetry={() => void movements.refetch()} />}

      {movements.data && (
        <div className="movements-agenda">
          <section className="movement-section movement-section--arrival" aria-labelledby="todays-arrivals">
            <header className="movement-section__header">
              <div><CheckInIcon /><h2 id="todays-arrivals">{translate("todaysCheckIns")}</h2></div>
              <strong>{movements.data.summary.arrivals}</strong>
            </header>
            <div className="movement-section__list">
              {movements.data.arrivals.length > 0
                ? movements.data.arrivals.map((arrival) => <ArrivalCard arrival={arrival} key={arrival.id} />)
                : <div className="movement-empty"><AlertIcon /><p>{translate("noArrivals")}</p></div>}
            </div>
          </section>

          <section className="movement-section movement-section--departure" aria-labelledby="todays-departures">
            <header className="movement-section__header">
              <div><CheckOutIcon /><h2 id="todays-departures">{translate("todaysCheckOuts")}</h2></div>
              <strong>{movements.data.summary.departures}</strong>
            </header>
            <div className="movement-section__list">
              {movements.data.departures.length > 0
                ? movements.data.departures.map((departure) => <DepartureCard departure={departure} key={departure.id} />)
                : <div className="movement-empty"><AlertIcon /><p>{translate("noDepartures")}</p></div>}
            </div>
          </section>
        </div>
      )}
    </WorkspaceShell>
  );
}
