import { cn } from '@/lib/utils';
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@/types';

const TONES: Record<ApplicationStatus, string> = {
  APPLIED: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  SHORTLISTED: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  SELECTED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  REJECTED: 'border-zinc-600 bg-zinc-800/60 text-zinc-400',
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
