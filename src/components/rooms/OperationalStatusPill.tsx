import type { StatusTone } from "../../config/roomOperationalPresentation";

interface OperationalStatusPillProps {
  label: string;
  tone: StatusTone;
  emphasis?: boolean;
}

export default function OperationalStatusPill({ emphasis = false, label, tone }: OperationalStatusPillProps) {
  return (
    <span className={`operational-status-pill operational-status-pill--${tone}${emphasis ? " operational-status-pill--emphasis" : ""}`}>
      {label}
    </span>
  );
}
