'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { AuditionCard } from '@/components/auditions/AuditionCard';
import { RequireAuth } from '@/components/common/RequireAuth';
import { SiteHeader } from '@/components/common/SiteHeader';
import { ApiError, auditionApi, castingApi } from '@/lib/api';
import { Audition, CastingRole } from '@/types';
import { Spinner } from '@/components/ui/spinner';
import { buttonVariants } from '@/components/ui';

export default function RoleAuditionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [role, setRole] = useState<CastingRole | null>(null);
  const [auditions, setAuditions] = useState<Audition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([castingApi.get(id), auditionApi.listForRole(id)])
      .then(([roleResult, auditionResult]) => {
        if (!active) return;
        setRole(roleResult.castingRole);
        setAuditions(auditionResult.items);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof ApiError ? caught.message : 'Could not load auditions.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-6">
          <Link
            href={`/casting/${id}`}
            className="text-sm text-stone-400 hover:text-stone-200"
          >
            ← Back to role
          </Link>
          <header>
            <h1 className="text-2xl font-bold tracking-tight text-stone-100">
              Review auditions
            </h1>
            <p className="text-sm text-stone-400 mt-1">
              {role?.title ?? 'Casting role'} · Open an audition to watch the submission and
              approve or reject it.
            </p>
          </header>

          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner className="h-8 w-8 text-amber-500" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400">
              {error}
            </div>
          ) : auditions.length === 0 ? (
            <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-8 text-center text-sm text-stone-400">
              No auditions have been requested for this role yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {auditions.map((audition) => (
                <AuditionCard key={audition.id} audition={audition} isAuthor />
              ))}
            </div>
          )}

          <Link
            href={`/casting/${id}/applicants`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Back to applicants
          </Link>
        </main>
      </div>
    </RequireAuth>
  );
}
