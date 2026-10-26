import Link from 'next/link';
import { Card, CardContent } from '@/components/ui';
import { ROLE_LABELS, type Application } from '@/types';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';
import { formatDate } from './format';

/** One entry in "My applications": the role applied to and where it stands. */
export function ApplicationCard({ application }: { application: Application }) {
  const role = application.castingRole;

  return (
    <li>
      <Card size="sm">
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="font-heading text-lg font-medium text-foreground">
              <Link
                href={`/casting/${role.id}`}
                className="underline-offset-4 hover:underline focus-visible:underline"
              >
                {role.title}
              </Link>
            </h2>
            <ApplicationStatusBadge status={application.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {ROLE_LABELS[role.seekingRole]} · {role.location} · {role.compensation}
          </p>
          <p className="text-xs text-muted-foreground/80">
            Applied {formatDate(application.createdAt)} · Posted by {role.postedBy.name}
            {role.status === 'CLOSED' ? ' · Casting closed' : ''}
          </p>
        </CardContent>
      </Card>
    </li>
  );
}
