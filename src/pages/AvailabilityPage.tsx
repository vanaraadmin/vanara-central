import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import WorkspaceShell from "../components/WorkspaceShell";
import { CalendarIcon, ChevronDownIcon } from "../components/OperationsIcons";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraGlassSheet from "../components/vanara/VanaraGlassSheet";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import { useLanguage } from "../providers/language.context";
import { loadAvailabilityPrices } from "../services/availability-prices.service";
import type { AvailabilityPricesGroup } from "../types/availability-prices";
import "../styles/AvailabilityPage.css";

type SearchRange = {
  arrival: string;
  departure: string;
};

const PRICE_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

function bangkokDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDateDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day) + days * 86_400_000).toISOString().slice(0, 10);
}

function isValidStayRange(range: SearchRange, minimumArrival: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(range.arrival)
    && /^\d{4}-\d{2}-\d{2}$/.test(range.departure)
    && range.arrival >= minimumArrival
    && range.departure > range.arrival;
}

function formatPrice(value: number | null, translate: (key: string) => string): string {
  return value === null ? translate("priceMissing") : `${PRICE_FORMATTER.format(value)} THB`;
}

function formatStayDate(value: string, language = "en"): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function availabilityLabel(group: AvailabilityPricesGroup, translate: (key: string, options?: Record<string, unknown>) => string): string {
  if (group.availabilityStatus === "UNKNOWN") return translate("cacheMissing");
  return translate(group.availableCount === 1 ? "oneAvailableUnit" : "availableUnits", { count: group.availableCount });
}

function AvailabilityResultCard({
  expanded,
  group,
  onToggle,
}: {
  expanded: boolean;
  group: AvailabilityPricesGroup;
  onToggle: () => void;
}) {
  const { translate } = useLanguage();
  return (
    <article className={`availability-card availability-card--${group.availabilityStatus.toLowerCase()}`}>
      <button
        aria-expanded={expanded}
        className="availability-card__summary vc-interactive-surface"
        onClick={onToggle}
        type="button"
      >
        <span className="availability-card__identity">
          <span className="availability-card__icon" aria-hidden="true">
            <CalendarIcon />
          </span>
          <span>
            <strong>{group.accommodationType}</strong>
            <small>{group.roomTypeName}</small>
          </span>
        </span>

        <span className="availability-card__availability">{availabilityLabel(group, translate)}</span>

        <dl className="availability-card__metrics">
          <div>
            <dt>{translate("averageNight")}</dt>
            <dd>{formatPrice(group.pricing.averageNightlyPrice, translate)}</dd>
          </div>
          <div>
            <dt>{translate("stayTotal")}</dt>
            <dd>{formatPrice(group.pricing.totalPrice, translate)}</dd>
          </div>
        </dl>

        <span className="availability-card__expand">
          <span>{expanded ? translate("hideRooms") : translate("expand")}</span>
          <ChevronDownIcon />
        </span>
      </button>

      {expanded ? (
        <div className="availability-card__rooms">
          <span>{translate("availableRooms")}</span>
          {group.availableUnits.length > 0 ? (
            <ul>
              {group.availableUnits.map((unit) => (
                <li key={unit.unitId}>{unit.unitName}</li>
              ))}
            </ul>
          ) : (
            <p>{translate("noAvailableRoomsInCache")}</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default function AvailabilityPage() {
  const { language, translate } = useLanguage();
  const defaultArrival = useMemo(() => bangkokDate(), []);
  const defaultDeparture = useMemo(() => bangkokDate(1), []);
  const [arrival, setArrival] = useState(defaultArrival);
  const [departure, setDeparture] = useState(defaultDeparture);
  const [submittedRange, setSubmittedRange] = useState<SearchRange | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const availability = useQuery({
    enabled: submittedRange !== null,
    queryKey: ["availability-prices", submittedRange?.arrival, submittedRange?.departure],
    queryFn: ({ signal }) => {
      if (!submittedRange) throw new Error("Search range is missing");
      return loadAvailabilityPrices(submittedRange.arrival, submittedRange.departure, signal);
    },
  });

  const result = availability.data;
  const groups = result?.groups ?? [];
  const minimumDeparture = addDateDays(arrival, 1);
  const cacheUnavailable = Boolean(result && result.cacheStatus === "UNAVAILABLE");
  const hasAvailableGroups = groups.some((group) => group.availableCount > 0);
  const noAvailability = Boolean(result && !cacheUnavailable && groups.length > 0 && !hasAvailableGroups);
  const missingPricingGroups = groups.filter((group) => group.availableCount > 0 && group.pricing.status === "MISSING");

  const updateArrival = (nextArrival: string) => {
    setArrival(nextArrival);
    setSearchError(null);
    const nextMinimumDeparture = addDateDays(nextArrival, 1);
    if (departure <= nextArrival) {
      setDeparture(nextMinimumDeparture);
    }
  };

  const updateDeparture = (nextDeparture: string) => {
    setDeparture(nextDeparture);
    setSearchError(null);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextRange = { arrival, departure };
    if (!isValidStayRange(nextRange, defaultArrival)) {
      setSearchError(translate("chooseDepartureAfterArrival"));
      return;
    }

    setSearchError(null);
    setExpandedGroups(new Set());
    setSubmittedRange(nextRange);
  };

  const toggleGroup = (roomTypeId: number) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(roomTypeId)) next.delete(roomTypeId);
      else next.add(roomTypeId);
      return next;
    });
  };

  return (
    <WorkspaceShell title={translate("prices")} stickyNavigationTitle={translate("prices")} workspace="rooms" bodyClassName="availability-page">
      <p className="availability-page__subtitle">
        {translate("pricesDescription")}
      </p>

      <VanaraGlassRegion className="availability-search" ariaLabelledBy="availability-search-title">
        <VanaraSectionHeader
          eyebrow={translate("verifiedPrices")}
          headingId="availability-search-title"
          title={translate("search")}
        />

        <form className="availability-search__controls" onSubmit={submitSearch}>
          <label className="availability-field">
            <span>{translate("arrival")}</span>
            <input
              min={defaultArrival}
              onChange={(event) => updateArrival(event.target.value)}
              type="date"
              value={arrival}
            />
          </label>

          <label className="availability-field">
            <span>{translate("departure")}</span>
            <input
              aria-invalid={Boolean(searchError)}
              min={minimumDeparture}
              onChange={(event) => updateDeparture(event.target.value)}
              type="date"
              value={departure}
            />
          </label>

          <button className="vc-primary-action availability-search__action" disabled={availability.isFetching} type="submit">
            {availability.isFetching ? translate("searching") : translate("searchPrices")}
          </button>
        </form>

        {searchError ? <p className="availability-search__error" role="alert">{searchError}</p> : null}
      </VanaraGlassRegion>

      <div className="availability-summary-slot" aria-hidden={!result}>
        {result ? (
          <span>{formatStayDate(result.arrivalDate, language)} - {formatStayDate(result.departureDate, language)} · {result.nights} {translate("nights")}</span>
        ) : null}
      </div>

      <VanaraGlassSheet className="availability-results" ariaLabelledBy="availability-results-title">
        <VanaraSectionHeader
          eyebrow={translate("verifiedPrices")}
          headingId="availability-results-title"
          meta={result ? translate("typesCount", { count: groups.length }) : undefined}
          title={translate("results")}
        />

        {!submittedRange && !searchError ? (
          <div className="availability-results__empty" role="status">
            <strong>{translate("noSearchExecuted")}</strong>
            <p>{translate("selectArrivalDeparture")}</p>
          </div>
        ) : null}

        {availability.isLoading ? (
          <div className="availability-results__loading" aria-live="polite">
            <span>{translate("readingCache")}</span>
          </div>
        ) : null}

        {availability.isError ? (
          <div className="availability-results__error" role="alert">
            <strong>{translate("pricesUnavailable")}</strong>
            <p>{translate("priceCouldNotLoad")}</p>
            <button className="vc-secondary-action" onClick={() => void availability.refetch()} type="button">{translate("tryAgain")}</button>
          </div>
        ) : null}

        {result && !availability.isLoading && !availability.isError ? (
          cacheUnavailable ? (
            <div className="availability-results__empty" role="status">
              <strong>{translate("cacheUnavailable")}</strong>
              <p>{translate("availabilityCouldNotLoad")}</p>
            </div>
          ) : noAvailability ? (
            <div className="availability-results__empty" role="status">
              <strong>{translate("noAccommodationAvailable")}</strong>
              <p>{translate("noAvailableUnitsForStay")}</p>
            </div>
          ) : groups.length > 0 ? (
            <div className="availability-results__list">
              {missingPricingGroups.length > 0 ? (
                <div className="availability-results__notice" role="status">
                  <strong>{translate("priceMissing")}</strong>
                  <p>{translate("priceMissingNotice")}</p>
                </div>
              ) : null}

              {groups.map((group) => (
                <AvailabilityResultCard
                  expanded={expandedGroups.has(group.roomTypeId)}
                  group={group}
                  key={group.roomTypeId}
                  onToggle={() => toggleGroup(group.roomTypeId)}
                />
              ))}
            </div>
          ) : (
            <div className="availability-results__empty" role="status">
              <strong>{translate("noAccommodationAvailable")}</strong>
              <p>{translate("noAvailableUnitsForStay")}</p>
            </div>
          )
        ) : null}
      </VanaraGlassSheet>
    </WorkspaceShell>
  );
}
