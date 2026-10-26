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
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Account settings</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Read-only account information. Editable details live on your profile.
      </p>

      <Card>
        <dl className="grid grid-cols-1 gap-y-4 sm:grid-cols-[10rem_1fr] sm:gap-y-3">
          <dt className="text-sm text-muted-foreground">Name</dt>
          <dd className="text-sm font-medium text-foreground">{user.name}</dd>

          <dt className="text-sm text-muted-foreground">Email</dt>
          <dd className="break-all text-sm text-foreground">{user.email}</dd>

          <dt className="text-sm text-muted-foreground">Professional role</dt>
          <dd className="text-sm text-foreground">{ROLE_LABELS[user.role]}</dd>

          <dt className="text-sm text-muted-foreground">Member since</dt>
          <dd className="text-sm text-foreground">
            {new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(
              new Date(user.createdAt)
            )}
          </dd>
        </dl>

        <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
          Email and professional role are fixed for this release.{' '}
          <Link href="/profile/edit" className="text-primary font-medium underline underline-offset-4 hover:opacity-85">
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
