import { useEffect, useState, type RefObject } from "react";
import "../styles/StickyGlassHeader.css";

interface StickyGlassHeaderProps {
  date: string;
  logoSrc: string;
  title: string;
  triggerRef: RefObject<HTMLElement | null>;
}

function scrollToWorkspaceTop() {
  window.scrollTo({
    behavior: "smooth",
    top: 0,
  });
}

export default function StickyGlassHeader({
  date,
  logoSrc,
  title,
  triggerRef,
}: StickyGlassHeaderProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;

    const updateVisibility = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const trigger = triggerRef.current;
        if (!trigger) {
          setVisible(false);
          return;
        }

        setVisible(trigger.getBoundingClientRect().top <= 0 && window.scrollY > 0);
      });
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [triggerRef]);

  return (
    <div
      aria-hidden={!visible}
      className={`sticky-glass-header${visible ? " is-visible" : ""}`}
    >
      <div className="sticky-glass-header__surface">
        <button
          aria-label="Scroll to top"
          className="sticky-glass-header__brand"
          onClick={scrollToWorkspaceTop}
          tabIndex={visible ? 0 : -1}
          type="button"
        >
          <img alt="" src={logoSrc} />
        </button>

        <button
          className="sticky-glass-header__title"
          onClick={scrollToWorkspaceTop}
          tabIndex={visible ? 0 : -1}
          type="button"
        >
          {title}
        </button>

        <time className="sticky-glass-header__date">{date}</time>
      </div>
    </div>
  );
}
