import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App";
import { LanguageProvider } from "./providers/LanguageProvider";
import { QueryProvider } from "./providers/QueryProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <QueryProvider>
        <App />
      </QueryProvider>
    </LanguageProvider>
  </StrictMode>,
);
