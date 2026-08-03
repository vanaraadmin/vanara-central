import AppRouter from "./router/AppRouter";
import { useGlobalGlassPhysics } from "./hooks/useGlassPhysics";
import { useUiTapSound } from "./hooks/useUiTapSound";

export default function App() {
  useGlobalGlassPhysics();
  useUiTapSound();

  return <AppRouter />;
}
