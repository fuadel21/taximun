import { useCallback } from "react";
import { translations, Language } from "./translations";

// Store language preference in localStorage
const LANGUAGE_KEY = "taximun_language";

export function useI18n() {
  const getStoredLanguage = (): Language => {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored === "es" || stored === "ca" || stored === "en") {
      return stored;
    }
    // Default to Spanish
    return "es";
  };

  const setLanguage = useCallback((lang: Language) => {
    localStorage.setItem(LANGUAGE_KEY, lang);
    // Trigger a re-render by dispatching a custom event
    window.dispatchEvent(new CustomEvent("languageChange", { detail: { language: lang } }));
  }, []);

  const currentLanguage = getStoredLanguage();
  const t = translations[currentLanguage];

  return {
    t,
    currentLanguage,
    setLanguage,
    availableLanguages: ["es", "ca", "en"] as const,
  };
}
