"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearAuthToken,
  clearStoredUser,
  getAuthToken,
  getStoredUser,
  setAuthToken,
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
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** Persist token+user and update in-memory state (cookie + display storage). */
  setAuth: (token: string, user: AuthUser | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initial state reads from cookie (not localStorage) on first render so the
  // UI never gates layout behind synchronous localStorage access.
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser<AuthUser>());

  const setAuth = useCallback((t: string, u: AuthUser | null) => {
    setAuthToken(t);
    setStoredUser(u);
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
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