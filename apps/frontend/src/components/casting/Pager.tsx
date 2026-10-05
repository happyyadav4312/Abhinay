import Link from 'next/link';
import { buttonVariants } from '@/components/ui';
import type { Pagination } from '@/types';

/**
 * Previous/next links rather than buttons: every page of results has its own
 * URL, so it can be bookmarked, shared and reached with the back button.
 */
export function Pager({
  pagination,
  hrefFor,
}: {
  pagination: Pagination;
  hrefFor: (page: number) => string;
}) {
  const { totalPages } = pagination;
  if (totalPages <= 1) return null;

  // A hand-edited URL can ask for a page past the end; never show "page 9 of 2".
  const page = Math.min(pagination.page, totalPages);
  const linkClass = buttonVariants({ variant: 'outline' });

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={linkClass}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-zinc-400">
        Page {page} of {totalPages}
      </p>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={linkClass}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
