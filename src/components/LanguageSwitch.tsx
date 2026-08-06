import { useLanguage } from "../providers/language.context";

export default function LanguageSwitch() {
  const { language, changeLanguage, translate } = useLanguage();

  return (
    <div className="operations-language" role="group" aria-label={translate("language")}>
      <button type="button" className={language === "en" ? "is-active" : ""} aria-pressed={language === "en"} onClick={() => changeLanguage("en")}>{translate("englishLanguage")}</button>
      <button type="button" className={language === "th" ? "is-active" : ""} aria-pressed={language === "th"} onClick={() => changeLanguage("th")}>{translate("thaiLanguage")}</button>
    </div>
  );
}
