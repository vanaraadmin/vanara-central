import type { ReactNode } from "react";

type VanaraGlassSheetProps = {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  children: ReactNode;
  className?: string;
};

export default function VanaraGlassSheet({
  ariaLabel,
  ariaLabelledBy,
  children,
  className,
}: VanaraGlassSheetProps) {
  const classNames = ["vc-glass-sheet", className].filter(Boolean).join(" ");

  return <section aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} className={classNames}>{children}</section>;
}
