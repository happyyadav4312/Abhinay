import { describe, expect, it } from 'vitest';
import { addDays, isOnOrAfterToday, today, todayString } from '../../src/utils/calendar';

describe('platform calendar', () => {
  it('reads "today" in the configured zone, not in UTC', () => {
    // 20:00 UTC on 31 Dec is already 1 Jan in India (UTC+5:30) but not in New York.
    const instant = new Date('2026-12-31T20:00:00.000Z');
    expect(todayString(instant, 'Asia/Kolkata')).toBe('2027-01-01');
    expect(todayString(instant, 'America/New_York')).toBe('2026-12-31');
    expect(todayString(instant, 'UTC')).toBe('2026-12-31');
  });

  it('expresses today at UTC midnight so it compares directly with @db.Date values', () => {
    const instant = new Date('2026-10-08T23:30:00.000Z');
    expect(today(instant, 'Asia/Kolkata').toISOString()).toBe('2026-10-09T00:00:00.000Z');
    expect(addDays(new Date('2026-12-31T00:00:00.000Z'), 1).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z'
    );
  });

  it('keeps accepting applications through the whole deadline day', () => {
    const deadline = new Date(`${todayString()}T00:00:00.000Z`);
    expect(isOnOrAfterToday(deadline)).toBe(true);
    expect(isOnOrAfterToday(addDays(deadline, -1))).toBe(false);
    expect(isOnOrAfterToday(null)).toBe(true);
  });
});
