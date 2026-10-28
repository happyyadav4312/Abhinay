'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { RequireAuth } from '@/components/common';
import { buttonVariants, Card } from '@/components/ui';
import { canPostCasting, ROLE_LABELS } from '@/types';

function DashboardContent() {
  const { user } = useAuth();
  if (!user) return null;

  const isCastingPoster = canPostCasting(user.role);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Welcome, {user.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{ROLE_LABELS[user.role]}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className='p-4'>
          <h2 className="font-heading text-lg font-medium text-foreground">Your professional profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep your photo, bio, skills and credits current so collaborators can find you.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/profile"
              className={buttonVariants({ size: 'sm' })}
            >
              View profile
            </Link>
            <Link
              href="/profile/edit"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Edit profile
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="font-heading text-lg font-medium text-foreground">Account</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate text-foreground">{user.email}</dd>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="text-foreground">{ROLE_LABELS[user.role]}</dd>
          </dl>
          <Link
            href="/settings"
            className="mt-4 inline-block text-sm text-primary underline underline-offset-4 hover:opacity-85"
          >
            Account settings
          </Link>
        </Card>

        <Card>
          <h2 className="font-heading text-lg font-medium text-foreground">Casting calls</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isCastingPoster
              ? 'Post roles for your productions, then publish, edit or close them as casting progresses.'
              : 'Find open roles from producers and directors that match your craft.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {isCastingPoster ? (
              <>
                <Link
                  href="/casting/create"
                  className={buttonVariants({ size: 'sm' })}
                >
                  Post a role
                </Link>
                <Link
                  href="/casting/mine"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  My postings
                </Link>
              </>
            ) : null}
            <Link
              href="/casting"
              className={buttonVariants({
                variant: isCastingPoster ? 'outline' : 'default',
                size: 'sm',
              })}
            >
              Browse casting calls
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="font-heading text-lg font-medium text-foreground">My applications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track the casting roles you have applied to and where each one stands.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/applications"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              View my applications
            </Link>
          </div>
        </Card>
      </div>

        <Card>
          <h2 className="font-heading text-lg font-medium text-foreground">Direct Messages</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time chat with casting directors and shortlisted applicants.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/messages"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Open messages
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="font-heading text-lg font-medium text-foreground">Auditions & Self-Tapes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload audition videos, review take submissions, and manage casting callbacks.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/auditions"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              View auditions
            </Link>
          </div>
        </Card>
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
