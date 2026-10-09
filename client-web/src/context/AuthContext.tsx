"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import config from "@/config/app-config.json";
import {
  clearStoredUser,
  getStoredUser,
  setStoredUser,
} from "@/lib/auth";

export interface AuthUser {
  id?: string;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  role?: string;
}

interface AuthContextValue {
  /** In-memory marker only; the real access token stays in an HttpOnly cookie. */
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** Persist display user data and update client state; never accepts a JWT. */
  setAuth: (user: AuthUser | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || config.api?.baseUrl || "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser<AuthUser>());
  // This marker is only for client-side UI. Server middleware and APIs validate the HttpOnly cookie.
  const [token, setToken] = useState<string | null>(() =>
    getStoredUser<AuthUser>() ? "httpOnly-session" : null
  );

  const setAuth = useCallback((u: AuthUser | null) => {
    setStoredUser(u);
    setToken(u ? "httpOnly-session" : null);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    // Only the server can clear an HttpOnly cookie. Revoke the session there,
    // then clear non-sensitive client display state immediately.
    void fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    }).catch(() => undefined);
    clearStoredUser();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ token, user, isAuthenticated: !!token, setAuth, logout }),
    [token, user, setAuth, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}
