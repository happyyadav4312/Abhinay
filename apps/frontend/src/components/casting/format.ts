const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "5 Oct 2026" from an ISO timestamp, in the viewer's own time zone. */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}
