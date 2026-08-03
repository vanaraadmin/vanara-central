import { useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";
import { playNavigationSound } from "../utils/navigation-sound";
import "../styles/StickyGlassHeader.css";

interface StickyGlassHeaderProps {
  date: string;
  heroLogoRef: RefObject<HTMLImageElement | null>;
  progress: number;
  title: string;
}

function scrollToWorkspaceTop(): void {
  playNavigationSound();
  window.scrollTo({
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
  const logoTargetRef = useRef<HTMLSpanElement>(null);
  const p = clampProgress(progress);
  const translateY = Math.round((1 - p) * 24 * 100) / 100;
  const scale = Math.round((0.985 + 0.015 * p) * 1000) / 1000;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("vc-sticky-glass-visible", p > 0.05);

    return () => {
      root.classList.remove("vc-sticky-glass-visible");
    };
  }, [p]);

  useLayoutEffect(() => {
    const logo = heroLogoRef.current;
    const target = logoTargetRef.current;

    if (!logo || !target || p <= 0) {
      resetHeroLogo(logo);
      return;
    }

    const first = logo.parentElement?.getBoundingClientRect();
    const last = target.getBoundingClientRect();
    if (!first || first.width <= 0 || first.height <= 0 || last.width <= 0 || last.height <= 0) {
      resetHeroLogo(logo);
      return;
    }

    const lastSize = Math.min(last.width, last.height);
    const lastLeft = last.left;
    const lastTop = last.top;
    const scale = 1 + (lastSize / first.width - 1) * p;
    const x = (lastLeft - first.left) * p;
    const y = (lastTop - first.top) * p;

    logo.style.position = "fixed";
    logo.style.left = `${first.left}px`;
    logo.style.top = `${first.top}px`;
    logo.style.width = `${first.width}px`;
    logo.style.height = `${first.height}px`;
    logo.style.zIndex = "90";
    logo.style.transformOrigin = "top left";
    logo.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    logo.style.willChange = "transform";
    logo.style.pointerEvents = p > 0.05 ? "none" : "";
  }, [heroLogoRef, p]);

  useLayoutEffect(() => () => resetHeroLogo(heroLogoRef.current), [heroLogoRef]);

  const motionStyle: CSSProperties = {
    opacity: p,
    transform: `translateY(${translateY}px) scale(${scale})`,
    pointerEvents: p > 0.05 ? "auto" : "none",
  };

  return (
    <div
      aria-hidden={p <= 0}
      className="sticky-glass-nav-positioner sticky-glass-header"
    >
      <div className="sticky-glass-nav-motion" style={motionStyle}>
        <button
          aria-label={`Scroll to top of ${title}`}
          className="sticky-glass-header__surface"
          onClick={scrollToWorkspaceTop}
          tabIndex={p > 0.05 ? 0 : -1}
          type="button"
        >
          <span className="sticky-glass-header__logo-target" aria-hidden="true">
            <span ref={logoTargetRef} className="sticky-glass-header__logo-final-frame" />
          </span>

          <span className="sticky-glass-header__title">
            {title}
          </span>

          <time className="sticky-glass-header__date">{date}</time>
        </button>
      </div>
    </div>
  );
}
