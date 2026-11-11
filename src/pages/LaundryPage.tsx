import LaundryServiceSection from "../components/LaundryServiceSection";
import WorkspaceShell from "../components/WorkspaceShell";
import { useLanguage } from "../providers/language.context";
import "../styles/HousekeepingV2Page.css";

/**
 * Laundry is operationally connected to housekeeping, but it has its own
 * hand-off, return-check and inventory workflow. Keeping it as a dedicated
 * workspace makes that workflow reachable directly from Staff Home.
 */
export default function LaundryPage() {
  const { translate } = useLanguage();

  return (
    <WorkspaceShell title={translate("laundry")} workspace="laundry" bodyClassName="laundry-page">
      <LaundryServiceSection />
    </WorkspaceShell>
  );
}
