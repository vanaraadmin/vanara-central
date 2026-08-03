import type { ReactNode } from "react";

export type VanaraGlassRegionVariant = "default" | "compact";

export type VanaraGlassRegionProps = {
  ariaLabelledBy?: string;
  children: ReactNode;
  className?: string;
  variant?: VanaraGlassRegionVariant;
};

/**
 * Purpose: groups one local operational section inside a Vanara glass sheet.
 *
 * When to use: domain sections such as current state, facts, evidence, or
 * actions.
 *
 * When NOT to use: nested glass regions, page cards, list containers, or modal
 * shells.
 *
 * Expected children: a `VanaraSectionHeader` followed by concise domain content.
 *
 * Accessibility notes: connect the visible heading through `ariaLabelledBy`
 * whenever the region has a title.
 */
export default function VanaraGlassRegion({
  ariaLabelledBy,
  children,
  className,
  variant = "default",
}: VanaraGlassRegionProps) {
  const classNames = ["vc-glass-region", `vc-glass-region--${variant}`, className].filter(Boolean).join(" ");

  return (
    <section className={classNames} aria-labelledby={ariaLabelledBy}>
      {children}
    </section>
  );
}
