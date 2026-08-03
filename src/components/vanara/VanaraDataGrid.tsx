import type { ReactNode } from "react";

export type VanaraDataGridItem = {
  label: string;
  value: ReactNode;
};

type VanaraDataGridProps = {
  ariaLabel: string;
  className?: string;
  items: VanaraDataGridItem[];
};

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
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
