import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import sn from "./locales/sn.json";
import nd from "./locales/nd.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sn: { translation: sn },
      nd: { translation: nd },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "sn", "nd"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "zimscore_lang",
    },
  });

export default i18n;
