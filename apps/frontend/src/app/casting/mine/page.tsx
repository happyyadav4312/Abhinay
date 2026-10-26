'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ApiError, castingApi, type CastingMineParams, type CastingRolePage } from '@/lib/api';
import { ErrorState, LoadingState, MessageCard, RequireAuth } from '@/components/common';
import { CastingRoleCard, Pager } from '@/components/casting';
import { Alert, buttonVariants, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';
import { canPostCasting, CASTING_ROLE_STATUSES, type CastingRoleStatus } from '@/types';

type LoadResult = { key: string } & (
  { ok: true; page: CastingRolePage } | { ok: false; message: string }
);

const TABS: { label: string; status?: CastingRoleStatus }[] = [
  { label: 'All' },
  { label: 'Drafts', status: 'DRAFT' },
  { label: 'Open', status: 'OPEN' },
  { label: 'Closed', status: 'CLOSED' },
];

function paramsFrom(search: { get(name: string): string | null }): CastingMineParams {
  const status = search.get('status') ?? '';
  const page = Number(search.get('page'));
  return {
    status: (CASTING_ROLE_STATUSES as readonly string[]).includes(status)
      ? (status as CastingRoleStatus)
      : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

function mineHref(params: CastingMineParams): string {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const query = search.toString();
  return query ? `/casting/mine?${query}` : '/casting/mine';
}

function MyCastingList() {
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  // State is only ever set from the promise callbacks; loading is derived.
  useEffect(() => {
    const controller = new AbortController();
    const key = `${queryKey}|${reloadToken}`;

    castingApi
      .mine(paramsFrom(new URLSearchParams(queryKey)), controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setResult({ key, ok: true, page });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          ok: false,
          message:
            caught instanceof ApiError ? caught.message : 'Could not load your casting roles.',
        });
      });

    return () => controller.abort();
  }, [queryKey, reloadToken]);

  const params = paramsFrom(searchParams);
  const deleted = searchParams.get('notice') === 'deleted';

  let body: React.ReactNode;
  if (result === null || result.key !== `${queryKey}|${reloadToken}`) {
    body = <LoadingState label="Loading your casting roles…" />;
  } else if (!result.ok) {
    body = (
      <ErrorState message={result.message} onRetry={() => setReloadToken((token) => token + 1)} />
    );
  } else if (result.page.castingRoles.length === 0) {
    body = params.status ? (
      <EmptyState>No casting roles with this status.</EmptyState>
    ) : (
      <EmptyState>
        You have not posted any casting roles yet.{' '}
        <Link href="/casting/create" className="text-primary underline underline-offset-4">
          Post your first role
        </Link>
      </EmptyState>
    );
  } else {
    const { castingRoles, pagination } = result.page;
    body = (
      <>
        <ul className="flex flex-col gap-3">
          {castingRoles.map((role) => (
            <CastingRoleCard key={role.id} role={role} showStatus />
          ))}
        </ul>
        <Pager pagination={pagination} hrefFor={(page) => mineHref({ ...params, page })} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            My postings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every casting role you have posted, including drafts only you can see.
          </p>
        </div>
        <Link href="/casting/create" className={buttonVariants()}>
          Post a role
        </Link>
      </div>

      {deleted ? <Alert tone="success">Draft deleted.</Alert> : null}

      <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const active = params.status === tab.status;
          return (
            <Link
              key={tab.label}
              href={mineHref({ status: tab.status })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'border border-border/80 bg-secondary text-foreground font-medium shadow-2xs'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {body}
    </div>
  );
}

function MyCasting() {
  const { user } = useAuth();

  // UX only: the API independently answers 403 for any other role.
  if (!canPostCasting(user?.role)) {
    return (
      <MessageCard
        title="Producers and directors only"
        action={
          <Link href="/casting" className={buttonVariants({ variant: 'outline' })}>
            Browse casting calls
          </Link>
        }
      >
        Only producers and directors post casting roles, so there is nothing to manage here.
      </MessageCard>
    );
  }

  return <MyCastingList />;
}

export default function MyCastingPage() {
  return (
    <RequireAuth>
      {/* useSearchParams requires a Suspense boundary during prerendering. */}
      <Suspense fallback={<LoadingState label="Loading your casting roles…" />}>
        <MyCasting />
      </Suspense>
    </RequireAuth>
  );
}
