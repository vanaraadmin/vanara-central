import { Link } from "react-router-dom";
import LanguageSwitch from "./LanguageSwitch";
import { ArrowRightIcon } from "./OperationsIcons";
import { useLanguage } from "../providers/language.context";
import "../styles/PlaceholderPage.css";

export interface PlaceholderLink {
  labelKey: string;
  to: string;
}

interface PagePlaceholderProps {
  titleKey: string;
  descriptionKey: string;
  links?: PlaceholderLink[];
  standalone?: boolean;
}

export default function PagePlaceholder({
  titleKey,
  descriptionKey,
  links = [],
  standalone = false,
}: PagePlaceholderProps) {
  const { translate } = useLanguage();

  return (
    <main className={standalone ? "placeholder-page is-standalone" : "placeholder-page"}>
      <header className="placeholder-header">
        <div>
          <span>{translate("appName")}</span>
          <h1>{translate(titleKey)}</h1>
        </div>
        <LanguageSwitch />
      </header>

      <section className="placeholder-card">
        <span className="placeholder-card__status">{translate("routeReady")}</span>
        <h2>{translate("placeholderTitle")}</h2>
        <p>{translate(descriptionKey)}</p>
        <p className="placeholder-card__note">{translate("placeholderNote")}</p>
      </section>

      {links.length > 0 && (
        <section className="placeholder-links" aria-label={translate("availableRoutes")}>
          <h2>{translate("availableRoutes")}</h2>
          {links.map((link) => (
            <Link key={link.to} to={link.to}>
              <span>{translate(link.labelKey)}</span>
              <ArrowRightIcon />
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
