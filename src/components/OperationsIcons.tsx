import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
const base = {
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function CheckInIcon(props: IconProps) { return <svg {...base} {...props}><path d="M4.5 20.5h15"/><path d="M6.5 20.5V5.8A2.3 2.3 0 0 1 8.8 3.5h6.4a2.3 2.3 0 0 1 2.3 2.3v14.7"/><path d="M9 12h10"/><path d="m16 9 3 3-3 3"/><circle cx="10.4" cy="8.2" r=".65" fill="currentColor" stroke="none"/></svg>; }
export function CheckOutIcon(props: IconProps) { return <svg {...base} {...props}><path d="M4.5 20.5h15"/><path d="M6.5 20.5V5.8A2.3 2.3 0 0 1 8.8 3.5h6.4a2.3 2.3 0 0 1 2.3 2.3v14.7"/><path d="M15 12H5"/><path d="m8 9-3 3 3 3"/><circle cx="13.6" cy="8.2" r=".65" fill="currentColor" stroke="none"/></svg>; }
export function HousekeepingIcon(props: IconProps) { return <svg {...base} {...props}><path d="M4 20.5c3.7-1 6.6-3.8 7.8-7.5"/><path d="m11.8 13 5.7-8.5 2 1.3-5.7 8.5"/><path d="M5 18.6c1.8.6 3.7 1.5 5.1 2.4"/><path d="M6.2 15.2c2.2.7 4.3 1.8 5.9 3"/><path d="M15.9 4.4 18.2 6"/></svg>; }
export function MaintenanceIcon(props: IconProps) { return <svg {...base} {...props}><path d="M14.8 6.2a4.3 4.3 0 0 0-5.4-5.1l2.3 2.3-2.9 2.9-2.3-2.3a4.3 4.3 0 0 0 5.1 5.4L4 17l-1 4 4-1 7.6-7.6a4.3 4.3 0 0 0 5.4-5.1l-2.3 2.3-2.9-2.9 2.3-2.3"/></svg>; }
export function CalendarIcon(props: IconProps) { return <svg {...base} {...props}><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3.5v3M16 3.5v3M3.5 9.5h17"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/></svg>; }
export function ArrowRightIcon(props: IconProps) { return <svg {...base} {...props}><path d="M5 12h14M14 7l5 5-5 5"/></svg>; }
export function BackIcon(props: IconProps) { return <svg {...base} {...props}><path d="M19 12H5M10 7l-5 5 5 5"/></svg>; }
export function RoomIcon(props: IconProps) { return <svg {...base} {...props}><path d="M3.5 20.5V9a2 2 0 0 1 2-2H9v13.5"/><path d="M9 11h9.5a2 2 0 0 1 2 2v7.5M3.5 17h17"/><path d="M6.5 11h.01"/></svg>; }
export function CameraIcon(props: IconProps) { return <svg {...base} {...props}><path d="m8.5 6 1.3-2h4.4l1.3 2h3A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8A2.5 2.5 0 0 1 5.5 6z"/><circle cx="12" cy="12.5" r="3.2"/></svg>; }
export function AlertIcon(props: IconProps) { return <svg {...base} {...props}><path d="m10.2 3.4-7.5 14a2.2 2.2 0 0 0 1.9 3.1h14.8a2.2 2.2 0 0 0 1.9-3.1l-7.5-14a2 2 0 0 0-3.6 0Z"/><path d="M12 9v4.5M12 17h.01"/></svg>; }
export function UserIcon(props: IconProps) { return <svg {...base} {...props}><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>; }
export function CheckIcon(props: IconProps) { return <svg {...base} {...props}><path d="m5 12.5 4.2 4.2L19.5 6.5"/></svg>; }
export function SparkleIcon(props: IconProps) { return <svg {...base} {...props}><path d="M12 2.5c.7 4.1 2.4 5.8 6.5 6.5-4.1.7-5.8 2.4-6.5 6.5C11.3 11.4 9.6 9.7 5.5 9 9.6 8.3 11.3 6.6 12 2.5Z"/><path d="M18.5 15.5c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z"/></svg>; }
export function ChevronDownIcon(props: IconProps) { return <svg {...base} {...props}><path d="m7 9.5 5 5 5-5"/></svg>; }
export function PlusIcon(props: IconProps) { return <svg {...base} {...props}><path d="M12 5v14M5 12h14"/></svg>; }
export function TodayIcon(props: IconProps) { return <CalendarIcon {...props}/>; }
export function RoomsIcon(props: IconProps) { return <RoomIcon {...props}/>; }
export function TasksIcon(props: IconProps) { return <HousekeepingIcon {...props}/>; }
export function AskIcon(props: IconProps) { return <svg {...base} {...props}><path d="M20.5 15a4 4 0 0 1-4 4H9l-5.5 2.5V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4z"/><path d="M8 10h8M8 14h5"/></svg>; }
export function RefreshIcon(props: IconProps) { return <svg {...base} {...props}><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg>; }
export function ArrivalsIcon(props: IconProps) { return <CheckInIcon {...props}/>; }
export function DeparturesIcon(props: IconProps) { return <CheckOutIcon {...props}/>; }
