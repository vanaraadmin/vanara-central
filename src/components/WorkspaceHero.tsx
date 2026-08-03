import { forwardRef } from "react";
import { Link } from "react-router-dom";

const WORKSPACE_HOME_ROUTE = "/staff";

interface WorkspaceHeroProps {
  date: string;
  logoSrc: string;
  title: string;
}

const WorkspaceHero = forwardRef<HTMLImageElement, WorkspaceHeroProps>(function WorkspaceHero(
  { date, logoSrc, title },
  heroLogoRef,
) {
  return (
    <>
      <header className="workspace-masthead">
        <Link className="workspace-masthead__brand" to={WORKSPACE_HOME_ROUTE} aria-label="Back to Home">
          <span className="workspace-masthead__logo-slot" aria-hidden="true">
            <img ref={heroLogoRef} src={logoSrc} alt="Vanara" className="workspace-masthead__logo" />
          </span>

          <div className="workspace-masthead__wordmark">
            <span>Vanara</span>
            <strong>Central</strong>
          </div>
        </Link>

        <time className="workspace-masthead__date">{date}</time>
      </header>

      <section className="workspace-intro" aria-labelledby="workspace-title">
        <p className="workspace-intro__eyebrow">Staff page</p>
        <h1 id="workspace-title">{title}</h1>
      </section>
    </>
  );
});

export default WorkspaceHero;
