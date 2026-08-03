import WorkspaceShell from "../components/WorkspaceShell";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraGlassSheet from "../components/vanara/VanaraGlassSheet";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import "../styles/AvailabilityPage.css";

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

export default function AvailabilityPage() {
  const arrival = bangkokDate();
  const departure = bangkokDate(1);

  return (
    <WorkspaceShell title="Availability & Prices" workspace="rooms" bodyClassName="availability-page">
      <p className="availability-page__subtitle">
        Check availability and pricing for a selected stay.
      </p>

      <VanaraGlassRegion className="availability-search" ariaLabelledBy="availability-search-title">
        <VanaraSectionHeader
          eyebrow="Availability"
          headingId="availability-search-title"
          title="Availability Search"
        />

        <div className="availability-search__controls">
          <label className="availability-field">
            <span>Arrival</span>
            <input defaultValue={arrival} type="date" />
          </label>

          <label className="availability-field">
            <span>Departure</span>
            <input defaultValue={departure} type="date" />
          </label>

          <button className="vc-primary-action availability-search__action" type="button">
            Search Availability
          </button>
        </div>
      </VanaraGlassRegion>

      <div className="availability-summary-slot" aria-hidden="true" />

      <VanaraGlassSheet className="availability-results" ariaLabelledBy="availability-results-title">
        <VanaraSectionHeader
          eyebrow="Read-only"
          headingId="availability-results-title"
          title="Results"
        />

        <div className="availability-results__empty" role="status">
          <strong>No search executed yet.</strong>
          <p>Select arrival and departure to check availability and prices.</p>
        </div>

        <div className="availability-results__loading" hidden aria-live="polite" />
        <div className="availability-results__error" hidden role="alert" />
      </VanaraGlassSheet>
    </WorkspaceShell>
  );
}
