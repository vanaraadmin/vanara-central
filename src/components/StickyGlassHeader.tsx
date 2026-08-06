import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import { Link } from "react-router-dom";
import logoSrc from "../assets/img/logo.png";
import { useLanguage } from "../providers/language.context";
import "../styles/StickyGlassHeader.css";

export type StickyGlassHeaderVariant = "default";

export type StickyGlassHeaderProps = {
  progress: number;
  title: string;
  variant?: StickyGlassHeaderVariant;
};

type ScrollContainer = Window | HTMLElement;

function resolveActualScrollContainer(): ScrollContainer {
  const scrollingElement = document.scrollingElement as HTMLElement | null;
  if (scrollingElement && scrollingElement.scrollHeight > scrollingElement.clientHeight) {
    return window;
  }

  const appScrollContainer = document.querySelector<HTMLElement>(".workspace-page, .staff-page");
  if (appScrollContainer && appScrollContainer.scrollHeight > appScrollContainer.clientHeight) {
    return appScrollContainer;
  }

  return window;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && "matchMedia" in window
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToPageTop(): void {
  const scrollContainer = resolveActualScrollContainer();

  if (scrollContainer === window) {
    window.scrollTo({
      behavior: "smooth",
      top: 0,
    });
    return;
  }

  scrollContainer.scrollTo({
    behavior: "smooth",
    top: 0,
  });
}

function clampProgress(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Purpose: presents the shared floating glass navigation after the workspace hero
 * has left view.
 *
 * When to use: full workspace pages that already have a large hero and need
 * persistent identity while the operator scrolls.
 *
 * When NOT to use: local card actions, modals, or page-specific navigation.
 *
 * Expected children: none; logo target and page title are controlled by typed
 * props.
 *
 * Accessibility notes: the button is keyboard reachable only while visible and
 * keeps a dedicated "Return to top" action. The Home link remains a separate
 * semantic navigation target.
 */
export default function StickyGlassHeader({
  progress,
  title,
  variant = "default",
}: StickyGlassHeaderProps) {
  const { translate } = useLanguage();
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const lastActivationRef = useRef(0);
  const p = clampProgress(progress);
  const visible = p > 0.05;
  const animationProgress = reducedMotion ? (visible ? 1 : 0) : p;
  const translateY = Math.round((1 - animationProgress) * 12 * 100) / 100;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("vc-sticky-glass-visible", visible);

    return () => {
      root.classList.remove("vc-sticky-glass-visible");
    };
  }, [visible]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => setReducedMotion(media.matches);

    syncReducedMotion();
    media.addEventListener("change", syncReducedMotion);
    return () => media.removeEventListener("change", syncReducedMotion);
  }, []);

  const positionerStyle: CSSProperties = {
    opacity: animationProgress,
    pointerEvents: visible ? "auto" : "none",
    transform: `translateX(-50%) translateY(${translateY}px)`,
  };

  const activateReturnToTop = (event?: SyntheticEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    const now = Date.now();
    if (now - lastActivationRef.current < 250) return;
    lastActivationRef.current = now;
    scrollToPageTop();
  };

  return (
    <div
      aria-hidden={!visible}
      className="sticky-glass-nav-positioner sticky-glass-header"
      style={positionerStyle}
    >
      <nav
        aria-label={`${title} ${translate("mainNavigation")}`}
        className={`sticky-glass-nav-surface sticky-glass-nav-surface--${variant} sticky-glass-header__surface`}
      >
        <button
          aria-label={`${translate("back")} ${title}`}
          className="sticky-glass-nav-return vc-interactive-surface"
          onClick={activateReturnToTop}
          onPointerUp={activateReturnToTop}
          tabIndex={visible ? 0 : -1}
          type="button"
        >
          <span className="sticky-glass-nav-logo-slot sticky-glass-header__logo-target">
            <img
              alt=""
              className="sticky-glass-nav-logo"
              src={logoSrc}
            />
          </span>

          <span className="sticky-glass-nav-title sticky-glass-header__title">
            {title}
          </span>
        </button>

        <Link
          aria-label={translate("staffHome")}
          className="sticky-glass-nav-home vc-interactive-surface"
          tabIndex={visible ? 0 : -1}
          to="/staff"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M4.75 11.1 12 5l7.25 6.1" />
            <path d="M6.75 10.2v8.05h10.5V10.2" />
            <path d="M10 18.25v-4.5h4v4.5" />
          </svg>
        </Link>
      </nav>
    </div>
  );
}
