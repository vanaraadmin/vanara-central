import type { VanaraTone } from "./types";

type VanaraSummaryTone = Extract<VanaraTone, "clean" | "progress" | "warning" | "critical" | "neutral">;
export type VanaraSummaryVariant = "default" | "compact";

export type VanaraSummaryItem = {
  id?: string;
  label: string;
  value: number | string;
  tone?: VanaraSummaryTone;
};

export type VanaraSummaryGridProps = {
  activeItemId?: string | null;
  ariaLabel: string;
  className?: string;
  items: VanaraSummaryItem[];
  onItemSelect?: (item: VanaraSummaryItem) => void;
  variant?: VanaraSummaryVariant;
};

/**
 * Purpose: renders the approved compact executive summary surface.
 *
 * When to use: a small set of operational counters with consistent semantic
 * tones.
 *
 * When NOT to use: detailed task lists, long descriptions, or mixed domain
 * facts.
 *
 * Expected children: data is supplied through typed `items`; the component owns
 * the summary definition-list markup.
 *
 * Accessibility notes: when `onItemSelect` is provided, every summary item
 * becomes a keyboard-reachable trigger with an accessible label.
 */
export default function VanaraSummaryGrid({
  activeItemId,
  ariaLabel,
  className,
  items,
  onItemSelect,
  variant = "default",
}: VanaraSummaryGridProps) {
  const classNames = [
    "vc-glass-summary",
    variant === "default" ? "vc-glass-surface" : null,
    `vc-glass-summary--${variant}`,
    className,
  ].filter(Boolean).join(" ");
  const isInteractive = Boolean(onItemSelect);

  return (
    <dl className={classNames} aria-label={ariaLabel}>
      {items.map((item) => {
        const itemId = item.id ?? item.label;
        const isActive = activeItemId === itemId;
        return (
          <div
            className={`vc-summary-item${isInteractive ? " vc-summary-item--interactive" : ""}${isActive ? " is-active" : ""}`}
            key={`${itemId}:${item.value}`}
          >
            {isInteractive ? (
              <button
                aria-expanded={isActive}
                aria-label={`${item.label}: ${item.value}`}
                className="vc-summary-item__button"
                onClick={() => onItemSelect?.(item)}
                type="button"
              />
            ) : null}
            <dt className="vc-summary-item__label">{item.label}</dt>
            <dd className={`vc-summary-item__value vc-state-${item.tone ?? "neutral"}`}>
              {item.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
