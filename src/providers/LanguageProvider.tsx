import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import "../i18n";
import { useTranslation } from "react-i18next";

import type { Language } from "../i18n";
import { LanguageContext } from "./language.context";

interface LanguageProviderProps {
  children: ReactNode;
}

function getInitialLanguage(): Language {
  const savedLanguage = localStorage.getItem("language");

  if (savedLanguage === "en" || savedLanguage === "th") {
    return savedLanguage;
  }

  const browserLanguage = navigator.language.toLowerCase();

  return browserLanguage.startsWith("th") ? "th" : "en";
}

export function LanguageProvider({
  children,
}: LanguageProviderProps) {
  const { t, i18n } = useTranslation();

  const [language, setLanguage] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language, i18n]);

  const changeLanguage = (nextLanguage: Language) => {
    localStorage.setItem("language", nextLanguage);
    setLanguage(nextLanguage);
  };

  const value = useMemo(
    () => ({
      language,
      changeLanguage,
      translate: (key: string, options?: Record<string, unknown>) => t(key, options),
    }),
    [language, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
