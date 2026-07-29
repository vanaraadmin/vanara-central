import { NavLink, Outlet } from "react-router-dom";
import { primaryNavigation } from "../config/navigation";
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

      <nav className="operations-nav" aria-label={translate("mainNavigation")}>
        {primaryNavigation.map(({ key, labelKey, path, Icon }) => (
          <NavLink
            className={({ isActive }) =>
              isActive
                ? "operations-nav__item is-active"
                : "operations-nav__item"
            }
            end={path === "/dashboard"}
            key={key}
            to={path}
          >
            <Icon />
            <span>{translate(labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
