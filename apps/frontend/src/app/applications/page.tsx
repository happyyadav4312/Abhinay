'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ApiError, applicationsApi, type ApplicationPage } from '@/lib/api';
import { ErrorState, LoadingState, RequireAuth } from '@/components/common';
import { ApplicationCard, Pager } from '@/components/casting';
import { buttonVariants, EmptyState } from '@/components/ui';

type LoadResult = { key: string } & (
  { ok: true; page: ApplicationPage } | { ok: false; message: string }
);

function pageFrom(search: { get(name: string): string | null }): number | undefined {
  const page = Number(search.get('page'));
  return Number.isInteger(page) && page > 1 ? page : undefined;
}

function applicationsHref(page: number): string {
  return page > 1 ? `/applications?page=${page}` : '/applications';
}

function MyApplications() {
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  // State is only ever set from the promise callbacks; loading is derived.
  useEffect(() => {
    const controller = new AbortController();
    const key = `${queryKey}|${reloadToken}`;

    applicationsApi
      .mine({ page: pageFrom(new URLSearchParams(queryKey)) }, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setResult({ key, ok: true, page });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          ok: false,
          message:
            caught instanceof ApiError ? caught.message : 'Could not load your applications.',
        });
      });

    return () => controller.abort();
  }, [queryKey, reloadToken]);

  let body: React.ReactNode;
  if (result === null || result.key !== `${queryKey}|${reloadToken}`) {
    body = <LoadingState label="Loading your applications…" />;
  } else if (!result.ok) {
    body = (
      <ErrorState message={result.message} onRetry={() => setReloadToken((token) => token + 1)} />
    );
  } else if (result.page.applications.length === 0) {
    body = (
      <EmptyState>
        You have not applied to any casting roles yet.{' '}
        <Link href="/casting" className="text-primary underline underline-offset-4">
          Browse casting calls
        </Link>
      </EmptyState>
    );
  } else {
    const { applications, pagination } = result.page;
    body = (
      <>
        <ul className="flex flex-col gap-3">
          {applications.map((application) => (
            <ApplicationCard key={application.id} application={application} />
          ))}
        </ul>
        <Pager pagination={pagination} hrefFor={applicationsHref} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My applications</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Casting roles you have applied to, most recent first.
          </p>
        </div>
        <Link href="/casting" className={buttonVariants({ variant: 'outline' })}>
          Browse casting calls
        </Link>
      </div>

      {body}
    </div>
  );
}

export default function MyApplicationsPage() {
  return (
    <RequireAuth>
      {/* useSearchParams requires a Suspense boundary during prerendering. */}
      <Suspense fallback={<LoadingState label="Loading your applications…" />}>
        <MyApplications />
      </Suspense>
    </RequireAuth>
  );
}
