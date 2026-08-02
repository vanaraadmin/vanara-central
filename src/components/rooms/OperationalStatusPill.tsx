type OperationalStatusVariant =
  | "Operating"
  | "Not Operating"
  | "Occupied"
  | "Vacant"
  | "Ready"
  | "Not Ready"
  | "Maintenance"
  | "Clear";

interface OperationalStatusPillProps {
  variant: OperationalStatusVariant;
  label?: string;
}

function toneFor(variant: OperationalStatusVariant): string {
  return variant.toLowerCase().replaceAll(" ", "-");
}

export default function OperationalStatusPill({ label, variant }: OperationalStatusPillProps) {
  return (
    <span className={`operational-status-pill operational-status-pill--${toneFor(variant)}`}>
      {label ?? variant}
    </span>
  );
}
