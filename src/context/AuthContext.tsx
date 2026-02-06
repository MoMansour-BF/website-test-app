"use client";

import type { IdentityBlob, Session, UserProfile } from "@/auth/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

const STORAGE_IDENTITY = "app_identity";

/** Phase 4: Promo display rules — CUG only; displayDiscountPercent for configured "fake" discount. */
export interface PromoConfig {
  isCug: boolean;
  displayDiscountPercent?: number;
}

function readStoredIdentity(): IdentityBlob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_IDENTITY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IdentityBlob;
    if (parsed?.session?.sessionId && parsed?.profile?.userId) return parsed;
  } catch {}
  return null;
}

function writeStoredIdentity(identity: IdentityBlob | null) {
  try {
    if (identity) {
      localStorage.setItem(STORAGE_IDENTITY, JSON.stringify(identity));
    } else {
      localStorage.removeItem(STORAGE_IDENTITY);
    }
  } catch {}
}

interface AuthContextValue {
  /** Whether we have finished initial load (session fetch or read from storage). */
  isReady: boolean;
  /** True when there is a valid session (logged in). */
  isLoggedIn: boolean;
  /** Phase 4: When true, UI may show promo (real SSP-based or configured discount). */
  isCug: boolean;
  /** Phase 4: Optional display discount % for "fake" promo (was = retail × (1 + p/100)). */
  promoConfig: PromoConfig;
  /** Current identity (session + profile) when logged in; null when guest. */
  identity: IdentityBlob | null;
  /** Current session when logged in; null when guest. */
  session: Session | null;
  /** Current user profile when logged in; null when guest. */
  userProfile: UserProfile | null;
  /** Adapter-style: get current session (from state). */
  getSession: () => Promise<Session | null>;
  /** Adapter-style: get current user profile (from state). */
  getUserProfile: () => Promise<UserProfile | null>;
  /** Adapter-style: get current identity blob (from state). */
  getIdentity: () => Promise<IdentityBlob | null>;
  /** Call after successful login to set identity (and persist to localStorage). */
  setIdentity: (identity: IdentityBlob | null) => void;
  /** Refresh identity from server (GET /api/auth/session). */
  refreshSession: () => Promise<void>;
  /** Log in via API then update state and storage. */
  login: (body: { email: string; password?: string; displayName?: string; phone?: string; userType?: string; loyaltyLevel?: string }) => Promise<{ ok: boolean; error?: string }>;
  /** Log out via API then clear state and storage. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

const DEFAULT_PROMO_CONFIG: PromoConfig = { isCug: false, displayDiscountPercent: undefined };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentityState] = useState<IdentityBlob | null>(null);
  const [promoConfig, setPromoConfig] = useState<PromoConfig>(DEFAULT_PROMO_CONFIG);
  const [isReady, setIsReady] = useState(false);

  const setIdentity = useCallback((next: IdentityBlob | null) => {
    setIdentityState(next);
    writeStoredIdentity(next);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      const data = await res.json();
      const next = data?.identity ?? null;
      setIdentityState(next);
      writeStoredIdentity(next);
      setPromoConfig(data?.promoConfig ?? DEFAULT_PROMO_CONFIG);
    } catch {
      setIdentityState(null);
      writeStoredIdentity(null);
      setPromoConfig(DEFAULT_PROMO_CONFIG);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    const stored = readStoredIdentity();
    if (stored) {
      setIdentityState(stored);
      // Refresh from server to confirm cookie is still valid
      refreshSession();
    } else {
      refreshSession();
    }
  }, [refreshSession]);

  const login = useCallback(
    async (body: {
      email: string;
      password?: string;
      displayName?: string;
      phone?: string;
      userType?: string;
      loyaltyLevel?: string;
    }) => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data?.error?.message ?? "Login failed" };
        }
        await refreshSession();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message ?? "Login failed" };
      }
    },
    [refreshSession]
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      setIdentityState(null);
      writeStoredIdentity(null);
      setIsReady(true);
    }
  }, []);

  const getSession = useCallback(
    async (): Promise<Session | null> => identity?.session ?? null,
    [identity]
  );
  const getUserProfile = useCallback(
    async (): Promise<UserProfile | null> => identity?.profile ?? null,
    [identity]
  );
  const getIdentity = useCallback(
    async (): Promise<IdentityBlob | null> => identity,
    [identity]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      isLoggedIn: !!identity,
      isCug: promoConfig.isCug,
      promoConfig,
      identity,
      session: identity?.session ?? null,
      userProfile: identity?.profile ?? null,
      getSession,
      getUserProfile,
      getIdentity,
      setIdentity,
      refreshSession,
      login,
      logout
    }),
    [
      isReady,
      identity,
      promoConfig,
      getSession,
      getUserProfile,
      getIdentity,
      setIdentity,
      refreshSession,
      login,
      logout
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
