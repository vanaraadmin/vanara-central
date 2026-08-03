type VanaraSummaryTone = "clean" | "progress" | "warning" | "critical" | "neutral";

export type VanaraSummaryItem = {
  label: string;
  value: number | string;
  tone?: VanaraSummaryTone;
};

type VanaraSummaryGridProps = {
  ariaLabel: string;
  className?: string;
  items: VanaraSummaryItem[];
};

export default function VanaraSummaryGrid({
  ariaLabel,
  className,
  items,
}: VanaraSummaryGridProps) {
  const classNames = ["vc-glass-summary", "vc-glass-surface", className].filter(Boolean).join(" ");

  return (
    <dl className={classNames} aria-label={ariaLabel}>
      {items.map((item) => (
        <div className="vc-summary-item" key={`${item.label}:${item.value}`}>
          <dt className="vc-summary-item__label">{item.label}</dt>
          <dd className={`vc-summary-item__value vc-state-${item.tone ?? "neutral"}`}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
