import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import PagePlaceholder, { type PlaceholderLink } from "../components/PagePlaceholder";
import AppLayout from "../layouts/AppLayout";
import ChatPage from "../pages/ChatPage";
import CreateMaintenancePage from "../pages/CreateMaintenancePage";
import DashboardPage from "../pages/DashboardPage";
import MaintenanceDetailPage from "../pages/MaintenanceDetailPage";
import MaintenancePage from "../pages/MaintenancePage";
import HousekeepingPage from "../pages/HousekeepingPage";
import MovementsPage from "../pages/MovementsPage";
import ProcurementDetailPage from "../pages/ProcurementDetailPage";
import ProcurementPage from "../pages/ProcurementPage";
import SupplyRequestPage from "../pages/SupplyRequestPage";
import RoomDetailPage from "../pages/RoomDetailPage";

const roomsLinks: PlaceholderLink[] = [
  { labelKey: "roomDetail", to: "/rooms/1" },
];

const moreLinks: PlaceholderLink[] = [
  { labelKey: "arrivalsDepartures", to: "/movements" },
  { labelKey: "housekeeping", to: "/housekeeping" },
  { labelKey: "maintenance", to: "/maintenance" },
  { labelKey: "procurement", to: "/procurement" },
  { labelKey: "notifications", to: "/notifications" },
  { labelKey: "askWaraporn", to: "/assistant" },
  { labelKey: "settings", to: "/settings" },
  { labelKey: "profile", to: "/profile" },
  { labelKey: "globalSearch", to: "/search" },
  { labelKey: "login", to: "/login" },
];

function Placeholder(props: {
  titleKey: string;
  descriptionKey: string;
  links?: PlaceholderLink[];
}) {
  return <PagePlaceholder {...props} />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/splash"
          element={<PagePlaceholder standalone titleKey="splash" descriptionKey="splashDescription" />}
        />
        <Route
          path="/login"
          element={<PagePlaceholder standalone titleKey="login" descriptionKey="loginDescription" />}
        />

        <Route element={<AppLayout />}>
          <Route index element={<Navigate replace to="/dashboard" />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="rooms" element={<Placeholder titleKey="roomWorkspace" descriptionKey="roomsPlaceholder" links={roomsLinks} />} />
          <Route path="rooms/:roomId" element={<RoomDetailPage />} />
          <Route path="movements" element={<MovementsPage />} />
          <Route path="housekeeping" element={<HousekeepingPage />} />
          <Route path="housekeeping/checklist/:roomId" element={<Placeholder titleKey="readyChecklist" descriptionKey="checklistPlaceholder" />} />
          <Route path="availability" element={<Placeholder titleKey="availability" descriptionKey="availabilityPlaceholder" />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="maintenance/new" element={<CreateMaintenancePage />} />
          <Route path="maintenance/:issueId" element={<MaintenanceDetailPage />} />
          <Route path="procurement" element={<ProcurementPage />} />
          <Route path="procurement/new" element={<SupplyRequestPage />} />
          <Route path="procurement/:requestId" element={<ProcurementDetailPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:conversationId" element={<ChatPage />} />
          <Route path="notifications" element={<Placeholder titleKey="notifications" descriptionKey="notificationsPlaceholder" />} />
          <Route path="more" element={<Placeholder titleKey="more" descriptionKey="morePlaceholder" links={moreLinks} />} />
          <Route path="assistant" element={<Placeholder titleKey="askWaraporn" descriptionKey="assistantPlaceholder" />} />
          <Route path="settings" element={<Placeholder titleKey="settings" descriptionKey="settingsPlaceholder" />} />
          <Route path="profile" element={<Placeholder titleKey="profile" descriptionKey="profilePlaceholder" />} />
          <Route path="search" element={<Placeholder titleKey="globalSearch" descriptionKey="searchPlaceholder" />} />
          <Route path="*" element={<Placeholder titleKey="pageNotFound" descriptionKey="notFoundPlaceholder" links={[{ labelKey: "dashboard", to: "/dashboard" }]} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}