'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, profileApi } from '@/lib/api';
import { ProfileView } from '@/components/common';
import { Alert, Button, Card, Spinner } from '@/components/ui';
import type { PublicProfile } from '@/types';

/**
 * Public professional profile. Rendered on the client so the page never carries
 * server-rendered private data, and so it works identically whether or not a
 * visitor is logged in.
 *
 * `params` is a Promise in Next.js 16; `use()` unwraps it in a Client Component.
 */
export default function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notFound' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // State is only ever set from the promise callbacks, never synchronously in
  // the effect body. `reloadToken` re-runs the effect for the retry button.
  useEffect(() => {
    const controller = new AbortController();

    profileApi
      .publicProfile(id, controller.signal)
      .then(({ profile: loaded }) => {
        if (controller.signal.aborted) return;
        setProfile(loaded);
        setMessage(null);
        setStatus('ready');
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 404) {
          setStatus('notFound');
          return;
        }
        setMessage(caught instanceof ApiError ? caught.message : 'Could not load this profile.');
        setStatus('error');
      });

    return () => controller.abort();
  }, [id, reloadToken]);

  const retry = useCallback(() => {
    setStatus('loading');
    setMessage(null);
    setReloadToken((token) => token + 1);
  }, []);

  if (status === 'loading') {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Spinner className="h-6 w-6 text-brand-400" />
        <span className="sr-only">Loading profile…</span>
      </div>
    );
  }

  if (status === 'notFound') {
    return (
      <Card className="mx-auto max-w-md text-center">
        <h1 className="text-lg font-semibold text-zinc-100">Profile not found</h1>
        <p className="mt-2 text-sm text-zinc-400">
          This profile does not exist, or the link is incorrect.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-brand-400 underline underline-offset-4"
        >
          Go to the home page
        </Link>
      </Card>
    );
  }

  if (status === 'error' || !profile) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-3">
        <Alert>{message ?? 'Could not load this profile.'}</Alert>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  return <ProfileView profile={profile} />;
}
