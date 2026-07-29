import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en";
import th from "./th";

export type Language = "en" | "th";

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
    },
    th: {
      translation: th,
    },
  },

  lng: localStorage.getItem("language") ?? "en",
  fallbackLng: "en",

  interpolation: {
    escapeValue: false,
  },
});

export default i18n;