import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App";
import { LanguageProvider } from "./providers/LanguageProvider";
import { QueryProvider } from "./providers/QueryProvider";
import { registerVanaraServiceWorker } from "./services/pwa.service";
import { TM30_TEMPLATE_URL } from "./tm30-template";

void TM30_TEMPLATE_URL;

if (import.meta.env.PROD) registerVanaraServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <QueryProvider>
        <App />
      </QueryProvider>
    </LanguageProvider>
  </StrictMode>,
);
