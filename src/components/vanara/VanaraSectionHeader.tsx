import { useId, type ReactNode } from "react";

export type VanaraSectionHeaderProps = {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  headingId?: string;
};

/**
 * Purpose: provides the standard heading rhythm for Vanara glass regions.
 *
 * When to use: the first child of a glass region or equivalent domain section.
 *
 * When NOT to use: decorative icons, page-specific controls, or long action
 * toolbars.
 *
 * Expected children: content is supplied through typed props; `meta` is reserved
 * for short state/count text.
 *
 * Accessibility notes: the generated or supplied heading id can be referenced by
 * the surrounding region for accessible labelling.
 */
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
