import type { ReactNode } from "react";

type VanaraGlassRegionProps = {
  ariaLabelledBy?: string;
  children: ReactNode;
  className?: string;
};

export default function VanaraGlassRegion({
  ariaLabelledBy,
  children,
  className,
}: VanaraGlassRegionProps) {
  const classNames = ["vc-glass-region", className].filter(Boolean).join(" ");

  return (
    <section className={classNames} aria-labelledby={ariaLabelledBy}>
      {children}
    </section>
  );
}
