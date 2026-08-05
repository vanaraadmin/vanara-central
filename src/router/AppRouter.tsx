import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import PagePlaceholder, { type PlaceholderLink } from "../components/PagePlaceholder";
import AppLayout from "../layouts/AppLayout";
import AvailabilityPage from "../pages/AvailabilityPage";
import ChatPage from "../pages/ChatPage";
import CreateMaintenancePage from "../pages/CreateMaintenancePage";
import DashboardPage from "../pages/DashboardPage";
import MaintenanceDetailPage from "../pages/MaintenanceDetailPage";
import MaintenancePage from "../pages/MaintenancePage";
import MessagesPage from "../pages/MessagesPage";
import HousekeepingV2Page from "../pages/HousekeepingV2Page";
import LoginPage from "../pages/LoginPage";
import MovementsPage from "../pages/MovementsPage";
import ProcurementDetailPage from "../pages/ProcurementDetailPage";
import ProcurementPage from "../pages/ProcurementPage";
import PayrollPage from "../pages/PayrollPage";
import ReceptionPage from "../pages/ReceptionPage";
import RoomsPage from "../pages/RoomsPage";
import SupplyRequestPage from "../pages/SupplyRequestPage";
import RoomDetailPage from "../pages/RoomDetailPage";
import SettingsPage from "../pages/SettingsPage";
import SocialAutomationPage from "../pages/SocialAutomationPage";
import StaffPage from "../pages/StaffPage";
import { ApiError } from "../services/api.client";
import { loadCurrentUser } from "../services/auth.service";

const moreLinks: PlaceholderLink[] = [
  { labelKey: "arrivalsDepartures", to: "/reception" },
  { labelKey: "staffHome", to: "/staff" },
  { labelKey: "housekeeping", to: "/housekeeping" },
  { labelKey: "maintenance", to: "/maintenance" },
  { labelKey: "messages", to: "/messages" },
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

function ProtectedLayout() {
  const user = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => loadCurrentUser(signal), retry: false });
  if (user.isLoading) return <PageLoading />;
  if (user.isError) {
    if (user.error instanceof ApiError && user.error.status === 401) {
      return <Navigate replace to="/login" state={{ from: window.location.pathname }} />;
    }
    return <PageError onRetry={() => void user.refetch()} />;
  }
  return <AppLayout />;
}

function HousekeepingRoomRedirect() {
  const { roomId = "", unitId = "" } = useParams();
  const targetId = unitId || roomId;
  return <Navigate replace to={`/rooms/${targetId}`} />;
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
          element={<LoginPage />}
        />

        <Route element={<ProtectedLayout />}>
          <Route index element={<Navigate replace to="/staff" />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="rooms/:roomId" element={<RoomDetailPage />} />
          <Route path="reception" element={<ReceptionPage />} />
          <Route path="movements" element={<MovementsPage />} />
          <Route path="housekeeping" element={<Navigate replace to="/housekeeping-v2" />} />
          <Route path="housekeeping-v2" element={<HousekeepingV2Page />} />
          <Route path="housekeeping/rooms/:unitId" element={<HousekeepingRoomRedirect />} />
          <Route path="housekeeping/checklist/:roomId" element={<HousekeepingRoomRedirect />} />
          <Route path="availability" element={<Navigate replace to="/availability-prices" />} />
          <Route path="availability-prices" element={<AvailabilityPage />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="maintenance/new" element={<CreateMaintenancePage />} />
          <Route path="maintenance/:issueId" element={<MaintenanceDetailPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="procurement" element={<ProcurementPage />} />
          <Route path="procurement/new" element={<SupplyRequestPage />} />
          <Route path="procurement/:requestId" element={<ProcurementDetailPage />} />
          <Route path="payroll" element={<PayrollPage />} />
          <Route path="social-automation" element={<SocialAutomationPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:conversationId" element={<ChatPage />} />
          <Route path="notifications" element={<Placeholder titleKey="notifications" descriptionKey="notificationsPlaceholder" />} />
          <Route path="more" element={<Placeholder titleKey="more" descriptionKey="morePlaceholder" links={moreLinks} />} />
          <Route path="assistant" element={<Placeholder titleKey="askWaraporn" descriptionKey="assistantPlaceholder" />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<Placeholder titleKey="profile" descriptionKey="profilePlaceholder" />} />
          <Route path="search" element={<Placeholder titleKey="globalSearch" descriptionKey="searchPlaceholder" />} />
          <Route path="*" element={<Placeholder titleKey="pageNotFound" descriptionKey="notFoundPlaceholder" links={[{ labelKey: "dashboard", to: "/dashboard" }]} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
