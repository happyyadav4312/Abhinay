import Link from 'next/link';
import { Card, CardContent } from '@/components/ui';
import { ROLE_LABELS, type CastingRoleSummary } from '@/types';
import { CastingStatusBadge } from './CastingStatusBadge';
import { formatDate } from './format';

/** One result in a casting list. The title is the link, so the card reads well to a screen reader. */
export function CastingRoleCard({
  role,
  showStatus = false,
}: {
  role: CastingRoleSummary;
  showStatus?: boolean;
}) {
  const posted = role.publishedAt ? `Posted ${formatDate(role.publishedAt)}` : 'Not published';

  return (
    <li>
      <Card size="sm">
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-base font-medium text-zinc-100">
              <Link
                href={`/casting/${role.id}`}
                className="underline-offset-4 hover:underline focus-visible:underline"
              >
                {role.title}
              </Link>
            </h2>
            {showStatus ? <CastingStatusBadge status={role.status} /> : null}
          </div>
          <p className="text-sm text-zinc-400">
            {ROLE_LABELS[role.seekingRole]} · {role.location} · {role.compensation}
          </p>
          <p className="text-sm text-zinc-300">{role.descriptionPreview}</p>
          <p className="text-xs text-zinc-500">
            {role.postedBy.name} · {posted}
          </p>
        </CardContent>
      </Card>
    </li>
  );
}
