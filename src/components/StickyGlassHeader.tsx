import { useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";
import logoSrc from "../assets/img/logo.png";
import "../styles/StickyGlassHeader.css";

interface StickyGlassHeaderProps {
  date: string;
  heroLogoRef: RefObject<HTMLImageElement | null>;
  progress: number;
  title: string;
}

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

function resetHeroLogo(logo: HTMLImageElement | null): void {
  if (!logo) return;
  logo.style.removeProperty("position");
  logo.style.removeProperty("top");
  logo.style.removeProperty("left");
  logo.style.removeProperty("width");
  logo.style.removeProperty("height");
  logo.style.removeProperty("z-index");
  logo.style.removeProperty("transform");
  logo.style.removeProperty("transform-origin");
  logo.style.removeProperty("will-change");
  logo.style.removeProperty("pointer-events");
}

function clampProgress(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export default function StickyGlassHeader({
  date,
  heroLogoRef,
  progress,
  title,
}: StickyGlassHeaderProps) {
  const compactLogoRef = useRef<HTMLImageElement>(null);
  const p = clampProgress(progress);
  const translateY = Math.round((1 - p) * 24 * 100) / 100;
  const scale = Math.round((0.985 + 0.015 * p) * 1000) / 1000;
  const compactLogoVisible = p >= 0.995;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("vc-sticky-glass-visible", p > 0.05);

    return () => {
      root.classList.remove("vc-sticky-glass-visible");
    };
  }, [p]);

  useLayoutEffect(() => {
    const heroLogo = heroLogoRef.current;
    const compactLogo = compactLogoRef.current;

    if (!heroLogo || !compactLogo || p <= 0 || compactLogoVisible) {
      resetHeroLogo(heroLogo);
      return;
    }

    const first = heroLogo.parentElement?.getBoundingClientRect();
    const last = compactLogo.getBoundingClientRect();
    if (!first || first.width <= 0 || first.height <= 0 || last.width <= 0 || last.height <= 0) {
      resetHeroLogo(heroLogo);
      return;
    }

    const lastSize = Math.min(last.width, last.height);
    const scale = 1 + (lastSize / first.width - 1) * p;
    const x = (last.left - first.left) * p;
    const y = (last.top - first.top) * p;

    heroLogo.style.position = "fixed";
    heroLogo.style.left = `${first.left}px`;
    heroLogo.style.top = `${first.top}px`;
    heroLogo.style.width = `${first.width}px`;
    heroLogo.style.height = `${first.height}px`;
    heroLogo.style.zIndex = "90";
    heroLogo.style.transformOrigin = "top left";
    heroLogo.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    heroLogo.style.willChange = "transform";
    heroLogo.style.pointerEvents = "none";
  }, [compactLogoVisible, heroLogoRef, p]);

  useLayoutEffect(() => () => resetHeroLogo(heroLogoRef.current), [heroLogoRef]);

  const surfaceStyle: CSSProperties = {
    opacity: p,
    pointerEvents: p > 0.05 ? "auto" : "none",
    transform: `translateY(${translateY}px) scale(${scale})`,
  };
  const compactLogoStyle: CSSProperties = {
    opacity: compactLogoVisible ? 1 : 0,
  };

  return (
    <div
      aria-hidden={p <= 0}
      className="sticky-glass-nav-positioner sticky-glass-header"
    >
      <button
        aria-label="Return to top"
        className="sticky-glass-nav-surface sticky-glass-header__surface"
        onClick={scrollToPageTop}
        style={surfaceStyle}
        tabIndex={p > 0.05 ? 0 : -1}
        type="button"
      >
        <span className="sticky-glass-nav-logo-slot sticky-glass-header__logo-target">
          <img
            ref={compactLogoRef}
            alt=""
            className="sticky-glass-nav-logo"
            src={logoSrc}
            style={compactLogoStyle}
          />
        </span>

        <span className="sticky-glass-nav-title sticky-glass-header__title">
          {title}
        </span>

        <span className="sticky-glass-nav-date sticky-glass-header__date">{date}</span>
      </button>
    </div>
  );
}
