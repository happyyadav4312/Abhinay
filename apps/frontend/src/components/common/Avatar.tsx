import { cn } from '@/lib/utils';

/** Deterministic initials, so an avatar-less profile still has a stable identity. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AvatarProps {
  name: string;
  photoUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-16 w-16 text-lg',
  lg: 'h-28 w-28 text-3xl',
} as const;

/**
 * Profile photos are served by the Express API on a different origin, already
 * processed to a fixed 512x512 WebP. A plain `<img>` is used rather than
 * `next/image` so the bytes are fetched directly from the media origin instead
 * of being round-tripped through the Next.js optimizer, which would need
 * `dangerouslyAllowLocalIP` to reach localhost in development.
 *
 * The fallback is rendered locally — no third-party avatar service.
 */
export function Avatar({ name, photoUrl, size = 'md', className }: AvatarProps) {
  const base = cn(
    'shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800',
    SIZES[size],
    className
  );

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served from the Express media origin, see above
      <img
        src={photoUrl}
        alt={`${name}'s profile photo`}
        width={512}
        height={512}
        className={cn(base, 'object-cover')}
      />
    );
  }

  return (
    <div
      className={cn(base, 'grid place-items-center font-semibold text-zinc-300')}
      role="img"
      aria-label={`${name}'s profile placeholder`}
    >
      {initialsOf(name)}
    </div>
  );
}
