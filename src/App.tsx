import AppRouter from "./router/AppRouter";
import { useGlobalGlassPhysics } from "./hooks/useGlassPhysics";
import AppNotificationToaster from "./components/AppNotificationToaster";

export default function App() {
  useGlobalGlassPhysics();

  return (
    <>
      <AppRouter />
      <AppNotificationToaster />
    </>
  );
}
