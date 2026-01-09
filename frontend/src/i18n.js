import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en/translation.json";
import th from "./locales/th/translation.json";

export const SUPPORTED_LANGS = ["en", "th"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      th: { translation: th },
    },
    supportedLngs: SUPPORTED_LANGS,
    fallbackLng: "en",

    // ✅ เพิ่ม 2 บรรทัดนี้
    load: "languageOnly",
    nonExplicitSupportedLngs: true,

    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  })


export default i18n;
