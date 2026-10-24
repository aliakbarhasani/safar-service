"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  getLocaleSettings,
  getTextDirection,
  resolveLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/i18n/locale";

const STORAGE_KEY = "safar-service-locale";

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const browserLocale = window.navigator.languages?.[0] ?? window.navigator.language;
      const initial = saved ? resolveLocale(saved) : resolveLocale(browserLocale);
      setLocaleState(initial);
    } catch {
      // Storage can be unavailable in private/restricted browser contexts.
      setLocaleState(DEFAULT_LOCALE);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getTextDirection(locale);
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLocale);
    } catch {
      // The preference still applies for the current page if storage is blocked.
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}

export { getLocaleSettings, getTextDirection, SUPPORTED_LOCALES };
