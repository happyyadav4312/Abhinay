import { cn } from '@/lib/utils';
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@/types';

const TONES: Record<ApplicationStatus, string> = {
  APPLIED: 'border-primary/40 bg-primary/10 text-primary',
  SHORTLISTED: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  SELECTED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  REJECTED: 'border-border/60 bg-muted/60 text-muted-foreground',
};

export function ApplicationStatusBadge({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[status],
        className
      )}
    >
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}
