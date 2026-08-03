import { Fragment } from "react";
import type { RoomCompactPresentation, RoomCompactSignal } from "../../config/roomOperationalPresentation";

interface RoomCompactSignalsProps {
  presentation: RoomCompactPresentation;
}

function RoomInlineSignal({ signal }: { signal: RoomCompactSignal }) {
  return (
    <span className={`room-inline-signal room-inline-signal--${signal.tone}`}>
      {signal.label}
    </span>
  );
}

function SignalSeparator() {
  return (
    <span className="room-compact-signals__separator" aria-hidden="true">
      ·
    </span>
  );
}

export function RoomTerminalState({ presentation }: RoomCompactSignalsProps) {
  return (
    <span className="room-terminal-state">
      <span className={`room-terminal-state__label room-terminal-state__label--${presentation.primary.tone}`}>
        {presentation.primary.label}
      </span>
      {presentation.primary.detail ? (
        <span className="room-terminal-state__detail">{presentation.primary.detail}</span>
      ) : null}
    </span>
  );
}

export default function RoomCompactSignals({ presentation }: RoomCompactSignalsProps) {
  return (
    <span className="room-compact-signals" aria-hidden="true">
      <span className="room-compact-signals__primary">
        {presentation.occupancy ? <RoomInlineSignal signal={presentation.occupancy} /> : null}
        {presentation.occupancy && presentation.housekeeping ? <SignalSeparator /> : null}
        {presentation.housekeeping ? <RoomInlineSignal signal={presentation.housekeeping} /> : null}
      </span>

      {presentation.secondarySignals.length > 0 ? (
        <span className="room-compact-signals__secondary">
          {presentation.secondarySignals.map((signal, index) => (
            <Fragment key={signal.key}>
              {index > 0 ? <SignalSeparator /> : null}
              <RoomInlineSignal signal={signal} />
            </Fragment>
          ))}
        </span>
      ) : null}
    </span>
  );
}
