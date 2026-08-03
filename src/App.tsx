import AppRouter from "./router/AppRouter";
import { useUiTapSound } from "./hooks/useUiTapSound";

export default function App() {
  useUiTapSound();

  return <AppRouter />;
}
