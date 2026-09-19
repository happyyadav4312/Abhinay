'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui';
import { ROLE_LABELS } from '@/types';

export function SiteHeader() {
  const { user, isAuthenticated, isInitializing, logout } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutWarning, setLogoutWarning] = useState<string | null>(null);

  async function handleLogout() {
    setIsLoggingOut(true);
    setLogoutWarning(null);

    const { revokedOnServer } = await logout();

    if (!revokedOnServer) {
      // Truthful: the UI is logged out but the server was never reached.
      setLogoutWarning('Signed out locally — the server could not be reached to end the session.');
    }

    setIsLoggingOut(false);
    router.replace('/login');
  }

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
      >
        <Link
          href={isAuthenticated ? '/dashboard' : '/'}
          className="text-base font-semibold tracking-tight text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
        >
          Abhinay
        </Link>

        <div className="ml-auto flex items-center gap-1">
          {isInitializing ? null : isAuthenticated && user ? (
            <>
              <span className="mr-2 hidden text-sm text-zinc-400 sm:inline">
                {user.name} · {ROLE_LABELS[user.role]}
              </span>
              <Link
                href="/dashboard"
                className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
              >
                Dashboard
              </Link>
              <Link
                href="/profile"
                className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
              >
                Profile
              </Link>
              <Link
                href="/settings"
                className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
              >
                Settings
              </Link>
              <Button variant="ghost" onClick={handleLogout} isLoading={isLoggingOut}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </nav>

      {logoutWarning ? (
        <p role="status" className="bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300">
          {logoutWarning}
        </p>
      ) : null}
    </header>
  );
}
