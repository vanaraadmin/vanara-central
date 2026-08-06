import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../providers/language.context";
import ProfilePanel from "./ProfilePanel";

const WORKSPACE_HOME_ROUTE = "/staff";

interface WorkspaceHeroProps {
  action?: ReactNode;
  date: string;
  logoSrc: string;
  title: string;
}

export default function WorkspaceHero({
  action,
  date,
  logoSrc,
  title,
}: WorkspaceHeroProps) {
  const { translate } = useLanguage();

  return (
    <>
      <header className="workspace-masthead">
        <div className="workspace-masthead__identity">
          <Link className="workspace-masthead__brand" to={WORKSPACE_HOME_ROUTE} aria-label={translate("back")}>
            <span className="workspace-masthead__logo-slot" aria-hidden="true">
              <img src={logoSrc} alt="Vanara" className="workspace-masthead__logo" />
            </span>

            <div className="workspace-masthead__wordmark">
              <span>Vanara</span>
              <strong>Central</strong>
            </div>
          </Link>

          <a className="workspace-masthead__site" href="https://www.vanararetreat.com" target="_blank" rel="noreferrer">
            vanararetreat.com
          </a>
        </div>

        <div className="workspace-masthead__tools">
          <time className="workspace-masthead__date">{date}</time>
          <ProfilePanel />
        </div>
      </header>

      <section className="workspace-intro" aria-labelledby="workspace-title">
        <p className="workspace-intro__eyebrow">{translate("staffPage")}</p>
        <div className="workspace-intro__title-row">
          <h1 id="workspace-title">{title}</h1>
          {action ? <div className="workspace-intro__action">{action}</div> : null}
        </div>
      </section>
    </>
  );
}
