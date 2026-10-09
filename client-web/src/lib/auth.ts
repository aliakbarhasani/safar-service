// Centralized client-side user display storage.
// The backend sets the access token as an HttpOnly cookie. JavaScript must not
// read, write, or persist that token. Middleware reads it server-side, while
// API requests send it using credentials: "include".

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