import Link from 'next/link';
import { Card, CardContent } from '@/components/ui';
import { ROLE_LABELS, type CastingRoleSummary } from '@/types';
import { CastingStatusBadge } from './CastingStatusBadge';
import { deadlineLabel, formatDate } from './format';

/** One result in a casting list. The title is the link, so the card reads well to a screen reader. */
export function CastingRoleCard({
  role,
  showStatus = false,
}: {
  role: CastingRoleSummary;
  showStatus?: boolean;
}) {
  const posted = role.publishedAt ? `Posted ${formatDate(role.publishedAt)}` : 'Not published';
  const deadline = deadlineLabel(role);
  const deadlinePassed = role.status === 'OPEN' && !role.acceptingApplications;

  return (
    <li>
      <Card size="sm" className="transition-colors hover:border-border/80">
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="font-heading text-lg font-medium text-foreground">
              <Link
                href={`/casting/${role.id}`}
                className="underline-offset-4 transition-colors hover:text-primary focus-visible:underline"
              >
                {role.title}
              </Link>
            </h2>
            {showStatus ? <CastingStatusBadge status={role.status} /> : null}
          </div>
          <p className="text-sm font-medium text-primary/90">
            {ROLE_LABELS[role.seekingRole]} · <span className="text-muted-foreground font-normal">{role.location} · {role.compensation}</span>
          </p>
          <p className="text-sm text-foreground/85 leading-relaxed">{role.descriptionPreview}</p>
          <p className="text-xs text-muted-foreground">
            {role.postedBy.name} · {posted}
            {deadline ? (
              <>
                {' · '}
                <span className={deadlinePassed ? 'text-amber-400 font-medium' : 'text-foreground/75'}>
                  {deadline}
                </span>
              </>
            ) : null}
          </p>
        </CardContent>
      </Card>
    </li>
  );
}
