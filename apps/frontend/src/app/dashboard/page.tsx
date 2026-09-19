'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { RequireAuth } from '@/components/common';
import { Card } from '@/components/ui';
import { ROLE_LABELS } from '@/types';

function DashboardContent() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Signed in as <span className="text-zinc-200">{ROLE_LABELS[user.role]}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-base font-medium text-zinc-100">Your professional profile</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Keep your photo, bio, skills and credits current so collaborators can find you.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/profile"
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
            >
              View profile
            </Link>
            <Link
              href="/profile/edit"
              className="rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
            >
              Edit profile
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-medium text-zinc-100">Account</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Email</dt>
            <dd className="truncate text-zinc-200">{user.email}</dd>
            <dt className="text-zinc-500">Role</dt>
            <dd className="text-zinc-200">{ROLE_LABELS[user.role]}</dd>
          </dl>
          <Link
            href="/settings"
            className="mt-4 inline-block text-sm text-brand-400 underline underline-offset-4"
          >
            Account settings
          </Link>
        </Card>
      </div>

      {/*
        Placeholders for later WBS modules. They are visibly disabled and link
        nowhere — no routes, APIs or tables exist behind them.
      */}
      <section aria-labelledby="coming-soon">
        <h2
          id="coming-soon"
          className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500"
        >
          Coming in a later release
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { title: 'Applications', body: 'Apply to casting calls and track your submissions.' },
            { title: 'Messages', body: 'Talk directly with directors, producers and crew.' },
          ].map((item) => (
            <div
              key={item.title}
              aria-disabled="true"
              className="cursor-not-allowed rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-5 opacity-60"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-base font-medium text-zinc-300">{item.title}</h3>
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-500">
                  Not available yet
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
