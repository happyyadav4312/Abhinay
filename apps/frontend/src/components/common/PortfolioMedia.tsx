import { formatDuration } from '@/lib/utils';
import type { PortfolioItem } from '@/types';

/**
 * One portfolio item: a photo, or a reel with native controls. Both are served
 * straight from the media origin (Cloudinary, or the API in local mode), so a
 * plain `<img>`/`<video>` is used rather than the Next.js image optimizer.
 * Videos load metadata only until played.
 */
export function PortfolioMedia({ item }: { item: PortfolioItem }) {
  const caption = item.title ?? (item.kind === 'PHOTO' ? 'Portfolio photo' : 'Show reel');

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
