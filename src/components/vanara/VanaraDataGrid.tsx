import type { ReactNode } from "react";
import type { VanaraTone } from "./types";

export type VanaraDataGridItem = {
  label: string;
  tone?: VanaraTone;
  value: ReactNode;
};

export type VanaraDataGridProps = {
  ariaLabel: string;
  className?: string;
  items: VanaraDataGridItem[];
};

/**
 * Purpose: renders compact comparable facts inside a glass region.
 *
 * When to use: two to six short operational attributes that benefit from
 * separators instead of individual cards.
 *
 * When NOT to use: long prose, action rows, nested forms, or page summaries.
 *
 * Expected children: data is supplied through typed `items`; the component owns
 * the `<dl>`, `<dt>`, and `<dd>` structure.
 *
 * Accessibility notes: provide an `ariaLabel` because this definition list does
 * not always sit under a visible heading.
 */
export default function VanaraDataGrid({
  ariaLabel,
  className,
  items,
}: VanaraDataGridProps) {
  const classNames = ["vc-data-grid", className].filter(Boolean).join(" ");

  return (
    <dl className={classNames} aria-label={ariaLabel}>
      {items.map((item) => (
        <div className="vc-data-item" key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.tone ? `vc-state-${item.tone}` : undefined}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
