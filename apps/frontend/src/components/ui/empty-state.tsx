import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'rounded-md border border-dashed border-zinc-800 px-3 py-6 text-center text-sm text-zinc-500',
        className
      )}
    >
      {children}
    </p>
  );
}
