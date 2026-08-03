import { useId, type ReactNode } from "react";

type VanaraSectionHeaderProps = {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  headingId?: string;
};

export default function VanaraSectionHeader({
  eyebrow,
  headingId,
  meta,
  title,
}: VanaraSectionHeaderProps) {
  const generatedHeadingId = useId();
  const resolvedHeadingId = headingId ?? generatedHeadingId;

  return (
    <header className="vc-section-header">
      <div className="vc-section-header__copy">
        <span className="vc-section-header__eyebrow">{eyebrow}</span>
        <h2 className="vc-section-header__title" id={resolvedHeadingId}>
          {title}
        </h2>
      </div>
      {meta ? <span className="vc-section-header__meta">{meta}</span> : null}
    </header>
  );
}
