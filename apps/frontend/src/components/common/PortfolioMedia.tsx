import { formatDuration } from '@/lib/utils';
import type { PortfolioItem } from '@/types';

/**
 * An Instagram reel as a link card. No embed: nothing loads from Instagram
 * until the viewer chooses to open it, in a new tab. `item.url` is the
 * canonical instagram.com URL the server validated and stored, so it can only
 * ever point at Instagram.
 */
function InstagramLinkCard({ item }: { item: PortfolioItem }) {
  const title = item.title ?? 'Instagram reel';

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch “${title}” on Instagram (opens in a new tab)`}
      className="group flex aspect-video w-full flex-col justify-between rounded-lg border border-zinc-800 bg-gradient-to-br from-fuchsia-600/25 via-rose-500/15 to-amber-400/20 p-4 transition-colors hover:border-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-300">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current">
          <rect x="3" y="3" width="18" height="18" rx="5" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" strokeWidth="2" />
          <circle cx="17.5" cy="6.5" r="1" className="fill-current" strokeWidth="0" />
        </svg>
        Instagram reel
      </span>
      <span className="text-sm font-medium text-zinc-100 group-hover:underline">
        Watch on Instagram ↗
      </span>
    </a>
  );
}

/**
 * One portfolio item: a photo, a reel with native controls, or an Instagram
 * link card. Photos and reels are served straight from the media origin
 * (Cloudinary, the API in local mode, or an external host for demo data), so a
 * plain `<img>`/`<video>` is used rather than the Next.js image optimizer.
 * Videos load metadata only until played.
 */
export function PortfolioMedia({ item }: { item: PortfolioItem }) {
  const caption =
    item.title ??
    (item.kind === 'PHOTO'
      ? 'Portfolio photo'
      : item.kind === 'LINK'
        ? 'Instagram reel'
        : 'Show reel');

  return (
    <figure className="flex flex-col gap-1.5">
      {item.kind === 'PHOTO' ? (
        // eslint-disable-next-line @next/next/no-img-element -- served from the media origin, see above
        <img
          src={item.url}
          alt={caption}
          width={item.width ?? undefined}
          height={item.height ?? undefined}
          loading="lazy"
          className="aspect-[4/3] w-full rounded-lg border border-zinc-800 bg-zinc-900 object-cover"
        />
      ) : item.kind === 'LINK' ? (
        <InstagramLinkCard item={item} />
      ) : (
        <video
          src={item.url}
          poster={item.thumbnailUrl ?? undefined}
          controls
          preload="metadata"
          aria-label={caption}
          className="aspect-video w-full rounded-lg border border-zinc-800 bg-black"
        />
      )}
      <figcaption className="text-xs text-zinc-400">
        {item.title ?? <span className="text-zinc-600">Untitled</span>}
        {item.durationSeconds ? ` · ${formatDuration(item.durationSeconds)}` : ''}
      </figcaption>
    </figure>
  );
}
