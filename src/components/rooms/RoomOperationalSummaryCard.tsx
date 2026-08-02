import { useId } from "react";
import { getRoomOperationalItems, type RoomOperationalItemModel } from "../../config/roomOperationalPresentation";
import type { RoomOperationalSummary } from "../../types/rooms-workspace";

type RoomOperationalSummaryCardProps = {
  summary: RoomOperationalSummary;
};

function RoomOperationalItem({ item }: { item: RoomOperationalItemModel }) {
  return (
    <div className={`room-operational-item room-operational-item--${item.tone}`}>
      <dt className="room-operational-item__label">{item.label}</dt>
      <dd className="room-operational-item__body">
        <span className="room-operational-item__value">{item.value}</span>
        {item.detail ? <span className="room-operational-item__detail">{item.detail}</span> : null}
        {item.meta ? <span className="room-operational-item__meta">{item.meta}</span> : null}
      </dd>
    </div>
  );
}

export default function RoomOperationalSummaryCard({ summary }: RoomOperationalSummaryCardProps) {
  const headingId = useId();
  const items = getRoomOperationalItems(summary);

  return (
    <section className="room-workspace-card room-operational-card" aria-labelledby={headingId}>
      <header className="room-operational-card__header">
        <h3 id={headingId}>Room Status</h3>
      </header>

      <dl className="room-operational-card__grid">
        {items.map((item) => (
          <RoomOperationalItem item={item} key={item.id} />
        ))}
      </dl>
    </section>
  );
}
