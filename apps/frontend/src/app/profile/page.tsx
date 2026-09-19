'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, profileApi } from '@/lib/api';
import { ProfileView, RequireAuth } from '@/components/common';
import { Alert, Button, Card, Spinner } from '@/components/ui';
import type { OwnProfile } from '@/types';

function OwnProfileContent() {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [copied, setCopied] = useState(false);

  // State is only ever set from the promise callbacks, never synchronously in
  // the effect body — the effect subscribes to an external system and reacts
  // when it answers. `reloadToken` re-runs the effect for the retry button.
  useEffect(() => {
    const controller = new AbortController();

    profileApi
      .me(controller.signal)
      .then(({ profile: loaded }) => {
        if (controller.signal.aborted) return;
        setProfile(loaded);
        setError(null);
        setIsLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught.message : 'Could not load your profile.');
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [reloadToken]);

  const retry = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setReloadToken((token) => token + 1);
  }, []);

  if (isLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Spinner className="h-6 w-6 text-brand-400" />
        <span className="sr-only">Loading your profile…</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert>{error ?? 'Profile unavailable.'}</Alert>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const publicUrl = `/profile/${profile.id}`;

  return (
    <ProfileView profile={profile}>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Private details
            </h2>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-zinc-500">Email</dt>
              <dd className="break-all text-zinc-200">{profile.email}</dd>
              <dt className="text-zinc-500">Phone</dt>
              <dd className="text-zinc-200">{profile.phone ?? '—'}</dd>
            </dl>
            <p className="mt-2 text-xs text-zinc-500">
              Email and phone are never shown on your public profile.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/profile/edit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
            >
              Edit profile
            </Link>
            <Link
              href={publicUrl}
              className="rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
            >
              View public page
            </Link>
            <Button
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard?.writeText(`${window.location.origin}${publicUrl}`);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Link copied' : 'Copy link'}
            </Button>
          </div>
        </div>
      </Card>
    </ProfileView>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <OwnProfileContent />
    </RequireAuth>
  );
}
