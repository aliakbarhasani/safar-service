// Centralized auth token persistence layer.
//
// استراتژی ذخیره‌سازی Token (طبق فاز ۲):
//  - Backend کوکی HttpOnly ست نمی‌کند، بنابراین به‌جای اتکای تنها به
//    localStorage (که برای middleware و رندر اولیه در دسترس نیست)، توکن در یک
//    کوکی ساده (بدون HttpOnly) هم نگه‌داری می‌شود تا (الف) middleware بتواند
//    مسیرهای محافظت‌شده را در Edge چک کند و (ب) رندر اولیه به localStorage
//    وابسته نباشد. کوکی فقط برای جلسه فعلی مشتری است و در این مرحله
//    رمزنگاری نمی‌شود (پیاده‌سازی کامل روی کوکی HttpOnly برای بعدی).
//
// NOTE: این ماژول به‌گونه‌ای طراحی شده که در دو روال client و middleware
// کوکی را به شکل سازگار بخواند.

export const AUTH_TOKEN_COOKIE = "access_token";
const USER_STORAGE_KEY = "user";

// The access token is HttpOnly and intentionally cannot be read or written by JavaScript.
// AUTH_TOKEN_COOKIE is exported for server-side middleware only.

// --- User profile (kept in localStorage — non-sensitive display data) ---

export function setStoredUser(user: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user ?? {}));
  } catch {
    /* ignore quota/security errors */
  }
}

export function getStoredUser<T = Record<string, unknown>>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearStoredUser(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_STORAGE_KEY);
}