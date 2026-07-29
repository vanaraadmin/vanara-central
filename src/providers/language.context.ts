import { createContext, useContext } from "react";

import type { Language } from "../i18n";

export interface LanguageContextValue {
  language: Language;
  changeLanguage: (language: Language) => void;
  translate: (key: string) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }

  return context;
}
