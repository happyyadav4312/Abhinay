'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Award, CheckCircle2, Info, Star } from 'lucide-react';
import { ApiError, notificationsApi } from '@/lib/api';
import { useNotifications } from '@/hooks';
import { ErrorState, LoadingState, RequireAuth } from '@/components/common';
import { Pager, formatDate } from '@/components/casting';
import { Button, Card, CardContent, EmptyState } from '@/components/ui';
import type { NotificationPage, NotificationType } from '@/types';

type LoadResult = { key: string } & (
  { ok: true; page: NotificationPage } | { ok: false; message: string }
);

function NotificationIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case 'APPLICATION_SHORTLISTED':
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Star className="h-5 w-5" />
        </div>
      );
    case 'APPLICATION_SELECTED':
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Award className="h-5 w-5" />
        </div>
      );
    case 'APPLICATION_REJECTED':
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive border border-destructive/20">
          <Info className="h-5 w-5" />
        </div>
      );
    default:
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
          <CheckCircle2 className="h-5 w-5" />
        </div>
      );
  }
}

function NotificationsList() {
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const unreadFilter = searchParams.get('unread') === 'true';

  const { refreshUnreadCount } = useNotifications();
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  const currentKey = `${queryKey}|${reloadToken}`;

  // State is only ever set from promise callbacks; loading is derived.
  useEffect(() => {
    const controller = new AbortController();
    const key = `${queryKey}|${reloadToken}`;

    notificationsApi
      .list(
        {
          page,
          pageSize: 15,
          unreadOnly: unreadFilter ? true : undefined,
        },
        controller.signal
      )
      .then((notificationPage) => {
        if (!controller.signal.aborted) {
          setResult({ key, ok: true, page: notificationPage });
        }
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          ok: false,
          message:
            caught instanceof ApiError ? caught.message : 'Could not load your notifications.',
        });
      });

    return () => controller.abort();
  }, [queryKey, page, unreadFilter, reloadToken]);

  async function handleMarkAsRead(id: string) {
    try {
      await notificationsApi.markAsRead(id);
      setResult((prev) => {
        if (!prev || !prev.ok) return prev;
        return {
          ...prev,
          page: {
            ...prev.page,
            notifications: prev.page.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            ),
            unreadCount: Math.max(0, prev.page.unreadCount - 1),
          },
        };
      });
      void refreshUnreadCount();
    } catch {
      // Ignored
    }
  }

  async function handleMarkAllAsRead() {
    try {
      await notificationsApi.markAllAsRead();
      setResult((prev) => {
        if (!prev || !prev.ok) return prev;
        return {
          ...prev,
          page: {
            ...prev.page,
            notifications: prev.page.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          },
        };
      });
      void refreshUnreadCount();
    } catch {
      // Ignored
    }
  }

  let body: React.ReactNode;
  if (result === null || result.key !== currentKey) {
    body = <LoadingState label="Loading notifications…" />;
  } else if (!result.ok) {
    body = (
      <ErrorState message={result.message} onRetry={() => setReloadToken((token) => token + 1)} />
    );
  } else if (result.page.notifications.length === 0) {
    body = (
      <EmptyState>
        {unreadFilter ? 'You have no unread notifications.' : 'You have no notifications yet.'}
      </EmptyState>
    );
  } else {
    const { notifications, pagination } = result.page;
    body = (
      <>
        <ul className="flex flex-col gap-3">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Card
                className={`transition-colors border ${
                  !notification.read
                    ? 'border-primary/40 bg-card/90 shadow-2xs'
                    : 'border-border/70 bg-card/40'
                }`}
              >
                <CardContent className="flex items-start gap-4">
                  <NotificationIcon type={notification.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        {notification.title}
                        {!notification.read && (
                          <span className="h-2 w-2 rounded-full bg-primary" title="Unread" />
                        )}
                      </h2>
                      <time className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {formatDate(notification.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-foreground/90 leading-relaxed">
                      {notification.message}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {notification.relatedApplicationId && (
                        <Link
                          href="/applications"
                          className="text-xs font-medium text-primary hover:underline underline-offset-2"
                        >
                          View in my applications →
                        </Link>
                      )}
                      {!notification.read && (
                        <button
                          type="button"
                          onClick={() => void handleMarkAsRead(notification.id)}
                          className="rounded text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>

        <Pager
          pagination={pagination}
          hrefFor={(target) => {
            const search = new URLSearchParams();
            if (unreadFilter) search.set('unread', 'true');
            if (target > 1) search.set('page', String(target));
            const query = search.toString();
            return `/notifications${query ? `?${query}` : ''}`;
          }}
        />
      </>
    );
  }

  const unreadCount = result?.ok ? result.page.unreadCount : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Updates on your applications, shortlist statuses, and casting calls.
          </p>
        </div>

        {unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={() => void handleMarkAllAsRead()}>
            Mark all as read
          </Button>
        ) : null}
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border gap-4">
        <Link
          href="/notifications"
          className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            !unreadFilter
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          All
        </Link>
        <Link
          href="/notifications?unread=true"
          className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
            unreadFilter
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Unread
          {unreadCount > 0 ? (
            <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-xs font-semibold">
              {unreadCount}
            </span>
          ) : null}
        </Link>
      </div>

      {body}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<LoadingState label="Loading notifications…" />}>
        <NotificationsList />
      </Suspense>
    </RequireAuth>
  );
}
