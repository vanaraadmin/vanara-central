import { useCallback, useEffect, useState } from "react";
import LanguageSwitch from "../components/LanguageSwitch";
import { ArrivalsIcon, DeparturesIcon, RefreshIcon } from "../components/OperationsIcons";
import { useLanguage } from "../providers/language.context";
import "../styles/TodayPage.css";

interface TodayReservation { id: number; guestName: string; unit: string; roomType: string; adults: number; children: number; guests: number; arrival: string; departure: string; channel: string; status: string; apiReference: string | null; }
interface TodayResponse { ok: boolean; data: { date: string; arrivals: TodayReservation[]; departures: TodayReservation[]; summary: { arrivals: number; departures: number; arrivingGuests: number; departingGuests: number; }; }; fetchedAt: string; fromCache: boolean; stale: boolean; error?: string; }
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

function formatDate(date: string, language: "en" | "th") { if (!date) return ""; return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00+07:00`)); }
function formatUpdatedAt(date: string, language: "en" | "th") { return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(new Date(date)); }

function GuestCount({ reservation }: { reservation: TodayReservation }) {
  const { translate } = useLanguage(); const parts: string[] = [];
  if (reservation.adults > 0) parts.push(`${reservation.adults} ${translate(reservation.adults === 1 ? "adult" : "adults")}`);
  if (reservation.children > 0) parts.push(`${reservation.children} ${translate(reservation.children === 1 ? "child" : "children")}`);
  return <span>{parts.join(" · ") || translate("guestsNotSpecified")}</span>;
}

function ReservationCard({ reservation, type }: { reservation: TodayReservation; type: "arrival" | "departure" }) {
  const { translate } = useLanguage();
  return <article className={`today-reservation-card today-reservation-card--${type}`}>
    <div className="today-reservation-card__main"><div className="today-reservation-card__guest">
      <span className={`today-reservation-card__type today-reservation-card__type--${type}`}>{translate(type === "arrival" ? "checkIn" : "checkOut")}</span>
      <h3>{reservation.guestName}</h3><p className="today-reservation-card__details"><GuestCount reservation={reservation}/><span>{reservation.channel}</span></p>
    </div><div className="today-reservation-card__unit"><strong>{reservation.unit}</strong><span>{reservation.roomType}</span></div></div>
  </article>;
}

function ReservationSection({ title, emptyMessage, reservations, type }: { title: string; emptyMessage: string; reservations: TodayReservation[]; type: "arrival" | "departure" }) {
  return <section className="today-section"><div className="today-section__header"><div className={`today-section__icon today-section__icon--${type}`}>{type === "arrival" ? <ArrivalsIcon/> : <DeparturesIcon/>}</div><h2>{title}</h2><span className="today-section__count">{reservations.length}</span></div>
    {reservations.length === 0 ? <div className="today-empty"><p>{emptyMessage}</p></div> : <div className="today-reservation-list">{reservations.map(r => <ReservationCard key={r.id} reservation={r} type={type}/>)}</div>}
  </section>;
}

export default function TodayPage() {
  const { language, translate } = useLanguage(); const [response, setResponse] = useState<TodayResponse | null>(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState<string | null>(null);
  const loadToday = useCallback(async (forceRefresh = false) => { try { if (forceRefresh) { setRefreshing(true); } else { setLoading(true); } setError(null); const request = await fetch(`${API_BASE_URL}/api/today${forceRefresh ? "/refresh" : ""}`, { method: forceRefresh ? "POST" : "GET", headers: { accept: "application/json" } }); const result = await request.json() as TodayResponse; if (!request.ok || !result.ok) throw new Error(result.error || "Unable to load arrivals and departures"); setResponse(result); } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); } finally { setLoading(false); setRefreshing(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void loadToday(); }, 0); return () => window.clearTimeout(timer); }, [loadToday]);
  if (loading && !response) return <main className="today-page"><div className="today-loading"><span className="today-loading__mark"/>{translate("loadingToday")}</div></main>;
  if (error && !response) return <main className="today-page"><div className="today-error"><h2>{translate("connectionUnavailable")}</h2><p>{error}</p><button type="button" onClick={() => void loadToday()}>{translate("tryAgain")}</button></div></main>;
  if (!response) return null;
  const { data } = response;
  return <main className="today-page" id="today"><header className="today-header"><div className="today-header__copy"><span className="today-header__eyebrow">{translate("operationsEyebrow")}</span><h1>{translate("today")}</h1><p className="today-header__date">{formatDate(data.date, language)}</p></div><div className="today-header__actions"><LanguageSwitch/><button className="today-refresh-button" type="button" disabled={refreshing} onClick={() => void loadToday(true)} aria-label={translate("refresh")}><RefreshIcon className={refreshing ? "is-spinning" : ""}/><span>{refreshing ? translate("refreshing") : translate("refresh")}</span></button></div></header>
    {(error || response.stale) && <div className="today-warning" role="status">{response.stale ? translate("latestAvailableData") : translate("dataMayBeOld")}</div>}
    <section className="today-summary" aria-label={translate("todayOverview")}><article className="today-summary-card today-summary-card--arrival"><div className="today-summary-card__icon"><ArrivalsIcon/></div><span>{translate("arrivals")}</span><strong>{data.summary.arrivals}</strong><small>{data.summary.arrivingGuests} {translate(data.summary.arrivingGuests === 1 ? "guest" : "guests")}</small></article><article className="today-summary-card today-summary-card--departure"><div className="today-summary-card__icon"><DeparturesIcon/></div><span>{translate("departures")}</span><strong>{data.summary.departures}</strong><small>{data.summary.departingGuests} {translate(data.summary.departingGuests === 1 ? "guest" : "guests")}</small></article></section>
    <ReservationSection title={translate("arrivals")} emptyMessage={translate("noArrivals")} reservations={data.arrivals} type="arrival"/><ReservationSection title={translate("departures")} emptyMessage={translate("noDepartures")} reservations={data.departures} type="departure"/>
    <footer className="today-footer">{translate("updatedAt")} {formatUpdatedAt(response.fetchedAt, language)}{response.fromCache ? ` · ${translate("cachedData")}` : ""}</footer>
  </main>;
}
