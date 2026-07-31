import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App";
import { LanguageProvider } from "./providers/LanguageProvider";
import { QueryProvider } from "./providers/QueryProvider";
import { TM30_TEMPLATE_URL } from "./tm30-template";

void TM30_TEMPLATE_URL;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <QueryProvider>
        <App />
      </QueryProvider>
    </LanguageProvider>
  </StrictMode>,
);
