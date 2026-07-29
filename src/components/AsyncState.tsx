import { RefreshIcon } from "./OperationsIcons";
import { useLanguage } from "../providers/language.context";

export function PageLoading() {
  const { translate } = useLanguage();

  return (
    <div className="async-state async-state--loading" aria-live="polite">
      <span className="vc-sr-only">{translate("loading")}</span>
      <div className="skeleton skeleton--title" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
      </div>
    </div>
  );
}

interface PageErrorProps {
  onRetry: () => void;
}

export function PageError({ onRetry }: PageErrorProps) {
  const { translate } = useLanguage();

  return (
    <div className="async-state async-state--error" role="alert">
      <span className="async-state__mark">!</span>
      <h2>{translate("unableToLoad")}</h2>
      <p>{translate("dashboardLoadError")}</p>
      <button type="button" onClick={onRetry}>
        <RefreshIcon />
        {translate("tryAgain")}
      </button>
    </div>
  );
}
