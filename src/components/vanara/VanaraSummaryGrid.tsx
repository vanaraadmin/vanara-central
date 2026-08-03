type VanaraSummaryTone = "clean" | "progress" | "warning" | "critical" | "neutral";

export type VanaraSummaryItem = {
  id?: string;
  label: string;
  value: number | string;
  tone?: VanaraSummaryTone;
};

type VanaraSummaryGridProps = {
  activeItemId?: string | null;
  ariaLabel: string;
  className?: string;
  items: VanaraSummaryItem[];
  onItemSelect?: (item: VanaraSummaryItem) => void;
};

export default function VanaraSummaryGrid({
  activeItemId,
  ariaLabel,
  className,
  items,
  onItemSelect,
}: VanaraSummaryGridProps) {
  const classNames = ["vc-glass-summary", "vc-glass-surface", className].filter(Boolean).join(" ");
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
