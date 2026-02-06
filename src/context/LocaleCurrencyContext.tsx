"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

const STORAGE_LOCALE = "app_locale";
const STORAGE_CURRENCY = "app_currency";

export type Locale = "en" | "ar";

export const CURRENCIES = ["EGP", "USD", "EUR", "SAR", "AED", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];

const DEFAULT_LOCALE: Locale = "en";
const DEFAULT_CURRENCY: Currency = "EGP";

function readLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const v = localStorage.getItem(STORAGE_LOCALE);
    if (v === "en" || v === "ar") return v;
  } catch {}
  return DEFAULT_LOCALE;
}

function readCurrency(): Currency {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  try {
    const v = localStorage.getItem(STORAGE_CURRENCY);
    if (v && CURRENCIES.includes(v as Currency)) return v as Currency;
  } catch {}
  return DEFAULT_CURRENCY;
}

interface LocaleCurrencyContextValue {
  locale: Locale;
  currency: Currency;
  isHydrated: boolean;
  setLocale: (locale: Locale) => void;
  setCurrency: (currency: Currency) => void;
}

const LocaleCurrencyContext = createContext<LocaleCurrencyContextValue | null>(
  null
);

export function useLocaleCurrency() {
  const ctx = useContext(LocaleCurrencyContext);
  if (!ctx) {
    throw new Error(
      "useLocaleCurrency must be used within LocaleCurrencyProvider"
    );
  }
  return ctx;
}

export function LocaleCurrencyProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_CURRENCY);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setLocaleState(readLocale());
    setCurrencyState(readCurrency());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    document.documentElement.lang = locale === "ar" ? "ar" : "en";
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [isHydrated, locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_LOCALE, next);
    } catch {}
  }, []);

  const setCurrency = useCallback((next: Currency) => {
    setCurrencyState(next);
    try {
      localStorage.setItem(STORAGE_CURRENCY, next);
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ locale, currency, isHydrated, setLocale, setCurrency }),
    [locale, currency, isHydrated, setLocale, setCurrency]
  );

  return (
    <LocaleCurrencyContext.Provider value={value}>
      {children}
    </LocaleCurrencyContext.Provider>
  );
}
