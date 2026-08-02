import { getRoomOperationalSignals } from "../../config/roomOperationalPresentation";
import type { RoomOperationalSummary } from "../../types/rooms-workspace";
import OperationalStatusPill from "./OperationalStatusPill";

interface RoomCompactSignalsProps {
  summary: RoomOperationalSummary;
}

export default function RoomCompactSignals({ summary }: RoomCompactSignalsProps) {
  return (
    <span className="room-row__signals" aria-label="Room operational signals">
      {getRoomOperationalSignals(summary).map((item) => (
        <OperationalStatusPill
          emphasis={item.emphasis}
          key={`${item.priority}-${item.label}`}
          label={item.label}
          tone={item.tone}
        />
      ))}
    </span>
  );
}
