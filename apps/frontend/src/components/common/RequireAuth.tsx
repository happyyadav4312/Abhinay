'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui';

/**
 * Only same-origin, path-only destinations are ever honoured. `//evil.test` and
 * `https://evil.test` both parse as absolute URLs in a browser, so rejecting
 * anything that does not start with a single `/` closes the open-redirect hole.
 */
export function safeReturnTo(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  return value;
}

/**
 * Client-side route guard. This is a UX measure only — Express independently
 * enforces every protected read and write, so bypassing this component gains an
 * attacker nothing.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isInitializing, didSignOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isInitializing || isAuthenticated) return;
    // Someone who deliberately logged out is not trying to reach this page any
    // more, so their next login must not bounce them back to it.
    router.replace(didSignOut ? '/login' : `/login?returnTo=${encodeURIComponent(pathname)}`);
  }, [isAuthenticated, isInitializing, didSignOut, pathname, router]);

  // Held in a loading state until the refresh-cookie exchange resolves, so
  // protected content never flashes before authentication is known.
  if (isInitializing || !isAuthenticated) {
    return (
      <div className="grid min-h-[60vh] place-items-center" data-testid="auth-loading">
        <Spinner className="h-6 w-6 text-brand-400" />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  return <>{children}</>;
}
