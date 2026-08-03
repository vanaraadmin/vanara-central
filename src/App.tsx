import AppRouter from "./router/AppRouter";
import { useGlobalGlassPhysics } from "./hooks/useGlassPhysics";

export default function App() {
  useGlobalGlassPhysics();

  return <AppRouter />;
}
