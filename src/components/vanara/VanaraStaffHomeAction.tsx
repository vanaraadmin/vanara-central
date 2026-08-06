import { Link } from "react-router-dom";
import { useLanguage } from "../../providers/language.context";

/**
 * Purpose: shared Staff Home return action for operational workspace heroes.
 *
 * When to use: any workspace shell that needs the standard route back to the
 * Staff Home without creating page-local button implementations.
 *
 * When NOT to use: Staff Home itself, modal actions, row actions, or workflows
 * that should return to a previous browser history entry.
 *
 * Expected children: none; the component owns its icon, label, route, and
 * accessible name.
 *
 * Accessibility notes: rendered as a semantic link with a stable text label and
 * no hidden click area.
 */
export default function VanaraStaffHomeAction() {
  const { translate } = useLanguage();

  return (
    <Link className="vc-secondary-glass-action vc-staff-home-action" to="/staff">
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M4.75 11.1 12 5l7.25 6.1" />
        <path d="M6.75 10.2v8.05h10.5V10.2" />
        <path d="M10 18.25v-4.5h4v4.5" />
      </svg>
      <span>{translate("staffHome")}</span>
    </Link>
  );
}
