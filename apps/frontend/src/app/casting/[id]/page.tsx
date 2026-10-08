'use client';

import { Suspense, use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ApiError, castingApi } from '@/lib/api';
import { Avatar, ErrorState, LoadingState, MessageCard, RequireAuth } from '@/components/common';
import {
  ApplyPanel,
  CastingStatusBadge,
  formatCalendarDate,
  formatDate,
} from '@/components/casting';
import { Alert, Button, buttonVariants, Card, CardContent } from '@/components/ui';
import { ROLE_LABELS, type CastingPoster, type CastingRole } from '@/types';

type LoadResult = { key: string } & (
  | { status: 'ready'; role: CastingRole }
  | { status: 'notFound' }
  | { status: 'error'; message: string }
);

/** One-off confirmations passed in the URL after a create or edit; shown to the owner only. */
const NOTICES: Record<string, { tone: 'success' | 'info'; text: string }> = {
  created: { tone: 'success', text: 'Saved as a draft. Only you can see it until you publish it.' },
  published: {
    tone: 'success',
    text: 'Published. Your casting role is now visible to everyone on Abhinay.',
  },
  'publish-failed': {
    tone: 'info',
    text: 'Saved as a draft, but it could not be published. Try publishing again below.',
  },
  updated: { tone: 'success', text: 'Changes saved.' },
};

function PostedBy({ poster }: { poster: CastingPoster }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <Avatar name={poster.name} photoUrl={poster.photoUrl} size="sm" />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Posted by</p>
          {poster.profileId ? (
            <Link
              href={`/profile/${poster.profileId}`}
              className="font-medium text-zinc-100 underline-offset-4 hover:underline"
            >
              {poster.name}
            </Link>
          ) : (
            <p className="font-medium text-zinc-100">{poster.name}</p>
          )}
          <p className="text-sm text-zinc-400">{ROLE_LABELS[poster.role]}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TextSection({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardContent>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">{title}</h2>
        <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-200">{text}</p>
      </CardContent>
    </Card>
  );
}

type OwnerAction = 'publish' | 'close' | 'delete';

function OwnerPanel({
  role,
  onChanged,
  onNotice,
}: {
  role: CastingRole;
  onChanged: (role: CastingRole) => void;
  onNotice: (text: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<OwnerAction | null>(null);
  const [confirming, setConfirming] = useState<'close' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Move focus to the confirmation so keyboard users land on the decision.
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  async function changeStatus(target: 'OPEN' | 'CLOSED') {
    setBusy(target === 'OPEN' ? 'publish' : 'close');
    setError(null);
    try {
      const { castingRole } = await castingApi.setStatus(role.id, target);
      setConfirming(null);
      onChanged(castingRole);
      onNotice(
        target === 'OPEN'
          ? 'Published. Your casting role is now visible to everyone on Abhinay.'
          : 'Closed. The role is no longer listed in search.'
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setBusy(null);
    }
  }

  async function deleteDraft() {
    setBusy('delete');
    setError(null);
    try {
      await castingApi.remove(role.id);
      router.replace('/casting/mine?notice=deleted');
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.'
      );
      setBusy(null);
    }
  }

  const summary = {
    DRAFT: 'Only you can see this draft. Publish it to list it for everyone.',
    OPEN: 'This role is listed for everyone on Abhinay.',
    CLOSED: 'This role is closed. Closed roles can’t be edited or reopened.',
  }[role.status];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Manage this role
        </h2>
        <p className="text-sm text-zinc-300">{summary}</p>
        {role.status === 'OPEN' && !role.acceptingApplications ? (
          <p className="text-sm text-amber-400">
            The application deadline has passed, so the role is no longer listed and takes no new
            applications. Edit it to set a later deadline, or close it.
          </p>
        ) : null}
        {role.status !== 'DRAFT' && role.applicationCount !== null ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-zinc-300">
              {role.applicationCount === 1
                ? '1 application so far.'
                : `${role.applicationCount} applications so far.`}
            </p>
            <Link
              href={`/casting/${role.id}/applicants`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Review applicants &amp; shortlists
            </Link>
          </div>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}

        {confirming ? (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-700 p-3">
            <p className="text-sm text-zinc-200">
              {confirming === 'close'
                ? 'Close this role? It stops appearing in search and can’t be reopened.'
                : 'Delete this draft? This can’t be undone.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                ref={confirmRef}
                variant="destructive"
                isLoading={busy === confirming}
                onClick={() => (confirming === 'close' ? changeStatus('CLOSED') : deleteDraft())}
              >
                {confirming === 'close' ? 'Yes, close role' : 'Yes, delete draft'}
              </Button>
              <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : role.status === 'CLOSED' ? null : (
          <div className="flex flex-wrap gap-2">
            {role.status === 'DRAFT' ? (
              <Button isLoading={busy === 'publish'} onClick={() => changeStatus('OPEN')}>
                Publish role
              </Button>
            ) : null}
            <Link
              href={`/casting/${role.id}/edit`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Edit
            </Link>
            {role.status === 'OPEN' ? (
              <Button variant="destructive" onClick={() => setConfirming('close')}>
                Close role
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => setConfirming('delete')}>
                Delete draft
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CastingRoleDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const requestKey = `${id}|${reloadToken}`;

  // State is only ever set from the promise callbacks, never synchronously in
  // the effect body; loading is derived from the request key.
  useEffect(() => {
    const controller = new AbortController();
    const key = `${id}|${reloadToken}`;

    castingApi
      .get(id, controller.signal)
      .then(({ castingRole }) => {
        if (!controller.signal.aborted) setResult({ key, status: 'ready', role: castingRole });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 404) {
          setResult({ key, status: 'notFound' });
          return;
        }
        setResult({
          key,
          status: 'error',
          message:
            caught instanceof ApiError ? caught.message : 'Could not load this casting role.',
        });
      });

    return () => controller.abort();
  }, [id, reloadToken]);

  if (result === null || result.key !== requestKey) {
    return <LoadingState label="Loading casting role…" />;
  }

  if (result.status === 'notFound') {
    return (
      <MessageCard
        title="Casting role not found"
        action={
          <Link href="/casting" className={buttonVariants({ variant: 'outline' })}>
            Browse casting calls
          </Link>
        }
      >
        This casting role does not exist, or it is a draft only its author can see.
      </MessageCard>
    );
  }

  if (result.status === 'error') {
    return (
      <ErrorState message={result.message} onRetry={() => setReloadToken((token) => token + 1)} />
    );
  }

  const { role } = result;
  const urlNotice = role.isOwner ? NOTICES[searchParams.get('notice') ?? ''] : undefined;

  return (
    <article className="flex flex-col gap-6">
      <Link
        href={role.isOwner ? '/casting/mine' : '/casting'}
        className="text-sm text-zinc-400 hover:text-zinc-200"
      >
        ← {role.isOwner ? 'My postings' : 'All casting calls'}
      </Link>

      {actionNotice ? (
        <Alert tone="success">{actionNotice}</Alert>
      ) : urlNotice ? (
        <Alert tone={urlNotice.tone}>{urlNotice.text}</Alert>
      ) : null}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CastingStatusBadge status={role.status} />
          <span className="text-sm text-zinc-400">Casting for {ROLE_LABELS[role.seekingRole]}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{role.title}</h1>
      </header>

      {role.status === 'CLOSED' && !role.isOwner ? (
        <Alert tone="info">This casting call is closed and is no longer listed.</Alert>
      ) : role.status === 'OPEN' && !role.acceptingApplications && !role.isOwner ? (
        <Alert tone="info">
          The deadline for this casting call has passed, so it no longer takes applications.
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-zinc-500">Location</dt>
            <dd className="text-zinc-200">{role.location}</dd>
            <dt className="text-zinc-500">Compensation</dt>
            <dd className="text-zinc-200">{role.compensation}</dd>
            <dt className="text-zinc-500">Apply by</dt>
            <dd className="text-zinc-200">
              {role.applicationDeadline
                ? formatCalendarDate(role.applicationDeadline)
                : 'No deadline'}
            </dd>
            <dt className="text-zinc-500">Posted</dt>
            <dd className="text-zinc-200">
              {role.publishedAt ? formatDate(role.publishedAt) : 'Not published yet'}
            </dd>
            {role.closedAt ? (
              <>
                <dt className="text-zinc-500">Closed</dt>
                <dd className="text-zinc-200">{formatDate(role.closedAt)}</dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {user && !role.isOwner ? (
        <ApplyPanel
          role={role}
          viewerRole={user.role}
          onApplied={(application) => {
            setResult({
              key: requestKey,
              status: 'ready',
              role: { ...role, myApplication: application },
            });
            setActionNotice(`Application sent. ${role.postedBy.name} can now see your profile.`);
          }}
          onStale={() => setReloadToken((token) => token + 1)}
        />
      ) : null}

      <TextSection title="About the role" text={role.description} />
      <TextSection title="Requirements" text={role.requirements} />
      <PostedBy poster={role.postedBy} />

      {role.isOwner ? (
        <OwnerPanel
          role={role}
          onChanged={(updated) => setResult({ key: requestKey, status: 'ready', role: updated })}
          onNotice={setActionNotice}
        />
      ) : null}
    </article>
  );
}

export default function CastingRolePage({ params }: { params: Promise<{ id: string }> }) {
  // `params` is a Promise in Next.js 16; `use()` unwraps it in a Client Component.
  const { id } = use(params);

  return (
    <RequireAuth>
      {/* useSearchParams requires a Suspense boundary during prerendering. */}
      <Suspense fallback={<LoadingState label="Loading casting role…" />}>
        <CastingRoleDetail id={id} />
      </Suspense>
    </RequireAuth>
  );
}
