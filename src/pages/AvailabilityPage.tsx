import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import WorkspaceShell from "../components/WorkspaceShell";
import { CalendarIcon, ChevronDownIcon } from "../components/OperationsIcons";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraGlassSheet from "../components/vanara/VanaraGlassSheet";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
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

function isValidStayRange(range: SearchRange): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(range.arrival)
    && /^\d{4}-\d{2}-\d{2}$/.test(range.departure)
    && range.departure > range.arrival;
}

function formatPrice(value: number | null): string {
  return value === null ? "Unavailable" : `${PRICE_FORMATTER.format(value)} THB`;
}

function formatStayDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function availabilityLabel(group: AvailabilityPricesGroup): string {
  if (group.availabilityStatus === "UNKNOWN") return "Cache missing";
  return group.availableCount === 1 ? "1 available unit" : `${group.availableCount} available units`;
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

        <span className="availability-card__availability">{availabilityLabel(group)}</span>

        <dl className="availability-card__metrics">
          <div>
            <dt>Average / night</dt>
            <dd>{formatPrice(group.pricing.averageNightlyPrice)}</dd>
          </div>
          <div>
            <dt>Stay total</dt>
            <dd>{formatPrice(group.pricing.totalPrice)}</dd>
          </div>
        </dl>

        <span className="availability-card__expand">
          <span>{expanded ? "Hide rooms" : "Expand"}</span>
          <ChevronDownIcon />
        </span>
      </button>

      {expanded ? (
        <div className="availability-card__rooms">
          <span>Available rooms</span>
          {group.availableUnits.length > 0 ? (
            <ul>
              {group.availableUnits.map((unit) => (
                <li key={unit.unitId}>{unit.unitName}</li>
              ))}
            </ul>
          ) : (
            <p>No available rooms in the Beds24 cache for this stay.</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default function AvailabilityPage() {
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

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextRange = { arrival, departure };
    if (!isValidStayRange(nextRange)) {
      setSearchError("Choose a departure date after arrival.");
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
    <WorkspaceShell title="Availability & Prices" stickyNavigationTitle="Availability" workspace="rooms" bodyClassName="availability-page">
      <p className="availability-page__subtitle">
        Check availability and pricing for a selected stay.
      </p>

      <VanaraGlassRegion className="availability-search" ariaLabelledBy="availability-search-title">
        <VanaraSectionHeader
          eyebrow="Availability"
          headingId="availability-search-title"
          title="Availability Search"
        />

        <form className="availability-search__controls" onSubmit={submitSearch}>
          <label className="availability-field">
            <span>Arrival</span>
            <input
              onChange={(event) => setArrival(event.target.value)}
              type="date"
              value={arrival}
            />
          </label>

          <label className="availability-field">
            <span>Departure</span>
            <input
              aria-invalid={Boolean(searchError)}
              onChange={(event) => setDeparture(event.target.value)}
              type="date"
              value={departure}
            />
          </label>

          <button className="vc-primary-action availability-search__action" disabled={availability.isFetching} type="submit">
            {availability.isFetching ? "Searching" : "Search Availability"}
          </button>
        </form>

        {searchError ? <p className="availability-search__error" role="alert">{searchError}</p> : null}
      </VanaraGlassRegion>

      <div className="availability-summary-slot" aria-hidden={!result}>
        {result ? (
          <span>{formatStayDate(result.arrivalDate)} to {formatStayDate(result.departureDate)} - {result.nights === 1 ? "1 night" : `${result.nights} nights`}</span>
        ) : null}
      </div>

      <VanaraGlassSheet className="availability-results" ariaLabelledBy="availability-results-title">
        <VanaraSectionHeader
          eyebrow="Beds24 cache"
          headingId="availability-results-title"
          meta={result ? `${groups.length} types` : undefined}
          title="Results"
        />

        {!submittedRange && !searchError ? (
          <div className="availability-results__empty" role="status">
            <strong>No search executed yet.</strong>
            <p>Select arrival and departure to check availability and prices.</p>
          </div>
        ) : null}

        {availability.isLoading ? (
          <div className="availability-results__loading" aria-live="polite">
            <span>Reading Beds24 cache</span>
          </div>
        ) : null}

        {availability.isError ? (
          <div className="availability-results__error" role="alert">
            <strong>Availability is unavailable.</strong>
            <p>The cached Beds24 result could not be loaded.</p>
            <button className="vc-secondary-action" onClick={() => void availability.refetch()} type="button">Retry</button>
          </div>
        ) : null}

        {result && !availability.isLoading && !availability.isError ? (
          groups.length > 0 ? (
            <div className="availability-results__list">
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
              <strong>No cached availability found.</strong>
              <p>Beds24 has no cached room availability for this stay range.</p>
            </div>
          )
        ) : null}
      </VanaraGlassSheet>
    </WorkspaceShell>
  );
}
