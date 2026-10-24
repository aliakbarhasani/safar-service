/**
 * Locale primitives for Safar Service.
 *
 * Keep locale, country, currency, and timezone as separate concepts:
 * changing the display locale must never convert a stored amount or alter a booking.
 * This module is deliberately dependency-free and safe to import during SSR.
 */

export const SUPPORTED_LOCALES = [
  "fa-AF",
  "fa-IR",
  "ps-AF",
  "ar",
  "en",
  "ur",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type TextDirection = "rtl" | "ltr";

export const DEFAULT_LOCALE: SupportedLocale = "fa-AF";

const LOCALE_SETTINGS: Record<
  SupportedLocale,
  { direction: TextDirection; languageName: string; nativeName: string }
> = {
  "fa-AF": { direction: "rtl", languageName: "Dari", nativeName: "دری" },
  "fa-IR": { direction: "rtl", languageName: "Persian", nativeName: "فارسی" },
  "ps-AF": { direction: "rtl", languageName: "Pashto", nativeName: "پښتو" },
  ar: { direction: "rtl", languageName: "Arabic", nativeName: "العربية" },
  en: { direction: "ltr", languageName: "English", nativeName: "English" },
  ur: { direction: "rtl", languageName: "Urdu", nativeName: "اردو" },
};

const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  fa: "fa-AF",
  "fa-af": "fa-AF",
  "fa-ir": "fa-IR",
  ps: "ps-AF",
  "ps-af": "ps-AF",
  ar: "ar",
  en: "en",
  ur: "ur",
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve a user/browser preference to a supported locale.
 * Unsupported values safely fall back; they are never used as arbitrary Intl locales.
 */
export function resolveLocale(value: unknown): SupportedLocale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const normalized = value.trim().replace(/_/g, "-").toLowerCase();
  return LOCALE_ALIASES[normalized] ?? DEFAULT_LOCALE;
}

export function getLocaleSettings(locale: SupportedLocale) {
  return LOCALE_SETTINGS[locale];
}

export function getTextDirection(locale: SupportedLocale): TextDirection {
  return LOCALE_SETTINGS[locale].direction;
}

export function formatNumber(
  value: number,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Formats an amount in the supplied currency only. It does not perform FX conversion.
 * Callers must pass the currency actually attached to the amount/transaction.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale: SupportedLocale = DEFAULT_LOCALE,
): string {
  if (!Number.isFinite(amount)) return "—";
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new RangeError("A three-letter ISO 4217 currency code is required.");
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalizedCurrency,
  }).format(amount);
}

/**
 * Timezone is explicit when supplied. Locale controls presentation, not the event's timezone.
 */
export function formatDateTime(
  value: Date | string | number,
  locale: SupportedLocale = DEFAULT_LOCALE,
  timeZone?: string,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
