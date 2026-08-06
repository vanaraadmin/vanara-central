import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { RoomDomainTone } from "../../types/rooms-workspace";
import { ArrowRightIcon } from "../OperationsIcons";
import { useLanguage } from "../../providers/language.context";

type RoomDomainCardProps = {
  eyebrow: string;
  title: string;
  status?: ReactNode;
  state?: ReactNode;
  secondary?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  headingId?: string;
};

type RoomSectionHeaderProps = {
  eyebrow: string;
  title: string;
  headingId: string;
  status?: ReactNode;
};

type OperationalStateBlockProps = {
  label?: string;
  value: string;
  detail: string;
  secondaryInfo?: string | null;
  tone: RoomDomainTone;
};

type PrimaryActionRowProps = {
  label: string;
  ariaLabel: string;
  to?: string | null;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
};

export function RoomSectionHeader({ eyebrow, headingId, status, title }: RoomSectionHeaderProps) {
  return (
    <header className="room-expanded-section__header room-domain-card__header">
      <div className="room-domain-card__heading">
        <span className="room-expanded-section__eyebrow vc-section-eyebrow room-domain-card__eyebrow">{eyebrow}</span>
        <h3 className="room-expanded-section__title room-domain-card__title" id={headingId}>{title}</h3>
      </div>
      {status ? <div className="room-domain-card__status">{status}</div> : null}
    </header>
  );
}

export function OperationalStateBlock({ detail, label = "Current state", secondaryInfo, tone, value }: OperationalStateBlockProps) {
  const { translate } = useLanguage();
  return (
    <div className={`room-expanded-current-state room-domain-state room-domain-state--${tone}`}>
      <span className="room-expanded-current-state__label room-domain-state__label">{label === "Current state" ? translate("currentState") : label}</span>
      <strong className="room-expanded-current-state__value room-domain-state__value">{value}</strong>
      <span className="room-expanded-current-state__description room-domain-state__detail">{detail}</span>
      {secondaryInfo ? <span className="room-expanded-current-state__description room-domain-state__meta">{secondaryInfo}</span> : null}
    </div>
  );
}

export function PrimaryActionRow({ ariaLabel, busy = false, disabled = false, label, onClick, to }: PrimaryActionRowProps) {
  const { translate } = useLanguage();
  const unavailable = disabled || busy;
  const className = [
    "room-domain-card__primary-action",
    unavailable ? "room-domain-card__primary-action--disabled" : "",
  ].filter(Boolean).join(" ");
  const actionLabel = busy ? translate("loading") : label;
  const content = (
    <>
      <span>{actionLabel}</span>
      <ArrowRightIcon />
    </>
  );

  if (to && !unavailable) {
    return (
      <Link className={className} to={to} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }

  return (
    <button className={className} type="button" onClick={onClick} disabled={unavailable} aria-label={ariaLabel}>
      {content}
    </button>
  );
}

export default function RoomDomainCard({ action, children, className, eyebrow, footer, headingId, secondary, state, status, title }: RoomDomainCardProps) {
  const generatedHeadingId = useId();
  const resolvedHeadingId = headingId ?? generatedHeadingId;
  const classNames = ["room-expanded-section", "vc-glass-region", "room-domain-card", className].filter(Boolean).join(" ");

  return (
    <section className={classNames} aria-labelledby={resolvedHeadingId}>
      <RoomSectionHeader eyebrow={eyebrow} headingId={resolvedHeadingId} status={status} title={title} />
      <div className="room-expanded-section__content">
        {state}
        {secondary ? <div className="room-domain-card__secondary">{secondary}</div> : null}
        {children}
        {action ? <div className="room-expanded-section__action room-domain-card__action-row">{action}</div> : null}
        {footer ? <footer className="room-domain-card__footer">{footer}</footer> : null}
      </div>
    </section>
  );
}
