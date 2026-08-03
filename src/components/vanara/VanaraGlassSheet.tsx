import type { ReactNode } from "react";

export type VanaraGlassSheetVariant = "default" | "elevated" | "quiet";

export type VanaraGlassSheetProps = {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  children: ReactNode;
  className?: string;
  variant?: VanaraGlassSheetVariant;
};

/**
 * Purpose: renders an expanded operational work surface using forest glass.
 *
 * When to use: a compact row opens into a temporary workspace, or a focused
 * workflow needs one lifted surface.
 *
 * When NOT to use: normal cards, modal scrims, page backgrounds, or small data
 * groups.
 *
 * Expected children: one identity/header area followed by `VanaraGlassRegion`
 * sections or similarly compact operational content.
 *
 * Accessibility notes: provide either `ariaLabel` or `ariaLabelledBy` so the
 * lifted surface has an accessible name.
 */
export default function VanaraGlassSheet({
  ariaLabel,
  ariaLabelledBy,
  children,
  className,
  variant = "default",
}: VanaraGlassSheetProps) {
  const classNames = ["vc-glass-sheet", `vc-glass-sheet--${variant}`, className].filter(Boolean).join(" ");

  return <section aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} className={classNames}>{children}</section>;
}
