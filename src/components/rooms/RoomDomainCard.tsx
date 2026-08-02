import { useId, type ReactNode } from "react";

type RoomDomainCardProps = {
  eyebrow: string;
  title: string;
  children: ReactNode;
  status?: ReactNode;
  footer?: ReactNode;
  className?: string;
  headingId?: string;
};

export default function RoomDomainCard({ children, className, eyebrow, footer, headingId, status, title }: RoomDomainCardProps) {
  const generatedHeadingId = useId();
  const resolvedHeadingId = headingId ?? generatedHeadingId;
  const classNames = ["room-workspace-card", "room-domain-card", className].filter(Boolean).join(" ");

  return (
    <section className={classNames} aria-labelledby={resolvedHeadingId}>
      <header className="room-domain-card__header">
        <div className="room-domain-card__heading">
          <p className="room-domain-card__eyebrow">{eyebrow}</p>
          <h3 className="room-domain-card__title" id={resolvedHeadingId}>{title}</h3>
        </div>
        {status ? <div className="room-domain-card__status">{status}</div> : null}
      </header>

      {children}

      {footer ? <footer className="room-domain-card__footer">{footer}</footer> : null}
    </section>
  );
}
