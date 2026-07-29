import { useLanguage } from "../providers/language.context";

export default function LanguageSwitch() {
  const { language, changeLanguage } = useLanguage();

  return (
    <div className="operations-language" role="group" aria-label="Language">
      <button type="button" className={language === "en" ? "is-active" : ""} aria-pressed={language === "en"} onClick={() => changeLanguage("en")}>EN</button>
      <button type="button" className={language === "th" ? "is-active" : ""} aria-pressed={language === "th"} onClick={() => changeLanguage("th")}>ไทย</button>
    </div>
  );
}
