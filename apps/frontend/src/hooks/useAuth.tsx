'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  authApi,
  invalidateSession,
  refreshAccessToken,
  setAccessToken,
  setUnauthenticatedHandler,
} from '@/lib/api';
import type { Role, User } from '@/types';

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  isAuthenticated: boolean;
  /**
   * True until the initial refresh-cookie exchange has resolved. Protected UI
   * must wait on this rather than on `isAuthenticated`, otherwise every reload
   * flashes the logged-out state before the session is restored.
   */
  isInitializing: boolean;
  /**
   * True only when the session ended because the user pressed Log out, as
   * opposed to expiring or never existing. Route guards use it to decide
   * whether sending the user back to the page they left makes sense.
   */
  didSignOut: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    role: Exclude<Role, 'ADMIN'>;
  }) => Promise<void>;
  logout: () => Promise<{ revokedOnServer: boolean }>;
  /** Merge a fresher copy of the user, e.g. after a profile rename. */
  applyUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [didSignOut, setDidSignOut] = useState(false);

  const clearSession = useCallback(() => {
    invalidateSession();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(clearSession);
    return () => setUnauthenticatedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const token = await refreshAccessToken();
        if (!token) return;

        const { user: currentUser } = await authApi.me(controller.signal);
        setUser(currentUser);
      } catch {
        // No valid session; the app stays logged out.
      } finally {
        if (!controller.signal.aborted) setIsInitializing(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    setAccessToken(result.accessToken);
    setUser(result.user);
    setDidSignOut(false);
  }, []);

  const register = useCallback<AuthContextValue['register']>(async (input) => {
    const result = await authApi.register(input);
    setAccessToken(result.accessToken);
    setUser(result.user);
    setDidSignOut(false);
  }, []);

  /**
   * Always ends in a logged-out UI, but reports honestly whether the server
   * actually revoked the refresh session. A network failure means the cookie may
   * still be live elsewhere, and the caller should say so rather than claim
   * success.
   */
  const logout = useCallback<AuthContextValue['logout']>(async () => {
    let revokedOnServer = false;
    try {
      await authApi.logout();
      revokedOnServer = true;
    } catch (error) {
      revokedOnServer = !(error instanceof ApiError && error.isNetworkError);
    } finally {
      setDidSignOut(true);
      clearSession();
    }
    return { revokedOnServer };
  }, [clearSession]);

  const applyUser = useCallback((next: User) => setUser(next), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user?.role ?? null,
      isAuthenticated: user !== null,
      isInitializing,
      didSignOut,
      login,
      register,
      logout,
      applyUser,
    }),
    [user, isInitializing, didSignOut, login, register, logout, applyUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}
