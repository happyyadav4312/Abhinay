'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useAuth, useNotifications } from '@/hooks';
import { Button, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ROLE_LABELS } from '@/types';

export function SiteHeader() {
  const { user, isAuthenticated, isInitializing, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const router = useRouter();
  const pathname = usePathname();
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

  const isNavActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const navLinkClass = (href: string) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      isNavActive(href)
        ? 'bg-secondary font-medium text-foreground shadow-2xs'
        : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
    );

  return (
    <header className="border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-40">
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
              <span className="mr-2 hidden text-xs text-muted-foreground lg:inline font-medium">
                {user.name} · {ROLE_LABELS[user.role]}
              </span>
              <Link
                href="/dashboard"
                aria-current={isNavActive('/dashboard') ? 'page' : undefined}
                className={navLinkClass('/dashboard')}
              >
                Dashboard
              </Link>
              <Link
                href="/casting"
                aria-current={isNavActive('/casting') ? 'page' : undefined}
                className={navLinkClass('/casting')}
              >
                Casting
              </Link>
              <Link
                href="/applications"
                aria-current={isNavActive('/applications') ? 'page' : undefined}
                className={navLinkClass('/applications')}
              >
                Applications
              </Link>
              <Link
                href="/messages"
                aria-current={isNavActive('/messages') ? 'page' : undefined}
                className={navLinkClass('/messages')}
              >
                Messages
              </Link>
              <Link
                href="/auditions"
                aria-current={isNavActive('/auditions') ? 'page' : undefined}
                className={navLinkClass('/auditions')}
              >
                Auditions
              </Link>
              <Link
                href="/profile"
                aria-current={isNavActive('/profile') ? 'page' : undefined}
                className={navLinkClass('/profile')}
              >
                Profile
              </Link>
              <Link
                href="/notifications"
                aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
                aria-current={isNavActive('/notifications') ? 'page' : undefined}
                className={cn(
                  'relative rounded-md p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  isNavActive('/notifications')
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                )}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-2xs tabular-nums">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/settings"
                aria-current={isNavActive('/settings') ? 'page' : undefined}
                className={navLinkClass('/settings')}
              >
                Settings
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout} isLoading={isLoggingOut}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Log in
              </Link>
              <Link
                href="/register"
                className={buttonVariants({ size: 'sm' })}
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </nav>

      {logoutWarning ? (
        <p role="status" className="bg-amber-500/10 border-t border-amber-500/20 px-4 py-2 text-center text-xs text-amber-300">
          {logoutWarning}
        </p>
      ) : null}
    </header>
  );
}
