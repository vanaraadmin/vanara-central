import { Outlet } from "react-router-dom";
import FloatingTeamChat from "../components/FloatingTeamChat";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useLanguage } from "../providers/language.context";
import "../styles/OperationsShell.css";

export default function AppLayout() {
  const { translate } = useLanguage();
  const isOnline = useNetworkStatus();

  return (
    <div className="operations-shell">
      {!isOnline && (
        <div className="network-banner" role="status">
          {translate("offlineMessage")}
        </div>
      )}

      <div className="operations-shell__content">
        <Outlet />
      </div>

      <FloatingTeamChat />
    </div>
  );
}
