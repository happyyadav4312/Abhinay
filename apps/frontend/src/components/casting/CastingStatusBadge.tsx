import { cn } from '@/lib/utils';
import { CASTING_STATUS_LABELS, type CastingRoleStatus } from '@/types';

const TONES: Record<CastingRoleStatus, string> = {
  DRAFT: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  OPEN: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  CLOSED: 'border-zinc-600 bg-zinc-800/60 text-zinc-400',
};

export function CastingStatusBadge({
  status,
  className,
}: {
  status: CastingRoleStatus;
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
      {CASTING_STATUS_LABELS[status]}
    </span>
  );
}
