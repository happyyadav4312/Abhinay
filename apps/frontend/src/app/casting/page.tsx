'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { ApiError, castingApi, type CastingListParams, type CastingRolePage } from '@/lib/api';
import { castingSearchFormSchema, LIMITS, type CastingSearchFormValues } from '@/lib/validation';
import { ErrorState, LoadingState, RequireAuth } from '@/components/common';
import { CastingRoleCard, Pager } from '@/components/casting';
import { Button, buttonVariants, EmptyState, Field, Input, NativeSelect } from '@/components/ui';
import { canPostCasting, PUBLIC_ROLES, ROLE_LABELS, type PublicRole } from '@/types';

type LoadResult = { key: string } & (
  { ok: true; page: CastingRolePage } | { ok: false; message: string }
);

/**
 * Filters live in the URL, so a search can be shared, bookmarked and restored
 * by the back button. Anything malformed in a hand-edited URL is dropped here
 * rather than sent to the API.
 */
function filtersFrom(search: { get(name: string): string | null }): CastingListParams {
  const seekingRole = search.get('seekingRole') ?? '';
  const page = Number(search.get('page'));

  return {
    q: search.get('q')?.trim().slice(0, LIMITS.CASTING_SEARCH_MAX) || undefined,
    seekingRole: (PUBLIC_ROLES as string[]).includes(seekingRole)
      ? (seekingRole as PublicRole)
      : undefined,
    location: search.get('location')?.trim().slice(0, LIMITS.CASTING_LOCATION_MAX) || undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

function castingHref(filters: CastingListParams): string {
  const search = new URLSearchParams();
  if (filters.q) search.set('q', filters.q);
  if (filters.seekingRole) search.set('seekingRole', filters.seekingRole);
  if (filters.location) search.set('location', filters.location);
  if (filters.page && filters.page > 1) search.set('page', String(filters.page));
  const query = search.toString();
  return query ? `/casting?${query}` : '/casting';
}

function SearchBar({
  initial,
  onSearch,
}: {
  initial: CastingListParams;
  onSearch: (filters: CastingListParams) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CastingSearchFormValues>({
    resolver: zodResolver(castingSearchFormSchema),
    defaultValues: {
      q: initial.q ?? '',
      seekingRole: initial.seekingRole ?? '',
      location: initial.location ?? '',
    },
  });

  return (
    <form
      role="search"
      aria-label="Filter casting roles"
      noValidate
      onSubmit={handleSubmit((values) =>
        onSearch({
          q: values.q || undefined,
          seekingRole: (values.seekingRole || undefined) as PublicRole | undefined,
          location: values.location || undefined,
        })
      )}
      className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-start"
    >
      <Field label="Search" htmlFor="casting-search" error={errors.q?.message}>
        <Input
          id="casting-search"
          type="search"
          placeholder="Title, description, requirements…"
          aria-invalid={Boolean(errors.q)}
          {...register('q')}
        />
      </Field>
      <Field label="Role" htmlFor="casting-filter-role">
        {/* h-8 matches the inputs; py-0 so the shorter select does not clip its text. */}
        <NativeSelect id="casting-filter-role" className="h-8 py-0" {...register('seekingRole')}>
          <option value="">Any role</option>
          {PUBLIC_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Location" htmlFor="casting-filter-location" error={errors.location?.message}>
        <Input
          id="casting-filter-location"
          placeholder="Any location"
          aria-invalid={Boolean(errors.location)}
          {...register('location')}
        />
      </Field>
      {/* Offset by the label row (text-sm, leading-none) plus the field gap. */}
      <Button type="submit" className="sm:mt-5">
        Search
      </Button>
    </form>
  );
}

function CastingBrowse() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();

  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);

  // State is only ever set from the promise callbacks, never synchronously in
  // the effect body. "Loading" is derived: the stored result belongs to an
  // older request key until the new answer arrives.
  useEffect(() => {
    const controller = new AbortController();
    const key = `${queryKey}|${reloadToken}`;

    castingApi
      .list(filtersFrom(new URLSearchParams(queryKey)), controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setResult({ key, ok: true, page });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          ok: false,
          message: caught instanceof ApiError ? caught.message : 'Could not load casting roles.',
        });
      });

    return () => controller.abort();
  }, [queryKey, reloadToken]);

  const filters = filtersFrom(searchParams);
  const hasFilters = Boolean(filters.q || filters.seekingRole || filters.location);
  const isPoster = canPostCasting(user?.role);
  const isLoading = result === null || result.key !== `${queryKey}|${reloadToken}`;

  let body: React.ReactNode;
  if (isLoading) {
    body = <LoadingState label="Loading casting roles…" />;
  } else if (!result.ok) {
    body = (
      <ErrorState message={result.message} onRetry={() => setReloadToken((token) => token + 1)} />
    );
  } else if (result.page.castingRoles.length === 0) {
    body = hasFilters ? (
      <EmptyState>
        No open casting roles match your search.{' '}
        <Link href="/casting" className="text-primary underline underline-offset-4">
          Clear filters
        </Link>
      </EmptyState>
    ) : (
      <EmptyState>
        No open casting roles yet.{' '}
        {isPoster ? (
          <Link href="/casting/create" className="text-primary underline underline-offset-4">
            Post the first one
          </Link>
        ) : (
          'Check back soon.'
        )}
      </EmptyState>
    );
  } else {
    const { castingRoles, pagination } = result.page;
    body = (
      <>
        <p className="text-sm text-zinc-500">
          {pagination.total} open {pagination.total === 1 ? 'role' : 'roles'}
          {hasFilters ? ' match your search' : ''}
        </p>
        <ul className="flex flex-col gap-3">
          {castingRoles.map((role) => (
            <CastingRoleCard key={role.id} role={role} />
          ))}
        </ul>
        <Pager pagination={pagination} hrefFor={(page) => castingHref({ ...filters, page })} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Casting calls</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Open roles from producers and directors across the network.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/applications" className={buttonVariants({ variant: 'outline' })}>
            My applications
          </Link>
          {isPoster ? (
            <>
              <Link href="/casting/mine" className={buttonVariants({ variant: 'outline' })}>
                My postings
              </Link>
              <Link href="/casting/create" className={buttonVariants()}>
                Post a role
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {/* Remounted per URL so the inputs always show the active filters. */}
      <SearchBar
        key={queryKey}
        initial={filters}
        onSearch={(next) => router.push(castingHref({ ...next, page: undefined }))}
      />

      {body}
    </div>
  );
}

export default function CastingBrowsePage() {
  return (
    <RequireAuth>
      {/* useSearchParams requires a Suspense boundary during prerendering. */}
      <Suspense fallback={<LoadingState label="Loading casting roles…" />}>
        <CastingBrowse />
      </Suspense>
    </RequireAuth>
  );
}
