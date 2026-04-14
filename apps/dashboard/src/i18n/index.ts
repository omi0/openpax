import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import it from "./it.json";

const stored = (() => {
  try {
    return localStorage.getItem("openpax.lang");
  } catch {
    return null;
  }
})();
const browser = navigator.language.toLowerCase().startsWith("it") ? "it" : "en";

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, it: { translation: it } },
  lng: stored ?? browser,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: "it" | "en") {
  void i18next.changeLanguage(lang);
  try {
    localStorage.setItem("openpax.lang", lang);
  } catch {}
}

export default i18next;
