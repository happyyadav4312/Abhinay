import type { CastingRoleSummary } from '@/types';

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Calendar dates are formatted in UTC so "2026-10-12" never shows as the 11th. */
const CALENDAR_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "5 Oct 2026" from an ISO timestamp, in the viewer's own time zone. */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** "12 Oct 2026" from a `YYYY-MM-DD` calendar date. */
export function formatCalendarDate(value: string): string {
  return CALENDAR_FORMAT.format(new Date(`${value}T00:00:00.000Z`));
}

/**
 * One line about the deadline, or null when there is nothing to say: "Apply by
 * 12 Oct 2026" while applications are open, "Applications closed 12 Oct 2026"
 * once an open role's deadline has passed.
 */
export function deadlineLabel(
  role: Pick<CastingRoleSummary, 'applicationDeadline' | 'acceptingApplications' | 'status'>
): string | null {
  if (!role.applicationDeadline) return null;
  const day = formatCalendarDate(role.applicationDeadline);
  if (role.status === 'OPEN' && !role.acceptingApplications) return `Applications closed ${day}`;
  if (role.status === 'CLOSED') return null;
  return `Apply by ${day}`;
}
