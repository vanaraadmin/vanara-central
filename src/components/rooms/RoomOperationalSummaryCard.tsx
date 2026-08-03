import { useId } from "react";
import { getRoomOperationalItems, type RoomOperationalItemModel } from "../../config/roomOperationalPresentation";
import type { RoomOperationalSummary } from "../../types/rooms-workspace";

type RoomOperationalSummaryCardProps = {
  summary: RoomOperationalSummary;
};

function RoomOperationalItem({ item }: { item: RoomOperationalItemModel }) {
  return (
    <div className={`room-status-item vc-data-item room-status-item--${item.tone} room-operational-item room-operational-item--${item.tone}`}>
      <dt className="room-status-item__label room-operational-item__label">{item.label}</dt>
      <dd className="room-status-item__body room-operational-item__body">
        <strong className="room-status-item__value room-operational-item__value">{item.value}</strong>
        {item.detail ? <span className="room-status-item__detail room-operational-item__detail">{item.detail}</span> : null}
        {item.meta ? <span className="room-status-item__meta room-operational-item__meta">{item.meta}</span> : null}
      </dd>
    </div>
  );
}

export default function RoomOperationalSummaryCard({ summary }: RoomOperationalSummaryCardProps) {
  const headingId = useId();
  const items = getRoomOperationalItems(summary);

  return (
    <section className="room-expanded-section vc-glass-region room-operational-card" aria-labelledby={headingId}>
      <header className="room-expanded-section__header room-operational-card__header">
        <div>
          <span className="room-expanded-section__eyebrow vc-section-eyebrow">Room Status</span>
          <h3 className="room-expanded-section__title" id={headingId}>Room Status</h3>
        </div>
      </header>

      <div className="room-expanded-section__content">
        <dl className="room-status-grid vc-data-grid room-operational-card__grid">
          {items.map((item) => (
            <RoomOperationalItem item={item} key={item.id} />
          ))}
        </dl>
      </div>
    </section>
  );
}
