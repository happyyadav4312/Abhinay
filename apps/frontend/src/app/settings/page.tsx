'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { RequireAuth } from '@/components/common';
import { Card } from '@/components/ui';
import { ROLE_LABELS } from '@/types';

function SettingsContent() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
      <p className="mb-6 mt-1 text-sm text-zinc-400">
        Read-only account information. Editable details live on your profile.
      </p>

      <Card>
        <dl className="grid grid-cols-1 gap-y-4 sm:grid-cols-[10rem_1fr] sm:gap-y-3">
          <dt className="text-sm text-zinc-500">Name</dt>
          <dd className="text-sm text-zinc-200">{user.name}</dd>

          <dt className="text-sm text-zinc-500">Email</dt>
          <dd className="break-all text-sm text-zinc-200">{user.email}</dd>

          <dt className="text-sm text-zinc-500">Professional role</dt>
          <dd className="text-sm text-zinc-200">{ROLE_LABELS[user.role]}</dd>

          <dt className="text-sm text-zinc-500">Member since</dt>
          <dd className="text-sm text-zinc-200">
            {new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(
              new Date(user.createdAt)
            )}
          </dd>
        </dl>

        <p className="mt-5 border-t border-zinc-800 pt-4 text-sm text-zinc-400">
          Email and professional role are fixed for this release.{' '}
          <Link href="/profile/edit" className="text-brand-400 underline underline-offset-4">
            Edit your profile
          </Link>{' '}
          to change your name, bio, location, phone, skills, credits and photo.
        </p>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  );
}
