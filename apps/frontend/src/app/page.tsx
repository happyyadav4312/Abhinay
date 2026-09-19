'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { healthApi } from '@/lib/api';
import { Card } from '@/components/ui';
import { ROLE_LABELS, PUBLIC_ROLES } from '@/types';

type Health = { state: 'checking' | 'up' | 'degraded' | 'down'; detail: string };

export default function HomePage() {
  const { isAuthenticated, isInitializing } = useAuth();
  const router = useRouter();
  const [health, setHealth] = useState<Health>({ state: 'checking', detail: 'Checking API…' });

  useEffect(() => {
    if (!isInitializing && isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, isInitializing, router]);

  useEffect(() => {
    const controller = new AbortController();

    healthApi
      .check(controller.signal)
      .then((data) =>
        setHealth(
          data.database === 'connected'
            ? { state: 'up', detail: 'API and database are reachable' }
            : { state: 'degraded', detail: 'API is up but the database is unavailable' }
        )
      )
      .catch(() => {
        if (!controller.signal.aborted) {
          setHealth({ state: 'down', detail: 'Cannot reach the API server' });
        }
      });

    return () => controller.abort();
  }, []);

  const dotColour = {
    checking: 'bg-zinc-500',
    up: 'bg-emerald-400 animate-pulse-glow',
    degraded: 'bg-amber-400',
    down: 'bg-red-400',
  }[health.state];

  return (
    <div className="flex flex-col gap-10 py-6">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          The network behind the <span className="gradient-text">camera</span>.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-400">
          Abhinay connects actors, directors, producers, camera operators, editors and crew. Build a
          professional profile, list your skills and credits, and share one link.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
          >
            Create your profile
          </Link>
          <Link
            href="/login"
            className="rounded-md bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
          >
            Log in
          </Link>
        </div>
      </section>

      <section aria-labelledby="roles">
        <h2 id="roles" className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Built for every department
        </h2>
        <ul className="flex flex-wrap gap-2">
          {PUBLIC_ROLES.map((role) => (
            <li
              key={role}
              className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-sm text-zinc-300"
            >
              {ROLE_LABELS[role]}
            </li>
          ))}
        </ul>
      </section>

      <Card className="max-w-md">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${dotColour}`} aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-zinc-200">Service status</p>
            <p role="status" className="text-sm text-zinc-400">
              {health.detail}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
