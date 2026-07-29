import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import PagePlaceholder, { type PlaceholderLink } from "../components/PagePlaceholder";
import AppLayout from "../layouts/AppLayout";
import DashboardPage from "../pages/DashboardPage";

const roomsLinks: PlaceholderLink[] = [
  { labelKey: "roomDetail", to: "/rooms/bungalow-4" },
];
const housekeepingLinks: PlaceholderLink[] = [
  { labelKey: "readyChecklist", to: "/housekeeping/checklist/bungalow-4" },
];
const maintenanceLinks: PlaceholderLink[] = [
  { labelKey: "createMaintenance", to: "/maintenance/new" },
  { labelKey: "maintenanceDetail", to: "/maintenance/example-issue" },
];
const procurementLinks: PlaceholderLink[] = [
  { labelKey: "createProcurement", to: "/procurement/new" },
  { labelKey: "procurementDetail", to: "/procurement/example-request" },
];
const chatLinks: PlaceholderLink[] = [
  { labelKey: "conversation", to: "/chat/example-conversation" },
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
          <Route path="rooms/:roomId" element={<Placeholder titleKey="roomDetail" descriptionKey="roomDetailPlaceholder" />} />
          <Route path="movements" element={<Placeholder titleKey="arrivalsDepartures" descriptionKey="movementsPlaceholder" />} />
          <Route path="housekeeping" element={<Placeholder titleKey="housekeeping" descriptionKey="housekeepingPlaceholder" links={housekeepingLinks} />} />
          <Route path="housekeeping/checklist/:roomId" element={<Placeholder titleKey="readyChecklist" descriptionKey="checklistPlaceholder" />} />
          <Route path="availability" element={<Placeholder titleKey="availability" descriptionKey="availabilityPlaceholder" />} />
          <Route path="maintenance" element={<Placeholder titleKey="maintenance" descriptionKey="maintenancePlaceholder" links={maintenanceLinks} />} />
          <Route path="maintenance/new" element={<Placeholder titleKey="createMaintenance" descriptionKey="createMaintenancePlaceholder" />} />
          <Route path="maintenance/:issueId" element={<Placeholder titleKey="maintenanceDetail" descriptionKey="maintenanceDetailPlaceholder" />} />
          <Route path="procurement" element={<Placeholder titleKey="procurement" descriptionKey="procurementPlaceholder" links={procurementLinks} />} />
          <Route path="procurement/new" element={<Placeholder titleKey="createProcurement" descriptionKey="createProcurementPlaceholder" />} />
          <Route path="procurement/:requestId" element={<Placeholder titleKey="procurementDetail" descriptionKey="procurementDetailPlaceholder" />} />
          <Route path="chat" element={<Placeholder titleKey="chat" descriptionKey="chatPlaceholder" links={chatLinks} />} />
          <Route path="chat/:conversationId" element={<Placeholder titleKey="conversation" descriptionKey="conversationPlaceholder" />} />
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
