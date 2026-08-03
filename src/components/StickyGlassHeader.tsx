import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";
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
  const logoTargetRef = useRef<HTMLButtonElement>(null);
  const p = clampProgress(progress);
  const translateY = Math.round((1 - p) * -10 * 100) / 100;
  const contentTranslateY = Math.round((1 - p) * 6 * 100) / 100;
  const blur = Math.round((8 + 10 * p) * 100) / 100;
  const saturate = Math.round((100 + 14 * p) * 100) / 100;
  const borderAlpha = Math.round((0.04 + 0.26 * p) * 1000) / 1000;
  const shadowAlpha = Math.round(0.28 * p * 1000) / 1000;
  const insetAlpha = Math.round(0.2 * p * 1000) / 1000;

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

    const lastSize = Math.max(24, Math.min(last.width, last.height) - 12);
    const lastLeft = last.left + (last.width - lastSize) / 2;
    const lastTop = last.top + (last.height - lastSize) / 2;
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

  const shellStyle: CSSProperties = {
    pointerEvents: p > 0.05 ? "auto" : "none",
  };
  const surfaceStyle: CSSProperties = {
    opacity: p,
    transform: `translateY(${translateY}px)`,
    borderColor: `rgba(247, 244, 238, ${borderAlpha})`,
    boxShadow: `0 18px 36px rgba(0, 0, 0, ${shadowAlpha}), inset 0 1px 0 rgba(255, 255, 255, ${insetAlpha})`,
    backdropFilter: `blur(${blur}px) saturate(${saturate}%)`,
    WebkitBackdropFilter: `blur(${blur}px) saturate(${saturate}%)`,
  };
  const contentStyle: CSSProperties = {
    opacity: p,
    transform: `translateY(${contentTranslateY}px)`,
  };

  return (
    <div
      aria-hidden={p <= 0}
      className="sticky-glass-header"
      style={shellStyle}
    >
      <div className="sticky-glass-header__surface" style={surfaceStyle}>
        <button
          ref={logoTargetRef}
          aria-label="Scroll to top"
          className="sticky-glass-header__logo-target"
          onClick={scrollToWorkspaceTop}
          tabIndex={p > 0.05 ? 0 : -1}
          type="button"
        />

        <button
          className="sticky-glass-header__title"
          onClick={scrollToWorkspaceTop}
          style={contentStyle}
          tabIndex={p > 0.05 ? 0 : -1}
          type="button"
        >
          {title}
        </button>

        <time className="sticky-glass-header__date" style={contentStyle}>{date}</time>
      </div>
    </div>
  );
}
