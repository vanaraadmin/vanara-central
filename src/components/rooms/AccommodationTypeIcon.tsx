import type { SVGProps } from "react";
import type { RoomsWorkspaceRoom } from "../../types/rooms-workspace";

type AccommodationTypeIconProps = {
  type: RoomsWorkspaceRoom["accommodationType"];
  className?: string;
};

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.65,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function BungalowIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 20h17" />
      <path d="m5 11 7-6 7 6" />
      <path d="M6.5 10.5V20h11v-9.5" />
      <path d="M10 20v-5.5h4V20" />
    </svg>
  );
}

function VillaIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 20h17" />
      <path d="M5 9.5 12 4l7 5.5" />
      <path d="M6.5 20V9.5h11V20" />
      <path d="M9.5 20v-6h5v6" />
      <path d="M8.5 11.5h7" />
    </svg>
  );
}

function TentIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 20h17" />
      <path d="M12 4 4.5 20" />
      <path d="M12 4 19.5 20" />
      <path d="M12 4v16" />
      <path d="m9 20 3-5 3 5" />
    </svg>
  );
}

function OtherIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 20V8.5L12 4l7.5 4.5V20" />
      <path d="M8.5 20v-6h7v6" />
      <path d="M8.5 10.5h7" />
    </svg>
  );
}

export default function AccommodationTypeIcon({ className, type }: AccommodationTypeIconProps) {
  if (type === "Bungalow") return <BungalowIcon className={className} />;
  if (type === "Villa") return <VillaIcon className={className} />;
  if (type === "Tent") return <TentIcon className={className} />;
  return <OtherIcon className={className} />;
}
