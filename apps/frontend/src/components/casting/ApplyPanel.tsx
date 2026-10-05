'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError, castingApi } from '@/lib/api';
import { Alert, Button, Card, CardContent } from '@/components/ui';
import { canApplyTo, ROLE_LABELS, type CastingRole, type MyApplication, type Role } from '@/types';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';
import { formatDate } from './format';

/**
 * The member's side of a role page: apply once, or see the application already
 * made. Renders nothing for the author (the owner panel covers them) or for a
 * closed role they never applied to (the page already says it is closed).
 */
export function ApplyPanel({
  role,
  viewerRole,
  onApplied,
  onStale,
}: {
  role: CastingRole;
  viewerRole: Role;
  onApplied: (application: MyApplication) => void;
  /** The role changed underneath us — applied in another tab, or just closed. */
  onStale: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Move focus to the confirmation so keyboard users land on the decision.
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  if (role.isOwner) return null;

  if (role.myApplication) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Your application
            </h2>
            <ApplicationStatusBadge status={role.myApplication.status} />
          </div>
          <p className="text-sm text-zinc-300">
            You applied on {formatDate(role.myApplication.createdAt)}. {role.postedBy.name} can see
            your public profile.
          </p>
          <Link href="/applications" className="text-sm text-primary underline underline-offset-4">
            See all your applications
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (role.status !== 'OPEN') return null;

  // UX only: the API independently refuses every other profession with 403.
  if (!canApplyTo(role, viewerRole)) {
    return (
      <Alert tone="info">
        Only {ROLE_LABELS[role.seekingRole]} profiles can apply to this role. Your profile is
        registered as {ROLE_LABELS[viewerRole]}.
      </Alert>
    );
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const { application } = await castingApi.apply(role.id);
      setConfirming(false);
      onApplied({
        id: application.id,
        status: application.status,
        createdAt: application.createdAt,
      });
    } catch (caught) {
      // Someone else's state won: show the role as it really is now.
      if (
        caught instanceof ApiError &&
        (caught.code === 'ALREADY_APPLIED' || caught.code === 'CASTING_ROLE_NOT_OPEN')
      ) {
        onStale();
        return;
      }
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Interested?</h2>
        <p className="text-sm text-zinc-300">
          Applying shares your public profile — photo, bio, skills and credits — with{' '}
          {role.postedBy.name}. You can apply to each role once, and an application can’t be
          withdrawn.
        </p>
        {error ? <Alert>{error}</Alert> : null}

        {confirming ? (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-700 p-3">
            <p className="text-sm text-zinc-200">
              Apply for “{role.title}” with your public profile?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button ref={confirmRef} isLoading={busy} onClick={apply}>
                Yes, apply
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button onClick={() => setConfirming(true)}>Apply for this role</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
