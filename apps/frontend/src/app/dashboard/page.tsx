'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Clapperboard,
  FileText,
  Plus,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  ApiError,
  applicationsApi,
  castingApi,
  profileApi,
  type ApplicationPage,
  type CastingRolePage,
} from '@/lib/api';
import { RequireAuth, Avatar } from '@/components/common';
import { ApplicationStatusBadge } from '@/components/casting';
import { formatCalendarDate, formatDate } from '@/components/casting/format';
import { buttonVariants, Card, Button } from '@/components/ui';
import {
  canPostCasting,
  ROLE_LABELS,
  type Application,
  type CastingRoleSummary,
  type OwnProfile,
} from '@/types';
import { cn } from '@/lib/utils';

type DashboardData = {
  profile: OwnProfile | null;
  applications: ApplicationPage | null;
  casting: CastingRolePage | null;
  errors: string[];
};

const INITIAL_DATA: DashboardData = {
  profile: null,
  applications: null,
  casting: null,
  errors: [],
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="h-52 animate-pulse rounded-2xl bg-card/70 ring-1 ring-foreground/10" />
      <div className="grid gap-px overflow-hidden rounded-xl bg-border/70 sm:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-28 animate-pulse bg-card" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="h-80 animate-pulse rounded-xl bg-card/70 ring-1 ring-foreground/10" />
        <div className="h-80 animate-pulse rounded-xl bg-card/70 ring-1 ring-foreground/10" />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof BriefcaseBusiness;
}) {
  return (
    <div className="bg-card px-5 py-5 first:rounded-t-xl last:rounded-b-xl sm:first:rounded-l-xl sm:first:rounded-tr-none sm:last:rounded-r-xl sm:last:rounded-bl-none">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <Icon className="h-4 w-4 text-primary/80" aria-hidden="true" />
      </div>
      <p className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function WelcomeSection({ profile }: { profile: OwnProfile }) {
  const isPoster = canPostCasting(profile.role);
  const firstName = profile.name.trim().split(/\s+/)[0] || profile.name;

  return (
    <section className="relative overflow-hidden rounded-2xl bg-card px-6 py-7 ring-1 ring-foreground/10 sm:px-8 sm:py-9">
      <div className="pointer-events-none absolute -right-20 -top-32 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-px w-1/2 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="relative flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Your professional space
          </p>
          <h1 className="font-heading text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            Good to see you, {firstName}.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            {isPoster
              ? 'Bring your next production to life. Shape your team, review talent, and keep every casting call moving.'
              : 'Your next role starts here. Discover opportunities, track your applications, and keep your professional presence ready.'}
          </p>
        </div>
        <Link
          href={isPoster ? '/casting/create' : '/casting'}
          className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto')}
        >
          {isPoster ? 'Post a casting call' : 'Explore casting calls'}
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function ProfileSummary({ profile, completion }: { profile: OwnProfile; completion: number }) {
  return (
    <Card className="h-full p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Your profile
          </p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">
            Make your work memorable.
          </h2>
        </div>
        <Avatar name={profile.name} photoUrl={profile.photoUrl} size="md" />
      </div>
      <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
        {profile.bio ||
          'Add a short introduction so collaborators know what you bring to a production.'}
      </p>
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Profile completeness</span>
          <span className="tabular-nums text-primary">{completion}%</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={completion}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Profile ${completion}% complete`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-border/70 pt-4">
        <span className="text-xs text-muted-foreground">
          {profile.skills.length} skills · {profile.experiences.length} credits
        </span>
        <Link
          href="/profile/edit"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:underline"
        >
          Edit profile <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

function CastingCard({ role }: { role: CastingRoleSummary }) {
  return (
    <li className="group border-b border-border/70 py-4 first:pt-0 last:border-0 last:pb-0">
      <Link
        href={`/casting/${role.id}`}
        className="flex items-start gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
          <Clapperboard className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="truncate font-heading text-lg font-medium text-foreground group-hover:text-primary">
              {role.title}
            </h3>
            <span className="shrink-0 text-xs text-muted-foreground">
              {role.acceptingApplications && role.applicationDeadline
                ? `By ${formatCalendarDate(role.applicationDeadline)}`
                : 'Open call'}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {ROLE_LABELS[role.seekingRole]} <span className="text-border">·</span> {role.location}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground/75">
            {role.compensation || 'Compensation not specified'}{' '}
            <span className="text-border">·</span> Posted by {role.postedBy.name}
          </p>
        </div>
        <ChevronRight
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

function CastingSection({ roles, isPoster }: { roles: CastingRoleSummary[]; isPoster: boolean }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            {isPoster ? 'Your slate' : 'Selected for you'}
          </p>
          <h2 className="mt-1 font-heading text-2xl font-semibold text-foreground">
            {isPoster ? 'Casting calls' : 'Opportunities in your craft'}
          </h2>
        </div>
        <Link
          href={isPoster ? '/casting/mine' : '/casting'}
          className="text-xs font-medium text-primary hover:underline focus-visible:underline"
        >
          View all
        </Link>
      </div>
      {roles.length > 0 ? (
        <ul aria-label={isPoster ? 'Your casting calls' : 'Recommended casting calls'}>
          {roles.slice(0, 4).map((role) => (
            <CastingCard key={role.id} role={role} />
          ))}
        </ul>
      ) : (
        <div className="border border-dashed border-border/80 px-5 py-8 text-center">
          <Clapperboard className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-foreground">
            {isPoster ? 'Your casting slate is clear.' : 'No open roles match your profession yet.'}
          </p>
          <Link
            href={isPoster ? '/casting/create' : '/casting'}
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            {isPoster ? 'Create your first call' : 'Browse all casting calls'}
          </Link>
        </div>
      )}
    </Card>
  );
}

function RecentApplications({ applications }: { applications: Application[] }) {
  return (
    <Card className="h-full p-5 sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Your activity
          </p>
          <h2 className="mt-1 font-heading text-2xl font-semibold text-foreground">
            Recent applications
          </h2>
        </div>
        <Link
          href="/applications"
          className="text-xs font-medium text-primary hover:underline focus-visible:underline"
        >
          View all
        </Link>
      </div>
      {applications.length > 0 ? (
        <ul className="divide-y divide-border/70">
          {applications.slice(0, 4).map((application) => (
            <li key={application.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/casting/${application.castingRole.id}`}
                  className="block truncate text-sm font-medium text-foreground hover:text-primary focus-visible:underline"
                >
                  {application.castingRole.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Applied {formatDate(application.createdAt)}
                </p>
              </div>
              <ApplicationStatusBadge status={application.status} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex min-h-44 flex-col items-center justify-center border border-dashed border-border/80 px-5 text-center">
          <BriefcaseBusiness className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-foreground">No applications to track yet.</p>
          <Link href="/casting" className="mt-2 text-sm text-primary hover:underline">
            Find your next opportunity
          </Link>
        </div>
      )}
    </Card>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [data, setData] = useState(INITIAL_DATA);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    if (!user) return () => controller.abort();

    const isPoster = canPostCasting(user.role);
    const castingRequest = isPoster
      ? castingApi.mine({ status: 'OPEN', pageSize: 5 }, controller.signal)
      : user.role === 'ADMIN'
        ? castingApi.list({ pageSize: 5 }, controller.signal)
        : castingApi.list({ seekingRole: user.role, pageSize: 5 }, controller.signal);

    Promise.allSettled([
      profileApi.me(controller.signal),
      applicationsApi.mine({ pageSize: 5 }, controller.signal),
      castingRequest,
    ]).then(([profileResult, applicationResult, castingResult]) => {
      if (controller.signal.aborted) return;
      const errors = [profileResult, applicationResult, castingResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) =>
          getErrorMessage(result.reason, 'Some dashboard information could not be loaded.')
        );
      setData({
        profile: profileResult.status === 'fulfilled' ? profileResult.value.profile : null,
        applications: applicationResult.status === 'fulfilled' ? applicationResult.value : null,
        casting: castingResult.status === 'fulfilled' ? castingResult.value : null,
        errors,
      });
      setIsLoading(false);
    });

    return () => controller.abort();
  }, [user]);

  const completion = useMemo(() => {
    if (!data.profile) return 0;
    const profile = data.profile;
    const completed = [
      Boolean(profile.name),
      Boolean(profile.bio),
      Boolean(profile.location),
      Boolean(profile.photoUrl),
      profile.skills.length > 0,
      profile.experiences.length > 0,
      Boolean(profile.resume),
      profile.portfolio.length > 0,
    ].filter(Boolean).length;
    return Math.round((completed / 8) * 100);
  }, [data.profile]);

  if (!user || isLoading) return <DashboardLoading />;
  if (!data.profile) {
    return (
      <Card className="p-6">
        <p className="text-sm text-destructive">
          {data.errors[0] ?? 'Your profile could not be loaded.'}
        </p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Card>
    );
  }

  const profile = data.profile;
  const isPoster = canPostCasting(user.role);
  const applications = data.applications?.applications ?? [];
  const roles = data.casting?.castingRoles ?? [];
  const shortlisted = applications.filter(
    (application) => application.status === 'SHORTLISTED'
  ).length;
  const activeRoles = roles.filter((role) => role.status === 'OPEN').length;

  return (
    <div className="space-y-6">
      <WelcomeSection profile={profile} />
      {data.errors.length > 0 ? (
        <p
          role="status"
          className="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          {data.errors[0]}
        </p>
      ) : null}
      <section
        aria-label="Dashboard summary"
        className="grid gap-px overflow-hidden rounded-xl bg-border/70 sm:grid-cols-3"
      >
        <Metric
          label={isPoster ? 'Open casting calls' : 'Applications'}
          value={isPoster ? activeRoles : (data.applications?.pagination.total ?? 0)}
          detail={isPoster ? 'Currently accepting applications' : 'Across your casting journey'}
          icon={isPoster ? Clapperboard : FileText}
        />
        <Metric
          label={isPoster ? 'Total roles posted' : 'Shortlisted'}
          value={isPoster ? (data.casting?.pagination.total ?? 0) : shortlisted}
          detail={isPoster ? 'Your professional slate' : 'Roles that moved forward'}
          icon={isPoster ? Users : Check}
        />
        <Metric
          label="Profile completeness"
          value={`${completion}%`}
          detail={completion === 100 ? 'Ready to be discovered' : 'A stronger profile stands out'}
          icon={UserRound}
        />
      </section>
      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
        <CastingSection roles={roles} isPoster={isPoster} />
        <RecentApplications applications={applications} />
      </div>
      <ProfileSummary profile={profile} completion={completion} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
        <p className="text-xs text-muted-foreground">
          Keep your credits and availability current for better connections.
        </p>
        <div className="flex gap-2">
          <Link href="/profile" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <UserRound aria-hidden="true" /> View profile
          </Link>
          {isPoster ? (
            <Link href="/casting/create" className={buttonVariants({ size: 'sm' })}>
              <Plus aria-hidden="true" /> New casting call
            </Link>
          ) : null}
        </div>
      </div>
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
