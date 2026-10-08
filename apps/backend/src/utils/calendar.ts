import { env } from '../config/env';

/**
 * Calendar days, as the platform sees them.
 *
 * Deadlines are stored as PostgreSQL `date` values, which Prisma hands back as
 * UTC midnight. "Today" must therefore be expressed the same way: the current
 * calendar date in APP_TIME_ZONE, at UTC midnight. Comparing the two is then a
 * plain date comparison with no time-of-day or offset involved.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    // en-CA formats as YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Today's date in the platform time zone, as `YYYY-MM-DD`. */
export function todayString(now: Date = new Date(), timeZone = env.APP_TIME_ZONE): string {
  return formatterFor(timeZone).format(now);
}

/** Today's date in the platform time zone, at UTC midnight (comparable with `@db.Date`). */
export function today(now: Date = new Date(), timeZone = env.APP_TIME_ZONE): Date {
  return new Date(`${todayString(now, timeZone)}T00:00:00.000Z`);
}

/** `date` plus a whole number of days, still at UTC midnight. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** True while applications are still accepted: no deadline, or not yet past it. */
export function isOnOrAfterToday(deadline: Date | null, now: Date = new Date()): boolean {
  return deadline === null || deadline.getTime() >= today(now).getTime();
}
