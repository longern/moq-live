import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, messages, SUPPORTED_LOCALES } from "./messages/index.js";

const STORAGE_KEY = "moq-live:locale";
const I18nContext = createContext(null);

function getByPath(source, key) {
  return String(key || "").split(".").reduce((current, part) => current?.[part], source);
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
}

function normalizeLocale(locale) {
  const value = String(locale || "").trim().toLowerCase();
  if (!value) {
    return DEFAULT_LOCALE;
  }
  if (value.startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
}

function detectBrowserLocale() {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }

  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
    navigator.userLanguage,
  ].filter(Boolean);

  return normalizeLocale(candidates[0]);
}

function readStoredLocale() {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function resolveInitialLocalePreference() {
  const storedValue = readStoredLocale();
  const storedLocale = normalizeLocale(storedValue);
  if (storedValue && SUPPORTED_LOCALES.includes(storedLocale)) {
    return storedLocale;
  }
  return "system";
}

function createTranslator(locale) {
  const resolvedLocale = normalizeLocale(locale);
  const localeMessages = messages[resolvedLocale] || messages[DEFAULT_LOCALE];
  const fallbackMessages = messages[DEFAULT_LOCALE];

  return function t(key, params = {}) {
    const value = getByPath(localeMessages, key) ?? getByPath(fallbackMessages, key);
    if (typeof value === "function") {
      return value(params);
    }
    if (typeof value === "string") {
      return interpolate(value, params);
    }
    if (import.meta.env?.DEV) {
      console.warn(`Missing i18n key: ${key}`);
    }
    return key;
  };
}

export function I18nProvider({ children }) {
  const [systemLocale, setSystemLocale] = useState(detectBrowserLocale);
  const [localePreference, setLocalePreferenceState] = useState(resolveInitialLocalePreference);
  const locale = localePreference === "system" ? systemLocale : normalizeLocale(localePreference);

  const value = useMemo(() => {
    const t = createTranslator(locale);
    function setLocalePreference(nextLocalePreference) {
      const normalized = nextLocalePreference === "system" ? "system" : normalizeLocale(nextLocalePreference);
      setLocalePreferenceState(normalized);
      if (typeof window !== "undefined") {
        try {
          if (normalized === "system") {
            window.localStorage.removeItem(STORAGE_KEY);
          } else {
            window.localStorage.setItem(STORAGE_KEY, normalized);
          }
        } catch {
          // Ignore storage failures; language remains active for this session.
        }
      }
    }

    return {
      locale,
      localePreference,
      setLocale: setLocalePreference,
      setLocalePreference,
      systemLocale,
      t,
    };
  }, [locale, localePreference, systemLocale]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function handleLanguageChange() {
      setSystemLocale(detectBrowserLocale());
    }

    window.addEventListener("languagechange", handleLanguageChange);
    return () => {
      window.removeEventListener("languagechange", handleLanguageChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      locale: DEFAULT_LOCALE,
      localePreference: "system",
      setLocale: () => {},
      setLocalePreference: () => {},
      systemLocale: DEFAULT_LOCALE,
      t: createTranslator(DEFAULT_LOCALE),
    };
  }
  return context;
}
