import { Fragment } from "react";
import type { RoomCompactPresentation, RoomCompactSignal } from "../../config/roomOperationalPresentation";
import { useLanguage } from "../../providers/language.context";
import { translateStaffLabel } from "../../utils/staff-i18n-labels";

interface RoomCompactSignalsProps {
  presentation: RoomCompactPresentation;
}

function RoomInlineSignal({ signal }: { signal: RoomCompactSignal }) {
  const { translate } = useLanguage();
  return (
    <span className={`room-signal room-signal--${signal.tone}`}>
      {translateStaffLabel(signal.label, translate)}
    </span>
  );
}

function SignalSeparator() {
  return (
    <span className="room-signals__separator" aria-hidden="true">
      &middot;
    </span>
  );
}

export function RoomTerminalState({ presentation }: RoomCompactSignalsProps) {
  const { translate } = useLanguage();
  return (
    <span className="room-terminal-state">
      <span className={`room-terminal-state__label room-terminal-state__label--${presentation.primary.tone}`}>
        {translateStaffLabel(presentation.primary.label, translate)}
      </span>
      {presentation.primary.detail ? (
        <span className="room-terminal-state__detail">{presentation.primary.detail}</span>
      ) : null}
    </span>
  );
}

export default function RoomCompactSignals({ presentation }: RoomCompactSignalsProps) {
  return (
    <span className="room-signals" aria-hidden="true">
      <span className="room-signals__primary">
        {presentation.occupancy ? <RoomInlineSignal signal={presentation.occupancy} /> : null}
        {presentation.occupancy && presentation.housekeeping ? <SignalSeparator /> : null}
        {presentation.housekeeping ? <RoomInlineSignal signal={presentation.housekeeping} /> : null}
      </span>

      {presentation.secondarySignals.length > 0 ? (
        <span className="room-signals__secondary">
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
