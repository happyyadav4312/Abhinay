'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useAuth, useNotifications } from '@/hooks';
import { Button } from '@/components/ui';
import { ROLE_LABELS } from '@/types';

export function SiteHeader() {
  const { user, isAuthenticated, isInitializing, logout } = useAuth();
  const { unreadCount } = useNotifications();
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
    <header className="border-b border-border bg-background/85 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
      >
        <Link
          href={isAuthenticated ? '/dashboard' : '/'}
          className="font-heading text-xl font-medium tracking-tight text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Abhinay
        </Link>

        {/* Wraps on narrow screens rather than overflowing the viewport. */}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {isInitializing ? null : isAuthenticated && user ? (
            <>
              <span className="mr-2 hidden text-sm text-muted-foreground sm:inline">
                {user.name} · {ROLE_LABELS[user.role]}
              </span>
              <Link
                href="/dashboard"
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Dashboard
              </Link>
              <Link
                href="/casting"
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Casting
              </Link>
              <Link
                href="/profile"
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Profile
              </Link>
              <Link
                href="/notifications"
                aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
                className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-primary-foreground shadow-2xs">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/settings"
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
